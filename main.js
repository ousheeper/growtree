'use strict';
/**
 * 桌面生长树 —— 主进程
 * 透明无边框窗口 + 状态持久化 + 托盘/热键 + 插件目录
 */
const { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// 打包后 __dirname 在 app.asar 里；插件被 asarUnpack 到旁边的真实目录
const ROOT = __dirname;
const UNPACKED = app.isPackaged ? __dirname.replace('app.asar', 'app.asar.unpacked') : __dirname;
const PLUGIN_DIR = path.join(UNPACKED, 'plugins');

// 固定 userData，保证开发版和 exe 版共用同一份存档
// --userdata <dir> 可隔离出测试档，方便同时跑多个实例
const __udIdx = process.argv.indexOf('--userdata');
app.setPath(
  'userData',
  __udIdx > 0 && process.argv[__udIdx + 1]
    ? path.resolve(process.argv[__udIdx + 1])
    : path.join(app.getPath('appData'), 'desktop-growtree')
);
/* ---- 设计尺寸：页面按 1:1 排版，整体再用 zoom 缩放 ----
 * 窗口尺寸 = 设计尺寸 × z，两边必须严格一致，否则树就会在屏幕上乱跳。
 */
const STAGE_W = 470; // 树区设计宽度
const PANEL_W = 380; // 插件面板设计宽度
const TRAY_H = 74; // 底部基座设计高度（树根离窗口底边这么远）
const STAGE_H0 = 940; // 树区设计高度默认值
const STAGE_H_MIN = 560;
const STAGE_H_MAX = 1400;
const Z_MIN = 0.6;
const Z_MAX = 1.5;
const EDGE_GAP = 14;

// 主进程也留一份几何，托盘对齐太阳时要用
const geom = { z: 1, stageH: STAGE_H0, panelOpen: true };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const designW = (g) => STAGE_W + (g.panelOpen ? PANEL_W : 0);
const geomSize = (g) => ({ width: Math.round(designW(g) * g.z), height: Math.round(g.stageH * g.z) });

function readGeom(saved) {
  const ui = (saved && saved.ui) || {};
  const b = ui.bounds;
  const z = clamp(Number(ui.scale) || 1, Z_MIN, Z_MAX);
  let stageH = Number(ui.stageH) || 0;
  // 兼容老存档：没有 stageH 时用窗口高度反推（老版本存的是物理像素，除以 z 才是设计高度）
  if (!stageH && b && b.height) stageH = Math.round(b.height / z);
  return {
    z,
    stageH: clamp(stageH || STAGE_H0, STAGE_H_MIN, STAGE_H_MAX),
    panelOpen: ui.panelOpen !== false
  };
}

let win = null;
let firstRun = false; // 老存档没记过窗口位置：这次启动要把太阳重新摆到树冠上方

/* ---------------- 键盘敲击统计 ---------------- */
let keyWatcher = null;
let keyTimer = null;
let keyBuf = 0;
let keyTotal = 0;

function startKeyWatcher() {
  try {
    const { uIOhook } = require('uiohook-napi');
    const down = new Set();
    uIOhook.on('keydown', (e) => {
      // 长按会连发 keydown，这里按"按下/抬起"配对，只算真实敲击
      if (down.has(e.keycode)) return;
      down.add(e.keycode);
      keyBuf += 1;
    });
    uIOhook.on('keyup', (e) => down.delete(e.keycode));
    uIOhook.start();
    keyWatcher = uIOhook;
    keyTimer = setInterval(flushKeys, 2000);
    bootLog('[keys] watcher started');
  } catch (e) {
    bootLog('[keys] watcher failed: ' + (e && e.message));
  }
}

function flushKeys() {
  if (!keyBuf) return;
  const n = keyBuf;
  keyBuf = 0;
  keyTotal += n;
  if (win && !win.isDestroyed()) win.webContents.send('keys', { n, total: keyTotal });
}

function stopKeyWatcher() {
  if (keyTimer) clearInterval(keyTimer);
  keyTimer = null;
  try {
    if (keyWatcher) keyWatcher.stop();
  } catch (e) {
    /* ignore */
  }
  keyWatcher = null;
} // 首启时太阳还没摆到树冠上方，此时不要给渲染进程报坐标
let tray = null;
let quitting = false;
let passThrough = false;
let loadingSave = false; // 读档/导入期间别让旧渲染进程把旧状态写回来

const statePath = () => path.join(app.getPath('userData'), 'state.json');

/* 打包版没有控制台，把启动异常写进 boot.log 方便排查 */
function bootLog(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg + '\n';
  const targets = [];
  try {
    targets.push(path.join(app.getPath('userData'), 'boot.log'));
  } catch (e) {
    /* ignore */
  }
  try {
    targets.push(path.join(require('os').tmpdir(), 'growtree-boot.log'));
  } catch (e) {
    /* ignore */
  }
  for (const t of targets) {
    try {
      fs.mkdirSync(path.dirname(t), { recursive: true });
      fs.appendFileSync(t, line);
    } catch (e) {
      /* ignore */
    }
  }
}
// Windows GUI 版没有 stdout：console.* 会抛 EPIPE 把主进程带崩，这里统一兜住
if (app.isPackaged) {
  const safe = (...args) => {
    try {
      bootLog(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    } catch (e) {
      /* ignore */
    }
  };
  console.log = safe;
  console.info = safe;
  console.warn = safe;
  console.error = safe;
}

bootLog('--- boot: packaged=' + app.isPackaged + ' root=' + __dirname);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeState(data) {
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    const tmp = statePath() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, statePath());
    return true;
  } catch (e) {
    console.error('[state] save failed', e);
    return false;
  }
}

