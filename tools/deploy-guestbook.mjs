import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const cli = process.env.PLUTONOC_TCB_CLI;
if (!cli) throw Error('Set PLUTONOC_TCB_CLI to the installed CloudBase CLI.');
const env = 'activity-book-web-d7djhe7bb1e834';
function call(args, privateOutput = false) {
  const result = spawnSync(process.execPath, [cli, ...args, '-e', env, '--json'], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
  if (result.status) throw Error(`${args.slice(0,3).join(' ')} failed${privateOutput ? ' (private output withheld)' : ': ' + result.stdout + result.stderr}`);
  const start = result.stdout.indexOf('{');
  const data = start >= 0 ? JSON.parse(result.stdout.slice(start)) : null;
  if (data?.success === false || data?.error) throw Error('Cloud operation failed');
  return data?.data ?? data;
}
const api = (service, action, body, privateOutput = false) => call(['api', service, action, '--api-version', service === 'scf' ? '2018-04-16' : '2018-06-08', '--body', JSON.stringify(body)], privateOutput);
const command = (name, value) => call(['db', 'nosql', 'execute', '--command', JSON.stringify([{ TableName: name, CommandType: 'COMMAND', Command: JSON.stringify(value) }])]);
const mode = process.argv[2], names = ['plutonoc_guestbook_messages', 'plutonoc_guestbook_limits'];
if (mode === 'initialize') {
  for (const name of names) {
    command(name, { create: name });
    api('tcb', 'ModifyDatabaseACL', { EnvId: env, CollectionName: name, AclTag: 'ADMINONLY' });
    command(name, { createIndexes: name, indexes: name.endsWith('messages') ? [
      { name: 'guestbook_public', key: { status: 1, publishedAt: -1, _id: -1 } },
      { name: 'guestbook_admin', key: { status: 1, createdAt: -1, _id: -1 } }
    ] : [{ name: 'guestbook_expiry', key: { expiresAt: 1 } }] });
    console.log('Created private collection and indexes:', name);
  }
}
if (mode === 'deploy') for (const role of ['public', 'admin', 'cleanup']) {
  const name = `plutonoc-guestbook-${role}`;
  call(['fn', 'deploy', name, '--dir', `work/guestbook-functions/${name}`, '--force']);
  console.log('Deployed', name);
}
if (mode === 'route') { call(['service', 'create', '-p', '/guestbook', '-f', 'plutonoc-guestbook-public']); console.log('Created guestbook public HTTP route'); }
if (mode === 'timer') {
  const secret = JSON.parse(fs.readFileSync('work/guestbook-private.json', 'utf8')).cleanupKey;
  const body = { Namespace: env, FunctionName: 'plutonoc-guestbook-cleanup' };
  const before = api('scf', 'ListTriggers', body, true);
  const existing = before?.Triggers?.find(t => t.TriggerName === 'plutonoc-guestbook-hourly');
  if (existing && existing.CustomArgument !== secret) throw Error('Existing cleanup trigger key differs; refusing to overwrite.');
  if (!existing) api('scf', 'CreateTrigger', { ...body, TriggerName: 'plutonoc-guestbook-hourly', Type: 'timer', TriggerDesc: '0 10 * * * * *', Enable: 'OPEN', CustomArgument: secret }, true);
  const result = api('scf', 'ListTriggers', body, true)?.Triggers?.find(t => t.TriggerName === 'plutonoc-guestbook-hourly');
  if (!result || result.CustomArgument !== secret || !['OPEN', 1].includes(result.Enable)) throw Error('Guestbook cleanup timer verification failed.');
  console.log('Verified hourly cleanup trigger and private key.');
}
if (mode === 'acl') for (const name of names) console.log(name, JSON.stringify(api('tcb', 'DescribeDatabaseACL', { EnvId: env, CollectionName: name })));
