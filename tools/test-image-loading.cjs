const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const images = require('../image-loader.js');
const script = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function fakeImages(behavior) {
  const requests = [];
  const previous = global.Image;
  global.Image = class {
    naturalWidth = 64;
    naturalHeight = 64;
    cancelled = false;
    set src(source) {
      this.source = source;
      requests.push(this);
      behavior(this, source, requests.length);
    }
    get src() { return this.source; }
    removeAttribute() { this.cancelled = true; }
    decode() { return Promise.resolve(); }
  };
  return { requests, restore: () => { global.Image = previous; } };
}

function cacheWith(loader = images) {
  const source = script.slice(script.indexOf('  class BitmapCache {'), script.indexOf('  function hashNumber'));
  const context = vm.createContext({
    performance, queueMicrotask, AbortController,
    window: { PlutonoCImages: loader }, archiveCanvas: { requestDraw() {} }
  });
  return vm.runInContext(source + '\nBitmapCache', context);
}

test('decodes a loaded image before resolving', async () => {
  let release;
  const fake = fakeImages(image => {
    image.decode = () => new Promise(resolve => { release = resolve; });
    queueMicrotask(() => image.onload?.());
  });
  try {
    let ready = false;
    const result = images.load('photo').then(image => { ready = true; return image; });
    await tick();
    assert.equal(ready, false);
    release();
    assert.equal((await result).source, 'photo');
  } finally { fake.restore(); }
});

test('retries one transient failure, then succeeds', async () => {
  const fake = fakeImages((image, _, attempt) => queueMicrotask(() => attempt === 1 ? image.onerror?.() : image.onload?.()));
  try {
    await images.load('photo');
    assert.equal(fake.requests.length, 2);
    assert.equal(fake.requests[0].cancelled, true);
  } finally { fake.restore(); }
});

test('network and decode stalls both have bounded deadlines', async () => {
  for (const decodeStall of [false, true]) {
    const fake = fakeImages(image => {
      if (decodeStall) {
        image.decode = () => new Promise(() => {});
        queueMicrotask(() => image.onload?.());
      }
    });
    try {
      await assert.rejects(images.load('stalled', { timeout: 8 }), /timed out/);
      assert.equal(fake.requests.length, 2);
      assert.ok(fake.requests.every(image => image.cancelled));
    } finally { fake.restore(); }
  }
});