/* ---------------- 手动存档槽 ---------------- */
const SAVE_SLOTS = 3;
const saveDir = () => path.join(app.getPath('userData'), 'saves');
const slotPath = (n) => path.join(saveDir(), 'slot' + n + '.json');

function readJsonFile(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

function saveMeta(data, mtime) {
  if (!data || typeof data.level !== 'number' || !data.genes) return null;
  const stock = data.stock || {};
  return {
    level: data.level,
    coins: typeof data.coins === 'number' ? data.coins : 0,
    achievements: Object.keys(data.achievements || {}).length,
    codex: Array.isArray(data.codex) ? data.codex.length : 0,
    season: (data.season && data.season.id) || null,
    seed: data.genes.seed,
    palette: data.genes.palette,
    stock: Object.keys(stock).reduce((n, k) => n + (Number(stock[k]) || 0), 0),
    savedAt: mtime || Date.now()
  };
}

function listSaves() {
  const out = [];
  for (let n = 1; n <= SAVE_SLOTS; n++) {
    let meta = null;
    try {
      const st = fs.statSync(slotPath(n));
      meta = saveMeta(readJsonFile(slotPath(n)), st.mtimeMs);
    } catch (e) {
      meta = null;
    }
    out.push({ slot: n, meta });
  }
  return out;
}

/* 读取存档时保留当前窗口/面板/插件布局，避免读一个旧档窗口尺寸对不上 */
function mergeEnvironment(data) {
  const cur = readState() || {};
  const d = Object.assign({}, data);
  d.ui = Object.assign({}, d.ui || {}, cur.ui || {});
  d.plugins = Object.assign({}, d.plugins || {}, cur.plugins || {});
  d.lastSeen = Date.now();
  return d;
}

function backupCurrent() {
  try {
    const cur = readState();
    if (cur) fs.writeFileSync(statePath() + '.bak', JSON.stringify(cur, null, 2), 'utf8');
  } catch (e) {
    /* ignore */
  }
}

function scheduleReload() {
  if (!win || win.isDestroyed()) {
    loadingSave = false;
    return;
  }
  const clear = () => {
    loadingSave = false;
  };
  win.webContents.once('did-finish-load', clear);
  setTimeout(clear, 5000);
  setTimeout(() => {
    if (win && !win.isDestroyed()) win.webContents.reload();
  }, 150);
}

/* 窗口位置：变化后让渲染进程存一次盘（state:save 会把最新 bounds 合进去） */
let boundsTimer = null;
function rememberBounds(now) {
  clearTimeout(boundsTimer);
  const send = () => {
    if (win && !win.isDestroyed()) win.webContents.send('cmd', { type: 'flush-state' });
  };
  if (now) send();
  else boundsTimer = setTimeout(send, 700);
}
function flushBounds() {
  if (!win || win.isDestroyed()) return;
  const s = readState() || {};
  s.ui = Object.assign({}, s.ui, { bounds: win.getBounds() });
  writeState(s);
}

/* ---------------- 托盘图标（纯代码生成 PNG，避免额外资源文件） ---------------- */
let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}
function makeTrayIcon() {
  const S = 32;
  const px = Buffer.alloc(S * S * 4, 0);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  for (let y = 14; y < 29; y++) {
    for (let x = 14; x < 18; x++) set(x, y, 226, 214, 190);
  }
  const blobs = [
    [16, 9, 7.4, 168, 132, 248],
    [9, 14, 5.4, 140, 108, 226],
    [23, 14, 5.2, 140, 108, 226],
    [12, 5, 4.2, 196, 164, 255],
    [21, 6, 3.8, 196, 164, 255]
  ];
  for (const [cx, cy, r, cr, cg, cb] of blobs) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y <= r * r) set(Math.round(cx + x), Math.round(cy + y), cr, cg, cb);
      }
    }
  }
  for (const [cx, cy] of [[9, 11], [22, 12], [16, 4]]) set(cx, cy, 240, 200, 132);
  return nativeImage.createFromBuffer(encodePNG(S, S, px));
}

