const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../cloudfunctions/analytics-shared/core');
const script = fs.readFileSync(require('node:path').join(__dirname, '../analytics.js'), 'utf8');
const id = () => crypto.randomUUID();
const now = Date.parse('2026-09-05T04:00:00Z');
const fixture = () => ({ visitor: id(), session: id(), source: 'example.com/path?secret=value', device: 'phone', ip: '192.0.2.1', events: [{ id: id(), kind: 'page', at: now }] });

test('collector strips extra fields and source paths; page IDs and session work IDs deduplicate', () => {
  const input = fixture(), first = core.normalize(input, now)[0];
  assert.equal(first.source, 'example.com'); assert.equal(first.ip, undefined);
  assert.equal(core.normalize(input, now)[0]._id, first._id);
  input.events[0].id = id(); assert.notEqual(core.normalize(input, now)[0]._id, first._id);
  input.events = [{ id: id(), kind: 'work', key: 'photo:earth-007' }];
  const work = core.normalize(input, now)[0]; input.events[0].id = id();
  assert.equal(core.normalize(input, now)[0]._id, work._id);
  input.session = id(); assert.notEqual(core.normalize(input, now)[0]._id, work._id);
});
test('invalid events and date ranges rejected; Shanghai date boundaries respected', () => {
  const input = fixture(); input.events[0].kind = 'unknown'; assert.throws(() => core.normalize(input, now));
  input.events = Array.from({length:21}, () => ({id:id(),kind:'page'})); assert.throws(() => core.normalize(input, now));
  assert.throws(() => core.range({start:'2026-06-01',end:'2026-09-05'}, now));
  assert.throws(() => core.range({start:'2026-02-31',end:'2026-09-05'}, now));
  assert.deepEqual(core.range({start:'2026-09-05',end:'2026-09-05'}, now), {start:'2026-09-05',end:'2026-09-05'});
  assert.equal(core.normalize(fixture(), Date.parse('2026-09-05T16:00:01Z'))[0].day, '2026-09-05'); // delayed event clamped to last minute
});
test('public route cannot read; rejects oversized batches and disallowed origins before DB access', async () => {
  assert.equal((await core.collect({httpMethod:'GET',headers:{origin:'https://plutonoc.cn'}})).statusCode,405);
  assert.equal((await core.collect({httpMethod:'POST',headers:{origin:'https://evil.example'},body:'{}'})).statusCode,403);
  assert.equal((await core.collect({httpMethod:'POST',headers:{origin:'https://plutonoc.cn'},body:'x'.repeat(10241)})).statusCode,413);
  await assert.rejects(core.cleanup({Type:'Timer',TriggerName:'plutonoc-analytics-daily'}, 'private'), {code:'CLEANUP_FORBIDDEN'});
});

