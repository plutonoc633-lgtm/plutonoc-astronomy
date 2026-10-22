const assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
(async () => {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const requests = []; page.on('request', r => requests.push(r.url()));
    await page.route('**/analytics-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_ANALYTICS={enabled:false};' }));
    await page.route('**/guestbook-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_GUESTBOOK={enabled:true,endpoint:"https://qa.test/book"};' }));
    await page.route('https://qa.test/**', r => r.fulfill({ contentType: 'application/json', body: '{"ok":true,"data":{"items":[],"nextCursor":null}}' }));
    await page.route('https://player.bilibili.com/**', r => r.fulfill({ contentType: 'text/html', body: '<body style="background:#111;color:#888">B站播放器尺寸测试</body>' }));
    await page.route('**/*.mp4', r => r.abort());
    await page.route('**/media?id=*', r => r.abort());
    await page.goto(process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011');
    await page.waitForTimeout(700);
    assert.equal(requests.some(url => /guestbook(?:-config)?\.js|qa\.test/.test(url)), false, 'No guestbook module/data at first screen');
    await page.locator('.film-card').first().click();
    for (const viewport of [{width:2048,height:1070},{width:1366,height:768},{width:800,height:450},{width:390,height:844},{width:844,height:390},{width:640,height:360}]) {
      await page.setViewportSize(viewport); await page.waitForTimeout(80);
      const result = await page.evaluate(() => {
        const rect = selector => {const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
        return { shell:rect('.video-shell'), frame:rect('.video-frame'), close:rect('.video-dialog .dialog-close'), display:getComputedStyle(document.querySelector('.video-frame video')).display, count:document.querySelectorAll('.bilibili-player').length };
      });
      assert.equal(result.display,'none'); assert.equal(result.count,1);
      assert.ok(Math.abs(result.shell.x+result.shell.w/2-viewport.width/2)<2);
      assert.ok(Math.abs(result.shell.y+result.shell.h/2-viewport.height/2)<2,JSON.stringify({viewport,result}));
      assert.ok(result.shell.y>=0 && result.shell.b<=viewport.height+1);
      assert.ok(Math.abs(result.frame.w/result.frame.h-16/9)<.01);
      assert.ok(result.close.y>=0 && result.close.b<=viewport.height);
    }
    await page.evaluate(()=>{document.querySelector('.video-caption h3').textContent='很长的影片标题'.repeat(100);window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
    assert.ok(await page.evaluate(()=>document.querySelector('.video-shell').getBoundingClientRect().bottom<=innerHeight));
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.bilibili-player').count(),0);
    await page.setViewportSize({width:1440,height:1000});
    const title=await page.evaluate(()=>window.localVideoData.find(x=>x.sourceType!=='bilibili'&&!x.bvid)?.title);
    assert.ok(title,'direct video fixture'); await page.locator('.film-card').filter({hasText:title}).first().click();
    assert.equal(await page.locator('.bilibili-player').count(),0); assert.equal(await page.locator('.video-frame video').isVisible(),true);
    await page.locator('.video-dialog .dialog-close').click();
    assert.equal(await page.locator('.video-frame video').getAttribute('src'),null);
    await page.evaluate(()=>{document.querySelectorAll('.film-card button')[1].click();document.querySelector('.video-dialog .dialog-close').click();document.querySelector('.film-card button').click();});
    await page.waitForTimeout(100);assert.equal(await page.locator('.bilibili-player').count(),1,'A delayed close must not clear the reopened video');await page.keyboard.press('Escape');assert.equal(await page.locator('.bilibili-player').count(),0);
    await page.locator('.film-card').first().click(); assert.equal(await page.locator('.bilibili-player').count(),1); await page.keyboard.press('Escape');
    await page.locator('[data-guestbook]').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('[data-guestbook]').dataset.initialized==='true');
    assert.equal(requests.filter(url=>url==='https://qa.test/book').length,1);
    await page.locator('[data-guestbook]').screenshot({path:'work/book-home-desktop.png'});
    await page.setViewportSize({width:390,height:844});await page.locator('[data-guestbook]').screenshot({path:'work/book-home-mobile.png'});
    console.log('PASS deferred guestbook, viewport-centered single video player, aspect ratio, long caption, close/ESC cleanup and source switching.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
