const assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
const base = process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011';
(async()=>{
 const browser=await chromium.launch(launchOptions);
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
  await page.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:true,endpoint:"https://qa.test/book"};'}));
  await page.route('https://qa.test/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":true,"data":{"items":[],"nextCursor":null}}'}));
  await page.route('https://player.bilibili.com/**',r=>r.fulfill({contentType:'text/html',body:'<body>测试播放器</body>'}));
  await page.route('**/*.mp4',r=>r.abort());
  await page.route('**/script.js?*',async r=>{const response=await r.fetch();const source=(await response.text()).replace(/\r\n/g,'\n').replace("  setVisualStage('deepsky');\n  requestMainFrame();", "  window.qaMobile={works:allWorks,open:openDirectoryWork,canvas:()=>archiveCanvas};\n  setVisualStage('deepsky');\n  requestMainFrame();");await r.fulfill({response,body:source});});
  await page.goto(base);await page.waitForFunction(()=>window.qaMobile&&document.querySelector('.film-card'));
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:430,height:932},{width:640,height:360},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(100);await page.locator('#works').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.waitForTimeout(300);
   const layout=await page.evaluate(()=>{
    const rect=s=>document.querySelector(s).getBoundingClientRect(),title=rect('.works h2'),total=rect('.works .section-heading>span');
    return {overflow:document.documentElement.scrollWidth>innerWidth,canvasTop:rect('.canvas-stage').top,sameLine:total.top<title.bottom&&total.bottom>title.top,progressInDirectory:document.querySelector('[data-directory-progress]').contains(document.querySelector('[data-gallery-continue]')),controls:getComputedStyle(document.querySelector('.gallery-controls')).display,cardHeight:rect('.descent-sheet').height,hint:document.querySelector('.drag-hint-touch').textContent,equipment:document.querySelector('#equipment').firstElementChild.tagName};
   });
   assert.equal(layout.overflow,false);assert.equal(layout.sameLine,true);assert.ok(layout.progressInDirectory);assert.equal(layout.controls,'none');assert.ok(layout.cardHeight<640);assert.equal(layout.hint,'左右滑动，点击查看');assert.equal(layout.equipment,'HEADER');
   if(viewport.width===390)assert.ok(layout.canvasTop<viewport.height/2,JSON.stringify(layout));
   await page.locator('[data-filter="earth"]').evaluate(e=>e.click());
   await page.waitForFunction(()=>{const strip=document.querySelector('.gallery-filters').getBoundingClientRect(),r=document.querySelector('.gallery-filters .active').getBoundingClientRect();return r.left>=strip.left-1&&r.right<=strip.right+1});
   const film=await page.locator('.film-card').first().evaluate(e=>{const visual=e.querySelector('.film-visual').getBoundingClientRect(),caption=e.querySelector('figcaption').getBoundingClientRect(),button=e.querySelector('button').getBoundingClientRect();return{ratio:visual.width/visual.height,expected:Number(e.style.getPropertyValue('--film-ratio')),below:caption.top>=visual.bottom-1,buttonBottom:button.bottom,visualBottom:visual.bottom,titleFits:e.querySelector('h3').scrollWidth<=e.querySelector('h3').clientWidth+1}});
   assert.ok(Math.abs(film.ratio-film.expected)<.01);assert.ok(film.below&&film.titleFits,JSON.stringify({viewport,film}));assert.ok(film.buttonBottom<=film.visualBottom+1);
   if(viewport.width===390){await page.screenshot({path:'work/mobile-layout-works.png'});await page.locator('#films').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:'work/mobile-layout-films.png'});}
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-gallery-directory-open]').click();
  assert.ok(await page.locator('[data-directory-progress] [data-gallery-continue]').isVisible());
  await page.locator('[data-gallery-directory-search]').fill('新宿雨');await page.locator('[data-directory-card]').first().click();await page.locator('[data-photo-title]').filter({hasText:'新宿雨'}).waitFor();
  const order=()=>page.locator('.photo-information').evaluate(e=>[...e.querySelectorAll(':scope>section')].map(n=>n.getAttributeNames().find(s=>s.startsWith('data-detail-'))));
  assert.deepEqual(await order(),['data-detail-object','data-detail-notes','data-detail-capture','data-detail-system','data-detail-process']);
  assert.ok(await page.locator('[data-gallery-directory]').evaluate(e=>!e.open));
  const horizontal=await page.locator('.photo-stage').evaluate(e=>e.getBoundingClientRect().height);assert.ok(horizontal<400);await page.screenshot({path:'work/mobile-layout-photo.png'});
  await page.locator('.photo-dialog .dialog-close').click();await page.waitForFunction(()=>!document.querySelector('[data-photo-dialog]').open);
  await page.locator('[data-gallery-directory-open]').click();await page.locator('[data-gallery-continue]').click();
  assert.equal(await page.locator('dialog[open]').count(),1);assert.ok(await page.locator('[data-photo-dialog]').evaluate(e=>e.open));await page.locator('.photo-dialog .dialog-close').click();await page.waitForFunction(()=>!document.querySelector('[data-photo-dialog]').open);
  // Real portrait / panorama works, plus an extreme-ratio fixture and long explanation.
  const targets=await page.evaluate(()=>{const works=qaMobile.works;return[works.find(w=>w.width/w.height<.7)?.id,works.find(w=>w.width/w.height>3)?.id].filter(Boolean)});
  for(const id of targets){await page.evaluate(id=>qaMobile.open(id),id);await page.waitForTimeout(200);const fit=await page.locator('.photo-stage').evaluate(e=>{const r=e.querySelector('img').getBoundingClientRect(),close=document.querySelector('.photo-dialog .dialog-close').getBoundingClientRect();return{w:r.width,h:r.height,ratio:r.width/r.height,target:Number(e.closest('dialog').style.getPropertyValue('--photo-ratio')),close:close.top>=0&&close.bottom<=innerHeight}});assert.ok(fit.w<=390&&fit.h<=844-100);assert.ok(Math.abs(fit.ratio-fit.target)<.02);assert.ok(fit.close);await page.locator('.photo-dialog .dialog-close').click();await page.waitForFunction(()=>!document.querySelector('[data-photo-dialog]').open);}
  await page.evaluate(()=>{const w=qaMobile.works[0];w.width=100;w.height=1000;w.details={...w.details,story:'长说明测试。'.repeat(150)};qaMobile.open(w.id)});await page.waitForTimeout(200);assert.equal(await page.locator('.photo-information').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);
  await page.setViewportSize({width:1440,height:1000});await page.waitForTimeout(200);
  assert.deepEqual(await order(),['data-detail-object','data-detail-capture','data-detail-system','data-detail-process','data-detail-notes']);
  assert.equal(await page.locator('[data-gallery-continue]').evaluate(e=>e.closest('.gallery-discovery')!==null),true);assert.equal(await page.locator('.equipment-console>header').count(),1);
  await page.locator('.photo-dialog .dialog-close').click();await page.waitForFunction(()=>!document.querySelector('[data-photo-dialog]').open);
  await page.locator('[data-equipment-tab="daily"]').click();await page.locator('[data-equipment-next]').click();
  const position=await page.locator('[data-equipment-position]').innerText();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.ok(await page.locator('[data-equipment-tab="daily"]').evaluate(e=>e.classList.contains('active')));assert.equal(await page.locator('[data-equipment-position]').innerText(),position);
  assert.equal(requests.some(url=>/\.mp4(?:[?]|$)/.test(url)),false,'No full video requested before play');
  await page.locator('.film-card h3').first().click();assert.equal(await page.locator('[data-video-dialog]').evaluate(e=>e.open),false,'Caption must not act as an invisible play button');
  await page.locator('.film-card button').first().click();assert.ok(await page.locator('[data-video-dialog]').evaluate(e=>e.open));await page.locator('.video-dialog .dialog-close').click();
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>window.qaMobile);
  await page.locator('[data-home-filter="earth"]').evaluate(e=>e.click());
  await page.waitForFunction(()=>location.hash==='#works'&&document.querySelector('.gallery-filters .active')?.dataset.filter==='earth');
  await page.waitForFunction(()=>{const strip=document.querySelector('.gallery-filters').getBoundingClientRect(),selected=document.querySelector('.gallery-filters .active').getBoundingClientRect();return selected.left>=strip.left-1&&selected.right<=strip.right+1});
  assert.deepEqual(errors,[]);console.log('PASS mobile 320/390/430/landscape geometry, category visibility, directory actions, image ratios/order, desktop restoration, equipment state and video opening.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
