const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, runtimeCredentials } = require('../cloudfunctions/plutonoc-media');
const host = 'e7d9-static-activity-book-web-d7djhe7bb1e834-1343388380.cos.ap-shanghai.myqcloud.com';
const event = (id, httpMethod = 'GET') => ({ httpMethod, queryStringParameters: { id } });

test('media endpoint signs only the two fixed public films, ignoring client paths and credentials', async () => {
  const calls = [];
  const handler = createHandler(async (options, context) => {
    calls.push({ options, context });
    return `https://${host}/${options.Key}?signature=temporary`;
  });
  const context = { runtime: true };
  for (const id of ['star-dream', 'tianjian-promo']) {
    const response = await handler({ ...event(id), queryStringParameters: { id, key: 'private/file', url: 'https://evil.invalid', Expires: 999999 }, context: { fake: true } }, context);
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.body, '');
    assert.match(response.headers.Location, new RegExp(`/plutonoc/videos/${id}\\.mp4\\?`));
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].context, context);
  assert.equal(calls[0].options.Expires, 3600);
});

test('unknown IDs, prototype properties, traversal, malformed input and writes never call the signer', async () => {
  let calls = 0;
  const handler = createHandler(() => { calls++; throw Error('must not run'); });
  for (const id of [undefined, '', 'constructor', '__proto__', '../star-dream', 'star-dream.mp4', ['star-dream'], { id: 'star-dream' }]) {
    assert.equal((await handler(event(id))).statusCode, 404);
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS', undefined]) {
    assert.equal((await handler({ ...event('star-dream'), httpMethod: method })).statusCode, 405);
  }
  assert.equal(calls, 0);
});

test('HEAD signs HEAD; credentials are taken afresh from each invocation', async () => {
  const seen = [];
  const handler = createHandler((options, context) => {
    seen.push([options.Method, context.token]);
    return `https://${host}/${options.Key}?temporary=${context.token}`;
  });
  await handler(event('star-dream', 'HEAD'), { token: 'first' });
  await handler(event('star-dream'), { token: 'second' });
  assert.deepEqual(seen, [['HEAD', 'first'], ['GET', 'second']]);
});

test('signing failures and unexpected destinations fail closed without exposing errors', async () => {
  for (const signer of [() => { throw Error('private-key'); }, () => 'https://evil.invalid/',
    () => `https://${host}/private.mp4`, () => `http://${host}/plutonoc/videos/star-dream.mp4`]) {
    const response = await createHandler(signer)(event('star-dream'));
    assert.equal(response.statusCode, 503);
    assert.equal(response.headers.Location, undefined);
    assert.equal(response.body, '');
  }
});

test('credentials refresh from serialized runtime context on warm invocations; never use stale environment keys', () => {
  const context = token => ({ environment: JSON.stringify({ TENCENTCLOUD_SECRETID: 'temporary-id', TENCENTCLOUD_SECRETKEY: 'temporary-key', TENCENTCLOUD_SESSIONTOKEN: token }) });
  assert.equal(runtimeCredentials(context('first')).SecurityToken, 'first');
  assert.equal(runtimeCredentials(context('second')).SecurityToken, 'second');
  assert.throws(() => runtimeCredentials({}), { code: 'MISSING_RUNTIME_CREDENTIALS' });
  assert.throws(() => runtimeCredentials({ environment: 'malformed' }));
});
