const assert = require('node:assert/strict');
const { chromium, launchOptions } = require('./browser-test-runtime.cjs');
(async()=>{
  const browser=await chromium.launch(launchOptions);
  try {
    const page=await browser.newPage();
    await page.route('**/analytics-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
    await page.route('**/guestbook-config.js?*',r=>r.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_GUESTBOOK={enabled:true,endpoint:"https://qa.test/book"};'}));
    await page.route('https://qa.test/**',r=>r.fulfill({contentType:'application/json',body:'{"ok":true,"data":{"items":[],"nextCursor":null}}'}));
    await page.goto(process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011');
    for(const viewport of [{width:2048,height:1070},{width:1920,height:1080},{width:1366,height:768},{width:1024,height:768},{width:768,height:1024},{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:640,height:360}]) {
      await page.setViewportSize(viewport); await page.locator('[data-index-open]').click(); await page.waitForTimeout(750);
      const result=await page.evaluate(()=>{
        const body=document.querySelector('.index-body'), bounds=body.getBoundingClientRect();
        return {scroll:body.scrollTop,overflow:body.scrollHeight-body.clientHeight,items:[...document.querySelectorAll('.index-nav a')].map(a=>{
          const r=a.getBoundingClientRect(),b=a.querySelector('b'),range=document.createRange();range.selectNodeContents(b);
          return {name:b.textContent,visible:r.top>=bounds.top-1&&r.bottom<=bounds.bottom+1&&r.left>=0&&r.right<=innerWidth,lines:range.getClientRects().length,clipped:b.scrollWidth>b.clientWidth+1};
        })};
      });
      assert.equal(result.scroll,0);assert.ok(result.overflow<=1,JSON.stringify({viewport,result}));
      assert.equal(result.items.length,11);assert.ok(result.items.every(x=>x.visible&&x.lines===1&&!x.clipped),JSON.stringify({viewport,result}));
      if(viewport.width===1920||viewport.width===390)await page.screenshot({path:`work/index-all-visible-${viewport.width}.png`});
      await page.keyboard.press('Escape');
    }
    await page.setViewportSize({width:1440,height:1000});
    const order=await page.evaluate(()=>{
      const contact=document.querySelector('#contact'),book=document.querySelector('#guestbook'),wrapper=document.querySelector('.arrival-guestbook');
      return {original:contact.querySelector('.arrival-hero').nextElementSibling.className,last:wrapper===document.querySelector('main').lastElementChild,after:!!(contact.compareDocumentPosition(book)&Node.DOCUMENT_POSITION_FOLLOWING),outside:!contact.contains(book)};
    });
    assert.equal(order.original,'arrival-outro');assert.ok(order.last&&order.after&&order.outside);
    await page.locator('.arrival-footer').scrollIntoViewIfNeeded();await page.waitForTimeout(350);
    const geometry=await page.evaluate(()=>{const end=document.querySelector('.arrival-outro').getBoundingClientRect(),next=document.querySelector('.arrival-guestbook').getBoundingClientRect();return{gap:next.top-end.bottom,bg:getComputedStyle(document.querySelector('.arrival-guestbook')).backgroundColor};});
    assert.ok(Math.abs(geometry.gap)<1);assert.equal(geometry.bg,'rgb(5, 10, 18)');
    await page.screenshot({path:'work/ending-continuous-desktop.png'});
    await page.locator('[data-index-open]').click();await page.locator('.index-nav a[href="#guestbook"]').click();await page.waitForURL('**/#guestbook');
    await page.waitForFunction(()=>document.querySelector('[data-guestbook]').dataset.initialized==='true');
    console.log('PASS all 11 index links visible without scrolling in 9 viewports; labels stay on one line; original ending restored; guestbook last; no background gap; anchor initializes.');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
