const fs = require('node:fs');
fs.mkdirSync('work', {recursive:true});
const { chromium } = require(process.env.PLUTONOC_PLAYWRIGHT || (process.platform === 'win32'
  ? 'C:/Users/komorebi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright' : 'playwright'));
const executablePath = process.env.PLUTONOC_BROWSER || (process.platform === 'win32' ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined);
module.exports = { chromium, launchOptions: {headless:true, ...(executablePath ? {executablePath} : {})} };
