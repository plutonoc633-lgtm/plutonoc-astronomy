const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function dom() {
  const nodes = new Map();
  const node = key => {
    if (nodes.has(key)) return nodes.get(key);
    const value = { value: '', dataset: {}, disabled: false, hidden: false, listeners: {}, children: [], files: [],
      classList: { toggle() {}, add() {}, remove() {} }, style: { setProperty() {} },
      addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); },
      async fire(name, event = {}) { for (const fn of this.listeners[name] || []) await fn({ preventDefault() {}, target: this, currentTarget: this, ...event }); },
      querySelector: selector => node(key + ' ' + selector), querySelectorAll: () => [],
      replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); },
      reset() {}, removeAttribute(name) { delete this[name]; }, scrollIntoView() {}, focus() {}, click() {},
    };
    value.elements = new Proxy({}, { get: (_, name) => node(key + ' field:' + name) });
    nodes.set(key, value); return value;
  };
  const document = { querySelector: node, querySelectorAll: () => [], createElement: tag => node(Symbol(tag)), createTextNode: text => ({ textContent: text }), addEventListener() {} };
  return { nodes, node, document };
}
function studio() {
  const d = dom();
  const context = { ...d, window: { addEventListener() {} }, document: d.document, console, URL: { createObjectURL: blob => blob.name, revokeObjectURL() {} }, Blob, Uint8Array, AbortSignal, btoa, TextEncoder, crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout, structuredClone, Date, location: { href: 'https://studio.invalid/' } };
  const code = read('admin.js').replace('  initialize();', `renderAll = () => {}; pollDeployment = () => {}; window.qa = {
    setState(state) { repoState = state; editBases.photo = state; editBases.video = state; },
    setApp(value) { app = value; }, setFetch(fn) { globalThis.fetch = fn; }, fetchAsset, setPrepare(fn) { preparePhotoFile = fn; },
    prepared: () => preparedPhoto, preparing: () => preparing.photo,
    publishChanges, onMutation, loadRepositoryContent, invalidateSession, visitorAnalytics,
    getState: () => repoState, resetPhotoForm, publisherRequest
  };`);
  vm.runInNewContext(code, context);
  return { ...d, api: context.window.qa };
}
function state(sha = 'a'.repeat(40)) { return { headSha: sha, gallery: JSON.parse(read('content/gallery.json')), videos: JSON.parse(read('content/videos.json')) }; }

test('missing optional analytics script leaves studio listeners available', () => {
  const s = studio(); s.api.visitorAnalytics.show();
  assert.ok(s.node('[data-login-form]').listeners.submit.length);
  assert.match(s.node('[data-stats-status]').textContent, /作品管理仍可使用/);
});
test('only latest image preparation can update preview; reset invalidates pending work', async () => {
  const s = studio(); s.api.setState(state()); const pending = {};
  s.api.setPrepare(file => new Promise(resolve => { pending[file.name] = resolve; }));
  const input = s.node('[data-photo-form]').elements.image;
  input.files = [{ name: 'A', size: 1 }]; const a = input.fire('change');
  input.files = [{ name: 'B', size: 1 }]; const b = input.fire('change');
  assert.equal(s.api.preparing(), true);
  pending.B({ displayBlob: { name: 'B' } }); await b;
  pending.A({ displayBlob: { name: 'A' } }); await a;
  assert.equal(s.api.prepared().displayBlob.name, 'B');
  input.files = [{ name: 'C', size: 1 }]; const c = input.fire('change');
  s.api.resetPhotoForm(); pending.C({ displayBlob: { name: 'C' } }); await c;
  assert.equal(s.api.prepared(), null);
});
test('publication keeps its snapshot and blocks refresh while blob upload is pending', async () => {
  const s = studio(), base = state(); s.api.setState(base); let release, submitted; const calls = [];
  s.api.setApp({ callFunction: async ({ data }) => {
    calls.push(data.action);
    if (data.action === 'createBlob') { await new Promise(resolve => { release = resolve; }); return { result: { ok: true, data: { sha: 'blob' } } }; }
    submitted = data; return { result: { ok: true, data: { sha: 'c'.repeat(40), treeSha: 'tree' } } };
  } });
  // No rendering/network polling is needed to test the request boundary.
  const button = s.node('qa-submit');
  s.api.onMutation(button, 'click', 'photo', async (event, snapshot) => {
    const pending = s.api.publishChanges({ base: snapshot, files: [['qa', new Blob(['qa'])]], changed: 'gallery' });
    await s.api.loadRepositoryContent();
    await pending;
  });
  const operation = button.fire('click'); await tick();
  s.api.setState(state('b'.repeat(40))); release(); await operation;
  assert.deepEqual(calls, ['createBlob', 'publish']);
  assert.equal(submitted.expectedHeadSha, base.headSha);
});
test('content responses arriving after sign-out cannot restore repository state', async () => {
  const s = studio(); let release;
  s.api.setState(state()); s.api.setApp({ callFunction: () => new Promise(resolve => { release = resolve; }) });
  const request = s.api.loadRepositoryContent(); s.api.invalidateSession();
  release({ result: { ok: true, data: state() } });
  await request; assert.equal(s.api.getState(), null);
});

