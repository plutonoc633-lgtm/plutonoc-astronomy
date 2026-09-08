'use strict';
const crypto = require('node:crypto');
const DAY = 86400000;
const EVENTS = 'plutonoc_analytics_events';
const LIMITS = 'plutonoc_analytics_limits';
const ADMIN = '2066559012906586114';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sections = new Set(['home', 'works', 'films', 'records', 'equipment', 'contact']);
const origins = new Set(['https://plutonoc.cn', 'https://www.plutonoc.cn', 'https://plutonoc633-lgtm.github.io']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const day = time => new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const fail = (code, message) => Object.assign(new Error(message), { code });

function normalize(body, now = Date.now()) {
  if (!body || !UUID.test(body.visitor) || !UUID.test(body.session) || !Array.isArray(body.events) || !body.events.length || body.events.length > 20) throw fail('INVALID_INPUT', '记录格式无效');
  const device = ['desktop', 'phone', 'tablet'].includes(body.device) ? body.device : 'unknown';
  let source = '';
  if (body.source) {
    try { source = new URL('https://' + String(body.source)).hostname.slice(0, 253); } catch { /* unknown source */ }
  }
  return body.events.map(event => {
    if (!event || typeof event !== 'object') throw fail('INVALID_INPUT', '记录格式无效');
    if (!UUID.test(event.id) || !['page', 'section', 'work'].includes(event.kind)) throw fail('INVALID_INPUT', '记录格式无效');
    const key = String(event.key || '');
    if (event.kind === 'section' && !sections.has(key)) throw fail('INVALID_INPUT', '栏目无效');
    if (event.kind === 'work' && !/^(photo|video):[a-z0-9._:-]{1,120}$/i.test(key)) throw fail('INVALID_INPUT', '作品编号无效');
    const at = Math.max(now - 60000, Math.min(now, Number(event.at) || now));
    const unique = event.kind === 'page' ? event.id : event.kind + ':' + key;
    return { _id: hash(body.visitor + ':' + body.session + ':' + unique), visitor: body.visitor, session: body.session,
      kind: event.kind, key: event.kind === 'page' ? 'home' : key, title: String(event.title || '').replace(/[\x00-\x1f]/g, '').slice(0, 120),
      at, day: day(at), receivedAt: now, device, source, test: body.test === true };
  });
}

function range(input, now = Date.now()) {
  const today = day(now);
  const first = day(Date.parse(today + 'T00:00:00+08:00') - 89 * DAY);
  const start = String(input.start || ''), end = String(input.end || '');
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00+08:00')) && day(Date.parse(value + 'T00:00:00+08:00')) === value;
  if (!valid(start) || !valid(end) || start < first || end > today || start > end) throw fail('INVALID_RANGE', '请选择最近 90 天内的日期');
  return { start, end };
}

function database() { return require('@cloudbase/node-sdk').init({ env: 'activity-book-web-d7djhe7bb1e834' }).database(); }
function response(statusCode, origin, body = '') {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    ...(origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}) }, body: body ? JSON.stringify(body) : '' };
}
const duplicate = error => /duplicate|重复|E11000|DATABASE_DOCUMENT_ALREADY_EXISTS/i.test(String(error.code) + ' ' + error.message);

async function collect(event) {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const origin = headers.origin || '';
  if (!origins.has(origin)) return response(403, origin);
  if (event.httpMethod === 'OPTIONS') return { ...response(204, origin), headers: { ...response(204, origin).headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' } };
  if (event.httpMethod !== 'POST') return response(405, origin);
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body;
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > 10240) return response(413, origin);
    const body = JSON.parse(raw), now = Date.now(), documents = normalize(body, now), db = database();
    // Shared database counter, not instance-local memory. Never persist raw IP or request headers.
    const bucket = Math.floor(now / 60000);
    const keys = [hash('visitor:' + body.visitor + ':' + bucket), hash('global:' + bucket)];
    const budgets = [12, 600];
    const ip = event.requestContext?.identity?.sourceIp || event.requestContext?.sourceIp;
    if (ip) { keys.push(hash('network:' + ip + ':' + bucket)); budgets.push(120); }
    for (let i = 0; i < keys.length; i++) {
      const id = keys[i];
      try { await db.collection(LIMITS).add({ _id: id, count: 0, at: now }); } catch (error) { if (!duplicate(error)) throw error; }
      await db.collection(LIMITS).doc(id).update({ count: db.command.inc(1) });
      const result = await db.collection(LIMITS).doc(id).get();
      if (result.data[0].count > budgets[i]) return response(429, origin);
    }
    await Promise.all(documents.map(async document => {
      try { await db.collection(EVENTS).add(document); } catch (error) { if (!duplicate(error)) throw error; }
    }));
    return response(204, origin);
  } catch (error) { return response(error.code === 'INVALID_INPUT' || error instanceof SyntaxError ? 400 : 503, origin); }
}

