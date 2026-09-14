import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const secretFile = path.join(root, 'work/guestbook-private.json');
if (!fs.existsSync(secretFile)) {
  // Explicit one-time provisioning only; regular builds must never rotate a deployed secret.
  if (!process.argv.includes('--initialize')) throw Error('Missing guestbook private config; initialize only for a new deployment.');
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  fs.writeFileSync(secretFile, JSON.stringify({ secret: crypto.randomBytes(32).toString('hex'), cleanupKey: crypto.randomBytes(32).toString('hex') }));
}
for (const role of ['public', 'admin', 'cleanup']) {
  const name = `plutonoc-guestbook-${role}`, directory = path.join(root, 'work/guestbook-functions', name);
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(path.join(root, 'cloudfunctions/guestbook-shared/core.js'), path.join(directory, 'core.js'));
  fs.copyFileSync(secretFile, path.join(directory, 'private-config.json'));
  fs.writeFileSync(path.join(directory, 'index.js'), `exports.main = require('./core').${role}Handler;\n`);
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', private: true, main: 'index.js', dependencies: { '@cloudbase/node-sdk': '3.18.1', '@cloudbase/js-sdk': '3.6.4' } }, null, 2));
  console.log('Built', name);
}