test('abort cancels an active request without retrying', async () => {
  const fake = fakeImages(() => {});
  try {
    const controller = new AbortController();
    const result = images.load('cancelled', { signal: controller.signal });
    controller.abort();
    await assert.rejects(result, { name: 'AbortError' });
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0].cancelled, true);
    await assert.rejects(images.load('never-started', { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(fake.requests.length, 1);
  } finally { fake.restore(); }
});

test('visible thumbnails start before queued high-resolution upgrades', async () => {
  const fake = fakeImages(() => {});
  try {
    const Cache = cacheWith();
    const cache = new Cache(1000000, 1);
    cache.request('upgrade', 1);
    cache.request('thumbnail', 0);
    cache.protect(['thumbnail', 'upgrade']);
    await tick();
    assert.equal(fake.requests[0].source, 'thumbnail');
    cache.cancelPending();
    await tick();
    assert.equal(cache.active, 0);
    assert.equal(cache.queue.length, 0);
  } finally { fake.restore(); }
});

test('stalled images release their slots and allow following images to load', async () => {
  const fake = fakeImages((image, source) => {
    if (source === 'healthy') queueMicrotask(() => image.onload?.());
  });
  try {
    const Cache = cacheWith({ load: (source, options) => images.load(source, { ...options, timeout: 8 }) });
    const cache = new Cache(1000000, 4);
    for (let i = 0; i < 4; i++) cache.request('stalled-' + i);
    cache.request('healthy');
    cache.protect(['stalled-0', 'stalled-1', 'stalled-2', 'stalled-3', 'healthy']);
    // One freed slot can finish the healthy image before the other deadlines.
    for (let i = 0; i < 50 && (!cache.get('healthy') || cache.active > 0); i++) await pause(5);
    assert.ok(cache.get('healthy'));
    assert.equal(cache.active, 0);
    assert.equal(cache.failed('stalled-0'), true);
    cache.retryFailed();
    assert.equal(cache.entries.has('stalled-0'), false);
    cache.request('stalled-0');
    await tick();
    assert.equal(fake.requests.filter(image => image.source === 'stalled-0').length, 3);
    cache.cancelPending();
    await tick();
  } finally { fake.restore(); }
});

test('leaving images or changing categories cancels obsolete work', async () => {
  const fake = fakeImages(() => {});
  try {
    const Cache = cacheWith();
    const cache = new Cache(1000000, 1);
    cache.request('old-visible');
    cache.request('old-queued');
    cache.protect(['old-visible', 'old-queued']);
    await tick();
    cache.request('new-visible');
    cache.protect(['new-visible']);
    await tick();
    assert.equal(fake.requests[0].cancelled, true);
    assert.deepEqual(fake.requests.map(image => image.source), ['old-visible', 'new-visible']);
    cache.cancelPending();
    await tick();
    assert.equal(cache.active, 0);
    assert.equal(cache.entries.size, 0);
  } finally { fake.restore(); }
});

test('cache retains visible images while evicting old decoded images within budget', async () => {
  const fake = fakeImages(image => queueMicrotask(() => image.onload?.()));
  try {
    const Cache = cacheWith();
    const cache = new Cache(64 * 64 * 4, 1);
    cache.request('old');
    cache.protect(['old']);
    await tick();
    cache.request('current');
    cache.protect(['current']);
    await tick();
    assert.ok(cache.get('current'));
    assert.equal(cache.get('old'), null);
    assert.equal(cache.bytes, cache.budget);
  } finally { fake.restore(); }
});

function photoHarness() {
  const element = { style: {}, src: '', getAttribute() { return this.src; }, removeAttribute() { this.src = ''; } };
  const message = { textContent: '' };
  const retry = { hidden: true };
  const pending = [];
  const context = vm.createContext({
    clearTimeout, setTimeout, AbortController, photoImage: element,
    archiveCanvas: { cache: { get() { return null; } } },
    $: selector => selector === '[data-photo-retry]' ? retry : message,
    window: { PlutonoCImages: { load(source, options) {
      return new Promise((resolve, reject) => pending.push({ source, options, resolve, reject }));
    } } }
  });
  const source = script.slice(script.indexOf('  function cancelPhotoImages()'), script.indexOf("  $('[data-photo-retry]')?.addEventListener"));
  vm.runInContext('let photoRenderTimer = 0, photoImageController = null, photoImageGeneration = 0;\n' + source, context);
  return { context, element, pending, retry, message };
}

test('lightbox shows the thumbnail first and never regresses after the full image', async () => {
  const h = photoHarness();
  h.context.work = { src: 'full', thumbnailSrc: 'thumb', width: 1800, height: 1200, title: 'Work' };
  vm.runInContext('loadPhotoImages(work)', h.context);
  h.pending.find(p => p.source === 'thumb').resolve();
  await tick();
  assert.equal(h.element.src, 'thumb');
  h.pending.find(p => p.source === 'full').resolve();
  await tick();
  assert.equal(h.element.src, 'full');
  assert.equal(h.message.textContent, '');
});

test('a late image response cannot overwrite a newer or closed lightbox', async () => {
  const h = photoHarness();
  h.context.work = { src: 'old', thumbnailSrc: 'old-thumb', width: 1, height: 1 };
  vm.runInContext('loadPhotoImages(work)', h.context);
  h.context.work = { src: 'new', thumbnailSrc: 'new-thumb', width: 1, height: 1 };
  vm.runInContext('loadPhotoImages(work)', h.context);
  h.pending.find(p => p.source === 'new').resolve();
  await tick();
  for (const p of h.pending.filter(p => p.source !== 'new')) p.resolve();
  await tick();
  assert.equal(h.element.src, 'new');
  vm.runInContext('loadPhotoImages(work); cancelPhotoImages()', h.context);
  h.element.src = '';
  h.pending.slice(-2).forEach(p => p.resolve());
  await tick();
  assert.equal(h.element.src, '');
});

test('failed full-size image keeps its preview and offers retry', async () => {
  const h = photoHarness();
  h.context.work = { src: 'full', thumbnailSrc: 'thumb', width: 1, height: 1 };
  vm.runInContext('loadPhotoImages(work)', h.context);
  h.pending[0].resolve();
  h.pending[1].reject(new Error('offline'));
  await tick();
  assert.equal(h.element.src, 'thumb');
  assert.equal(h.retry.hidden, false);
});
