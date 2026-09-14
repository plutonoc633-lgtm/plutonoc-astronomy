import fs from 'node:fs';
const fragment = fs.readFileSync('partials/guestbook.html', 'utf8').replace(/\r\n/g, '\n').trim();
for (const file of ['index.html', 'guestbook.html']) {
  const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const next = original.replace(/<!-- GUESTBOOK_START -->[\s\S]*?<!-- GUESTBOOK_END -->/, `<!-- GUESTBOOK_START -->\n${fragment}\n<!-- GUESTBOOK_END -->`);
  if (process.argv.includes('--check')) { if (original !== next) throw Error(`${file}: guestbook markup is stale`); }
  else fs.writeFileSync(file, next);
}
