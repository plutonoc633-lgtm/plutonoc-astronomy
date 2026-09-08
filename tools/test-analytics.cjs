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
  assert.deepEqual(await core.cleanup({Type:'Timer',TriggerName:'plutonoc-analytics-daily'}, 'private'), {ok:false});
});

function browser({storage, storageBlocked = false, disabled = false, failed = false, stalled = false} = {}) {
  let time = now, serial = 0;
  const tasks = new Map(), listeners = {}, requests = [], sections = [{id:'home'}, {id:'works'}];
  const local = storage?.local || new Map(), session = storage?.session || new Map();
  const store = map => ({getItem(key) {if(storageBlocked) throw Error('blocked'); return map.get(key);},setItem(key,value) {if(storageBlocked) throw Error('blocked'); map.set(key,value);}});
  const on = (name, fn) => (listeners[name] ||= []).push(fn);
  const timer = (fn, delay, interval = false) => { const token = ++serial; tasks.set(token,{fn,at:time+delay,delay,interval}); return token; };
  const win = { innerHeight:800, PLUTONOC_ANALYTICS:{enabled:!disabled,endpoint:'https://qa.invalid',test:true}, localStorage:store(local),sessionStorage:store(session),addEventListener:on,requestIdleCallback:fn=>timer(fn,1)};
  let observer;
  class IO {constructor(callback,options){observer=this;this.callback=callback;this.options=options;}observe(){}unobserve(){}disconnect(){}}
  win.IntersectionObserver = IO;
  const document = { readyState:'complete',referrer:'https://search.example/private?q=secret',visibilityState:'visible',addEventListener:on,querySelector:()=>null,querySelectorAll:()=>sections };
  const context = { window:win,document,navigator:{userAgent:'Desktop',maxTouchPoints:0},crypto,URL,TextEncoder,Blob,AbortController,IntersectionObserver:IO,
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
  return {win,document,requests,advance,storage:{local,session},margin:()=>observer.options.rootMargin,emit:(name,event={})=>listeners[name]?.forEach(fn=>fn(event)),enter:(index=0)=>observer.callback([{target:sections[index],isIntersecting:true}]),leave:(index=0)=>observer.callback([{target:sections[index],isIntersecting:false}])};
}
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