function browser({storage, storageBlocked = false, disabled = false, failed = false, stalled = false, interactions = true, earlyInteractions = []} = {}) {
  let time = now, serial = 0;
  const tasks = new Map(), listeners = {}, requests = [], sections = [{id:'home'}, {id:'works'}];
  const local = storage?.local || new Map(), session = storage?.session || new Map();
  let storageWrites = 0;
  const store = map => ({getItem(key) {if(storageBlocked) throw Error('blocked'); return map.get(key);},setItem(key,value) {if(storageBlocked) throw Error('blocked'); storageWrites++; map.set(key,value);}});
  const on = (name, fn) => (listeners[name] ||= []).push(fn);
  const timer = (fn, delay, interval = false) => { const token = ++serial; tasks.set(token,{fn,at:time+delay,delay,interval}); return token; };
  const win = { innerHeight:800, PLUTONOC_ANALYTICS:{enabled:!disabled,interactionEnabled:interactions,endpoint:'https://qa.invalid',test:true}, plutonoCEarlyInteractions:earlyInteractions, localStorage:store(local),sessionStorage:store(session),addEventListener:on,requestIdleCallback:fn=>timer(fn,1)};
  let observer, overlayCallback;
  class MO { constructor(callback) { overlayCallback = callback; } observe() {} }
  win.MutationObserver = MO;
  class IO {constructor(callback,options){observer=this;this.callback=callback;this.options=options;}observe(){}unobserve(){}disconnect(){}}
  win.IntersectionObserver = IO;
  const document = { readyState:'complete',referrer:'https://search.example/private?q=secret',visibilityState:'visible',addEventListener:on,querySelector:()=>null,querySelectorAll:()=>sections };
  const context = { window:win,document,navigator:{userAgent:'Desktop',maxTouchPoints:0},crypto,URL,TextEncoder,Blob,AbortController,IntersectionObserver:IO,MutationObserver:MO,
    Date:class extends Date {static now(){return time;}},
    requestAnimationFrame:fn=>timer(fn,16),setTimeout:(fn,ms)=>timer(fn,ms),clearTimeout:token=>tasks.delete(token),setInterval:(fn,ms)=>timer(fn,ms,true),
    fetch:(url,options)=>{requests.push({url,options,payload:JSON.parse(options.body)}); if(stalled)return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout')))); return failed?Promise.reject(Error('offline')):Promise.resolve({ok:true});}
  };
  vm.runInNewContext(script, context);
  async function advance(ms) {
    const end = time+ms;
    for (;;) {const next=[...tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      const [token,task]=next;time=task.at;tasks.delete(token);if(task.interval)tasks.set(token,{...task,at:time+task.delay});task.fn();await Promise.resolve();await Promise.resolve();}
    time=end;await Promise.resolve();
  }
  return {writes:()=>storageWrites,overlay(open) { document.querySelector = () => open ? {} : null; overlayCallback(); },win,document,requests,advance,storage:{local,session},margin:()=>observer.options.rootMargin,emit:(name,event={})=>listeners[name]?.forEach(fn=>fn(event)),enter:(index=0)=>observer.callback([{target:sections[index],isIntersecting:true}]),leave:(index=0)=>observer.callback([{target:sections[index],isIntersecting:false}])};
}

test('interaction delivery deduplicates IDs, validates targets and discards arbitrary fields', () => {
  const body = fixture();
  body.events = [{ id:id(),kind:'interaction',key:'outbound',target:'award-a1',entry:'records',title:'client text',url:'https://private.invalid/?secret=x',search:'private',ip:'192.0.2.1' }];
  const first = core.normalize(body,now)[0];
  assert.equal(first.title,'星耀山河：A1优秀奖');
  assert.equal(first.url,undefined);assert.equal(first.search,undefined);assert.equal(first.ip,undefined);
  assert.equal(core.normalize(body,now)[0]._id,first._id);
  body.events[0].id=id();assert.notEqual(core.normalize(body,now)[0]._id,first._id);
  for (const [key,target] of [['outbound','https://evil.invalid'],['outbound','unknown-link'],['category','unknown'],['equipment-photo','photo:0'],['directory-search','secret-words']]) {
    body.events[0]={id:id(),kind:'interaction',key,target,entry:'gallery'};
    assert.throws(()=>core.normalize(body,now),{code:'INVALID_INPUT'});
  }
  body.events[0]={id:id(),kind:'interaction',key:'directory-search',target:'results:12',entry:'directory',title:'搜索结果 12 张'};
  assert.equal(core.normalize(body,now)[0].target,'results:12');
});

test('distinct actions repeat, duplicate callbacks do not; action recording does not write storage or send synchronously', async()=>{
  const b=browser();await b.advance(40);const writes=b.writes(), token={};
  b.win.PlutonoCAnalytics.interaction('outbound','social-bilibili','B站','footer',token);
  b.win.PlutonoCAnalytics.interaction('outbound','social-bilibili','B站','footer',token);
  b.win.PlutonoCAnalytics.interaction('outbound','social-bilibili','B站','footer',{});
  assert.equal(b.requests.length,0);assert.equal(b.writes(),writes);
  await b.advance(10000);const events=b.requests.flatMap(r=>r.payload.events);
  assert.equal(events.filter(e=>e.kind==='interaction').length,2);
  assert.equal(new Set(events.map(e=>e.id)).size,events.length);
});

test('early actions keep timestamps; independent switch preserves legacy collection',async()=>{
  const b=browser({earlyInteractions:[['index-open','index','打开 INDEX','index',null,now-500]]});
  b.win.PlutonoCAnalytics.interaction('category','earth','大地','home');await b.advance(11000);
  const events=b.requests.flatMap(r=>r.payload.events);assert.equal(events.filter(e=>e.kind==='interaction').length,2);
  assert.equal(events.find(e=>e.key==='index-open').at,now-500);
  const off=browser({interactions:false,earlyInteractions:[['index-open','index','','index']]});
  await off.advance(40);off.win.PlutonoCAnalytics.interaction('category','earth','大地','gallery');
  off.win.PlutonoCAnalytics.work('photo','earth-007','QA');await off.advance(10000);
  assert.deepEqual(off.requests.flatMap(r=>r.payload.events).map(e=>e.kind),['page','work']);
});

test('interaction flood cannot evict page and work events; failed actions do not create retry loops',async()=>{
  const b=browser({failed:true});await b.advance(40);
  for(let i=0;i<150;i++)b.win.PlutonoCAnalytics.interaction('category','earth','大地','gallery');
  for(let i=0;i<10;i++)b.win.PlutonoCAnalytics.work('photo','qa-'+i,'QA');
  await b.advance(100000);const events=b.requests.flatMap(r=>r.payload.events);
  assert.equal(events.length,100);assert.equal(events.filter(e=>e.kind==='page').length,1);assert.equal(events.filter(e=>e.kind==='work').length,10);
  assert.equal(b.requests.length,5);
});

function queryHarness(replies, uid = core.ADMIN) {
  const pipelines=[];let initialized=0;
  const bound=value=>({value,and(other){return {gte:value,lte:other.value};}});
  const db={command:{gte:bound,lte:bound,gt:value=>({$gt:value}),or:rows=>({$or:rows}),aggregate:{sum:value=>({$sum:value}),first:value=>({$first:value})}},collection:()=>({aggregate(){const ops=[];pipelines.push(ops);const chain={};for(const k of ['match','group','count','limit','sort','skip'])chain[k]=value=>{ops.push([k,value]);return chain;};chain.end=async()=>({data:replies.shift()||[]});return chain;}})};
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../cloudfunctions/analytics-shared/core.js'),'utf8'),{module,exports:module.exports,Date,Buffer,console,require:name=>name==='@cloudbase/js-sdk'?{init:()=>({auth:{getUserInfo:()=>({uid})}})}:name==='@cloudbase/node-sdk'?{init:()=>{initialized++;return{database:()=>db};}}:require(name)});
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  return{run:event=>module.exports.query({start:today,end:today,...event}),pipelines,initialized:()=>initialized};
}

test('admin summary preserves original counters and separately aggregates interactions and external entries',async()=>{
  const h=queryHarness([[{_id:'page',count:2},{_id:'work',count:1},{_id:'interaction',count:4}],[{count:1}],[],[],[{_id:'photo:x',count:1}],[],[],[{_id:'outbound',count:4}],[{_id:'award-a1',count:4,title:'A1'}]]);
  const r=await h.run({action:'summary'});assert.equal(r.ok,true);assert.equal(r.data.visitors,1);assert.equal(r.data.works[0].count,1);assert.equal(r.data.interactions[0].count,4);assert.equal(r.data.outbound[0]._id,'award-a1');
  assert.equal(h.pipelines.length,9);assert.ok(h.pipelines.every(p=>p[0][1].test===false));
  assert.ok(h.pipelines[2].some(([k,v])=>k==='limit'&&v>=360));
});

test('long details use a stable time/ID cursor, exclude duplicates at the boundary, and reject malformed cursors',async()=>{
  const at=Date.now(),rows=Array.from({length:501},(_,i)=>({_id:(i+1).toString(16).padStart(64,'0'),at,kind:i?'interaction':'page'}));
  const h=queryHarness([rows,rows.slice(500)]), identity={action:'detail',visitor:id(),session:id()};
  const first=await h.run(identity);assert.equal(first.ok,true);assert.equal(first.data.rows.length,500);assert.equal(first.data.nextCursor.id,rows[499]._id);
  const second=await h.run({...identity,cursor:first.data.nextCursor});assert.equal(second.data.rows[0]._id,rows[500]._id);assert.equal(second.data.nextCursor,null);
  const cursorMatch=h.pipelines[1].find(([k,v])=>k==='match'&&v.$or)?.[1].$or;
  assert.equal(cursorMatch[0].at.$gt,at);assert.equal(cursorMatch[1]._id.$gt,rows[499]._id);
  assert.equal((await h.run({...identity,cursor:{at:'not-number',id:'x'}})).error.code,'INVALID_INPUT');
  const denied=queryHarness([], 'not-admin');assert.equal((await denied.run({action:'summary'})).error.code,'FORBIDDEN');assert.equal(denied.initialized(),0);
});
test('starts after paint/idle, one-second section dwell and per-session work dedupe', async () => {
  const b=browser();assert.equal(b.requests.length,0);b.win.PlutonoCAnalytics.work('photo','earth-007','QA');
  await b.advance(40);b.enter();await b.advance(500);b.leave();await b.advance(600);b.enter();await b.advance(1001);
  b.win.PlutonoCAnalytics.work('photo','earth-007','QA');await b.advance(10000);
  const events=b.requests.flatMap(r=>r.payload.events);assert.deepEqual(events.map(e=>e.kind).sort(),['page','section','work']);assert.equal(b.requests[0].payload.source,'search.example');
});
test('reload preserves visitor/session and increments page count; inactivity starts new session', async () => {
  const a=browser();await a.advance(40);a.win.PlutonoCAnalytics.work('photo','earth-007','QA');await a.advance(10000);
  const b=browser({storage:a.storage});await b.advance(40);b.win.PlutonoCAnalytics.work('photo','earth-007','QA');await b.advance(10000);
  assert.equal(a.requests[0].payload.visitor,b.requests[0].payload.visitor);assert.equal(a.requests[0].payload.session,b.requests[0].payload.session);assert.equal(b.requests[0].payload.events.length,1);
  await b.advance(30*60000);b.win.PlutonoCAnalytics.work('photo','earth-007','QA');await b.advance(10000);
  assert.notEqual(b.requests[0].payload.session,b.requests[1].payload.session);
});
test('section center band follows viewport height and resets dwell on resize', async () => {
  const b=browser();await b.advance(40);assert.equal(b.margin(),'-200px 0px -200px 0px');
  b.enter();await b.advance(500);b.win.innerHeight=1000;b.emit('resize');await b.advance(501);
  assert.equal(b.margin(),'-250px 0px -250px 0px');await b.advance(10000);
  assert.equal(b.requests.flatMap(r=>r.payload.events).filter(e=>e.kind==='section').length,0);
});
test('storage blocked, failed and timed-out requests remain isolated with no automatic retry', async () => {
  for(const options of [{storageBlocked:true,failed:true},{stalled:true}]) {
    const b=browser(options);await b.advance(40000);assert.equal(b.requests.length,1);
    b.win.PlutonoCAnalytics.work('photo','earth-008','QA');await b.advance(15000);assert.equal(b.requests.length,2);
  }
});
test('batches bounded by 20 events and 10 KB; feature switch installs no reporting', async () => {
  const b=browser();await b.advance(40);for(let i=0;i<50;i++)b.win.PlutonoCAnalytics.work('photo','qa-'+i,'测试'.repeat(80));await b.advance(70000);
  for(const request of b.requests){assert.ok(request.payload.events.length<=20);assert.ok(Buffer.byteLength(request.options.body)<=10240);}
  const off=browser({disabled:true});await off.advance(100000);assert.equal(off.requests.length,0);assert.equal(off.win.PlutonoCAnalytics,undefined);
});

test('closing an overlay restarts full dwell; resumed session records the current section', async () => {
  const b=browser(); await b.advance(40); b.enter(); await b.advance(500);
  b.overlay(true); await b.advance(1500); b.overlay(false); await b.advance(999);
  b.overlay(true); await b.advance(9000);
  assert.equal(b.requests.flatMap(r=>r.payload.events).filter(e=>e.kind==='section').length,0);
  b.overlay(false); await b.advance(1001); await b.advance(10000);
  assert.equal(b.requests.flatMap(r=>r.payload.events).filter(e=>e.kind==='section').length,1);
  await b.advance(30*60000); b.emit('pointerdown'); await b.advance(1001); await b.advance(10000);
  const visits=b.requests.filter(r=>r.payload.events.some(e=>e.kind==='section'));
  assert.equal(visits.length,2); assert.notEqual(visits[0].payload.session,visits[1].payload.session);
});