/* ---------------- 窗口 ---------------- */
function workArea() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay();
  return d.workArea;
}

function createWindow() {
  const saved = readState();
  const ui = (saved && saved.ui) || {};
  const g = readGeom(saved);
  const wa = workArea();
  // 屏幕换小了 / 首次启动：别让窗口比工作区还高
  if (g.stageH * g.z > wa.height - 4) g.stageH = Math.max(STAGE_H_MIN, Math.floor((wa.height - 4) / g.z));
  geom.z = g.z;
  geom.stageH = g.stageH;
  geom.panelOpen = g.panelOpen;

  const size = geomSize(g);
  const sb = ui.bounds;
  firstRun = !(sb && typeof sb.x === 'number');
  let x;
  let y;
  if (sb && typeof sb.x === 'number') {
    // 老存档的宽高可能是被 minWidth/minHeight 卡出来的，这里按设计尺寸重新摆：
    // 左边不动（树区在窗口左侧，树就不会横向漂），底边不动（树根不会上下漂）
    x = Math.round(sb.x);
    y = Math.round(sb.y + (sb.height || size.height) - size.height);
  } else {
    x = wa.x + wa.width - size.width - EDGE_GAP;
    y = wa.y + 24;
  }
  x = Math.round(clamp(x, wa.x - size.width + 120, wa.x + wa.width - 120));
  y = Math.round(clamp(y, wa.y - 40, wa.y + wa.height - 160));
  const bounds = { x, y, width: size.width, height: size.height };

  win = new BrowserWindow({
    ...bounds,
    minWidth: 240,
    minHeight: 280,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    // 原生拖边会和「窗口 = 设计尺寸 × zoom」打架，所以关掉，改由页面里的 .rz 热区接管
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: ui.alwaysOnTop !== false,
    show: false,
    title: '生长之树',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  win.setAlwaysOnTop(ui.alwaysOnTop !== false, ui.overlay ? 'screen-saver' : 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.on('console-message', (_e, level, msg, line, src) => {
    if (level >= 2) {
      console.log('[renderer]', msg);
      bootLog('[renderer] ' + msg + (src ? ` (${path.basename(src)}:${line})` : ''));
    }
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => bootLog('[fail-load] ' + code + ' ' + desc + ' ' + url));
  win.webContents.on('did-finish-load', () => bootLog('[did-finish-load]'));
  win.webContents.on('render-process-gone', (_e, details) => bootLog('[render-gone] ' + JSON.stringify(details)));
  win.webContents.on('preload-error', (_e, p, err) => bootLog('[preload-error] ' + p + ' ' + err));
  win.webContents.on('unresponsive', () => bootLog('[unresponsive]'));

  bootLog('[window] loading ' + path.join(ROOT, 'src', 'index.html'));
  win.loadFile(path.join(ROOT, 'src', 'index.html')).catch((e) => bootLog('[loadFile-error] ' + e.message));

  // 兜底：3 秒后还没显示就强行显示，避免"只有进程没有窗口"
  setTimeout(() => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      bootLog('[window] force show');
      win.showInactive();
    }
  }, 3000);

  if (process.argv.includes('--deskcap')) {
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(3000);
      const xi = process.argv.indexOf('--xp');
      if (xi > 0) {
        await win.webContents.executeJavaScript(`Store.addXp(${Number(process.argv[xi + 1]) || 0})`);
        await wait(1500);
      }
      try {
        const d = screen.getPrimaryDisplay();
        const sources = await require('electron').desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) }
        });
        if (sources[0]) {
          fs.writeFileSync(path.join(ROOT, 'desktop.png'), sources[0].thumbnail.toPNG());
          console.log('[deskcap] saved', sources[0].name);
        }
      } catch (e) {
        console.error('[deskcap]', e);
      }
      quitting = true;
      app.quit();
    });
  }

  if (process.argv.includes('--gallery')) {
    win.webContents.once('did-finish-load', async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const exec = (js) => win.webContents.executeJavaScript(js);
      const grab = async (name) => {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(ROOT, `ui-${name}.png`), img.toPNG());
        console.log('[gallery]', name);
      };
      try {
        await wait(2600);
        console.log('[gallery] boot =', await exec(`Store.state.level + '/' + Store.state.totalXp + '/' + Store.state.codex.length + ' statePath=' + 'ok'`));
        const r = await exec(`(Store.addXp(400), Store.state.level + '/' + Store.state.codex.length)`);
        console.log('[gallery] after xp:', r);
        await wait(1500);
        for (const id of ['codex', 'genes', 'journal', 'stats', 'achievements', 'warehouse', 'shop', 'saves', 'pomodoro', '__manager']) {
          await exec(`Host.mount('${id}')`);
          await wait(650);
          await grab(id);
        }
        await exec(`document.getElementById('trunkHit').click(); document.getElementById('base').click()`);
        await wait(400);
        console.log('[gallery] click-feed nutrient =', await exec(`Store.state.nutrient + '/' + Store.state.stats.clicks`));
        await exec(`Host.mount('codex'); __app.togglePanel(false)`);
        await wait(900);
        await grab('closed');
        await exec(`__app.togglePanel(true)`);
        await wait(700);
        await exec(`__app.feed(240, 640)`);
        await wait(900);
        await grab('after-feed');
        const drag = await exec(`(() => {
          const t0 = performance.now();
          __app.renderTree(false);
          const cost = (performance.now()-t0).toFixed(1);
          return 'tilt=' + __app.built.stats.sunTilt + ' genMs=' + cost;
        })()`);
        console.log('[gallery] tilt =', drag);
        const fps = await exec(`new Promise((r)=>{let n=0;const t0=performance.now();function f(){n++;const dt=performance.now()-t0;if(dt<2500)requestAnimationFrame(f);else r((n/(dt/1000)).toFixed(1))}requestAnimationFrame(f)})`);
        console.log('[gallery] fps =', fps);
        const dump = await exec(`JSON.stringify({level: Store.state.level, xp: Store.state.xp, total: Store.state.totalXp, codex: Store.state.codex.length, journal: Store.state.journal.length, branches: __app.built.stats.branches, flowers: __app.built.stats.flowers, leaves: __app.built.stats.leaves})`);
        console.log('[gallery] state:', dump);
      } catch (e) {
        console.error('[gallery] error', e);
      }
      quitting = true;
      app.quit();
    });
  }

  if (process.argv.includes('--shot')) {
    const out = process.argv[process.argv.indexOf('--shot') + 1] || path.join(ROOT, 'shot.png');
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const bi = process.argv.indexOf('--bg');
          if (bi > 0) {
            const c = process.argv[bi + 1];
            await win.webContents.executeJavaScript(`document.body.style.background='${c}'`);
            await new Promise((r) => setTimeout(r, 400));
          }
          const ei = process.argv.indexOf('--eval');
          if (ei > 0) {
            console.log('[eval]', await win.webContents.executeJavaScript(String(process.argv[ei + 1])));
          }
          const sci = process.argv.indexOf('--scale');
          if (sci > 0) {
            await win.webContents.executeJavaScript(`__app.applyScale(${Number(process.argv[sci + 1])}, false)`);
            await new Promise((r) => setTimeout(r, 700));
          }
          const xi = process.argv.indexOf('--xp');
          if (xi > 0) {
            await win.webContents.executeJavaScript(`Store.addXp(${Number(process.argv[xi + 1]) || 0})`);
            await new Promise((r) => setTimeout(r, 1400));
          }
          const si = process.argv.indexOf('--seed');
          if (si > 0) {
            await win.webContents.executeJavaScript(`window.__setSeed(${Number(process.argv[si + 1]) || 1})`);
            await new Promise((r) => setTimeout(r, 500));
          }
          const info = await win.webContents.executeJavaScript(`JSON.stringify({
            iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
            stage: (()=>{const r=document.querySelector('.stage').getBoundingClientRect();return [r.width,r.height]})(),
            panel: (()=>{const r=document.querySelector('.panel').getBoundingClientRect();return [r.x,r.width]})(),
            svg: (()=>{const r=document.querySelector('#tree').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})(),
            bar: (()=>{const r=document.querySelector('.levelbar').getBoundingClientRect();return [r.x,r.width]})(),
            bounds: ${'`'}+JSON.stringify(0)+${'`'}
          })`);
          console.log('[debug]', info);
          const img = await win.webContents.capturePage();
          fs.writeFileSync(out, img.toPNG());
          console.log('[shot] saved to', out);
        } catch (e) {
          console.error('[shot] failed', e);
        }
        quitting = true;
        app.quit();
      }, 3200);
    });
  }

  win.once('ready-to-show', () => {
    bootLog('[window] ready-to-show');
    win.showInactive();
    if (ui.passThrough) setPassThrough(true, false);
  });

  // 注意：'moved' 只有 macOS 才有，Windows 上得听 'move'
  const onGeomChange = () => {
    rememberBounds();
    broadcastBoundsSoon();
  };
  win.on('move', onGeomChange);
  win.on('resize', onGeomChange);
  win.on('moved', onGeomChange);
  win.on('resized', onGeomChange);
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

