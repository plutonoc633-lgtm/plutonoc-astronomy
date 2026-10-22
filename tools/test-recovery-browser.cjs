const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium,launchOptions}=require('./browser-test-runtime.cjs');
const base=process.env.PLUTONOC_TEST_URL||'http://127.0.0.1:9011';
const png=fs.readFileSync('assets/branding/favicon-32.png');
(async()=>{const b=await chromium.launch(launchOptions);try{
 const p=await b.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
 await p.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:false};'}));
 await p.goto(base);await p.waitForFunction(()=>document.querySelector('.film-card'));
 await p.evaluate(()=>{window.navEntries=[];const original=history.pushState.bind(history);history.pushState=(state,_,url)=>{navEntries.push(url);return original(state,_,url)};document.querySelector('[data-home-filter="deepsky"]').click();setTimeout(()=>document.querySelector('.index-nav a[href="#films"]').click(),100)});
 await p.waitForURL('**/#films');await p.waitForTimeout(950);assert.deepEqual(await p.evaluate(()=>navEntries),['#films']);
 await p.evaluate(()=>document.querySelector('.index-nav a[href="#equipment"]').click());await p.waitForTimeout(80);await p.goBack();await p.waitForTimeout(1250);assert.ok((await p.url()).endsWith('#home'));assert.equal(await p.locator('body').evaluate(e=>e.classList.contains('is-transitioning')),false);
 await p.evaluate(()=>document.querySelector('.index-nav a[href="#equipment"]').click());await p.waitForTimeout(80);await p.goForward();await p.waitForTimeout(1250);assert.ok((await p.url()).endsWith('#films'));
 await p.evaluate(()=>{document.querySelector('[data-home-filter="earth"]').click();setTimeout(()=>document.querySelector('[data-home-filter="planet"]').click(),80)});await p.waitForURL('**/#works');await p.waitForTimeout(1000);assert.equal(await p.locator('.gallery-filters .active').getAttribute('data-filter'),'planet');assert.deepEqual(errors,[]);
 for(const mode of ['transient','failed','timeout','manual-timeout']){
  const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const page=await c.newPage();let attempts=0,healthy=false,release;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
  await page.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:false};'}));
  if(mode.includes('timeout'))await page.route('**/image-loader.js?*',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text())+'\nconst actual=window.PlutonoCImages.loadElement;window.PlutonoCImages.loadElement=(img,options)=>actual(img,{...options,...(img.closest(".film-feature")?{timeout:200}:{})});'})});
  await page.route('**/video-posters/previews/uploads/japan-summer-vlog-*.webp*',async r=>{attempts++;if((mode==='timeout'&&attempts===1)||(mode==='manual-timeout'&&attempts===3)){await new Promise(resolve=>release=resolve);try{await r.fulfill({contentType:'image/png',body:png})}catch{}return}if(healthy||(mode==='transient'&&attempts>1)||mode==='timeout')return r.fulfill({contentType:'image/png',body:png});return r.fulfill({status:503,body:'temporary failure',headers:{'Cache-Control':'no-store'}})});
  await page.goto(base);await page.locator('#films').evaluate(e=>e.scrollIntoView({block:'start',behavior:'instant'}));
  const image=page.locator('.film-feature img');
  if(['failed','manual-timeout'].includes(mode)){await page.waitForFunction(()=>document.querySelector('.film-feature img').dataset.mediaState==='error');assert.equal(attempts,2);healthy=true;await page.locator('.film-feature [data-media-retry]').click();}
  try { await page.waitForFunction(()=>document.querySelector('.film-feature img').dataset.mediaState==='loaded',null,{timeout:10000}); } catch(e) { console.log('FAILED CASE',mode,attempts,await image.evaluate(img=>({src:img.src,current:img.currentSrc,state:img.dataset.mediaState,complete:img.complete,width:img.naturalWidth}))); throw e; }
  assert.equal(attempts,mode==='manual-timeout'?4:mode==='failed'?3:2);assert.equal(await page.locator('.film-feature [data-media-retry]').count(),0);assert.ok(await image.evaluate(e=>e.currentSrc.includes('/previews/')&&e.naturalWidth>0));
  if(release){release();await page.waitForTimeout(60);assert.equal(await image.getAttribute('data-media-state'),'loaded')}
  assert.ok(await page.locator('[data-video-dialog]').evaluate(e=>!e.open),'Retry does not open video');
  await page.locator('[data-gallery-directory-open]').tap();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.activeElement.matches('[data-gallery-directory-close]')),true);
  await page.locator('[data-gallery-directory-close]').tap();await page.locator('[data-gallery-directory-open]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement.matches('[data-gallery-directory-search]'));
  await page.evaluate(()=>{document.querySelector('[data-gallery-directory-close]').click();document.querySelector('[data-gallery-directory-open]').click();});
  await page.waitForFunction(()=>document.activeElement.matches('[data-gallery-directory-search]'));assert.ok(await page.locator('[data-directory-card]').count()>0,'A delayed close cannot empty the reopened directory');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>document.activeElement.matches('[data-gallery-directory-open]'));
  await c.close();
 }
 const cover=await b.newPage({viewport:{width:1440,height:1000}});let coverHealthy=false,equipmentHealthy=false,equipmentRequests=0;
 await cover.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
 await cover.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:false};'}));
 await cover.route('**/gallery/hero/deepsky.webp*',r=>coverHealthy?r.fulfill({contentType:'image/png',body:png}):r.fulfill({status:503,body:'failure'}));
 await cover.route('**/equipment/responsive/equipment-1280.webp*',r=>{equipmentRequests++;return equipmentHealthy?r.fulfill({contentType:'image/png',body:png}):r.fulfill({status:503,body:'failure'})});
 await cover.goto(base);await cover.waitForFunction(()=>document.querySelector('[data-home-filter="deepsky"] img').dataset.mediaState==='error');
 assert.equal(equipmentRequests,0,'Equipment stays lazy');const coverUrl=cover.url();coverHealthy=true;await cover.locator('.descent-sheet [data-media-retry]').first().click();
 await cover.waitForFunction(()=>document.querySelector('[data-home-filter="deepsky"] img').dataset.mediaState==='loaded');assert.equal(cover.url(),coverUrl);
 await cover.locator('.equipment-track').scrollIntoViewIfNeeded();
 await cover.waitForFunction(()=>document.querySelector('.equipment-track .is-center img').dataset.mediaState==='error');equipmentHealthy=true;
 await cover.locator('.equipment-track .is-center [data-media-retry]').click();await cover.waitForFunction(()=>document.querySelector('.equipment-track .is-center img').dataset.mediaState==='loaded');
 await cover.close();
 assert.deepEqual(errors,[]);console.log('PASS latest navigation/history, image transient/permanent/timeout recovery, no stale overwrite, responsive source, touch vs keyboard directory focus.');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