function canvas() {
  const source = read('script.js'); const timers = new Map(); let serial = 0;
  const context = { categoryConfig: { earth: {}, deepsky: {} }, categoryLabel: s => s, pad: String, reducedMotion: false, isMobile: false,
    clamp: (v, min, max) => Math.max(min, Math.min(v, max)), mod: (a, b) => ((a % b) + b) % b,
    $: () => ({ classList: { add() {}, remove() {} } }), $$: () => [], setVisualStage() {},
    setTimeout: fn => { timers.set(++serial, fn); return serial; }, clearTimeout: token => timers.delete(token) };
  const Class = vm.runInNewContext(source.slice(source.indexOf('  class InfiniteArchiveCanvas {'), source.indexOf('  const canvasElement')) + '\nInfiniteArchiveCanvas', context);
  const instance = Object.assign(Object.create(Class.prototype), { width: 1200, height: 700, tile: {}, cache: { cancelPending() {} }, velocity: {}, camera: {}, initialCamera: {}, totalElement: {}, currentElement: {}, status: {}, requestDraw() {}, context: { save() {}, restore() {}, measureText: text => ({ width: [...text].length * 14 }) } });
  return { instance, timers };
}
test('rapid filters and immediate directory selection discard old callbacks', () => {
  const { instance: c, timers } = canvas(); c.layout = () => {};
  c.allWorks = [{ category: 'earth' }, { category: 'deepsky' }];
  c.setFilter('deepsky'); c.setFilter('earth'); assert.equal(timers.size, 1);
  c.setFilter('deepsky', true); assert.equal(timers.size, 0); assert.equal(c.status.textContent, 'deepsky / 1');
});
test('caption space accommodates long narrow titles, hover growth and the repeated tile boundary', () => {
  const { instance: c } = canvas();
  c.visibleWorks = [{ title: '很长的竖幅作品标题'.repeat(5) }, { title: '宽幅' }];
  c.orderedWorks = () => c.visibleWorks.map((work, index) => ({ work, index, aspect: index ? 2 : .2 }));
  c.layout();
  const rows = [...new Set(c.nodes.map(n => n.y - n.height / 2))].sort((a, b) => a - b);
  for (let i = 0; i < rows.length; i++) {
    const current = c.nodes.filter(n => Math.abs(n.y - n.height / 2 - rows[i]) < .001);
    const next = i + 1 < rows.length ? c.nodes.filter(n => Math.abs(n.y - n.height / 2 - rows[i + 1]) < .001) : c.nodes.filter(n => Math.abs(n.y - n.height / 2 - rows[0]) < .001).map(n => ({ ...n, y: n.y + c.tile.height }));
    const captionBottom = Math.max(...current.map(n => n.y + n.height * 1.035 / 2 + 24 + n.titleLines.length * 20 + 3));
    const nextTop = Math.min(...next.map(n => n.y - n.height * 1.035 / 2));
    assert.ok(captionBottom < nextTop, `${captionBottom} < ${nextTop}`);
    current.forEach(n => n.titleLines.forEach(line => assert.ok([...line].length * 14 <= n.width + 14)));
  }
});

test('statistics pagination uses submitted dates and late responses cannot render after reset', async () => {
  const d = dom(), window = {}; vm.runInNewContext(read('admin-analytics.js'), { document: d.document, window, Date });
  const calls = [], root = d.node('[data-analytics]'); let pending;
  const api = window.createVisitorAnalytics(async (action, data) => {
    calls.push({ action, data });
    if (pending) return new Promise(resolve => { pending.resolve = resolve; });
    if (action === 'summary') return { dates: data, counts: [], visitors: 0, trendCounts: [], trendVisitors: [], works: [], devices: [], sources: [] };
    return { rows: [], page: data.page, hasNext: true };
  });
  api.show(); await tick(); const submitted = calls[0].data.start;
  root.querySelector('[data-stats-start]').value = '2026-01-01';
  await root.querySelector('[data-stats-next]').fire('click'); await tick();
  assert.equal(calls.at(-1).data.start, submitted); assert.equal(calls.at(-1).data.page, 1);
  pending = {}; root.querySelector('[data-stats-next]').fire('click'); await tick(); api.reset();
  pending.resolve({ rows: [], page: 2, hasNext: true }); await tick();
  assert.equal(root.querySelector('[data-stats-status]').textContent, '');
});

