'use strict';
const crypto = require('node:crypto');
const ENV = 'activity-book-web-d7djhe7bb1e834';
const ADMIN = '2066559012906586114';
const MESSAGES = 'plutonoc_guestbook_messages', LIMITS = 'plutonoc_guestbook_limits';
const DAY = 86400000;
const origins = new Set(['https://plutonoc.cn', 'https://www.plutonoc.cn', 'https://plutonoc633-lgtm.github.io']);
const error = (code, message) => Object.assign(new Error(message), { code });
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const validId = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function text(value, max, required = false) {
  if (typeof value !== 'string') throw error('INVALID_INPUT', '请填写有效的文字');
  const clean = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if ([...clean].length > max || (required && !clean) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean)) throw error('INVALID_INPUT', '文字为空、过长或包含无效字符');
  return clean;
}
function submission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.requestId)) throw error('INVALID_INPUT', '请求编号无效，请重新打开留言簿');
  return { id: hash(input.requestId.toLowerCase()), nickname: text(input.nickname ?? '', 20) || '访客', body: text(input.body, 1000, true), trap: text(input.website ?? '', 200) };
}
function decodeCursor(value, scope) {
  if (!value) return null;
  try {
    if (typeof value !== 'string' || value.length > 300) throw 0;
    const item = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (item.s !== scope || !Number.isSafeInteger(item.t) || item.t < 0 || !validId(item.id)) throw 0;
    return item;
  } catch { throw error('INVALID_INPUT', '分页位置无效，请刷新列表'); }
}
const cursorFor = (item, field, scope) => Buffer.from(JSON.stringify({ s: scope, t: item[field], id: item._id })).toString('base64url');
const checked = result => { if (result?.code) throw error(result.code, 'Database operation failed'); return result; };
const first = result => { checked(result); return Array.isArray(result.data) ? result.data[0] : result.data; };
async function assertAdmin(context) {
  let uid = context?.extendedContext?.userId || context?.userId || '';
  if (!uid) {
    const app = require('@cloudbase/js-sdk').init({ env: ENV });
    try { uid = app.auth.getUserInfo()?.uid || ''; } catch { /* anonymous */ }
  }
  if (uid !== ADMIN) throw error('FORBIDDEN', '请使用管理员账号登录');
}
function createService({ db, secret, now = Date.now, authorize = assertAdmin }) {
  async function list(status, value, admin = false) {
    const field = admin ? 'createdAt' : 'publishedAt', scope = `${admin ? 'admin' : 'public'}:${status}`;
    const cursor = decodeCursor(value, scope), limit = admin ? 50 : 20, _ = db.command;
    const filter = cursor ? _.and([{ status }, _.or([{ [field]: _.lt(cursor.t) }, { [field]: cursor.t, _id: _.lt(cursor.id) }])]) : { status };
    const fields = { _id: true, nickname: true, body: true, publishedAt: true, reply: true, ...(admin ? { createdAt: true, status: true, revision: true } : {}) };
    const result = checked(await db.collection(MESSAGES).where(filter).orderBy(field, 'desc').orderBy('_id', 'desc').field(fields).limit(limit + 1).get());
    const items = result.data.slice(0, limit);
    return { items, nextCursor: result.data.length > limit ? cursorFor(items.at(-1), field, scope) : null };
  }
  async function submit(input, network) {
    const item = submission(input);
    if (item.trap) return { received: true };
    if (!secret || !network) throw error('UNAVAILABLE', '暂时无法提交，请稍后重试');
    const at = now(), day = Math.floor(at / DAY);
    const digest = crypto.createHmac('sha256', secret).update(`${day}:${network}`).digest('hex');
    const fingerprint = hash(JSON.stringify([item.nickname, item.body]));
    return db.runTransaction(async tx => {
      const ref = tx.collection(MESSAGES).doc(item.id), existing = first(await ref.get());
      if (existing) {
        if (existing.status !== 'deleted' && existing.fingerprint !== fingerprint) throw error('CONFLICT', '请求编号已使用，请重新提交');
        return { received: true };
      }
      // A transaction keeps concurrent instances from exceeding these database-backed quotas.
      const buckets = [[`network:${digest}:${Math.floor(at / 600000)}`, 5], [`day:${digest}`, 20], [`global:${Math.floor(at / 60000)}`, 60]];
      const counters = [];
      for (const [id, max] of buckets) {
        const counter = tx.collection(LIMITS).doc(hash(id));
        const old = first(await counter.get());
        if ((old?.count || 0) >= max) throw error('RATE_LIMITED', '提交较频繁，请稍后再试');
        counters.push([counter, (old?.count || 0) + 1]);
      }
      for (const [counter, count] of counters) checked(await counter.set({ count, expiresAt: (day + 2) * DAY }));
      checked(await ref.set({ nickname: item.nickname, body: item.body, fingerprint, status: 'pending', createdAt: at, publishedAt: 0, reply: '', revision: 1 }));
      return { received: true };
    });
  }
  async function manage(input, context) {
    await authorize(context);
    if (!input || Buffer.byteLength(JSON.stringify(input)) > 16384) throw error('INVALID_INPUT', '请求过大');
    if (input.action === 'list') {
      if (!['pending', 'published', 'hidden'].includes(input.status)) throw error('INVALID_INPUT', '列表无效');
      return list(input.status, input.cursor, true);
    }
    if (!['publish', 'hide', 'delete', 'reply'].includes(input.action) || !validId(input.id) || !Number.isSafeInteger(input.revision)) throw error('INVALID_INPUT', '操作无效');
    const reply = input.action === 'reply' ? text(input.reply, 1000) : null;
    return db.runTransaction(async tx => {
      const ref = tx.collection(MESSAGES).doc(input.id), item = first(await ref.get());
      if (!item || item.status === 'deleted') throw error('NOT_FOUND', '留言已删除，请刷新列表');
      if (item.revision !== input.revision) throw error('CONFLICT', '留言已变化，请刷新列表后重试');
      if (input.action === 'delete') {
        // Retain only an opaque request tombstone so delayed submit retries cannot resurrect deleted text.
        checked(await ref.set({ status: 'deleted' }));
      } else {
        const update = { revision: item.revision + 1 };
        if (reply !== null) update.reply = reply;
        else { update.status = input.action === 'publish' ? 'published' : 'hidden'; if (update.status === 'published' && item.status !== 'published') update.publishedAt = now(); }
        checked(await ref.update(update));
      }
      return { updated: true };
    });
  }
  async function cleanup() {
    const at = now(); let removed = 0;
    for (let page = 0; page < 100; page++) {
      const rows = checked(await db.collection(LIMITS).where({ expiresAt: db.command.lt(at) }).limit(100).get()).data;
      if (!rows.length) return { removed };
      await Promise.all(rows.map(async row => checked(await db.collection(LIMITS).doc(row._id).remove()))); removed += rows.length;
    }
    throw error('BACKLOG', '限流清理达到上限，需要检查积压');
  }
  return { list, submit, manage, cleanup };
}
function service() {
  const db = require('@cloudbase/node-sdk').init({ env: ENV }).database();
  const secret = require('./private-config.json').secret;
  return createService({ db, secret });
}
const safeError = cause => ({ code: ['INVALID_INPUT', 'FORBIDDEN', 'CONFLICT', 'NOT_FOUND', 'RATE_LIMITED'].includes(cause.code) ? cause.code : 'UNAVAILABLE', message: ['INVALID_INPUT', 'FORBIDDEN', 'CONFLICT', 'NOT_FOUND', 'RATE_LIMITED'].includes(cause.code) ? cause.message : '服务暂时不可用，请稍后重试' });
async function publicHandler(event) {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const origin = headers.origin || '';
  const respond = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Vary': 'Origin', ...(origins.has(origin) ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } : {}) }, body: body ? JSON.stringify(body) : '' });
  if (origin && !origins.has(origin)) return respond(403, { ok: false });
  if (event.httpMethod === 'OPTIONS') return respond(204);
  try {
    let data;
    if (event.httpMethod === 'GET') data = await service().list('published', event.queryStringParameters?.cursor || '');
    else if (event.httpMethod === 'POST') {
      const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '';
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > 10240) throw error('INVALID_INPUT', '请求过大');
      let input; try { input = JSON.parse(raw); } catch { throw error('INVALID_INPUT', '请求格式无效'); }
      // CloudBase HTTP gateway supplies x-real-ip; never persist it or trust a body-supplied address.
      const network = event.requestContext?.identity?.sourceIp || event.requestContext?.sourceIp || event.requestContext?.sourceIP || headers['x-real-ip'] || '';
      data = await service().submit(input, require('node:net').isIP(network) ? network : '');
    } else return respond(405, { ok: false });
    return respond(200, { ok: true, data });
  } catch (cause) {
    const detail = safeError(cause);
    return respond({ INVALID_INPUT: 400, CONFLICT: 409, RATE_LIMITED: 429 }[detail.code] || 503, { ok: false, error: detail });
  }
}
async function adminHandler(event, context) {
  try { return { ok: true, data: await service().manage(event, context) }; }
  catch (cause) { return { ok: false, error: safeError(cause) }; }
}
async function cleanupHandler(event) {
  const key = require('./private-config.json').cleanupKey;
  if (!key || event?.Message !== key) throw error('FORBIDDEN', 'Invalid cleanup trigger');
  return service().cleanup();
}
module.exports = { createService, submission, decodeCursor, cursorFor, publicHandler, adminHandler, cleanupHandler, MESSAGES, LIMITS };