/* 窗口矩形变了就告诉渲染进程一声（用户拖顶栏挪窗口时，页面里的坐标也要跟上） */
let boundsTimer2 = null;
function broadcastBoundsSoon() {
  if (boundsTimer2) return;
  boundsTimer2 = setTimeout(() => {
    boundsTimer2 = null;
    if (win && !win.isDestroyed()) win.webContents.send('bounds', win.getBounds());
  }, 50);
}



/* ---------------- 穿透 / 显示控制 ---------------- */
function applyIgnore(on) {
  if (!win || win.isDestroyed()) return;
  if (on) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
}

function setPassThrough(on, broadcast) {
  passThrough = !!on;
  applyIgnore(passThrough);
  if (broadcast && win && !win.isDestroyed()) {
    win.webContents.send('cmd', { type: 'passthrough', value: passThrough });
  }
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) {
    win.hide();
  } else {
    win.showInactive();
    win.focus();
  }
}

/* ---------------- IPC ---------------- */
ipcMain.handle('state:load', () => readState());
ipcMain.handle('state:save', (_e, data) => {
  if (loadingSave) return false;
  // 窗口位置由主进程说了算：渲染进程存盘时把最新的 bounds 合进去，
  // 否则每次 Store.save() 都会把 moved 事件记下的位置冲掉。
  if (data && typeof data === 'object' && win && !win.isDestroyed()) {
    data.ui = Object.assign({}, data.ui, { bounds: win.getBounds() });
  }
  return writeState(data);
});

