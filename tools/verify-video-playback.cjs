// Opt-in live media check; does not post analytics or guestbook data.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
const base = process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011/';
const isMedia = url => {
  const u = new URL(url);
  return u.pathname === '/media' || (u.hostname.endsWith('.myqcloud.com') && u.pathname.startsWith('/plutonoc/videos/'));
};
const state = video => ({ time: video.currentTime, duration: video.duration, paused: video.paused, ready: video.readyState, seeking: video.seeking, width: video.videoWidth, height: video.videoHeight, error: video.error?.code || null });
(async () => {
  const browser = await chromium.launch(launchOptions);
  const results = [], requests = [], responses = [], failures = [];
  const active = new Set();
  try {
    const page = await browser.newPage();
    await page.route('**/analytics-config.js?*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_ANALYTICS={enabled:false};' }));
    await page.route('**/guestbook-config.js?*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_GUESTBOOK={enabled:false};' }));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 30, downloadThroughput: 4 * 1024 * 1024, uploadThroughput: 512 * 1024 });
    page.on('request', request => {
      if (isMedia(request.url())) {
        active.add(request);
        requests.push({ path: new URL(request.url()).pathname, range: request.headers().range || null });
      }
    });
    page.on('requestfinished', request => active.delete(request));
    page.on('requestfailed', request => active.delete(request));
    page.on('response', response => {
      if (!isMedia(response.url())) return;
      // Never write the short-lived signature from the final URL or Location.
      responses.push({ path: new URL(response.url()).pathname, status: response.status(), range: response.headers()['content-range'] || null });
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.film-card');
    await page.waitForTimeout(500);
    assert.equal(requests.length, 0, 'No full film should load before opening');
    const video = page.locator('.video-frame video');
    for (const [index, duration] of [[1, 285.9], [2, 151.6]]) {
      const started = Date.now(), requestStart = requests.length;
      await page.locator(`[data-film-index="${index}"] button`).click();
      try {
        await page.waitForFunction(() => { const v = document.querySelector('.video-frame video'); return Number.isFinite(v.duration) && v.readyState >= 2 && v.videoWidth > 0; }, null, { timeout: 45000 });
        const first = await video.evaluate(state);
        assert.ok(Math.abs(first.duration - duration) < 1);
        const readyMs = Date.now() - started;
        await video.evaluate(v => v.play());
        await page.waitForFunction(() => document.querySelector('.video-frame video').currentTime > 0.3, null, { timeout: 15000 });
        const seeks = [];
        for (const fraction of [0.5, 0.92]) {
          const seekStart = Date.now(), before = requests.length;
          const target = await video.evaluate((v, f) => { v.currentTime = v.duration * f; return v.currentTime; }, fraction);
          await page.waitForFunction(t => { const v = document.querySelector('.video-frame video'); return !v.seeking && v.readyState >= 2 && v.currentTime > t + 0.3; }, target, { timeout: 45000 });
          seeks.push({ target, elapsedMs: Date.now() - seekStart, newRequests: requests.length - before, state: await video.evaluate(state) });
        }
        await page.locator('.video-dialog .dialog-close').click();
        const count = requests.length;
        await page.waitForTimeout(1000);
        const closed = await video.evaluate(v => ({ src: v.getAttribute('src'), paused: v.paused, ready: v.readyState }));
        assert.deepEqual(closed, { src: null, paused: true, ready: 0 });
        assert.equal(requests.length, count, 'No new film requests after close');
        assert.equal(active.size, 0, 'Closing must cancel in-flight film requests');
        assert.ok(requests.slice(requestStart).some(r => r.range && !/^bytes=0-/.test(r.range)), 'Seek must request a later byte range');
        results.push({ index, readyMs, first, seeks, closed, requestsAfterClose: requests.length - count, activeAfterClose: active.size });
      } catch (error) {
        failures.push({ index, message: error.message.split('\n')[0], state: await video.evaluate(state) });
        await page.locator('.video-dialog .dialog-close').click();
      }
    }
    const report = { base, results, requests, responses, failures };
    fs.writeFileSync('work/video-playback-verification.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    assert.equal(failures.length, 0);
    assert.equal(results.length, 2);
    assert.ok(responses.filter(r => r.path.endsWith('.mp4')).every(r => r.status === 206));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
