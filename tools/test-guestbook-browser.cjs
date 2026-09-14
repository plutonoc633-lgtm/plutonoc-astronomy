const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLUTONOC_PLAYWRIGHT || 'C:/Users/komorebi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.PLUTONOC_TEST_URL || 'http://127.0.0.1:9011';
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/guestbook-config.js?*', route => route.fulfill({ contentType: 'application/javascript', body: 'window.PLUTONOC_GUESTBOOK={enabled:true,endpoint:"https://guestbook.test/api"};' }));
    let posted = [], gets = 0;
    await page.route('https://guestbook.test/**', async route => {
      const req = route.request(); let data;
      if (req.method() === 'POST') {
        posted.push(JSON.parse(req.postData()));
        if (posted.length === 1) { await route.abort('timedout'); return; }
        data = { received: true };
      } else {
        gets++; data = { items: Array.from({ length: gets === 1 ? 20 : 1 }, (_, i) => ({ _id: `${gets}-${i}`, nickname: '<img src=x onerror=alert(1)>', body: '留言 <script>bad()</script>\n' + '长'.repeat(1000), publishedAt: 1800000000000, reply: '<b>谢谢</b>' })), nextCursor: gets === 1 ? 'second' : null };
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
    });
    await page.goto(`${base}/guestbook.html`); await page.waitForSelector('.book-entry');
    assert.equal(await page.locator('.book-entry').count(),20); assert.equal(await page.locator('.book-entry script,.book-entry img,.book-reply b').count(),0);
    await page.locator('#message').fill('测试中文留言 <script>'); await page.locator('button[type=submit]').click();
    await page.waitForFunction(() => !document.querySelector('button[type=submit]').disabled);
    assert.equal(await page.locator('#message').inputValue(),'测试中文留言 <script>');
    await page.locator('button[type=submit]').click(); await page.getByText('留言已收到，审核后会显示').waitFor();
    assert.equal(posted.length,2); assert.equal(posted[0].requestId,posted[1].requestId); assert.equal(await page.locator('#message').inputValue(),'');
    await page.locator('[data-book-more]').click(); await page.waitForFunction(() => document.querySelectorAll('.book-entry').length===21);
    assert.ok(await page.locator('[data-book-more]').isHidden());
    for (const width of [1440,390,320]) { await page.setViewportSize({width,height:844}); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true); }
    await page.screenshot({path:'work/guestbook-mobile-qa.png',fullPage:false});
    console.log('PASS public: plaintext, 20-item pagination, Chinese input, failed-input preservation, same-ID retry, success clear, 320/390/1440px layouts.');
    await page.route('**/admin.js?*',route=>route.abort()); await page.route('https://static.cloudbase.net/**',route=>route.abort());
    await page.goto(`${base}/admin.html`);
    await page.evaluate(() => {
      document.querySelector('[data-dashboard]').hidden=false;
      const root=document.querySelector('[data-admin-book]');root.hidden=false;root.classList.add('is-active');
      window.calls=[];window.deferred=[];
      window.book=window.createGuestbookAdmin((action,data)=>new Promise((resolve,reject)=>{calls.push({action,data});deferred.push({resolve,reject});}));
      book.show();book.show();
    });
    assert.equal(await page.evaluate(()=>calls.length),1);
    await page.evaluate(()=>deferred.shift().resolve({items:[{_id:'test',revision:1,nickname:'访客',body:'<script>evil()</script>',createdAt:1800000000000,status:'pending',reply:''}],nextCursor:'next'}));
    await page.waitForSelector('.admin-book-entry');
    assert.equal(await page.locator('.admin-book-entry script').count(),0);
    await page.locator('[data-admin-book-next]').click();
    assert.equal(await page.evaluate(()=>calls.at(-1).data.cursor),'next');
    await page.evaluate(()=>{book.reset();deferred.shift().resolve({items:[{_id:'late',nickname:'PRIVATE',body:'PRIVATE',createdAt:1,status:'pending'}],nextCursor:null});});
    await page.waitForTimeout(50); assert.equal(await page.locator('[data-admin-book-list]').innerText(),'');
    await page.evaluate(()=>{book.show();deferred.shift().resolve({items:[{_id:'a',revision:1,nickname:'访客',body:'test',createdAt:1800000000000,status:'pending'}],nextCursor:null});});
    await page.waitForSelector('.admin-book-entry'); await page.getByRole('button',{name:'审核公开',exact:true}).click();
    assert.ok(await page.getByRole('button',{name:'审核公开',exact:true}).isDisabled());
    await page.evaluate(()=>{book.reset();deferred.shift().resolve({updated:true});}); await page.waitForTimeout(50);
    assert.equal(await page.locator('[data-admin-book-list]').innerText(),'');
    console.log('PASS admin: duplicate show guard, cursor use, plaintext, busy controls, reset rejects late list and moderation responses.');
    await page.route('**/analytics-config.js?*',route=>route.fulfill({contentType:'application/javascript',body:'window.PLUTONOC_ANALYTICS={enabled:false};'}));
    for (const viewport of [{width:1366,height:768},{width:320,height:568}]) {
      await page.setViewportSize(viewport); await page.goto(base);
      await page.locator('[data-index-open]').click();
      await page.locator('.index-nav a[href="guestbook.html"]').click();
      await page.waitForURL('**/guestbook.html');
    }
    console.log('PASS navigation: guestbook reachable from INDEX at 1366×768 and 320×568.');
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