function publisherHarness(uid = '2066559012906586114') {
  const calls = [], base = state(), sha = base.headSha;
  const module = { exports: {} };
  vm.runInNewContext(read('cloudfunctions/plutonoc-content-publisher/index.js'), {
    module, exports: module.exports, Buffer, AbortSignal, process: { env: { plutonoc_github_token: 'qa-only' } },
    require: name => name === '@cloudbase/js-sdk' ? { init: () => ({ auth: { getUserInfo: () => ({ uid }) } }) } : require(path.join(root, 'cloudfunctions/plutonoc-content-publisher/content-runtime.js')),
    fetch: async (url, options) => {
      calls.push(url); const parsed = new URL(url); let data;
      if (parsed.pathname.includes('/git/ref/')) data = { object: { sha } };
      else if (parsed.pathname.includes('/git/commits/')) data = { tree: { sha: 'tree' } };
      else if (parsed.pathname.includes('/git/blobs/')) data = { encoding: 'base64', content: Buffer.from('qa-image').toString('base64') };
      else if (parsed.pathname.includes('/contents/assets/')) data = { type: 'file', size: parsed.pathname.includes('large.webp') ? 4000000 : 8, sha };
      else {
        const file = parsed.pathname.split('/contents/')[1];
        data = { content: Buffer.from(file === 'content/gallery.json' ? JSON.stringify(base.gallery) : file === 'content/videos.json' ? JSON.stringify(base.videos) : read(file)).toString('base64') };
      }
      return { ok: true, status: 200, json: async () => data };
    }
  });
  return { main: module.exports.main, calls, sha };
}
test('publisher loads one commit snapshot; asset reads require admin and a safe pinned path', async () => {
  const p = publisherHarness(); assert.equal((await p.main({ action: 'load' })).ok, true);
  p.calls.filter(url => url.includes('/contents/')).forEach(url => assert.equal(new URL(url).searchParams.get('ref'), p.sha));
  const result = await p.main({ action: 'readAsset', path: 'assets/gallery/deepsky/deepsky-01.webp', ref: p.sha });
  assert.equal(result.ok, true); assert.equal(Buffer.from(result.data.content, 'base64').toString(), 'qa-image');
  for (const bad of ['https://evil.example/a.webp', 'assets/gallery/../secret.webp', 'cloudbaserc.json']) assert.equal((await p.main({ action: 'readAsset', path: bad, ref: p.sha })).error.code, 'INVALID_PATH');
  assert.equal((await p.main({ action: 'readAsset', path: 'assets/gallery/a.webp', ref: 'main' })).error.code, 'INVALID_PATH');
  const large = await p.main({ action: 'readAsset', path: 'assets/gallery/large.webp', ref: p.sha });
  assert.equal(large.ok, true); assert.equal(large.data.content, undefined); assert.ok(large.data.sources[1].includes(p.sha));
  const guest = publisherHarness(''); assert.equal((await guest.main({ action: 'readAsset', path: 'assets/gallery/a.webp', ref: p.sha })).error.code, 'FORBIDDEN'); assert.equal(guest.calls.length, 0);
});
test('cleanup reports deletion counts and rejects remaining backlog or database failures', async () => {
  async function run(mode) {
    let reads = 0;
    const db = { command: { lt: value => value }, collection: () => ({
      where: () => ({ limit: () => ({ field: () => ({ get: async () => {
        reads++; if (mode === 'failure') throw Error('DB unavailable');
        return { data: mode === 'backlog' || reads === 1 ? [{ _id: 'qa' }] : [] };
      } }) }) }), doc: () => ({ remove: async () => {} })
    }) };
    const module = { exports: {} };
    vm.runInNewContext(read('cloudfunctions/analytics-shared/core.js'), { module, exports: module.exports, Date, console: { log() {} }, require: name => name === '@cloudbase/node-sdk' ? { init: () => ({ database: () => db }) } : require(name) });
    return module.exports.cleanup({ Type: 'Timer', TriggerName: 'plutonoc-analytics-daily', Message: 'secret' }, 'secret');
  }
  const result = await run('success'); assert.equal(result.ok, true); assert.equal(result.report.plutonoc_analytics_events.deleted, 1);
  await assert.rejects(run('backlog'), { code: 'CLEANUP_INCOMPLETE' });
  await assert.rejects(run('failure'), /DB unavailable/);
});

test('large source fallback verifies Git blob digest instead of trusting a stale public copy', async () => {
  const s=studio(), bytes=Buffer.from('correct-image'), hash=require('node:crypto').createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  s.api.setApp({callFunction:async()=>({result:{ok:true,data:{sha:hash,size:bytes.length,sources:['public','pinned']}}})});
  const urls=[];
  s.api.setFetch(async url=>{urls.push(url);return{ok:true,blob:async()=>new Blob([url==='public'?'outdated-data':bytes])}});
  const blob=await s.api.fetchAsset('assets/gallery/a.jpg',[],'a'.repeat(40));
  assert.equal(await blob.text(),'correct-image');assert.deepEqual(urls,['public','pinned']);
  s.api.setFetch(async()=>({ok:true,blob:async()=>new Blob(['outdated-data'])}));
  await assert.rejects(s.api.fetchAsset('assets/gallery/a.jpg',[],'a'.repeat(40)),/无法读取与编辑版本一致/);
});
