const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');

// Seed Chromium's real browser zoom preference in disposable profiles. This is
// neither CSS zoom, pinch scaling nor a smaller emulated viewport. The default
// storage partition key is "x" (empty relative path), per ChromeZoomLevelPrefs:
// https://chromium.googlesource.com/chromium/src/+/lkgr/chrome/browser/ui/zoom/chrome_zoom_level_prefs.cc
const base = process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011/';
const work = path.resolve('work');
(async () => {
  const results = [];
  for (const zoom of [1, 1.25, 1.5, 2]) {
    const profile = fs.mkdtempSync(path.join(work, 'zoom-'));
    fs.mkdirSync(path.join(profile, 'Default'));
    fs.writeFileSync(path.join(profile, 'Default', 'Preferences'), JSON.stringify({
      partition: { default_zoom_level: { x: Math.log(zoom) / Math.log(1.2) } }
    }));
    let context;
    try {
      context = await chromium.launchPersistentContext(profile, {
        ...launchOptions,
        // Chromium's separate headless shell ignores profile zoom preferences.
        // Use the full browser's new headless mode, as the local Edge run does.
        ...(!launchOptions.executablePath ? { channel: 'chromium' } : {}),
        viewport: null,
        args: ['--window-size=1440,1000', '--force-device-scale-factor=1']
      });
      const page = context.pages()[0];
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/analytics-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_ANALYTICS={enabled:false};' }));
      await page.route('**/guestbook-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_GUESTBOOK={enabled:false};' }));
      await page.route('https://player.bilibili.com/**', r => r.fulfill({ contentType: 'text/html', body: '<body style="background:#111;color:white">播放器布局测试</body>' }));
      await page.route('**/*.mp4', r => r.abort());
      await page.goto(base);
      await page.locator('.film-card').first().waitFor();
      const metrics = await page.evaluate(() => ({
        dpr: devicePixelRatio, width: innerWidth, height: innerHeight, outerWidth,
        pinch: visualViewport.scale, cssZoom: getComputedStyle(document.documentElement).zoom,
        overflow: document.documentElement.scrollWidth > innerWidth
      }));
      assert.ok(Math.abs(metrics.dpr - zoom) < .01, JSON.stringify(metrics));
      assert.equal(metrics.outerWidth, 1440);
      assert.equal(metrics.pinch, 1);
      assert.equal(metrics.cssZoom, '1');
      assert.equal(metrics.overflow, false);

      await page.locator('[data-index-open]').click();
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.index-panel')).transform === 'matrix(1, 0, 0, 1, 0, 0)');
      const entries = await page.locator('[data-index-link]').evaluateAll(links => links.map(link => {
        const r = link.getBoundingClientRect();
        return { text: link.textContent.trim(), rect: { top: r.top, right: r.right, bottom: r.bottom }, visible: r.top >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 };
      }));
      await page.screenshot({ path: `work/browser-zoom-index-${Math.round(zoom * 100)}.png` });
      assert.ok(entries.every(entry => entry.visible), JSON.stringify({ zoom, metrics, entries }));
      await page.keyboard.press('Escape');

      await page.locator('[data-gallery-directory-open]').click();
      await page.locator('[data-gallery-directory-search]').fill('新宿雨');
      await page.locator('[data-directory-card]').first().click();
      await page.waitForFunction(() => document.querySelector('[data-photo-dialog]').open);
      const photo = await page.locator('.photo-stage').evaluate(stage => {
        const image = stage.querySelector('img').getBoundingClientRect(), bounds = stage.getBoundingClientRect();
        const close = document.querySelector('.photo-dialog .dialog-close').getBoundingClientRect();
        return { inside: image.left >= bounds.left - 1 && image.right <= bounds.right + 1 && image.top >= bounds.top - 1 && image.bottom <= bounds.bottom + 1,
          closeVisible: close.top >= 0 && close.bottom <= innerHeight && close.right <= innerWidth };
      });
      assert.ok(photo.inside && photo.closeVisible, JSON.stringify({ zoom, photo }));
      await page.locator('.photo-dialog .dialog-close').click();

      await page.locator('.film-card button').first().click();
      const video = await page.locator('.video-shell').evaluate(shell => {
        const r = shell.getBoundingClientRect(), caption = shell.querySelector('.video-caption');
        return { inside: r.top >= 0 && r.bottom <= innerHeight + 1,
          centered: Math.abs(r.top + r.height / 2 - innerHeight / 2) < 2,
          captionHeight: caption.clientHeight, captionScroll: caption.scrollHeight,
          captionLimit: parseFloat(getComputedStyle(caption).maxHeight),
          hiddenPlayer: getComputedStyle(shell.querySelector('video')).display === 'none' };
      });
      assert.ok(video.inside && video.centered && video.hiddenPlayer, JSON.stringify({ zoom, video }));
      assert.ok(video.captionScroll <= video.captionHeight + 1 || Math.abs(video.captionHeight - video.captionLimit) <= 1,
        JSON.stringify({ zoom, video }));
      await page.screenshot({ path: `work/browser-zoom-${Math.round(zoom * 100)}.png` });
      await page.locator('.video-dialog .dialog-close').click();
      assert.equal(await page.locator('.bilibili-player').count(), 0);
      assert.deepEqual(errors, []);
      results.push({ zoom, metrics, photo, video });
    } finally {
      if (context) await context.close();
      // Only delete this test's newly-created, resolved directory inside work/.
      if (profile.startsWith(work + path.sep) && path.basename(profile).startsWith('zoom-')) fs.rmSync(profile, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(path.join(work, 'browser-zoom-results.json'), JSON.stringify(results, null, 2));
  console.log('PASS real browser zoom 100/125/150/200%: INDEX entries, photo fit/close, centered single video player and caption overflow.');
})().catch(error => { console.error(error); process.exitCode = 1; });
