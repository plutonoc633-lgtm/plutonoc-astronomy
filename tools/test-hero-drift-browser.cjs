'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,launchOptions}=require('./browser-test-runtime.cjs');
const base=process.env.PLUTONOC_TEST_URL||'http://127.0.0.1:9011';
(async()=>{
 const browser=await chromium.launch(launchOptions),report={layouts:[],limits:'Browser simulation; physical display smoothness is not certified.'};
 try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
  await page.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:false};'}));
  await page.goto(base+'/#home');await page.waitForFunction(()=>document.querySelector('.profile-copy').classList.contains('is-motion-active'));
  for(const size of [{width:2560,height:1440},{width:1440,height:900},{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:844,height:390}]){
   await page.setViewportSize(size);await page.waitForTimeout(80);
   const layout=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect(),hero=rect('.home-profile'),title=rect('.profile-copy h1'),logo=rect('.profile-watermark');return{width:innerWidth,titleWidth:title.width,bottomGap:hero.bottom-logo.bottom,logoCenter:logo.x+logo.width/2-hero.x-hero.width/2,independent:document.querySelector('.profile-watermark').parentElement.matches('.home-profile'),gap:logo.top-title.bottom,overflow:document.documentElement.scrollWidth-innerWidth};});
   assert(layout.independent&&layout.gap>20&&Math.abs(layout.logoCenter)<1&&layout.bottomGap>=21&&layout.bottomGap<=31&&layout.overflow<1);
   assert(layout.titleWidth<=(size.width<=760?264:600)+1);report.layouts.push(layout);
   if(size.width===1440||size.width===390)await page.screenshot({path:`work/hero-drift-${size.width}.png`});
  }
  await page.setViewportSize({width:1440,height:900});
  report.motion=await page.evaluate(()=>{const el=document.querySelector('.hero-handwriting-motion'),a=el.getAnimations()[0],original=a.currentTime,points=[];for(let i=0;i<=192;i++){a.currentTime=i*500;const m=new DOMMatrix(getComputedStyle(el).transform);points.push([m.m41,m.m42]);}a.currentTime=original;return{duration:a.effect.getTiming().duration,easing:a.effect.getTiming().easing,points};});
  assert.equal(report.motion.duration,96000);assert.equal(report.motion.easing,'linear');
  const points=report.motion.points,steps=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  assert(Math.min(...steps)>.5,'No stationary holds between direction changes');assert(Math.max(...steps)/Math.min(...steps)<1.4);
  assert(Math.hypot(points[0][0]-points.at(-1)[0],points[0][1]-points.at(-1)[1])<.01);
  const dx0=points[1][0]-points[0][0],dy0=points[1][1]-points[0][1],dx1=points.at(-1)[0]-points.at(-2)[0],dy1=points.at(-1)[1]-points.at(-2)[1];
  assert(Math.hypot(dx0-dx1,dy0-dy1)<.15,'Loop direction remains continuous');
  assert(Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0]))>30);assert(Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1]))>25);
  await page.locator('#equipment').evaluate(e=>e.scrollIntoView({behavior:'instant'}));await page.waitForFunction(()=>getComputedStyle(document.querySelector('.hero-handwriting-motion')).animationPlayState==='paused');
  const paused=await page.locator('.hero-handwriting-motion').evaluate(e=>e.getAnimations()[0].currentTime);await page.waitForTimeout(180);assert(Math.abs((await page.locator('.hero-handwriting-motion').evaluate(e=>e.getAnimations()[0].currentTime))-paused)<1);
  await page.locator('#home').evaluate(e=>e.scrollIntoView({behavior:'instant'}));await page.waitForFunction(()=>getComputedStyle(document.querySelector('.hero-handwriting-motion')).animationPlayState==='running');
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.hero-handwriting-motion').evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('.hero-handwriting-motion').getAnimations().length===1);
  await page.evaluate(()=>document.documentElement.setAttribute('data-page-hidden',''));assert.equal(await page.locator('.hero-handwriting-motion').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  await mobile.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
  await mobile.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:false};'}));
  await mobile.goto(base+'/#home');await mobile.waitForFunction(()=>document.querySelector('.profile-copy').classList.contains('is-motion-active'));
  for(const width of [320,390,430]){await mobile.setViewportSize({width,height:844});const state=await mobile.evaluate(()=>{const h=document.querySelector('.home-profile').getBoundingClientRect(),w=document.querySelector('.profile-watermark').getBoundingClientRect();return{gap:h.bottom-w.bottom,amplitude:getComputedStyle(document.querySelector('.hero-handwriting-motion')).getPropertyValue('--drift-x'),overflow:document.documentElement.scrollWidth-innerWidth};});assert(state.gap>=21&&state.gap<31&&state.amplitude.trim()==='12px'&&state.overflow<1);if(width===390)await mobile.screenshot({path:'work/hero-drift-phone-390.png'});}
  await mobile.close();
  const plain=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});await plain.goto(base+'/#home');
  assert(await plain.locator('.profile-watermark').isVisible());assert(await plain.locator('.profile-copy h1 img').isVisible());assert(await plain.locator('.profile-watermark').evaluate(e=>e.parentElement.getBoundingClientRect().bottom-e.getBoundingClientRect().bottom<31));await plain.close();
  assert.deepEqual(errors,[]);report.passed=true;fs.writeFileSync('work/hero-drift-report.json',JSON.stringify(report,null,2));console.log('PASS hero: bottom watermark, smaller title in six viewports, continuous irregular drift/loop, offscreen/background pause, reduced motion and no-script layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