/* ---------------- 存档槽 IPC ---------------- */
ipcMain.handle('saves:list', () => listSaves());

ipcMain.handle('saves:save', (_e, n, data) => {
  const slot = Number(n);
  if (!(slot >= 1 && slot <= SAVE_SLOTS)) return { ok: false, msg: '槽位不对' };
  if (!saveMeta(data)) return { ok: false, msg: '没有可保存的进度' };
  try {
    fs.mkdirSync(saveDir(), { recursive: true });
    const tmp = slotPath(slot) + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, slotPath(slot));
    return { ok: true, meta: saveMeta(data, Date.now()) };
  } catch (e) {
    console.error('[saves] save failed', e);
    return { ok: false, msg: '写入失败' };
  }
});

ipcMain.handle('saves:load', (_e, n) => {
  const slot = Number(n);
  if (!(slot >= 1 && slot <= SAVE_SLOTS)) return { ok: false, msg: '槽位不对' };
  const data = readJsonFile(slotPath(slot));
  if (!saveMeta(data)) return { ok: false, msg: '这个槽位还是空的' };
  loadingSave = true;
  backupCurrent();
  if (!writeState(mergeEnvironment(data))) {
    loadingSave = false;
    return { ok: false, msg: '写入失败' };
  }
  scheduleReload();
  return { ok: true };
});

