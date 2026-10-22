const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
(async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/analytics-config.js?*', r => r.fulfill({ body: 'window.PLUTONOC_ANALYTICS={enabled:false};' }));
    await page.route('**/guestbook-config.js?*', r => r.fulfill({ body: 'window.PLUTONOC_GUESTBOOK={enabled:false};' }));
    await page.goto(process.env.PLUTONOC_TEST_URL || 'https://plutonoc.cn/');
    await page.locator('.film-card button').first().click();
    const frame = page.frameLocator('iframe.bilibili-player');
    const video = frame.locator('video').first();
    await video.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('iframe.bilibili-player'));
    const initial = await video.evaluate(v => ({ time: v.currentTime, duration: v.duration, paused: v.paused, ready: v.readyState }));
    await video.evaluate(v => v.play());
    await page.waitForTimeout(2500);
    const played = await video.evaluate(v => ({ time: v.currentTime, duration: v.duration, paused: v.paused, ready: v.readyState, width: v.videoWidth, height: v.videoHeight, error: v.error?.code || null }));
    assert.ok(played.time > initial.time + .5 && played.ready >= 2 && !played.paused && !played.error, JSON.stringify({ initial, played }));
    await page.screenshot({ path: 'work/bilibili-live-playback.png' });
    await video.hover();
    await frame.getByRole('button', { name: '全屏', exact: true }).click();
    const fullscreen = await page.evaluate(() => ({ tag: document.fullscreenElement?.tagName || null }));
    assert.equal(fullscreen.tag, 'IFRAME');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // Headless Chromium does not process every browser accelerator. Exercise
    // the real embedded player's fullscreen toggle to leave fullscreen too.
    if (await page.evaluate(() => Boolean(document.fullscreenElement))) {
      await video.hover();
      await frame.getByRole('button', { name: /全屏/ }).click();
      await page.waitForFunction(() => !document.fullscreenElement);
    }
    await page.locator('.video-dialog .dialog-close').click();
    assert.equal(await page.locator('.bilibili-player').count(), 0);
    const results = { initial, played, fullscreen, exitedFullscreen: true, closedFrameCount: 0 };
    fs.writeFileSync('work/bilibili-live-results.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