async function assertAdmin(context) {
  const app = require('@cloudbase/js-sdk').init({ env: 'activity-book-web-d7djhe7bb1e834' });
  let uid = context?.extendedContext?.userId || context?.userId || '';
  if (!uid) { try { uid = app.auth.getUserInfo()?.uid || ''; } catch { /* no authenticated caller */ } }
  if (uid !== ADMIN) throw fail('FORBIDDEN', '当前账号无权查看访客记录');
}

async function query(event, context) {
  try {
    await assertAdmin(context);
    const dates = range(event), db = database(), $ = db.command.aggregate, _ = db.command;
    // Administrator-only QA can inspect marked visits; production dashboard always excludes them.
    const match = { test: event.testOnly === true, day: _.gte(dates.start).and(_.lte(dates.end)), at: _.gte(Date.now() - 90 * DAY) };
    const pipeline = () => db.collection(EVENTS).aggregate().match(match);
    const run = async chain => (await chain.end()).data;
    if (event.action === 'summary') {
      const [counts, visitors, trendCounts, trendVisitors, works, devices, sources] = await Promise.all([
        run(pipeline().group({ _id: '$kind', count: $.sum(1) })),
        run(pipeline().group({ _id: '$visitor' }).count('count')),
        run(pipeline().group({ _id: { day: '$day', kind: '$kind' }, count: $.sum(1) }).limit(300)),
        run(pipeline().group({ _id: { day: '$day', visitor: '$visitor' } }).group({ _id: '$_id.day', count: $.sum(1) }).limit(90)),
        run(pipeline().match({ kind: 'work' }).group({ _id: '$key', title: $.first('$title'), count: $.sum(1) }).sort({ count: -1, _id: 1 }).limit(20)),
        run(pipeline().match({ kind: 'page' }).group({ _id: '$device', count: $.sum(1) }).sort({ count: -1 }).limit(10)),
        run(pipeline().match({ kind: 'page' }).group({ _id: '$source', count: $.sum(1) }).sort({ count: -1, _id: 1 }).limit(20))
      ]);
      return { ok: true, data: { dates, counts, visitors: visitors[0]?.count || 0, trendCounts, trendVisitors, works, devices, sources } };
    }
    if (event.action === 'visits') {
      const page = Math.min(10000, Math.max(0, Math.floor(Number(event.page) || 0)));
      const rows = await run(pipeline().group({ _id: { visitor: '$visitor', session: '$session' }, first: $.min('$at'), last: $.max('$at'), device: $.first('$device'), source: $.first('$source'), actions: $.sum(1) }).sort({ last: -1, '_id.session': 1 }).skip(page * 50).limit(51));
      return { ok: true, data: { rows: rows.slice(0, 50), hasNext: rows.length > 50, page } };
    }
    if (event.action === 'detail') {
      if (!UUID.test(event.visitor) || !UUID.test(event.session)) throw fail('INVALID_INPUT', '访问编号无效');
      const rows = await run(pipeline().match({ visitor: event.visitor, session: event.session }).sort({ at: 1, _id: 1 }).limit(500));
      return { ok: true, data: { rows } };
    }
    throw fail('INVALID_ACTION', '不支持的统计操作');
  } catch (error) { return { ok: false, error: { code: error.code || 'ANALYTICS_ERROR', message: ['FORBIDDEN', 'INVALID_RANGE', 'INVALID_INPUT', 'INVALID_ACTION'].includes(error.code) ? error.message : '统计暂时不可用，请稍后刷新' } }; }
}

async function cleanup(event, secret) {
  // Fixed retention only: caller input cannot select collections or deletion dates.
  if (!secret || event.Message !== secret || event.Type !== 'Timer' || event.TriggerName !== 'plutonoc-analytics-daily') return { ok: false };
  const db = database(), now = Date.now();
  for (const [collection, cutoff] of [[EVENTS, now - 90 * DAY], [LIMITS, now - DAY]]) {
    for (let batch = 0; batch < 100; batch++) {
      const rows = (await db.collection(collection).where({ at: db.command.lt(cutoff) }).limit(100).field({ _id: true }).get()).data;
      if (!rows.length) break;
      await Promise.all(rows.map(row => db.collection(collection).doc(row._id).remove()));
    }
  }
  return { ok: true };
}
module.exports = { normalize, range, collect, query, cleanup, ADMIN, EVENTS, LIMITS };