ipcMain.handle('saves:delete', (_e, n) => {
  const slot = Number(n);
  if (!(slot >= 1 && slot <= SAVE_SLOTS)) return { ok: false, msg: '槽位不对' };
  try {
    fs.unlinkSync(slotPath(slot));
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: '删除失败' };
  }
});

ipcMain.handle('saves:export', async (_e, data) => {
  if (!saveMeta(data)) return { ok: false, msg: '没有可导出的进度' };
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const r = await dialog.showSaveDialog(win, {
    title: '导出 GrowTree 存档',
    defaultPath: path.join(app.getPath('documents'), 'GrowTree-' + stamp + '.json'),
    filters: [{ name: 'GrowTree 存档', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePath) return { ok: false, msg: '已取消' };
  try {
    fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, msg: '写入失败' };
  }
});

ipcMain.handle('saves:import', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '导入 GrowTree 存档',
    properties: ['openFile'],
    filters: [{ name: 'GrowTree 存档', extensions: ['json'] }]
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) return { ok: false, msg: '已取消' };
  try {
    const st = fs.statSync(r.filePaths[0]);
    if (st.size > 10 * 1024 * 1024) return { ok: false, msg: '文件太大，不像存档' };
    const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
    if (!saveMeta(data)) return { ok: false, msg: '不是有效的 GrowTree 存档' };
    loadingSave = true;
    backupCurrent();
    if (!writeState(mergeEnvironment(data))) {
      loadingSave = false;
      return { ok: false, msg: '写入失败' };
    }
    scheduleReload();
    return { ok: true, path: r.filePaths[0] };
  } catch (e) {
    return { ok: false, msg: '读取失败' };
  }
});

ipcMain.handle('saves:open', async () => {
  fs.mkdirSync(saveDir(), { recursive: true });
  await shell.openPath(saveDir());
  return true;
});

/* 渲染进程拿当前窗口矩形 + 工作区，自己算缩放/面板要多大 */
ipcMain.handle('win:geom', () => ({
  bounds: win && !win.isDestroyed() ? win.getBounds() : null,
  workArea: workArea(),
  firstRun,
  geom: Object.assign({}, geom)
}));

