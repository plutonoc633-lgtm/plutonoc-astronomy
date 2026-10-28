'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,launchOptions}=require('./browser-test-runtime.cjs');
const BASE=process.env.PLUTONOC_TEST_URL||'http://127.0.0.1:9011';
const report={checks:[],errors:[],limits:['Simulated image latency and touch-sized viewport; physical networks and phones are not reproduced.']};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS',name);}
async function pageFor(browser,options){
 const page=await browser.newPage(options);
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
 await page.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:false};'}));
 await page.route('**/script.js?*',async r=>{const response=await r.fetch();const body=(await response.text()).replace('    archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks);','    archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks); window.__loadingArchive=archiveCanvas;');await r.fulfill({response,body});});
 await page.route('**/assets/gallery/**',async r=>{await delay(r.request().url().includes('/previews/')?1400:180);try{await r.continue();}catch{}});
 await page.goto(BASE+'/#works');
 await page.waitForFunction(()=>window.__loadingArchive?.rendered.length>0);
 await page.locator('[data-archive-canvas]').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));
 await page.waitForFunction(()=>{const a=__loadingArchive;return a.visible&&a.rendered.filter(i=>i.opacity>.15).every(i=>a.cache.entries.get(i.node.work.thumbnailSrc)?.bitmap);});
 await page.evaluate(()=>{const a=__loadingArchive,native=PlutonoCImages.load;a.__duringDragUpgrades=[];a.__drawCost=[];const draw=a.draw.bind(a);a.draw=function(){const start=performance.now();try{return draw();}finally{a.__drawCost.push(performance.now()-start);}};PlutonoCImages.load=(source,options)=>{if(a.pointer?.dragging&&a.allPreviewSources.has(source)&&!a.allThumbnailSources.has(source))a.__duringDragUpgrades.push(source);return native(source,options);};});
 return page;
}
function warmState(){const a=__loadingArchive,visible=new Set(a.rendered.filter(i=>i.opacity>.015).map(i=>i.node.work.thumbnailSrc)),protectedThumbs=[...a.cache.protectedSources].filter(s=>a.allThumbnailSources.has(s));return{extra:protectedThumbs.filter(s=>!visible.has(s)).length,pendingPreviews:a.cache.activeUpgrades,concurrency:a.cache.concurrency,previews:a.previewSources.size};}
(async()=>{const browser=await chromium.launch(launchOptions);try{
 const p=await pageFor(browser,{viewport:{width:1440,height:900}});
 await check('desktop reserves thumbnail capacity and warms only a bounded nearby ring',async()=>{await p.waitForFunction(()=>__loadingArchive.cache.activeUpgrades>0);const s=await p.evaluate(warmState);assert(s.pendingPreviews<=2&&s.concurrency===6);assert(s.extra>0&&s.extra<=12);});
 await check('continuous dragging and reversal load thumbnails without starting new upgrades',async()=>{
  const rect=await p.locator('[data-archive-canvas]').boundingBox(),y=Math.max(180,Math.min(700,rect.y+rect.height*.45));
  await p.mouse.move(1180,y);await p.mouse.down();
  for(let n=1;n<=75;n++){await p.mouse.move(1180-n*11,y-n*.5);await p.waitForTimeout(20);}
  assert(await p.evaluate(()=>__loadingArchive.pointer?.dragging));
  const state=await p.evaluate(warmState);assert(state.extra<=12);assert.equal(state.pendingPreviews,0);
  await p.mouse.up();await p.waitForTimeout(250);await p.mouse.move(400,y-40);await p.mouse.down();
  for(let n=1;n<=60;n++){await p.mouse.move(400+n*11,y-40+n*.5);await p.waitForTimeout(20);}
  await p.mouse.up();
  assert.deepEqual(await p.evaluate(()=>__loadingArchive.__duringDragUpgrades),[]);
  await p.waitForFunction(()=>{const a=__loadingArchive;return Math.abs(a.velocity.x)+Math.abs(a.velocity.y)<.04
    &&a.cache.active===0&&a.cache.queue.length===0&&[...a.previewSources].some(s=>a.cache.entries.get(s)?.bitmap);},{},{timeout:20000});
  assert(await p.evaluate(()=>{const a=__loadingArchive;return a.rendered.filter(i=>i.opacity>.15).every(i=>a.cache.entries.get(i.node.work.thumbnailSrc)?.bitmap);}));
  const costs=await p.evaluate(()=>__loadingArchive.__drawCost.sort((a,b)=>a-b));report.drawCpuMs={samples:costs.length,median:costs[Math.floor(costs.length*.5)],p95:costs[Math.floor(costs.length*.95)]};
 });
 await check('idle restores bounded high-resolution upgrades, then leaving cancels pending work',async()=>{
  assert(await p.evaluate(()=>{const a=__loadingArchive;return a.previewSources.size<=6&&[...a.previewSources].some(s=>a.cache.entries.get(s)?.bitmap);}));
  await p.locator('.descent-sheet').evaluate(e=>e.scrollIntoView({behavior:'instant'}));await p.waitForFunction(()=>!__loadingArchive.visible);
  await p.waitForFunction(()=>__loadingArchive.cache.active===0);assert(await p.evaluate(()=>__loadingArchive.previewSources.size===0&&__loadingArchive.cache.queue.length===0));
 });
 const m=await pageFor(browser,{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await check('mobile keeps four previews, one upgrade slot and at most six warmed thumbnails',async()=>{const s=await m.evaluate(warmState);assert(s.previews<=4&&s.pendingPreviews<=1&&s.concurrency===4&&s.extra<=6);assert.equal(await m.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);});
 assert.deepEqual(report.errors,[]);fs.writeFileSync('work/canvas-loading-browser-report.json',JSON.stringify(report,null,2));
 }finally{await browser.close();}})().catch(e=>{console.error(e);fs.writeFileSync('work/canvas-loading-browser-report.json',JSON.stringify({...report,fatal:e.message},null,2));process.exitCode=1;});
