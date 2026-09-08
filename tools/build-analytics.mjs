import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cleanupSecret = path.join(root, 'work/analytics-functions/plutonoc-analytics-cleanup/cleanup-secret.json');
if (!fs.existsSync(cleanupSecret) || !/^[a-f0-9]{64}$/.test(JSON.parse(fs.readFileSync(cleanupSecret, 'utf8')))) {
  throw new Error('缺少有效的清理触发参数；请安全恢复线上既有参数后再构建，不能生成替代密钥。');
}
for (const role of ['collect', 'query', 'cleanup']) {
  const directory = path.join(root, 'work', 'analytics-functions', 'plutonoc-analytics-' + role);
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(path.join(root, 'cloudfunctions/analytics-shared/core.js'), path.join(directory, 'core.js'));
  fs.writeFileSync(path.join(directory, 'index.js'), `'use strict';\nexports.main = require('./core').${role};\n`);
  if (role === 'cleanup') {
    fs.writeFileSync(path.join(directory, 'index.js'), `'use strict';\nexports.main = event => require('./core').cleanup(event, require('./cleanup-secret.json'));\n`);
  }
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'plutonoc-analytics-' + role, version: '1.0.0', private: true, main: 'index.js', dependencies: { '@cloudbase/node-sdk': '3.18.1', '@cloudbase/js-sdk': '3.6.4' } }, null, 2) + '\n');
}
console.log('Analytics deployment packages built.');