/* 渲染进程算好目标矩形，这里只负责落位 + 兜底夹取 */
ipcMain.handle('win:bounds', (_e, b) => {
  if (!win || win.isDestroyed() || !b) return null;
  const wa = workArea();
  const width = clamp(Math.round(b.width) || 300, 240, wa.width);
  const height = clamp(Math.round(b.height) || 300, 280, wa.height);
  const x = clamp(Math.round(b.x), wa.x - width + 100, wa.x + wa.width - 100);
  const y = clamp(Math.round(b.y), wa.y - height + 100, wa.y + wa.height - 100);
  win.setBounds({ x, y, width, height });
  rememberBounds();
  broadcastBoundsSoon();
  return win.getBounds();
});

/* 同步设计参数（太阳对齐、记住的尺寸要用） */
ipcMain.on('geom:set', (_e, g) => {
  if (!g) return;
  if (typeof g.z === 'number') geom.z = clamp(g.z, Z_MIN, Z_MAX);
  if (typeof g.stageH === 'number') geom.stageH = clamp(g.stageH, STAGE_H_MIN, STAGE_H_MAX);
  if (typeof g.panelOpen === 'boolean') geom.panelOpen = g.panelOpen;
});

ipcMain.handle('win:top', (_e, on) => {
  if (!win) return false;
  win.setAlwaysOnTop(!!on, 'floating');
  return !!on;
});
ipcMain.handle('win:overlay', (_e, on) => {
  if (!win) return false;
  win.setAlwaysOnTop(true, on ? 'screen-saver' : 'floating');
  return !!on;
});
ipcMain.handle('win:through', (_e, on, silent) => {
  setPassThrough(on, !silent);
  return passThrough;
});

ipcMain.handle('plugins:list', () => {
  try {
    return fs
      .readdirSync(PLUGIN_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(PLUGIN_DIR, d.name, 'plugin.js')))
      .map((d) => d.name);
  } catch (e) {
    return [];
  }
});
ipcMain.handle('plugins:open', async () => {
  await shell.openPath(PLUGIN_DIR);
  return PLUGIN_DIR;
});
ipcMain.handle('plugins:reload', () => {
  if (win) win.reload();
  return true;
});
ipcMain.on('win:hide', () => win && win.hide());
ipcMain.on('win:quit', () => {
  quitting = true;
  app.quit();
});

/* ---------------- 托盘 ---------------- */
function buildTray() {
  const icon = makeTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('生长之树');
  const menu = Menu.buildFromTemplate([
    { label: '显示 / 隐藏', accelerator: 'Ctrl+Alt+T', click: toggleVisible },
    { label: '插件面板', click: () => win && win.webContents.send('cmd', { type: 'toggle-panel' }) },
    { type: 'separator' },
    {
      label: '鼠标穿透',
      type: 'checkbox',
      checked: passThrough,
      click: (item) => setPassThrough(item.checked, true)
    },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: true,
      click: (item) => win && win.setAlwaysOnTop(item.checked, 'floating')
    },
    { type: 'separator' },
    { label: '打开插件目录', click: () => shell.openPath(PLUGIN_DIR) },
    { label: '重新加载', click: () => win && win.reload() },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('click', toggleVisible);
}

/* ---------------- 生命周期 ---------------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      win.show();
      win.focus();
    }
  });

  bootLog('--- app ready soon');
  app.whenReady().then(() => {
    bootLog('--- app ready');
    app.setAppUserModelId('com.growtree.desktop');
    createWindow();
    startKeyWatcher();
    buildTray();
    globalShortcut.register('Ctrl+Alt+T', toggleVisible);
    globalShortcut.register('Ctrl+Alt+L', () => setPassThrough(!passThrough, true));
    globalShortcut.register('Ctrl+Alt+P', () => win && win.webContents.send('cmd', { type: 'toggle-panel' }));
    globalShortcut.register('Ctrl+Alt+G', () => win && win.webContents.send('cmd', { type: 'feed' }));
  });

  app.on('window-all-closed', () => {
    /* 托盘常驻，不退出 */
  });

  app.on('before-quit', () => {
    quitting = true;
    flushBounds();
    stopKeyWatcher();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
