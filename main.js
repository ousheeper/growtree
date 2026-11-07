'use strict';
/**
 * 桌面生长树 —— 主进程
 * 透明无边框窗口 + 状态持久化 + 托盘/热键 + 插件目录
 */
const { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, shell } = require('electron');
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
let sunWin = null;
let sunAligned = false;
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
      const suni = process.argv.indexOf('--sun');
      if (suni > 0 && sunWin) {
        const [sx, sy] = String(process.argv[suni + 1]).split(',').map(Number);
        const wa = workArea();
        sunWin.setBounds({
          x: Math.round(wa.x + wa.width * sx - SUN_SIZE / 2),
          y: Math.round(wa.y + wa.height * sy - SUN_SIZE / 2),
          width: SUN_SIZE,
          height: SUN_SIZE
        });
        await wait(900);
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
        for (const id of ['codex', 'genes', 'journal', 'stats', 'pomodoro', '__manager']) {
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
          return 'sun=' + JSON.stringify(__app.sunPos) + ' tilt=' + __app.built.stats.sunTilt + ' genMs=' + cost;
        })()`);
        console.log('[gallery] sun =', drag);
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
          const suni = process.argv.indexOf('--sun');
          if (suni > 0 && sunWin) {
            const [sx, sy] = String(process.argv[suni + 1]).split(',').map(Number);
            const wa = workArea();
            sunWin.setBounds({
              x: Math.round(wa.x + wa.width * sx - SUN_SIZE / 2),
              y: Math.round(wa.y + wa.height * sy - SUN_SIZE / 2),
              width: SUN_SIZE,
              height: SUN_SIZE
            });
            await new Promise((r) => setTimeout(r, 800));
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
    broadcastSunSoon();
    broadcastBoundsSoon();
  };
  win.on('move', onGeomChange);
  win.on('resize', onGeomChange);
  win.on('moved', onGeomChange);
  win.on('resized', onGeomChange);
  win.webContents.on('did-finish-load', () => setTimeout(broadcastSun, 400));
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

/* ---------------- 太阳：独立小窗口，可拖到屏幕任意位置 ---------------- */
const SUN_SIZE = 108; // 窗口要留出光晕的余量，等于球体直径的话边框会被硬切

function createSunWindow() {
  const saved = (readState() && readState().sun) || {};
  const wa = workArea();
  // 首次启动：把太阳放在树冠正上方（而不是屏幕 24% 处——那会让树永远往左倒）
  const tb = win && !win.isDestroyed() ? win.getBounds() : null;
  const treeW = tb ? STAGE_W * geom.z : STAGE_W;
  const defX = tb ? tb.x + treeW / 2 : wa.x + wa.width * 0.5;
  const defY = tb ? Math.max(wa.y + SUN_SIZE / 2 + 6, tb.y + 34) : wa.y + wa.height * 0.14;
  const cx = typeof saved.x === 'number' ? saved.x : defX;
  const cy = typeof saved.y === 'number' ? saved.y : defY;
  const half = SUN_SIZE / 2;
  const x = Math.round(Math.min(Math.max(cx - half, wa.x - half), wa.x + wa.width - half));
  const y = Math.round(Math.min(Math.max(cy - half, wa.y - half), wa.y + wa.height - half));

  sunWin = new BrowserWindow({
    width: SUN_SIZE,
    height: SUN_SIZE,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    title: '太阳',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  sunWin.loadFile(path.join(ROOT, 'src', 'sun.html'));

  // 调试：把太阳窗口单独截出来（透明底），检查光晕有没有被窗口边界切到
  if (process.argv.includes('--suncap')) {
    const out = process.argv[process.argv.indexOf('--suncap') + 1] || path.join(ROOT, 'sun.png');
    sunWin.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const img = await sunWin.webContents.capturePage();
          fs.writeFileSync(out, img.toPNG());
          console.log('[suncap] saved to', out);
        } catch (e) {
          console.error('[suncap] failed', e);
        }
        quitting = true;
        app.quit();
      }, 1200);
    });
  }
  // 首启：等主窗口定位完成后再把太阳摆到树冠正上方（创建瞬间的 bounds 还不可靠）
  sunAligned = typeof saved.x === 'number';
  if (!sunAligned) {
    sunWin.once('ready-to-show', () => setTimeout(alignSunOverTree, 500));
  }
  sunWin.setAlwaysOnTop(true, 'floating');
  sunWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  sunWin.once('ready-to-show', () => sunWin.showInactive());
  sunWin.on('moved', () => broadcastSun());
  sunWin.on('closed', () => {
    sunWin = null;
  });
}

/* 把太阳摆到树区正上方（首次启动，或用户从菜单里点"重置太阳位置"） */
function alignSunOverTree() {
  if (!sunWin || sunWin.isDestroyed() || !win || win.isDestroyed()) return;
  const wa = workArea();
  const tb = win.getBounds();
  const treeW = STAGE_W * geom.z;
  const half = SUN_SIZE / 2;
  const cx = tb.x + treeW / 2;
  const cy = Math.max(wa.y + half + 6, tb.y + 30);
  sunWin.setBounds({
    x: Math.round(Math.min(Math.max(cx - half, wa.x - half), wa.x + wa.width - half)),
    y: Math.round(Math.min(Math.max(cy - half, wa.y - half), wa.y + wa.height - half)),
    width: SUN_SIZE,
    height: SUN_SIZE
  });
  sunAligned = true;
  broadcastSun({ fresh: true });
}

function broadcastSun(extra) {
  if (!win || win.isDestroyed()) return;
  if (!sunWin || sunWin.isDestroyed()) return;
  const sb = sunWin.getBounds();
  win.webContents.send(
    'sun',
    Object.assign(
      {
        x: sb.x + sb.width / 2,
        y: sb.y + sb.height / 2,
        win: win.getBounds()
      },
      extra || {}
    )
  );
}

/* 拖动窗口/缩放时 moved/resized 会连发几十次，节流一下，别让渲染进程重绘整棵树 */
let sunTimer = null;
function broadcastSunSoon() {
  if (sunTimer) return;
  sunTimer = setTimeout(() => {
    sunTimer = null;
    broadcastSun();
  }, 90);
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

ipcMain.handle('sun:get', () => {
  if (!sunWin || sunWin.isDestroyed() || !win || !sunAligned) return null;
  const sb = sunWin.getBounds();
  return { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2, win: win.getBounds() };
});

ipcMain.handle('sun:top', (_e, on) => {
  if (sunWin && !sunWin.isDestroyed()) sunWin.setAlwaysOnTop(!!on, 'floating');
  return !!on;
});

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
    if (sunWin && !sunWin.isDestroyed()) sunWin.hide();
  } else {
    win.showInactive();
    win.focus();
    if (sunWin && !sunWin.isDestroyed()) sunWin.showInactive();
  }
}

/* ---------------- IPC ---------------- */
ipcMain.handle('state:load', () => readState());
ipcMain.handle('state:save', (_e, data) => {
  // 窗口位置由主进程说了算：渲染进程存盘时把最新的 bounds 合进去，
  // 否则每次 Store.save() 都会把 moved 事件记下的位置冲掉。
  if (data && typeof data === 'object' && win && !win.isDestroyed()) {
    data.ui = Object.assign({}, data.ui, { bounds: win.getBounds() });
  }
  return writeState(data);
});

/* 渲染进程拿当前窗口矩形 + 工作区，自己算缩放/面板要多大 */
ipcMain.handle('win:geom', () => ({
  bounds: win && !win.isDestroyed() ? win.getBounds() : null,
  workArea: workArea(),
  firstRun,
  geom: Object.assign({}, geom)
}));

/* 渲染进程量出树冠顶部后，把太阳摆到它上面（只在新装/老存档没位置时做一次） */
ipcMain.handle('sun:place', (_e, p) => {
  if (!sunWin || sunWin.isDestroyed() || !p) return false;
  const wa = workArea();
  const half = SUN_SIZE / 2;
  sunWin.setBounds({
    x: Math.round(clamp(p.x - half, wa.x - half, wa.x + wa.width - half)),
    y: Math.round(clamp(p.y - half, wa.y - half, wa.y + wa.height - half)),
    width: SUN_SIZE,
    height: SUN_SIZE
  });
  sunAligned = true;
  broadcastSun({ fresh: true });
  firstRun = false;
  return true;
});

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
  if (sunWin && !sunWin.isDestroyed()) sunWin.setAlwaysOnTop(!!on, 'floating');
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
    createSunWindow();
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
