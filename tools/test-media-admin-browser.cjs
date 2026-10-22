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
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
