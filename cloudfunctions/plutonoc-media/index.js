'use strict';

const BUCKET = 'e7d9-static-activity-book-web-d7djhe7bb1e834-1343388380';
const REGION = 'ap-shanghai';
const files = Object.freeze({
  'star-dream': 'plutonoc/videos/star-dream.mp4',
  'tianjian-promo': 'plutonoc/videos/tianjian-promo.mp4',
});

// Only these already-public films can be read. Never accept a URL, bucket or key.
function createHandler(sign) {
  return async (event, context) => {
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
    const respond = (statusCode, extra = {}) => ({ statusCode, headers: { ...headers, ...extra }, body: '' });
    if (!['GET', 'HEAD'].includes(event?.httpMethod)) return respond(405, { Allow: 'GET, HEAD' });
    const id = event.queryStringParameters?.id;
    if (typeof id !== 'string' || !Object.hasOwn(files, id)) return respond(404);
    try {
      const location = await sign({ Bucket: BUCKET, Region: REGION, Key: files[id], Method: event.httpMethod, Expires: 3600 }, context);
      // A bad signer must never turn this endpoint into an arbitrary redirect.
      const url = new URL(location);
      if (url.protocol !== 'https:' || url.host !== `${BUCKET}.cos.${REGION}.myqcloud.com`
          || url.pathname !== `/${files[id]}` || url.username || url.password || url.hash) throw Error('Invalid media URL');
      return respond(302, { Location: location });
    } catch (cause) {
      console.warn('media unavailable:', cause?.code === 'MISSING_RUNTIME_CREDENTIALS' ? 'runtime credentials missing' : 'signing failed');
      // Do not log credentials, signed URLs or SDK errors containing them.
      return respond(503, { 'Retry-After': '5' });
    }
  };
}

function runtimeCredentials(context) {
  // Node's runtime puts fresh per-invocation credentials in context.environment.
  // Do not cache a client with cold-start process.env credentials.
  const environment = typeof context?.environment === 'string' ? JSON.parse(context.environment) : context?.environment;
  const current = { ...environment, ...context };
  const SecretId = current?.TENCENTCLOUD_SECRETID;
  const SecretKey = current?.TENCENTCLOUD_SECRETKEY;
  const SecurityToken = current?.TENCENTCLOUD_SESSIONTOKEN;
  if (!SecretId || !SecretKey || !SecurityToken) {
    throw Object.assign(Error('Missing runtime credentials'), { code: 'MISSING_RUNTIME_CREDENTIALS' });
  }
  return { SecretId, SecretKey, SecurityToken };
}

const main = createHandler((options, context) => {
  const COS = require('cos-nodejs-sdk-v5');
  const cos = new COS(runtimeCredentials(context));
  return new Promise((resolve, reject) => cos.getObjectUrl({ ...options, Method: options.Method.toLowerCase(), Protocol: 'https:', Sign: true },
    (error, data) => error ? reject(error) : resolve(data.Url)));
});

module.exports = { main, createHandler, runtimeCredentials };
