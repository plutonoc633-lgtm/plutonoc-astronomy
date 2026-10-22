const assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
(async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/analytics-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_ANALYTICS={enabled:false};' }));
    await page.route('**/guestbook-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_GUESTBOOK={enabled:false};' }));
    await page.route('**/script.js?*', async route => {
      const response = await route.fetch();
      let source = (await response.text()).replace(/\r\n/g, '\n');
      source = source.replace('    draw() {', '    draw() {\n      window.qaCanvasFrames ||= [];');
      source = source.replace('      this.syncFocusedFromCenter();', `      this.syncFocusedFromCenter();
      const bitmaps = [...this.cache.entries].filter(([, entry]) => entry.bitmap);
      window.qaCanvasFrames.push({ visible: this.visible, thumbnails: bitmaps.filter(([src]) => src.includes('/thumbnails/')).length, previews: bitmaps.filter(([src]) => src.includes('/previews/')).length });`);
      source = source.replace("  setVisualStage('deepsky');\n  requestMainFrame();", "  window.qaCanvas=()=>archiveCanvas;\n  setVisualStage('deepsky');\n  requestMainFrame();");
      await route.fulfill({ response, body: source });
    });
    await page.goto(process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011/');
    await page.locator('.descent-sheet').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => window.qaCanvas?.()?.prepared);
    await page.waitForFunction(() => qaCanvas().cache.active === 0 && qaCanvas().cache.queue.length === 0);
    const warmup = await page.evaluate(() => ({ visible: qaCanvas().visible, top: qaCanvas().canvas.getBoundingClientRect().top,
      height: innerHeight, frames: qaCanvasFrames.length, sources: [...qaCanvas().cache.entries.keys()], loaded: [...qaCanvas().cache.entries.values()].filter(e => e.bitmap).length }));
    assert.equal(warmup.visible, false);
    assert.ok(warmup.top > warmup.height);
    assert.equal(warmup.frames, 1, 'Offscreen warmup paints only one preparation frame');
    assert.ok(warmup.loaded > 0 && warmup.sources.every(src => src.includes('/thumbnails/')), JSON.stringify(warmup));
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => qaCanvasFrames.length), warmup.frames, 'Thumbnail completion must not repaint the hidden canvas');

    await page.locator('.canvas-stage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => qaCanvasFrames.some(f => f.visible));
    const firstVisible = await page.evaluate(() => qaCanvasFrames.find(f => f.visible));
    assert.ok(firstVisible.thumbnails > 0);
    assert.equal(firstVisible.previews, 0, 'First visible frame uses already prepared thumbnails');
    await page.waitForFunction(() => qaCanvasFrames.some(f => f.visible && f.previews > 0));
    await page.waitForFunction(() => qaCanvas().cache.active === 0 && qaCanvas().cache.queue.length === 0);
    const beforeDrag = await page.evaluate(() => ({ ...qaCanvas().camera }));
    const bounds = await page.locator('[data-archive-canvas]').boundingBox();
    const dragY = Math.max(120, Math.min(900, bounds.y + bounds.height * .4));
    await page.mouse.move(bounds.x + bounds.width * .55, dragY);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .55 - 220, dragY, { steps: 6 });
    await page.mouse.up();
    assert.notDeepEqual(await page.evaluate(() => ({ ...qaCanvas().camera })), beforeDrag);
    await page.locator('.descent-sheet').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !qaCanvas().visible);
    assert.equal(await page.evaluate(() => Math.abs(qaCanvas().velocity.x) + Math.abs(qaCanvas().velocity.y)), 0);
    const paused = await page.evaluate(() => ({ frames: qaCanvasFrames.length, camera: { ...qaCanvas().camera } }));
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => ({ frames: qaCanvasFrames.length, camera: { ...qaCanvas().camera } })), paused);
    await page.locator('.canvas-stage').scrollIntoViewIfNeeded();
    await page.waitForFunction(n => qaCanvas().visible && qaCanvasFrames.length > n, paused.frames);
    assert.deepEqual(await page.evaluate(() => ({ ...qaCanvas().camera })), paused.camera, 'Returning preserves browsing position');

    await page.locator('.descent-sheet').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => !qaCanvas().visible);
    const frames = await page.evaluate(() => qaCanvasFrames.length);
    await page.evaluate(() => qaCanvas().setFilter('earth', true));
    await page.waitForFunction(n => qaCanvasFrames.length > n, frames);
    await page.waitForFunction(() => qaCanvas().cache.active === 0 && qaCanvas().cache.queue.length === 0);
    assert.equal(await page.evaluate(() => qaCanvasFrames.length), frames + 1, 'A changed hidden layout receives one new preparation frame');
    await page.locator('.canvas-stage').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => qaCanvas().visible && qaCanvasFrames.at(-1).visible);
    assert.equal(await page.evaluate(() => qaCanvas().filter), 'earth');
    assert.deepEqual(errors, []);
    console.log('PASS offscreen canvas prepares only thumbnails, suspends painting/upgrades, resumes with thumbnails then previews, and preserves position/category.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
