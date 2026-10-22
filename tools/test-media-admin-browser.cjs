const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
(async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage();
    // Exercise the public metadata reader; no login or publishing request is made.
    await page.route('https://static.cloudbase.net/cloudbase-js-sdk/**', route => route.fulfill({
      contentType: 'application/javascript', body: 'window.cloudbase={init(){throw Error("QA: login disabled")}};'
    }));
    const clip = fs.readFileSync('assets/videos/jupiter.mp4');
    await page.route('https://media.test/film.mp4', route => route.fulfill({
      status: 200, contentType: 'video/mp4', body: clip,
      // Deliberately no CORS header: native video metadata must still work.
    }));
    await page.goto(new URL('admin.html', process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011/').href);
    await page.evaluate(() => {
      document.querySelector('[data-video-form]').elements.videoUrl.value = 'https://media.test/film.mp4';
      document.querySelector('[data-probe-video]').click();
    });
    await page.waitForFunction(() => document.querySelector('[data-video-message]').textContent === '视频信息已读取');
    const metadata = await page.locator('[data-video-form]').evaluate(form => ({ duration: Number(form.elements.duration.value), ratio: Number(form.elements.aspectRatio.value) }));
    assert.ok(Math.abs(metadata.duration - 6.084) < 0.01);
    assert.ok(Math.abs(metadata.ratio - 1) < 0.001, JSON.stringify(metadata));
    console.log('PASS studio reads real cross-origin video metadata without requiring CORS or login/publishing calls.');
    await page.close();

    // Exercise the actual editor controls against a local read-only SDK fixture.
    // Every non-load call fails; this test cannot publish or access production data.
    const editor = await browser.newPage();
    const errors = []; editor.on('pageerror', error => errors.push(error.message));
    const fixture = {
      headSha: 'a'.repeat(40), gallery: JSON.parse(fs.readFileSync('content/gallery.json')),
      videos: JSON.parse(fs.readFileSync('content/videos.json')),
    };
    await editor.route('https://static.cloudbase.net/cloudbase-js-sdk/**', route => route.fulfill({
      contentType: 'application/javascript', body: `window.qaCalls=[]; window.cloudbase={init(){
        let signedIn=true, changed;
        const auth={getCurrentUser:()=>signedIn?{uid:'qa'}:null,onLoginStateChanged(fn){changed=fn},async signOut(){signedIn=false;changed?.(null)}};
        return {auth:()=>auth,async callFunction({name,data}){
          qaCalls.push([name,data.action]);
          if(name==='plutonoc-content-publisher'&&data.action==='load') return {result:{ok:true,data:${JSON.stringify(fixture)}}};
          throw Error('QA: writes and other cloud services disabled');
        }};
      }};`
    }));
    await editor.addInitScript(() => {
      window.qaReaders = [];
      const create = document.createElement.bind(document);
      document.createElement = (tag, ...args) => {
        const element = create(tag, ...args);
        if (tag === 'video') {
          qaReaders.push(element); element.qaPaused = element.qaLoads = 0;
          const pause = element.pause.bind(element), load = element.load.bind(element);
          element.pause = () => { element.qaPaused++; pause(); };
          element.load = () => { element.qaLoads++; load(); };
        }
        return element;
      };
    });
    const releases = [];
    await editor.route('https://media.test/slow-*.mp4', route => new Promise(resolve => {
      releases.push(async () => { try { await route.fulfill({contentType:'video/mp4',body:clip}); } catch {} resolve(); });
    }));
    await editor.route('https://media.test/ready.mp4', route => route.fulfill({contentType:'video/mp4',body:clip}));
    await editor.goto(new URL('admin.html', process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011/').href);
    await editor.waitForFunction(() => document.querySelector('[data-publish-state]').textContent.includes('内容已连接'));
    await editor.locator('[data-studio-tab="videos"]').click();
    const form = editor.locator('[data-video-form]'), url = form.locator('[name="videoUrl"]');
    const probe = editor.locator('[data-probe-video]'), message = editor.locator('[data-video-message]');
    assert.ok(await form.locator('[name="aspectRatio"]').evaluate(input => input.checkValidity()), 'Default 16:9 ratio accepts four decimals');
    for (const video of fixture.videos.items) {
      await editor.locator(`[data-video-id="${video.id}"] [data-edit-video]`).click();
      assert.ok(await form.locator('[name="aspectRatio"]').evaluate(input => input.checkValidity()), `Stored ratio is valid: ${video.id}`);
    }
    await editor.locator('[data-new-video]').click();
    async function startSlow(name) {
      await url.fill(`https://media.test/slow-${name}.mp4`);
      await Promise.all([editor.waitForRequest(`https://media.test/slow-${name}.mp4`), probe.click()]);
      assert.ok(await form.locator('[type="submit"]').isDisabled());
      assert.ok(await probe.isDisabled());
      await editor.evaluate(() => { window.qaLate = qaReaders.at(-1).onloadedmetadata; });
    }
    async function stopped() {
      assert.ok(await editor.evaluate(() => {
        const video = qaReaders.at(-1);
        return !video.hasAttribute('src') && !video.onloadedmetadata && !video.onerror && video.qaPaused > 0 && video.qaLoads > 0;
      }), 'Reader releases source, callbacks and native network activity');
    }
    await startSlow('edit');
    const target = fixture.videos.items.find(item => item.sourceType !== 'bilibili' && !item.bvid);
    await editor.locator(`[data-video-id="${target.id}"] [data-edit-video]`).click(); await stopped();
    const expected = await form.locator('[name="duration"]').inputValue();
    await editor.evaluate(() => qaLate());
    assert.equal(await form.locator('[name="duration"]').inputValue(), expected);

    await startSlow('manual'); await form.locator('[name="duration"]').fill('77.123'); await stopped();
    await editor.evaluate(() => qaLate());
    assert.equal(await form.locator('[name="duration"]').inputValue(), '77.123');
    assert.ok(await form.locator('[type="submit"]').isEnabled());

    await startSlow('source'); await form.locator('[name="sourceType"]').selectOption('bilibili'); await stopped();
    await editor.evaluate(() => qaLate()); assert.ok(await probe.isHidden());
    await form.locator('[name="sourceType"]').selectOption('direct');
    await startSlow('reset'); await editor.locator('[data-reset-video]').click(); await stopped();
    await editor.evaluate(() => qaLate()); assert.equal(await form.locator('[name="duration"]').inputValue(), '');

    await startSlow('timeout'); await message.getByText('读取超时，请手动填写时长与画幅', {exact:true}).waitFor({timeout:20000}); await stopped();
    assert.ok(await probe.isEnabled());
    await url.fill('https://media.test/ready.mp4'); await probe.click();
    await message.getByText('视频信息已读取', {exact:true}).waitFor(); await stopped();
    assert.ok(await form.locator('[name="aspectRatio"]').evaluate(input => input.checkValidity()));
    assert.equal(Number(await form.locator('[name="duration"]').inputValue()), metadata.duration);

    await startSlow('logout'); await editor.locator('[data-sign-out]').click(); await stopped();
    await editor.evaluate(() => qaLate());
    assert.ok(await editor.locator('[data-dashboard]').isHidden());
    assert.equal(await form.locator('[name="duration"]').inputValue(), '');
    for (const release of releases) await release();
    assert.deepEqual(await editor.evaluate(() => qaCalls), [['plutonoc-content-publisher','load']]);
    assert.deepEqual(errors, []);
    console.log('PASS actual editor controls: valid stored/default ratios, stale reads cancelled on edit/manual change/source/reset/logout, native 15s timeout cleanup and retry; no writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
