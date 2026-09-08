import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = 'activity-book-web-d7djhe7bb1e834';
const cli = process.env.PLUTONOC_TCB_CLI;
if (!cli || !fs.existsSync(cli)) throw new Error('请将 PLUTONOC_TCB_CLI 指向已安装的 @cloudbase/cli/bin/tcb。');
const secretPath = path.join(root, 'work/analytics-functions/plutonoc-analytics-cleanup/cleanup-secret.json');
if (!fs.existsSync(secretPath)) throw new Error('请先安全恢复线上既有清理参数，不能创建替代密钥。');
const secret = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('本地清理参数格式无效。');
function call(args) {
  const result = spawnSync(process.execPath, [cli, ...args, '-e', env, '--json'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 300000 });
  if (result.error || result.status !== 0) throw new Error(`CloudBase 操作失败：${args.slice(0, 3).join(' ')}；请单独检查该操作，部署已停止。`);
  const text = result.stdout;
  // The CLI's function deploy command exits successfully without JSON output.
  if (args[0] === 'fn' && args[1] === 'deploy') return;
  const output = JSON.parse(text.slice(text.indexOf('{')));
  if (output.success === false || output.error) throw new Error('CloudBase 返回失败，部署已停止。');
  return output.data;
}
function verify() {
  const result = call(['api', 'scf', 'ListTriggers', '--api-version', '2018-04-16', '--body', JSON.stringify({ Namespace: env, FunctionName: 'plutonoc-analytics-cleanup' })]);
  const trigger = result.Triggers.find(item => item.TriggerName === 'plutonoc-analytics-daily');
  if (!trigger || trigger.CustomArgument !== secret || ![1, 'OPEN'].includes(trigger.Enable)) throw new Error('线上清理任务缺失、未启用或参数不匹配，禁止继续部署。');
  console.log('Daily cleanup trigger enabled; private parameter matches.');
}
verify();
if (!process.argv.includes('--check')) {
  const build = spawnSync(process.execPath, ['tools/build-analytics.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (build.status !== 0) throw new Error('统计构建失败，部署已停止。');
  for (const role of ['collect', 'query', 'cleanup']) {
    const name = 'plutonoc-analytics-' + role;
    call(['fn', 'deploy', name, '--dir', 'work/analytics-functions/' + name, '--force']);
    console.log('Deployed', name);
  }
  verify();
}
