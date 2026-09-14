const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createService, submission, decodeCursor, MESSAGES, LIMITS } = require('../cloudfunctions/guestbook-shared/core');
function fakeDB() {
  const stores = new Map(), command = { lt: x => v => v < x, and: xs => row => xs.every(x => match(row, x)), or: xs => row => xs.some(x => match(row, x)) };
  function match(row, filter) { return typeof filter === 'function' ? filter(row) : Object.entries(filter).every(([key, value]) => typeof value === 'function' ? value(row[key]) : row[key] === value); }
  const collection = name => {
    if (!stores.has(name)) stores.set(name, new Map()); const store = stores.get(name);
    const query = (filter = {}, sorts = [], fields = null, count = Infinity) => ({
      where: value => query(value, sorts, fields, count), orderBy: (key, direction) => query(filter, [...sorts, [key, direction]], fields, count), field: value => query(filter, sorts, value, count), limit: value => query(filter, sorts, fields, value),
      async get() { let rows = [...store].map(([id, row]) => ({ ...row, _id: id })).filter(row => match(row, filter)); rows.sort((a,b) => { for (const [key, direction] of sorts) { const cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (cmp) return direction === 'desc' ? -cmp : cmp; } return 0; }); return { data: rows.slice(0, count).map(row => fields ? Object.fromEntries(Object.entries(row).filter(([key]) => fields[key])) : row) }; },
      doc: id => ({ async get() { return { data: store.has(id) ? [{ ...store.get(id), _id: id }] : [] }; }, async set(value) { store.set(id, { ...value }); }, async update(value) { if (store.has(id)) store.set(id, { ...store.get(id), ...value }); }, async remove() { store.delete(id); } })
    }); return query();
  };
  let tail = Promise.resolve(); const db = { command, collection, stores, runTransaction(fn) { const run = tail.then(async () => { const snapshot = structuredClone(stores); try { return await fn(db); } catch (error) { stores.clear(); for (const [k,v] of snapshot) stores.set(k,v); throw error; } }); tail = run.catch(() => {}); return run; } }; return db;
}
const input = () => ({ requestId: crypto.randomUUID(), nickname: '', body: '一条中文留言 <script>alert(1)</script>' });
const fixture = () => { const db = fakeDB(); let time = 1800000000000; return { db, service: createService({ db, secret: 'test-secret', now: () => time, authorize: async ctx => { if (ctx !== 'admin') throw Object.assign(Error('denied'), {code:'FORBIDDEN'}); } }), advance: ms => { time += ms; } }; };
test('Unicode limits, blank text, invalid types and controls are checked', () => {
  assert.equal(submission({ ...input(), nickname: '😀'.repeat(20), body: '文'.repeat(1000) }).nickname.length, 40);
  for (const patch of [{body:' \n '},{body:'字'.repeat(1001)},{nickname:'名'.repeat(21)},{body:[]},{body:'a\0'},{requestId:'x'}]) assert.throws(() => submission({...input(),...patch}));
});
test('submission ignores forged status/admin/date and exposes no pending text', async () => {
  const {service,db} = fixture(); await service.submit({...input(),status:'published',admin:true,publishedAt:1},'192.0.2.1');
  assert.equal((await service.list('published')).items.length,0);
  const saved=[...db.stores.get(MESSAGES).values()][0]; assert.equal(saved.status,'pending'); assert.equal(saved.nickname,'访客'); assert.ok(!JSON.stringify([...db.stores]).includes('192.0.2.1'));
});
test('parallel duplicate requests insert once; changed payload conflicts', async () => {
  const {service,db} = fixture(), value=input(); await Promise.all(Array.from({length:12},()=>service.submit(value,'ip')));
  assert.equal(db.stores.get(MESSAGES).size,1); assert.equal([...db.stores.get(LIMITS).values()][0].count,1);
  await assert.rejects(service.submit({...value,body:'different'},'ip'),{code:'CONFLICT'});
});
test('transactional rate limits apply across concurrent requests, expire in the next window', async () => {
  const {service,db,advance}=fixture(); const results=await Promise.allSettled(Array.from({length:8},()=>service.submit(input(),'ip')));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,5); assert.equal(db.stores.get(MESSAGES).size,5);
  advance(600001); await service.submit(input(),'ip');
});
test('honeypot accepted silently with no data, missing network fails closed', async()=> {
  const {service,db}=fixture(); await service.submit({...input(),website:'spam'},'ip'); assert.equal(db.stores.size,0); await assert.rejects(service.submit(input(),''),{code:'UNAVAILABLE'});
});
test('admin-only access, revision conflicts, approval, reply, hiding and deletion',async()=> {
  const {service,db}=fixture(); const value=input(); await service.submit(value,'ip');
  await assert.rejects(service.manage({action:'list',status:'pending'},null),{code:'FORBIDDEN'});
  let item=(await service.manage({action:'list',status:'pending'},'admin')).items[0];
  const act=async(action,revision,rest={})=>service.manage({action,id:item._id,revision,...rest},'admin');
  await act('publish',1); await assert.rejects(act('hide',1),{code:'CONFLICT'}); await act('reply',2,{reply:'谢谢 <b>你</b>'});
  let publicItem=(await service.list('published')).items[0]; assert.equal(publicItem.reply,'谢谢 <b>你</b>'); assert.ok(!('fingerprint' in publicItem)); assert.ok(!('createdAt' in publicItem)); assert.ok(!('revision' in publicItem));
  await act('hide',3); assert.equal((await service.list('published')).items.length,0); await act('delete',4);
  assert.deepEqual(db.stores.get(MESSAGES).get(item._id),{status:'deleted'}); await service.submit(value,'ip'); assert.equal((await service.manage({action:'list',status:'pending'},'admin')).items.length,0);
});
test('stable tied-timestamp pagination has no repeats, public 20 / admin 50',async()=> {
  const {service,db}=fixture(); for(let i=0;i<105;i++)await db.collection(MESSAGES).doc(i.toString(16).padStart(64,'0')).set({status:'published',createdAt:20,publishedAt:30,nickname:'访客',body:'test',revision:1,reply:''});
  const page=await service.list('published'); assert.equal(page.items.length,20); const second=await service.list('published',page.nextCursor); assert.equal(second.items.length,20); assert.equal(new Set([...page.items,...second.items].map(x=>x._id)).size,40);
  const admin=await service.manage({action:'list',status:'published'},'admin'); assert.equal(admin.items.length,50); const more=await service.manage({action:'list',status:'published',cursor:admin.nextCursor},'admin'); assert.equal(more.items.length,50);
  assert.throws(()=>decodeCursor(admin.nextCursor,'public:published')); await assert.rejects(service.list('published','malformed'));
});
test('cleanup removes expired limit buckets and preserves current limits / messages',async()=> {
  const {service,db}=fixture(); await db.collection(LIMITS).doc('old').set({expiresAt:1}); await db.collection(LIMITS).doc('new').set({expiresAt:1900000000000}); await service.submit(input(),'ip');
  assert.equal((await service.cleanup()).removed,1); assert.ok(db.stores.get(LIMITS).has('new')); assert.equal(db.stores.get(MESSAGES).size,1);
});
module.exports={fakeDB};
test('cleanup propagates database errors instead of reporting success',async()=> {
  const db=fakeDB(); const original=db.collection;
  db.collection=name=>name===LIMITS ? {where:()=>({limit:()=>({get:async()=>({code:'DATABASE_ERROR'})})})} : original(name);
  const service=createService({db,secret:'test'}); await assert.rejects(service.cleanup(),{code:'DATABASE_ERROR'});
});
test('a denied counter write rolls back without accepting the message',async()=> {
  const db=fakeDB(), original=db.collection;
  db.collection=name=>{const collection=original(name);if(name===LIMITS)collection.doc=()=>({get:async()=>({data:null}),set:async()=>({code:'DATABASE_ERROR'})});return collection;};
  await assert.rejects(createService({db,secret:'test'}).submit(input(),'ip'),{code:'DATABASE_ERROR'});
  assert.equal(db.stores.get(MESSAGES)?.size||0,0);
});
