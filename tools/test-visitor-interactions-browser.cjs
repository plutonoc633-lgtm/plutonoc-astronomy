'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
const base = process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011';
const report = { checks: [], errors: [], writes: [], limits: 'Headless browser; physical phone touch, keyboard and browser chrome are unverified.' };
let browser;
async function check(name, task) { await task(); report.checks.push(name); console.log('PASS', name); }
async function page({ enabled = true, early = false, mobile = false, reducedMotion = 'reduce' } = {}) {
  const p = await browser.newPage({ viewport: mobile ? { width:390,height:844 } : { width:1440,height:900 }, isMobile:mobile, hasTouch:mobile, reducedMotion });
  p.on('pageerror', e => report.errors.push(e.message));
  await p.route('**/*', async r => {
    const u=new URL(r.request().url());
    if (u.hostname==='qa.invalid') {
      report.writes.push({url:u.href,method:r.request().method()});
      await p.evaluate(body=>window.qaBatches.push(JSON.parse(body)),r.request().postData());
      return r.fulfill({status:204});
    }
    if (u.origin!==new URL(base).origin) return r.fulfill({status:200,body:''});
    if (u.pathname==='/analytics-config.js') return r.fulfill({contentType:'application/javascript',body:`window.PLUTONOC_ANALYTICS={enabled:true,interactionEnabled:${enabled},endpoint:'http://qa.invalid/collect',test:true};`});
    if (u.pathname==='/guestbook-config.js') return r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:false};'});
    if (u.pathname==='/analytics.js') {
      if(early) await new Promise(resolve=>setTimeout(resolve,900));
      return r.fulfill({contentType:'application/javascript',body:fs.readFileSync('analytics.js','utf8').replace('  const schedule =','  window.qaFlush=flush;\n  const schedule =')});
    }
    if (u.pathname==='/script.js') {
      let s=fs.readFileSync('script.js','utf8').replace(/\r\n/g,'\n').replace('    archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks);','    archiveCanvas = new InfiniteArchiveCanvas(canvasElement, allWorks);window.qaCanvas=archiveCanvas;');
      s=s.replace("  setVisualStage('deepsky');\n  requestMainFrame();", "  window.qaApi={openPhoto,movePhoto,requestPhotoClose,photoMotion,copyPhotoLink};\n  setVisualStage('deepsky');\n  requestMainFrame();");
      return r.fulfill({contentType:'application/javascript',body:s});
    }
    return r.continue();
  });
  await p.addInitScript(()=>{
    window.qaBatches=[];
    // Prevent external navigation after the site's delegated document listener has run.
    for(const type of ['click','auxclick'])window.addEventListener(type,e=>{if(e.target.closest?.('[data-analytics-outbound]'))e.preventDefault();});
  });
  return p;
}
async function flush(p) { await p.waitForFunction(()=>localStorage.getItem('plutonoc.analytics.visitor.v1')); await p.evaluate(()=>window.qaFlush()); return p.evaluate(()=>qaBatches.flatMap(b=>b.events)); }
const interactions=events=>events.filter(e=>e.kind==='interaction');
async function gallery(p) {
  await p.goto(base+'/#works');
  await p.waitForFunction(()=>window.qaCanvas?.rendered.length&&window.PlutonoCAnalytics);
  await p.locator('[data-archive-canvas]').evaluate(e=>e.scrollIntoView({behavior:'instant',block:'center'}));
  await p.waitForFunction(()=>qaCanvas.visible&&qaCanvas.cache.active===0&&qaCanvas.cache.queue.length===0);
  await p.waitForTimeout(150);
}
async function openFirst(p) {
  await p.locator('[data-gallery-directory-open]').click();
  const card=p.locator('[data-directory-card]').first(),id=await card.getAttribute('data-work-id');
  await card.click();await p.waitForFunction(id=>qaApi.photoMotion.displayed?.id===id,id);
  return id;
}
function stat(a) { a=a.slice().sort((x,y)=>x-y); return {samples:a.length,p95:a[Math.min(a.length-1,Math.floor(a.length*.95))]||0,max:a.at(-1)||0}; }
(async()=>{
 browser=await chromium.launch(launchOptions);
 try {
  await check('early INDEX interaction survives deferred analytics; only the final navigation commits',async()=>{
    const p=await page({early:true,reducedMotion:'no-preference'});
    await p.goto(base,{waitUntil:'commit'});await p.waitForFunction(()=>window.qaApi);
    await p.locator('[data-index-open]').click();
    await p.evaluate(()=>{
      document.querySelector('[data-index-link][href="#records"]').click();
      document.querySelector('[data-index-open]').click();
      document.querySelector('[data-index-link][href="#equipment"]').click();
    });
    await p.waitForFunction(()=>location.hash==='#equipment'&&window.PlutonoCAnalytics);
    await p.waitForTimeout(150);const e=interactions(await flush(p));
    assert(e.some(x=>x.key==='index-open'));assert(e.some(x=>x.key==='index-select'&&x.target==='equipment'));
    assert(!e.some(x=>x.key==='index-select'&&x.target==='records'));await p.close();
  });
  await check('all fixed external entries, repeats and middle-clicks are reported without navigation',async()=>{
    const p=await page();await p.goto(base);await p.waitForFunction(()=>window.PlutonoCAnalytics);
    await p.locator('[data-analytics-outbound]:not([data-video-external])').evaluateAll(links=>links.forEach(a=>a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}))));
    const a=p.locator('[data-analytics-outbound="social-bilibili"]');await a.dispatchEvent('click');await a.dispatchEvent('auxclick',{button:1});
    const e=interactions(await flush(p)).filter(x=>x.key==='outbound');
    assert.equal(e.length,12);assert.equal(e.filter(x=>x.target==='social-bilibili').length,3);
    assert(e.some(x=>x.target==='award-a1'));assert(e.some(x=>x.target==='award-b1'));assert(e.some(x=>x.target==='award-b2'));
    assert(e.every(x=>!JSON.stringify(x).includes('https://')));await p.close();
  });
  await check('directory IME/search privacy, canceled debounce, filters and actual category selection',async()=>{
    const p=await page();await gallery(p);await p.locator('[data-gallery-directory-open]').click();
    const s=p.locator('[data-gallery-directory-search]');await s.dispatchEvent('compositionstart');await s.fill('玫瑰');await p.waitForTimeout(550);
    assert(!interactions(await flush(p)).some(x=>x.key==='directory-search'));
    await s.dispatchEvent('compositionend');await p.waitForTimeout(550);
    let e=interactions(await flush(p));const searches=e.filter(x=>x.key==='directory-search');assert.equal(searches.length,1);assert(/^results:\d+$/.test(searches[0].target));assert(!JSON.stringify(searches[0]).includes('玫瑰'));
    await s.fill('银河');await p.locator('[data-gallery-directory-close]').click();await p.waitForTimeout(550);
    e=interactions(await flush(p));assert.equal(e.filter(x=>x.key==='directory-search').length,1);
    await p.locator('[data-gallery-directory-open]').click();await p.locator('[data-directory-category="earth"]').click();await p.locator('[data-directory-status="unseen"]').click();
    await p.locator('[data-gallery-directory-close]').click();await p.locator('.gallery-filters [data-filter="deepsky"]').click();
    await p.locator('.gallery-filters [data-filter="deepsky"]').click();
    e=interactions(await flush(p));assert.equal(e.filter(x=>x.key==='category'&&x.target==='deepsky').length,1);assert(e.some(x=>x.key==='directory-filter'&&x.target==='status:unseen'));await p.close();
  });
  await check('photo switching commits once, cancellation produces no switch, clipboard fallback is not success',async()=>{
    const p=await page();await gallery(p);let id=await openFirst(p);
    await p.locator('.dialog-next').click();await p.waitForFunction(id=>qaApi.photoMotion.displayed?.id!==id,id);
    let e=interactions(await flush(p));assert.equal(e.filter(x=>x.key==='photo-next').length,1);
    await p.evaluate(()=>{window.prompt=()=>null;document.execCommand=()=>false;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(Error('blocked'))}});});
    await p.locator('[data-photo-copy-link]').click();e=interactions(await flush(p));assert(e.some(x=>x.key==='photo-copy-manual'));assert(!e.some(x=>x.key==='photo-copy'));
    await p.evaluate(()=>{navigator.clipboard.writeText=()=>Promise.resolve();});await p.locator('[data-photo-copy-link]').click();e=interactions(await flush(p));assert.equal(e.filter(x=>x.key==='photo-copy').length,1);
    const before=e.filter(x=>['photo-next','photo-prev'].includes(x.key)).length;
    await p.route('**/assets/gallery/**',r=>r.abort());await p.evaluate(()=>{qaCanvas.cache.entries.clear();qaApi.movePhoto(1);qaApi.requestPhotoClose({immediate:true});});await p.waitForTimeout(100);
    e=interactions(await flush(p));assert.equal(e.filter(x=>['photo-next','photo-prev'].includes(x.key)).length,before);await p.close();
  });
  await check('equipment drag, button and keyboard changes exclude clone normalization and repeated active tabs',async()=>{
    const p=await page();await p.goto(base+'/#equipment');await p.waitForFunction(()=>window.PlutonoCAnalytics);
    await p.locator('[data-equipment-tab="daily"]').click();await p.locator('[data-equipment-tab="daily"]').click();
    await p.locator('[data-equipment-next]').click();await p.waitForTimeout(550);
    await p.locator('[data-equipment-next]').press('Enter');await p.waitForTimeout(550);
    const box=await p.locator('[data-equipment-track]').boundingBox();let y=box.y+Math.min(box.height*.5,200);
    await p.mouse.move(box.x+box.width*.6,y);await p.mouse.down();await p.mouse.move(box.x+box.width*.25,y,{steps:20});await p.mouse.up();await p.waitForTimeout(600);
    const e=interactions(await flush(p));assert.equal(e.filter(x=>x.key==='equipment-tab').length,1);assert.equal(e.filter(x=>x.key==='equipment-photo').length,3);assert(e.some(x=>x.key==='equipment-photo'&&x.entry==='drag'));
    await p.waitForTimeout(650);assert.equal(interactions(await flush(p)).filter(x=>x.key==='equipment-photo').length,3);await p.close();
  });
  await check('mobile directory select/continue and video outbound preserve normal controls',async()=>{
    const p=await page({mobile:true});await gallery(p);await p.locator('[data-gallery-directory-open]').click();
    await p.locator('[data-directory-category-select]').selectOption('sunmoon');await p.locator('[data-directory-card]').first().click();
    await p.waitForFunction(()=>qaApi.photoMotion.displayed);await p.locator('[data-photo-dialog] .dialog-close').click();
    await p.waitForFunction(()=>!document.querySelector('[data-photo-dialog]').open);
    await p.locator('[data-gallery-directory-open]').click();await p.locator('[data-gallery-continue]').click();await p.waitForFunction(()=>qaApi.photoMotion.displayed);await p.keyboard.press('Escape');
    await p.locator('.film-card button').first().click();
    const out=p.locator('[data-video-external]');if(await out.isVisible()){await out.dispatchEvent('click');const e=interactions(await flush(p));assert(e.some(x=>x.key==='outbound'&&x.target.startsWith('video:')));}
    const e=interactions(await flush(p));assert(e.some(x=>x.key==='directory-select'));assert(e.some(x=>x.key==='directory-continue'));await p.close();
  });
  await check('admin long details load once per cursor, summaries stay separate, reset discards late results',async()=>{
    const p=await browser.newPage();await p.route('**/admin.js?*',r=>r.fulfill({contentType:'application/javascript',body:''}));await p.route('**/cloudbase.full.js',r=>r.fulfill({body:''}));await p.goto(base+'/admin.html');
    await p.evaluate(()=>{
      document.querySelector('[data-dashboard]').hidden=false;document.querySelector('[data-analytics]').hidden=false;
      window.qaCalls=[];window.qaDefer=false;
      window.qaAdmin=createVisitorAnalytics(async(action,data)=>{qaCalls.push({action,data});if(qaDefer)return new Promise(r=>window.qaResolve=r);
        if(action==='summary')return{dates:data,visitors:1,counts:[{_id:'page',count:2},{_id:'work',count:1},{_id:'interaction',count:501}],trendCounts:[],trendVisitors:[],works:[],devices:[],sources:[],interactions:[{_id:'outbound',count:501}],outbound:[{_id:'social-bilibili',title:'B站主页',count:501}]};
        if(action==='visits')return{rows:[{_id:{visitor:'12345678-1234-1234-1234-123456789012',session:'12345678-1234-1234-1234-123456789012'},first:Date.now(),device:'phone',actions:502}],page:0,hasNext:false};
        return{rows:Array.from({length:data.cursor?1:500},()=>({kind:'interaction',key:'outbound',target:'social-bilibili',title:'B站主页',entry:'footer',at:Date.now()})),nextCursor:data.cursor?null:{at:1,id:'a'.repeat(64)}};
      });qaAdmin.show();
    });
    await p.locator('.stats-visit summary').click();await p.getByRole('button',{name:'继续加载访问过程'}).click();await p.waitForFunction(()=>qaCalls.filter(x=>x.action==='detail').length===2);
    assert.equal(await p.locator('.stats-timeline p').filter({hasText:'点击跳转'}).count(),501);assert.equal(await p.locator('[data-stats-metrics] .stats-metric').count(),4);
    for(const width of [1440,390]) {
      await p.setViewportSize({width,height:900});await p.evaluate(()=>scrollTo(0,0));
      assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin horizontal overflow');
      await p.screenshot({path:`work/visitor-stats-${width}.png`});
    }
    await p.evaluate(()=>{qaDefer=true;qaAdmin.show();});await p.waitForFunction(()=>window.qaResolve);await p.evaluate(()=>{qaAdmin.reset();qaResolve({rows:[],page:0,hasNext:false});});
    assert.equal(await p.locator('[data-stats-visits]').textContent(),'');await p.close();
  });
  if(!process.env.PLUTONOC_SKIP_PERF) {
    report.performance=[];
    for(let round=0;round<3;round++)for(const enabled of (round%2?[true,false]:[false,true])){
      const p=await page({enabled,reducedMotion:'no-preference'});await gallery(p);
      await p.evaluate(()=>{
        window.qaMeasure={frames:[],inputs:[],long:[],recording:[],running:true};let last=performance.now();
        const original=PlutonoCAnalytics.interaction;
        PlutonoCAnalytics.interaction=function(...args){const t=performance.now();try{return original(...args);}finally{qaMeasure.recording.push(performance.now()-t);}};
        function frame(t){if(!qaMeasure.running)return;qaMeasure.frames.push(t-last);last=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
        for(const type of ['pointerdown','click','keydown'])document.addEventListener(type,e=>requestAnimationFrame(()=>{if(qaMeasure.running)qaMeasure.inputs.push(performance.now()-e.timeStamp);}),{passive:true});
        new PerformanceObserver(list=>{if(qaMeasure.running)qaMeasure.long.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})));}).observe({type:'longtask'});
      });
      const box=await p.locator('[data-archive-canvas]').boundingBox(),y=box.y+Math.min(300,box.height*.4);
      for(let sweep=0;sweep<3;sweep++){
        await p.mouse.move(box.x+box.width*.7,y);await p.mouse.down();
        for(let n=1;n<=45;n++){await p.mouse.move(box.x+box.width*(.7-.4*n/45),y-35*n/45);await p.waitForTimeout(16);}
        await p.mouse.up();await p.waitForTimeout(350);
      }
      await p.locator('[data-gallery-directory-open]').click();await p.locator('[data-gallery-directory-close]').click();
      await p.evaluate(()=>{qaMeasure.running=false;});const m=await p.evaluate(()=>qaMeasure);
      report.performance.push({round,enabled,frameMs:stat(m.frames),inputToFrameMs:stat(m.inputs),recordingMs:stat(m.recording),longTasks:m.long});
      assert(stat(m.recording).max<50,'Recording itself created a long task');await p.close();
    }
    let frameRegressions=0,inputRegressions=0;
    for(let round=0;round<3;round++){
      const off=report.performance.find(x=>x.round===round&&!x.enabled),on=report.performance.find(x=>x.round===round&&x.enabled);
      if(on.frameMs.p95-off.frameMs.p95>Math.max(2,off.frameMs.p95*.1))frameRegressions++;
      if(on.inputToFrameMs.p95-off.inputToFrameMs.p95>Math.max(2,off.inputToFrameMs.p95*.1))inputRegressions++;
    }
    assert(frameRegressions<2&&inputRegressions<2,'Repeated performance regression against disabled baseline');
    report.checks.push('three paired enabled/disabled performance runs satisfy the regression gate');
  }
  assert.deepEqual(report.errors,[]);assert(report.writes.every(x=>x.url==='http://qa.invalid/collect'));
 } finally { fs.writeFileSync('work/visitor-interactions-browser.json',JSON.stringify(report,null,2));await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
