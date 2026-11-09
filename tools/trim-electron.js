/**
 * 打包前准备一份「瘦身版」Electron：
 * 官方发行版自带 55 种语言的 locales/*.pak（40 MB+），而这个组件只用中文和英文。
 * 复制一份到 .electron-dist/，只保留 zh-CN / en-US，供 electron-builder 的 electronDist 使用。
 *
 * 这是纯复制，不删任何文件；.electron-dist 已在 .gitignore 里。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT = path.join(ROOT, '.electron-dist');
const KEEP = new Set(['zh-CN.pak', 'en-US.pak']);

if (!fs.existsSync(SRC)) {
  console.error('[trim-electron] 找不到 ' + SRC + '，先跑 npm install');
  process.exit(1);
}

const version = require(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version;
const stamp = path.join(OUT, '.version');
if (fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === version) {
  console.log('[trim-electron] .electron-dist 已是 ' + version + '，跳过');
  process.exit(0);
}

const t0 = Date.now();
fs.cpSync(SRC, OUT, {
  recursive: true,
  force: true,
  filter: (src) => {
    // 只保留 locales 下的中英文；其它文件原样带过去
    if (path.basename(path.dirname(src)) === 'locales') return KEEP.has(path.basename(src));
    return true;
  }
});
fs.writeFileSync(stamp, version);
const mb = (n) => (n / 1048576).toFixed(0) + ' MB';
console.log('[trim-electron] ' + version + ' → .electron-dist（' + mb(dirSize(OUT)) + '，' + ((Date.now() - t0) / 1000).toFixed(1) + 's）');

function dirSize(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}
