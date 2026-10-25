'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
const base = process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011';
const report = { checks: [], errors: [], writes: [], limits: 'Browser simulation; physical touch, browser chrome and presentation timing are unverified.' };
let browser;
async function page(options = {}) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 }, ...options });
  p.on('pageerror', error => report.errors.push(error.message));
  p.on('request', request => { if (!['GET', 'HEAD'].includes(request.method())) report.writes.push(request.url()); });
  await p.route('**/analytics-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_ANALYTICS={enabled:false};' }));
  await p.route('**/guestbook-config.js?*', r => r.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_GUESTBOOK={enabled:false};' }));
  await p.route('**/script.js?*', async r => {
    const response = await r.fetch();
    let source = (await response.text()).replace(/\r\n/g, '\n');
    source = source.replace('    archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks);',
      '    archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks);window.qaCanvas=archiveCanvas;');
    source = source.replace("  setVisualStage('deepsky');\n  requestMainFrame();",
      "  window.qaMotion={state:photoMotion,seen:()=>[...seenWorkIds],index:()=>photoIndex,rect:photoRect};const nativeFlight=photoFlight;photoFlight=(...args)=>{const result=nativeFlight(...args),f=photoMotion.flight;if(f){window.qaMotion.lastFlight={left:parseFloat(f.style.left),top:parseFloat(f.style.top),width:parseFloat(f.style.width),height:parseFloat(f.style.height),last:f.getAnimations()[0]?.effect.getKeyframes().at(-1),duration:args[3]};}return result;};\n  setVisualStage('deepsky');\n  requestMainFrame();");
    await r.fulfill({ response, body: source });
  });
  return p;
}
async function gallery(p) {
  await p.goto(base + '/#works');
  await p.waitForFunction(() => window.qaCanvas?.rendered.length);
  await p.locator('[data-archive-canvas]').evaluate(e => e.scrollIntoView({ behavior: 'instant', block: 'center' }));
  await p.waitForFunction(() => qaCanvas.visible);
  await p.waitForTimeout(150);
}
async function clickWork(p) {
  await p.waitForFunction(()=>qaCanvas.rendered.some(i=>i.x>30&&i.x<qaCanvas.width-30&&i.y>60&&i.y<qaCanvas.sceneHeight-60&&qaCanvas.hitTest(i.x,i.y)?.key===i.key&&(qaCanvas.cache.get(i.node.work.thumbnailSrc)||qaCanvas.cache.get(i.node.work.previewSrc))));
  const item = await p.evaluate(() => {
    const a = qaCanvas;
    const i = a.rendered.slice().sort((x,y) => x.distance-y.distance).find(i => i.x>30 && i.x<a.width-30 && i.y>60 && i.y<a.sceneHeight-60 && a.hitTest(i.x,i.y)?.key===i.key && (a.cache.get(i.node.work.thumbnailSrc)||a.cache.get(i.node.work.previewSrc)));
    return { x:i.x, y:i.y, title:i.node.work.title, id:i.node.work.id };
  });
  const r = await p.locator('[data-archive-canvas]').boundingBox();
  await p.mouse.click(r.x+item.x, r.y+item.y);
  return item;
}
async function opened(p) { await p.waitForFunction(() => qaMotion.state.phase==='open' && qaMotion.state.committed); }
async function closed(p) { await p.waitForFunction(() => !document.querySelector('[data-photo-dialog]').open && qaMotion.state.phase==='closed'); await p.waitForTimeout(40); }
async function check(name, run) {
  let p;
  try { p=await page(); await run(p); report.checks.push({name,passed:true}); console.log('PASS',name); }
  catch(error) { report.checks.push({name,passed:false,error:error.stack}); console.log('FAIL',name,error.stack); }
  finally { await p?.close(); }
}
(async()=>{
  browser=await chromium.launch(launchOptions);
  await check('home category close and forward/back restore exact camera and scroll',async p=>{
    await p.goto(base+'/#home'); await p.locator('[data-home-filter="earth"]').click();
    await p.waitForURL('**/#works'); await p.waitForFunction(()=>!document.body.classList.contains('is-transitioning')&&!document.body.classList.contains('is-transition-exiting'));
    await p.locator('[data-archive-canvas]').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'})); await p.waitForFunction(()=>qaCanvas.visible);
    const r=await p.locator('[data-archive-canvas]').boundingBox();
    await p.mouse.move(740,r.y+350);await p.mouse.down();for(let i=1;i<=12;i++){await p.mouse.move(740-i*10,r.y+350+i*2);await p.waitForTimeout(15);}await p.waitForTimeout(130);await p.mouse.up();
    const before=await p.evaluate(()=>({camera:{...qaCanvas.camera},filter:qaCanvas.filter,scroll:scrollY}));
    const item=await clickWork(p);await opened(p);assert.equal(await p.locator('[data-photo-title]').textContent(),item.title);
    await p.keyboard.press('Escape');await closed(p);
    assert.deepEqual(await p.evaluate(()=>({camera:{...qaCanvas.camera},filter:qaCanvas.filter,scroll:scrollY})),before);
    await p.goForward();await opened(p);await p.goBack();await closed(p);
    assert.deepEqual(await p.evaluate(()=>({camera:{...qaCanvas.camera},filter:qaCanvas.filter,scroll:scrollY})),before);
  });
  await check('Escape during opening cancels the flight without history or seen records',async p=>{
    await gallery(p);const before=await p.evaluate(()=>({url:location.href,seen:qaMotion.seen()}));
    await clickWork(p);await p.waitForFunction(()=>qaMotion.state.phase==='opening');await p.keyboard.press('Escape');await closed(p);await p.waitForTimeout(350);
    assert.deepEqual(await p.evaluate(()=>({url:location.href,seen:qaMotion.seen()})),before);assert.equal(await p.locator('.photo-transition-image').count(),0);
  });
  await check('close button cancels an unfinished opening and cannot reopen later',async p=>{
    await gallery(p);await clickWork(p);await p.locator('.photo-dialog .dialog-close').click();await closed(p);await p.waitForTimeout(350);
    assert.equal(await p.locator('[data-photo-dialog]').evaluate(e=>e.open),false);assert.equal(await p.locator('.photo-transition-image').count(),0);
  });
  await check('opening flight ends at the contained image rectangle',async p=>{
    await gallery(p);await clickWork(p);await p.waitForFunction(()=>!!qaMotion.lastFlight);
    const measured=await p.evaluate(()=>{const r=qaMotion.lastFlight,m=new DOMMatrix(r.last.transform),work=qaCanvas.visibleWorks[qaMotion.index()];return{end:{left:r.left+m.m41,top:r.top+m.m42,width:r.width*m.m11,height:r.height*m.m22},target:qaMotion.rect(work),duration:r.duration};});
    report.geometry=measured;
    assert.equal(measured.duration,300);for(const key of ['left','top','width','height'])assert(Math.abs(measured.end[key]-measured.target[key])<1);
    await opened(p);assert.equal(await p.locator('.photo-transition-image').count(),0);
  });
  await check('slow next preview retains the displayed image, title and history until ready',async p=>{
    await gallery(p);await clickWork(p);await opened(p);
    const before=await p.evaluate(()=>({src:document.querySelector('.photo-stage img').getAttribute('src'),title:document.querySelector('[data-photo-title]').textContent,url:location.href}));
    let release;const hold=new Promise(resolve=>release=resolve);
    await p.route('**/*motion_slow*',async r=>{await hold;try{const response=await r.fetch();await r.fulfill({response});}catch{}});
    const target=await p.evaluate(()=>{const w=qaCanvas.visibleWorks[(qaMotion.index()+1)%qaCanvas.visibleWorks.length];for(const key of ['thumbnailSrc','previewSrc','src'])if(w[key]){const u=new URL(w[key],location.href);u.searchParams.set('motion_slow','1');w[key]=u.href;}return w.title;});
    await p.locator('.photo-dialog .dialog-next').click();await p.waitForTimeout(230);
    assert.deepEqual(await p.evaluate(()=>({src:document.querySelector('.photo-stage img').getAttribute('src'),title:document.querySelector('[data-photo-title]').textContent,url:location.href})),before);
    release();await p.waitForFunction(title=>qaMotion.state.phase==='open'&&document.querySelector('[data-photo-title]').textContent===title,target);await p.waitForFunction(()=>!qaMotion.state.flight,null,{timeout:3000});
    assert(await p.locator('.photo-stage img').getAttribute('src'));assert.equal(await p.locator('.photo-transition-image').count(),0);
  });
  await check('rapid switches and closing discard all late image/animation results',async p=>{
    await gallery(p);await clickWork(p);await opened(p);await p.evaluate(()=>{const next=document.querySelector('.photo-dialog .dialog-next');next.click();next.click();next.click();document.querySelector('.photo-dialog .dialog-close').click();});await closed(p);await p.waitForTimeout(500);
    assert.equal(await p.locator('.photo-transition-image').count(),0);assert.equal(await p.locator('.photo-stage img').getAttribute('src'),null);assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('dialog-open')),false);
  });
  await check('reopening during the close continues from its current picture and keeps one history entry',async p=>{
    await gallery(p);const item=await clickWork(p);await opened(p);
    const before=await p.evaluate(()=>({length:history.length,camera:{...qaCanvas.camera}}));
    await p.locator('.photo-dialog .dialog-close').click();await p.waitForTimeout(45);
    await p.evaluate(id=>{const item=qaCanvas.rendered.find(i=>i.node.work.id===id);qaCanvas.startOpening(item);},item.id);
    await opened(p);assert.equal(await p.locator('[data-photo-title]').textContent(),item.title);
    assert.equal(await p.evaluate(()=>history.length),before.length);
    await p.keyboard.press('Escape');await closed(p);await p.waitForTimeout(80);
    assert.deepEqual(await p.evaluate(()=>({...qaCanvas.camera})),before.camera);
    assert.equal(await p.locator('.photo-transition-image').count(),0);
  });
  await check('category interruptions discard the opening and retire one snapshot before upgrading previews',async p=>{
    await gallery(p);await clickWork(p);await p.evaluate(()=>qaCanvas.setFilter('deepsky',true));await closed(p);await p.waitForTimeout(150);
    await p.evaluate(()=>{qaCanvas.setFilter('earth');setTimeout(()=>qaCanvas.setFilter('planet'),35);});
    await p.waitForFunction(()=>qaCanvas.filter==='planet'&&!qaCanvas.filterTransition);
    assert.equal(await p.locator('.sphere-wall-snapshot').count(),0);assert(await p.evaluate(()=>qaCanvas.rendered.every(i=>i.node.work.category==='planet')&&qaCanvas.previewSources.size<=6));
  });
  await check('tight rows keep 30/32px world spacing, preserve ratio, and keep titles in their footer',async p=>{
    await gallery(p);
    for(const width of [1440,320,390,430,844]){
      await p.setViewportSize({width,height:844});await p.waitForTimeout(100);
      const result=await p.evaluate(()=>{const a=qaCanvas,tops=[...new Set(a.nodes.map(n=>n.y-n.height/2))].sort((a,b)=>a-b),gap=a.mobile?32:30;return{valid:tops.slice(0,-1).every((t,i)=>{const n=a.nodes.find(n=>Math.abs(n.y-n.height/2-t)<.001);return Math.abs(tops[i+1]-t-n.height-gap)<.001})&&Math.abs(tops[0]+a.tile.height-(tops.at(-1)+a.nodes.find(n=>Math.abs(n.y-n.height/2-tops.at(-1))<.001).height)-gap)<.001,overflow:document.documentElement.scrollWidth>innerWidth,footer:a.footerHeight,ratios:a.rendered.every(i=>Math.abs(i.width/i.height-i.node.width/i.node.height)<.001)};});assert(result.valid&&!result.overflow&&result.ratios&&result.footer>=76);
    }
  });
  await check('cross-section back and reduced-motion changes interrupt without stranded overlays',async p=>{
    await gallery(p);await clickWork(p);await p.emulateMedia({reducedMotion:'reduce'});await opened(p);await p.keyboard.press('Escape');await closed(p);
    await p.emulateMedia({reducedMotion:'no-preference'});await clickWork(p);await p.goto(base+'/#equipment');await p.waitForTimeout(600);
    assert.equal(await p.locator('[data-photo-dialog]').evaluate(e=>e.open),false);assert.equal(await p.locator('.photo-transition-image').count(),0);assert(p.url().endsWith('#equipment'));
  });
  await check('enabling reduced motion settles the pending navigation once without leaving its curtain',async p=>{
    await gallery(p);const before=await p.evaluate(()=>history.length);
    await p.evaluate(()=>document.querySelector('.index-nav a[href="#films"]').click());await p.waitForTimeout(60);
    await p.emulateMedia({reducedMotion:'reduce'});
    await p.waitForFunction(()=>location.hash==='#films'&&!document.body.classList.contains('is-transitioning')&&!document.body.classList.contains('is-transition-exiting'),null,{timeout:250});
    await p.waitForTimeout(600);assert.equal(await p.evaluate(()=>history.length),before+1);
  });
  await check('failed next target retains its image until a successful manual retry',async p=>{
    await gallery(p);await clickWork(p);await opened(p);
    const before=await p.evaluate(()=>({src:document.querySelector('.photo-stage img').getAttribute('src'),title:document.querySelector('[data-photo-title]').textContent,url:location.href}));
    let healthy=false;
    await p.route('**/*motion_failed*',async r=>{try {if(healthy)await r.fulfill({response:await r.fetch()});else await r.fulfill({status:503,body:'unavailable'});}catch{await r.abort().catch(()=>{});}});
    const target=await p.evaluate(()=>{const w=qaCanvas.visibleWorks[(qaMotion.index()+1)%qaCanvas.visibleWorks.length];for(const key of ['thumbnailSrc','previewSrc','src'])if(w[key]){const u=new URL(w[key],location.href);u.searchParams.set('motion_failed','1');w[key]=u.href;}return w.title;});
    await p.locator('.photo-dialog .dialog-next').click();await p.locator('[data-photo-retry]').waitFor({state:'visible'});
    assert.deepEqual(await p.evaluate(()=>({src:document.querySelector('.photo-stage img').getAttribute('src'),title:document.querySelector('[data-photo-title]').textContent,url:location.href})),before);
    healthy=true;await p.locator('[data-photo-retry]').click();await p.waitForFunction(title=>qaMotion.state.displayed?.title===title,target);
    await p.keyboard.press('Escape');await closed(p);assert.equal(await p.locator('.photo-transition-image').count(),0);
  });
  await check('directory and direct photo links retain working close and forward history',async p=>{
    await gallery(p);await p.locator('[data-gallery-directory-open]').click();
    const card=p.locator('[data-directory-card]').first(),id=await card.getAttribute('data-work-id');await card.click();await opened(p);
    assert.equal(await p.evaluate(()=>qaMotion.state.displayed.id),id);await p.keyboard.press('Escape');await closed(p);
    await p.goto(base+'/?photo=sunmoon-04#works');await opened(p);assert.equal(await p.evaluate(()=>qaMotion.state.displayed.id),'sunmoon-04');
    await p.keyboard.press('Escape');await closed(p);assert(!p.url().includes('photo='));assert.equal(await p.locator('.photo-transition-image').count(),0);
  });
  await check('mobile touch switches the picture without page drift and closes back to the same view',async()=>{
    const m=await page({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    try {
      await gallery(m);const before=await m.evaluate(()=>({camera:{...qaCanvas.camera},scroll:scrollY}));
      await clickWork(m);await opened(m);const id=await m.evaluate(()=>qaMotion.state.displayed.id);
      const r=await m.locator('.photo-stage').boundingBox(),y=Math.min(650,Math.max(150,r.y+r.height*.5));
      report.mobileStart={stage:r,y,hit:await m.evaluate(y=>document.elementFromPoint(290,y)?.outerHTML.slice(0,250),y)};
      await m.evaluate(()=>{window.motionTouches=[];for(const type of ['pointerdown','pointerup','pointercancel','click'])document.addEventListener(type,e=>motionTouches.push({type,x:e.clientX,y:e.clientY,target:e.target.tagName,cls:e.target.className,phase:qaMotion.state.phase,button:!!e.target.closest('button')}),true);});
      const cd=await m.context().newCDPSession(m);await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:290,y}]});
      for(let i=1;i<=10;i++){await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:290-i*17,y}]});await m.waitForTimeout(18);}
      await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      try { await m.waitForFunction(id=>qaMotion.state.phase==='open'&&qaMotion.state.displayed?.id!==id,id,{timeout:5000}); }
      catch(error) { throw new Error(JSON.stringify({start:report.mobileStart,state:await m.evaluate(()=>({phase:qaMotion.state.phase,id:qaMotion.state.displayed?.id,touches:motionTouches,src:document.querySelector('.photo-stage img').src}))})); }
      await m.locator('.photo-dialog .dialog-close').tap();
      try { await m.waitForFunction(()=>!document.querySelector('[data-photo-dialog]').open&&qaMotion.state.phase==='closed',null,{timeout:3000}); }
      catch(error){throw new Error(JSON.stringify(await m.evaluate(()=>({phase:qaMotion.state.phase,open:document.querySelector('[data-photo-dialog]').open,touches:motionTouches,anims:qaMotion.state.animations.size,flight:!!qaMotion.state.flight}))))}
      await m.waitForTimeout(80);
      assert.deepEqual(await m.evaluate(()=>({camera:{...qaCanvas.camera},scroll:scrollY})),before);
    } finally { await m.close(); }
  });
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.writes,[]);
  report.passed=report.checks.filter(c=>c.passed).length;report.failed=report.checks.length-report.passed;
  fs.writeFileSync('work/photo-motion-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,failed:report.failed}));
  await browser.close();if(report.failed)process.exitCode=1;
})().catch(async error=>{console.error(error);await browser?.close();process.exitCode=1;});
