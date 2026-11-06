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
app.setPath('userData', path.join(app.getPath('appData'), 'desktop-growtree'));
const TREE_WIDTH = 470;
const PANEL_WIDTH = 380;
const EDGE_GAP = 14;

let win = null;
let sunWin = null;
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

function defaultBounds() {
  const wa = workArea();
  const height = Math.max(620, Math.min(940, wa.height - 40));
  return {
    width: TREE_WIDTH,
    height,
    x: wa.x + wa.width - TREE_WIDTH - EDGE_GAP,
    y: wa.y + 24
  };
}

function createWindow() {
  const saved = readState();
  const ui = (saved && saved.ui) || {};
  let bounds = ui.bounds;
  if (!bounds || typeof bounds.x !== 'number') bounds = defaultBounds();
  const wa = workArea();
  bounds.width = Math.max(TREE_WIDTH, Math.min(1400, bounds.width || TREE_WIDTH));
  bounds.height = Math.max(620, Math.min(wa.height, bounds.height || 800));
  bounds.x = Math.max(wa.x - 100, Math.min(bounds.x, wa.x + wa.width - 120));
  bounds.y = Math.max(wa.y - 60, Math.min(bounds.y, wa.y + wa.height - 200));

  win = new BrowserWindow({
    ...bounds,
    minWidth: TREE_WIDTH,
    minHeight: 620,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
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

  let saveTimer = null;
  const rememberBounds = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win || win.isDestroyed()) return;
      const b = win.getBounds();
      const s = readState() || {};
      s.ui = Object.assign({}, s.ui, { bounds: b });
      writeState(s);
    }, 600);
  };
  win.on('moved', () => {
    rememberBounds();
    broadcastSun();
  });
  win.on('resized', () => {
    rememberBounds();
    broadcastSun();
  });
  win.webContents.on('did-finish-load', () => setTimeout(broadcastSun, 400));
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

/* ---------------- 太阳：独立小窗口，可拖到屏幕任意位置 ---------------- */
const SUN_SIZE = 76;

function createSunWindow() {
  const saved = (readState() && readState().sun) || {};
  const wa = workArea();
  const cx = typeof saved.x === 'number' ? saved.x : wa.x + wa.width * 0.24;
  const cy = typeof saved.y === 'number' ? saved.y : wa.y + wa.height * 0.16;
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
  sunWin.setAlwaysOnTop(true, 'floating');
  sunWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  sunWin.once('ready-to-show', () => sunWin.showInactive());
  sunWin.on('moved', () => broadcastSun());
  sunWin.on('closed', () => {
    sunWin = null;
  });
}

function broadcastSun() {
  if (!win || win.isDestroyed()) return;
  if (!sunWin || sunWin.isDestroyed()) return;
  const sb = sunWin.getBounds();
  win.webContents.send('sun', {
    x: sb.x + sb.width / 2,
    y: sb.y + sb.height / 2,
    win: win.getBounds()
  });
}

ipcMain.handle('sun:get', () => {
  if (!sunWin || sunWin.isDestroyed() || !win) return null;
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

function setPanelOpen(open) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const wa = workArea();
  const target = open ? TREE_WIDTH + PANEL_WIDTH : TREE_WIDTH;
  if (b.width === target) return;
  const right = b.x + b.width;
  let x = Math.max(wa.x, right - target);
  win.setBounds({ x, y: b.y, width: target, height: b.height }, true);
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
ipcMain.handle('state:save', (_e, data) => writeState(data));
ipcMain.handle('win:panel', (_e, open) => {
  setPanelOpen(open);
  return true;
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
ipcMain.handle('win:scale', (_e, w, h) => {
  if (!win || win.isDestroyed()) return false;
  const b = win.getBounds();
  const wa = workArea();
  const width = Math.max(320, Math.min(1700, Math.round(w)));
  const height = Math.max(420, Math.min(wa.height, Math.round(h)));
  const right = b.x + b.width;
  const bottom = b.y + b.height;
  win.setBounds({
    x: Math.round(Math.max(wa.x - 40, right - width)),
    y: Math.round(Math.max(wa.y - 40, bottom - height)),
    width,
    height
  });
  return true;
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
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });
}
