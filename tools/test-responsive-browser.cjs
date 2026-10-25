const assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
(async () => {
 const browser = await chromium.launch(launchOptions);
 try {
  const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
  await page.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:true,endpoint:"https://qa.test/book"};'}));
  let gets=0;
  await page.route('https://qa.test/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,data:{items:Array.from({length:20},(_,i)=>({_id:`${gets}-${i}`,nickname:'测试',body:'测试长留言。'.repeat(60),publishedAt:1800000000000})),nextCursor:++gets===1?'next':null}})}));
  // Test-only instrumentation; no public debugging interface is shipped.
  await page.route('**/script.js?*',async r=>{
   const response=await r.fetch(); let source=(await response.text()).replace(/\r\n/g,'\n');
   source=source.replace('  setVisualStage(\'deepsky\');\n  requestMainFrame();', '  window.qa = {canvas:()=>archiveCanvas, mobile:()=>isMobile, metrics:()=>({...layoutMetrics}), preview:()=>indexPreviewRequest};\n  setVisualStage(\'deepsky\');\n  requestMainFrame();');
   source=source.replace('  function refreshLayoutMetrics() {','  function refreshLayoutMetrics() { window.qaRefreshes=(window.qaRefreshes||0)+1;');
   await r.fulfill({response,body:source});
  });
  await page.goto(process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011');
  await page.waitForFunction(()=>window.qa);
  let previews=0;
  await page.route('**/qa-index-*.png',r=>{previews++;return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64')});});
  await page.evaluate(()=>document.querySelectorAll('.index-nav a').forEach((a,i)=>a.dataset.preview=`/qa-index-${i}.png`));
  await page.locator('[data-index-open]').click();
  await page.locator('.index-nav a').nth(3).focus(); await page.waitForTimeout(200);
  assert.equal(previews,0,'hidden mobile preview must not download');
  await page.setViewportSize({width:1440,height:1000});
  await page.waitForFunction(()=>document.querySelector('.index-preview img').getAttribute('src')==='/qa-index-3.png');
  await page.waitForFunction(()=>document.querySelector('.index-preview img').complete);
  const visibleRequests=previews; assert.ok(visibleRequests>0);
  let releaseSlow, slowStarted;
  const started=new Promise(resolve=>slowStarted=resolve);
  const pending=new Promise(resolve=>releaseSlow=resolve);
  await page.route('**/qa-slow.png',async r=>{slowStarted();await pending;await r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64')});});
  await page.evaluate(()=>document.querySelectorAll('.index-nav a')[4].dataset.preview='/qa-slow.png');
  await page.locator('.index-nav a').nth(4).focus();await started;
  await page.locator('.index-nav a').nth(3).focus();releaseSlow();await page.waitForTimeout(150);
  assert.equal(await page.locator('.index-preview img').getAttribute('src'),'/qa-index-3.png','late preview must not replace current item');
  await page.setViewportSize({width:1440,height:700});
  await page.locator('.index-nav a').nth(4).focus(); await page.waitForTimeout(150); assert.equal(previews,visibleRequests,'short viewport preview must not download');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{document.querySelector('[data-index-open]').click();document.querySelector('[data-index-close]:not(.index-backdrop)').click();});
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.activeElement.matches('[data-index-open]')),true,'closed index must not steal focus');
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#works').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>qa.canvas()?.nodes.length);
  await page.evaluate(()=>qa.canvas().setFilter('earth',true));
  const anchor=()=>page.evaluate(()=>{const c=qa.canvas(),m=(v,n)=>(v%n+n)%n;const points=c.nodes.map(n=>{const dx=m(n.x-c.camera.x+c.tile.width/2,c.tile.width)-c.tile.width/2,dy=m(n.y-c.camera.y+c.tile.height/2,c.tile.height)-c.tile.height/2;const point=c.project(dx,dy);return point&&{id:n.work.id,x:point.x/c.width,y:point.y/c.height,distance:Math.hypot(dx,dy)};}).filter(Boolean);return points.sort((a,b)=>a.distance-b.distance)[0];});
  for(const width of [390,844,390,1440]) {
   const before=await anchor();
   await page.setViewportSize({width,height:844});
   await page.waitForFunction(w=>qa.mobile()===(w<=760)&&qa.canvas().mobile===(w<=760),width);
   const state=await page.evaluate(before=>{const c=qa.canvas(),m=(v,n)=>(v%n+n)%n;return {filter:c.filter,dpr:c.dpr,concurrency:c.cache.concurrency,matched:c.nodes.filter(n=>n.work.id===before.id).some(n=>{const p=c.project(m(n.x-c.camera.x+c.tile.width/2,c.tile.width)-c.tile.width/2,m(n.y-c.camera.y+c.tile.height/2,c.tile.height)-c.tile.height/2);return p&&Math.abs(p.x/c.width-before.x)<.001&&Math.abs(p.y/c.height-before.y)<.001;})};},before);
   assert.equal(state.filter,'earth'); assert.ok(state.matched,'same artwork retains relative position'); assert.equal(state.dpr,width<=760?1.2:1.75);assert.equal(state.concurrency,width<=760?4:6);
   assert.equal(await page.locator('.is-mobile-current').count(),width<=760?1:0);
  }
  await page.locator('[data-guestbook]').scrollIntoViewIfNeeded(); await page.waitForSelector('.book-entry');
  const checkHeight=()=>page.waitForFunction(()=>Math.abs(qa.metrics().scrollable-(document.documentElement.scrollHeight-innerHeight))<=1);
  await checkHeight(); const h=await page.evaluate(()=>qa.metrics().scrollable);
  await page.locator('[data-book-more]').click(); await page.waitForFunction(()=>document.querySelectorAll('.book-entry').length===40);await checkHeight();assert.ok(await page.evaluate(()=>qa.metrics().scrollable)>h);
  await page.evaluate(()=>document.querySelector('#message').style.height='650px');await checkHeight();
  await page.waitForTimeout(400);const ticks=await page.evaluate(()=>qaRefreshes);await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>qaRefreshes),ticks,'idle layout must settle');
  assert.deepEqual(errors,[]);console.log('PASS responsive anchor/cache/DPR, hidden preview, index focus cancellation, dynamic page height and settled layout.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
