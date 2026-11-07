/**
 * 主控：装配状态 / 树 / 插件 / 窗口行为
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmtKeys = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n));

  // 冻结倾斜的算法版本：换算法时旧数据不可信，需要整批重算
  const TILT_VER = 2;

  // 修剪保护：剪完至少留这么多枝；单刀最多剪掉这么多比例；超过这个比例先确认
  const MIN_KEEP_BRANCHES = 4;
  const MAX_CUT_RATIO = 0.5;
  const ASK_CUT_RATIO = 0.12;

  const App = {
    built: null,
    panelOpen: true,
    userThrough: false,
    ignoring: false,

    async boot() {
      await Store.init();
      Host.init();
      await this.loadPlugins();
      this.bindUi();
      this.bindStore();
      this.bindNative();
      this.scale = 1;
      this.baseHeight = Store.state.ui.baseHeight || 942;
      this.applyUiFlags();
      this._booted = true;
      if ((Store.state.ui.scale || 1) !== 1) setTimeout(() => this.applyScale(Store.state.ui.scale, false), 120);
      if (window.native && window.native.onKeys) window.native.onKeys((p) => this.onKeys(p));
      this.mountInitial();
      await this.initSun();
      this.setMode(Store.state.ui.mode || 'water');
      this.renderTree(false);
      this.updateBar();
      this.startLoop();

      if (Store.overlay) {
        const o = Store.overlay;
        setTimeout(() => this.toast(`你离开了 ${this.fmtDur(o.seconds)}，它自己长了 ${o.gain} 点`), 1100);
        Store.overlay = null;
      }
      document.body.classList.add('ready');
    },

    /* ---------- 插件脚本装载 ---------- */
    async loadPlugins() {
      let dirs = [];
      try {
        dirs = await window.native.listPlugins();
      } catch (e) {
        console.warn('[app] 读取插件目录失败', e);
      }
      for (const d of dirs) {
        await new Promise((res) => {
          const s = document.createElement('script');
          s.src = `../plugins/${d}/plugin.js`;
          s.onload = res;
          s.onerror = () => {
            console.warn('[app] 插件加载失败:', d);
            res();
          };
          document.head.appendChild(s);
        });
      }
    },

    mountInitial() {
      Host.renderTabs();
      const list = Host.enabledList();
      if (!list.length) {
        Host.el.body.innerHTML = '<div class="empty">没有启用的插件<br>点右上角 ⚙ 打开插件管理</div>';
        return;
      }
      const want = Store.state.plugins.active;
      const target = list.find((p) => p.id === want) || list[0];
      Host.mount(target.id);
    },

    /* ---------- 树 ---------- */
    /* 只改数字，避免整块重绘 */
    updateSoil() {
      const el = document.querySelector('[data-slot="soil"] .n');
      if (el) el.textContent = Math.round(Store.state.soil || 0);
    },

    updateKeys() {
      const el = document.querySelector('[data-slot="keys"] .n');
      if (el) el.textContent = fmtKeys(Store.state.stats.keysToday || 0);
    },

    /* 键盘计数由主进程推过来 */
    onKeys(payload) {
      if (!payload || !payload.n) return;
      const res = Store.addKeys(payload.n);
      this.updateKeys();
      this.updateBar();
      if (res && res.nut > 0) this.toast('敲击 ' + (Store.state.stats.keysToday || 0) + ' 下 · 养分 +' + res.nut);
    },

    buildParams(extra) {
      const st = Store.state;
      return Object.assign(
        {},
        st.genes,
        {
          sunTilt: this.sunTiltNow(),
          tiltMap: st.branchTilt || {},
          pruned: st.pruned || [],
          picked: st.picked || []
        },
        extra || {}
      );
    },

    /* 不落地地试算一次：剪掉这根会少多少枝 */
    analyzeCut(path) {
      const before = this.built ? this.built.stats.branches : 0;
      const pruned = (Store.state.pruned || []).concat([path]);
      let after = before;
      try {
        after = window.TreeGen.generate(this.buildParams({ pruned }), Store.state.level).stats.branches;
      } catch (e) {
        /* ignore */
      }
      const cut = Math.max(0, before - after);
      return { before, after, cut, ratio: cut / Math.max(1, before) };
    },

    renderTree(animate) {
      const svg = document.getElementById('tree');
      const st = Store.state;
      if (st.tiltSeed !== st.genes.seed || st.tiltVer !== TILT_VER) {
        // 换种子 / 换了倾斜算法 → 旧的冻结值全部作废
        st.branchTilt = {};
        st.tiltSeed = st.genes.seed;
        st.tiltVer = TILT_VER;
      }
      const params = this.buildParams();
      this.built = window.TreeGen.mount(svg, params, Store.state.level, animate !== false);
      // 记录新枝出生时的太阳方位；之后太阳再动，这些枝也不变
      if (this.built.stats.newTilt) {
        Object.assign(st.branchTilt, this.built.stats.newTilt);
        if (Object.keys(st.branchTilt).length > 2500) st.branchTilt = this.built.stats.newTilt;
        Store.saveSoon();
      }
      const glow = this.built.stats.glow || '#9b6bff';
      const el = document.getElementById('groundGlow');
      if (el) {
        el.style.setProperty('--glow-a', this.hexA(glow, 0.34));
        el.style.setProperty('--glow-b', this.hexA(glow, 0.12));
      }
      Bus.emit('tree-stats', this.built.stats);
      this.renderDock();
      this.updateFab();
    },

    hexA(hex, a) {
      const h = String(hex).replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
      return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
    },

    renderDock() {
      const s = Store.state;
      const sp = (this.built && this.built.stats && this.built.stats.species) || { flower: 0, fruit: 0, mushroom: 0, crystal: 0 };
      const palette = window.TreeGen.PALETTES[s.genes.palette] || window.TreeGen.PALETTES.cthulhu;
      const items = [
        { k: '花', n: sp.flower, c: palette.flower[0] },
        { k: '果', n: sp.fruit, c: palette.fruit[0] },
        { k: '菌', n: sp.mushroom, c: palette.shroom[0] },
        { k: '晶', n: sp.crystal, c: palette.crystal[0] },
        { k: '水', n: Math.round(s.soil || 0), c: '#7fc7ff', id: 'soil' },
        { k: '养分', n: s.nutrient, c: '#7fe6b0' },
        { k: '键', n: fmtKeys(s.stats.keysToday || 0), c: '#b8a6ff', id: 'keys' },
        { k: '词条', n: s.codex.length, c: '#e6c684' }
      ];
      $('#slots').innerHTML = items
        .map(
          (i) =>
            `<div class="slot" data-slot="${i.id || ''}" title="${i.k}"><i class="dot" style="background:${i.c}"></i><span class="n">${i.n}</span><span class="k">${i.k}</span></div>`
        )
        .join('');
    },

    updateBar() {
      const s = Store.state;
      if (!s) return;
      $('#lvNum').textContent = s.level;
      const sn = document.getElementById('stageName');
      if (sn && this.built && this.built.stats.stageLabel) sn.textContent = this.built.stats.stageLabel;
      const p = Store.xpPercent;
      $('#xpFill').style.width = p.toFixed(1) + '%';
      $('#pct').textContent = Math.floor(p) + '%';
    },

    /* ---------- 模式：浇水 / 修剪 / 收获 ---------- */
    setMode(mode) {
      this.mode = mode;
      Store.state.ui.mode = mode;
      Store.saveSoon();
      document.body.classList.toggle('mode-prune', mode === 'prune');
      document.body.classList.toggle('mode-harvest', mode === 'harvest');
      document.body.classList.toggle('mode-poke', mode === 'poke');
      document.body.classList.toggle('mode-water', mode === 'water');
      const svg = document.getElementById('tree');
      if (svg) svg.classList.toggle('ui-hit', mode !== 'water');
      document.querySelectorAll('#modes .mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
      this.updateFab();
    },

    updateFab() {
      const fab = document.getElementById('fabHarvest');
      if (!fab) return;
      const n = document.querySelectorAll('#tree .deco').length;
      fab.querySelector('b').textContent = n;
      fab.style.opacity = n ? '1' : '0.45';
    },

    async prune(path, x, y) {
      if (!path || (Store.state.pruned || []).includes(path)) return;
      if (path.indexOf('.') < 0) {
        // 主干剪不得，否则整棵树会消失
        this.toast('主干不能剪，挑一根枝条试试');
        return;
      }

      // 先试算，别把树剪死
      const info = this.analyzeCut(path);
      if (info.after < MIN_KEEP_BRANCHES) {
        this.toast(`再剪就只剩 ${info.after} 根枝，这棵树活不成了`);
        return;
      }
      if (info.ratio > MAX_CUT_RATIO) {
        this.toast(`这一刀要带走 ${Math.round(info.ratio * 100)}% 的枝，太多了`);
        return;
      }
      if (info.ratio >= ASK_CUT_RATIO) {
        const ok = await this.askConfirm({
          title: '要剪掉这一大枝？',
          text: `会带走 ${info.cut} 根枝条（占全树 ${Math.round(info.ratio * 100)}%），剪完还剩 ${info.after} 根。剪口不会长回来。`,
          ok: '剪掉',
          cancel: '算了'
        });
        if (!ok) return;
      }

      Store.state.pruned.push(path);
      if (Store.state.pruned.length > 2000) Store.state.pruned.shift();
      // 剪得越狠，单次养分越少
      const reward = info.ratio > 0.25 ? 1 : 2;
      Store.state.nutrient += reward;
      Store.addXp(3, 'prune');
      this.renderTree(true);
      this.sparks(x, y, 12);
      if (window.Fx) window.Fx.shear(x, y);
      this.toast(`剪掉 ${info.cut} 根枝条 · 养分 +${reward}`);
      Store.log(`剪去一枝（连带 ${info.cut} 根），树把养分挪给了别的枝头。`, 'grow');
      this.updateFab();
      this.renderDock();
    },

    poke(x, y) {
      const gain = Store.poke();
      if (window.Fx) window.Fx.poke(x, y);
      if (gain == null) return;
      this.floatText(x, y - 14, '+1');
      this.updateBar();
    },

    /* 应用内确认框：返回 Promise<boolean> */
    askConfirm(opts) {
      const o = opts || {};
      return new Promise((resolve) => {
        const mask = document.getElementById('ask');
        if (!mask) {
          resolve(window.confirm(o.text || '确认？'));
          return;
        }
        document.getElementById('askTitle').textContent = o.title || '确认';
        document.getElementById('askText').textContent = o.text || '';
        const bOk = document.getElementById('askOk');
        const bCancel = document.getElementById('askCancel');
        bOk.textContent = o.ok || '确定';
        bCancel.textContent = o.cancel || '取消';
        bOk.classList.toggle('danger', o.danger !== false);
        mask.classList.add('show');

        const onKey = (e) => {
          if (e.key === 'Escape') done(false);
        };
        function done(v) {
          mask.classList.remove('show');
          bOk.onclick = null;
          bCancel.onclick = null;
          mask.onclick = null;
          document.removeEventListener('keydown', onKey);
          resolve(v);
        }
        bOk.onclick = () => done(true);
        bCancel.onclick = () => done(false);
        mask.onclick = (e) => {
          if (e.target === mask) done(false);
        };
        document.addEventListener('keydown', onKey);
        setTimeout(() => bCancel.focus(), 30);
      });
    },

    harvestEls(els) {
      const s = Store.state;
      const counts = {};
      let n = 0;
      // 先记下位置，重绘后元素就没了
      const spots = [];
      els.forEach((el) => {
        const id = el.dataset.id;
        const sp = el.dataset.sp;
        if (!id || !sp || s.picked.includes(id)) return;
        const r = el.getBoundingClientRect();
        spots.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        s.picked.push(id);
        const cat = window.TreeGen.SPECIES[sp] ? window.TreeGen.SPECIES[sp].cat : null;
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
        n += 1;
      });
      if (!n) return 0;
      const spark = (this.built && this.built.stats && this.built.stats.glow) || '#ffe3a8';
      spots.slice(0, 6).forEach((pt, i) => {
        setTimeout(() => window.Fx && window.Fx.pick(pt.x, pt.y, spark), i * 70);
      });
      Store.addHarvest(counts);
      s.nutrient += n;
      Store.addXp(n * 3, 'harvest');
      this.renderTree(false);
      this.updateFab();
      const parts = Object.keys(counts)
        .map((k) => ({ flower: '花', fruit: '果', mushroom: '菌', crystal: '晶' })[k] + ' ' + counts[k])
        .join(' · ');
      this.toast(`收获 ${n} 份 · ${parts} · 养分 +${n}`);
      Store.log(`收下 ${n} 份（${parts}），枝头轻了一些。`, 'feed');
      return n;
    },

    /* ---------- 太阳（独立窗口，可拖到屏幕任意位置） ---------- */
    /* SVG 画布坐标 → 视口坐标（特效层用；fx 与 getBoundingClientRect 同一坐标系） */
    svgPt(x, y) {
      const svg = document.getElementById('tree');
      if (!svg) return null;
      const r = svg.getBoundingClientRect();
      const k = Math.min(r.width / 460, r.height / 800) || 1;
      return {
        x: r.left + (r.width - 460 * k) / 2 + x * k,
        y: r.top + (r.height - 800 * k) + y * k
      };
    },

    /* 太阳位置 → 相对竖直方向的倾角（弧度）
     * 只用窗口矩形做换算，不碰 SVG 坐标系 / zoom / 留白，避免算出反方向。
     * 返回值的正负：正 = 太阳在右侧，负 = 左侧。强度系数在 tree.js 里乘。
     */
    sunTiltNow() {
      const sun = this.sunPos;
      const wb = this.winBounds;
      if (!sun || !wb) return null;
      const treeW = 470;
      const panelW = this.panelOpen ? 380 : 0;
      // 树区在窗口里占的宽度比例，树根位于树区水平中点、竖直 85.5% 处
      const treeCx = 0.5 * (treeW / (treeW + panelW));
      const groundFy = 0.855;
      const fx = (sun.x - wb.x) / Math.max(1, wb.width);
      const fy = (sun.y - wb.y) / Math.max(1, wb.height);
      const dx = (fx - treeCx) * (wb.width / Math.max(1, wb.height));
      const dy = fy - groundFy; // <0 = 在树根上方
      const ang = Math.atan2(dx, -dy); // 相对竖直向上
      const up = dy < 0 ? 1 : Math.max(0, 1 + dy * 2.6);
      const tilt = Math.max(-1.35, Math.min(1.35, ang)) * 0.35 * up;
      return Number(tilt.toFixed(4));
    },

    applySun(payload) {
      if (!payload) return;
      this.sunPos = { x: payload.x, y: payload.y };
      this.winBounds = payload.win;
      Store.state.sun = { x: payload.x, y: payload.y };
      if (payload.fresh) {
        // 首启对齐：之前那一帧是按占位坐标冻结的，作废重算
        Store.state.branchTilt = {};
      }
      Store.saveSoon(1500);
      // 形状不重算（枝干冻结），只让光照跟过去；整体重绘一次即可刷新明暗
      const now = performance.now();
      const force = !!payload.fresh; // 首启对齐必须立刻重画，不能被节流吞掉
      if (!force && now - (this._sunRender || 0) < 120) return;
      this._sunRender = now;
      this.renderTree(false);
    },

    async initSun() {
      window.native.onSun((payload) => this.applySun(payload));
      try {
        const p = await window.native.getSun();
        if (p) {
          this.sunPos = { x: p.x, y: p.y };
          this.winBounds = p.win;
          Store.state.sun = { x: p.x, y: p.y };
        }
      } catch (e) {
        /* ignore */
      }
      if (!this.sunPos) {
        // 首次启动：主进程要等主窗口定位完成后才把太阳摆到树冠上方。
        // 这里等它一下，否则第一帧会按错误位置冻结倾角。
        await new Promise((res) => {
          const t = setTimeout(res, 900);
          const iv = setInterval(() => {
            if (this.sunPos) {
              clearInterval(iv);
              clearTimeout(t);
              res();
            }
          }, 60);
        });
      }
    },

    /* ---------- 交互 ---------- */
    bindUi() {
      $('#btnPanel').onclick = () => this.togglePanel();
      $('#btnClosePanel').onclick = () => this.togglePanel(false);

      // 置顶 / 不挡：一个键切换
      $('#btnTop').onclick = () => this.setTopMode(!Store.state.ui.alwaysOnTop);

      $('#btnThrough').onclick = () => this.toggleThrough();
      $('#btnHide').onclick = () => window.native.hide();

      // 缩放
      $('#zoomOut').onclick = () => this.applyScale((this.scale || 1) - 0.05, true);
      $('#zoomIn').onclick = () => this.applyScale((this.scale || 1) + 0.05, true);

      const feedAt = (x, y) => this.feed(x, y);
      $('#trunkHit').addEventListener('click', (e) => {
        if (this.mode !== 'water') return;
        feedAt(e.clientX, e.clientY);
      });
      $('#base').addEventListener('click', (e) => {
        if (this.mode !== 'water' || e.target.closest('.chip')) return;
        feedAt(e.clientX, e.clientY);
      });

      // 模式切换
      document.querySelectorAll('#modes .mode').forEach((b) => {
        b.onclick = () => this.setMode(b.dataset.mode);
      });

      // 树上点击：修剪 / 收获
      const svg = document.getElementById('tree');
      svg.addEventListener('click', (e) => {
        if (this.mode === 'prune') {
          const p = e.target.closest('path.br');
          if (p) this.prune(p.dataset.path, e.clientX, e.clientY);
        } else if (this.mode === 'harvest') {
          const d = e.target.closest('.deco');
          if (d) this.harvestEls([d]);
        } else if (this.mode === 'poke') {
          this.poke(e.clientX, e.clientY);
        }
      });

      $('#fabHarvest').onclick = () => {
        const els = Array.from(document.querySelectorAll('#tree .deco'));
        if (!els.length) this.toast('树上暂时没有可收的东西');
        else this.harvestEls(els);
      };

      // Ctrl + 滚轮缩放
      document.addEventListener(
        'wheel',
        (e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          this.applyScale(this.scale + (e.deltaY > 0 ? -0.05 : 0.05), true);
        },
        { passive: false }
      );

      // 窗口尺寸变化时记下新的基准高度
      window.addEventListener('resize', () => {
        if (!this._booted) return;
        Store.state.ui.baseHeight = Math.round(window.innerHeight);
        Store.saveSoon(1200);
      });

      // 透明区域穿透：只有真正落在 UI 上的鼠标才被窗口拦截
      let raf = null;
      let last = { x: 0, y: 0 };
      document.addEventListener('mousemove', (e) => {
        if (this.userThrough || this._draggingSun) return;
        last = { x: e.clientX, y: e.clientY };
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const el = document.elementFromPoint(last.x, last.y);
          const hit = !!(el && el.closest('.ui-hit'));
          this.setIgnore(!hit);
        });
      });
    },

    applyScale(next, persist) {
      const z = Math.max(0.7, Math.min(1.5, Math.round((Number(next) || 1) * 100) / 100));
      this.scale = z;
      Store.state.ui.scale = z;
      document.documentElement.style.zoom = z;
      const baseH = Store.state.ui.baseHeight || 942;
      const w = Math.round((470 + (this.panelOpen ? 380 : 0)) * z);
      const h = Math.round(baseH * z);
      window.native.setAppScale(w, h);
      const zl = document.getElementById('zoomVal');
      if (zl) zl.textContent = Math.round(z * 100) + '%';
      if (persist) {
        Store.saveSoon();
        this.toast('缩放 ' + Math.round(z * 100) + '%');
      }
      Bus.emit('scale', z);
    },

    setIgnore(on) {
      if (this.ignoring === on) return;
      this.ignoring = on;
      window.native.setThrough(on, true);
    },

    toggleThrough() {
      this.userThrough = !this.userThrough;
      Store.state.ui.passThrough = this.userThrough;
      Store.saveSoon();
      $('#btnThrough').classList.toggle('on', this.userThrough);
      if (this.userThrough) {
        window.native.setThrough(true);
        this.toast('鼠标已穿透 · 再按 Ctrl+Alt+L 恢复');
      } else {
        this.ignoring = false;
        window.native.setThrough(false);
        this.toast('鼠标已恢复');
      }
    },

    feed(x, y) {
      const gain = Store.feed();
      if (gain == null) {
        const soil = Store.state.soil;
        if (typeof soil === 'number' && soil > 100 - 18) {
          this.toast('土还湿着，等它干一点再浇（' + Math.round(soil) + '%）');
        }
        return;
      }
      this.updateSoil();
      this.floatText(x, y, '+' + gain);
      this.sparks(x, y, 6);
      // 水壶就在你点的地方倒水
      if (window.Fx) window.Fx.water(x, y);
      this.updateBar();
      this.renderDock();
      if (Store.state.stats.clicks % 6 === 0) {
        Store.log('又浇了一层露水，土面浮起细小的气泡。', 'feed');
      }
    },

    togglePanel(force) {
      const open = typeof force === 'boolean' ? force : !this.panelOpen;
      this.panelOpen = open;
      $('#panel').classList.toggle('open', open);
      $('#btnPanel').classList.toggle('on', open);
      Store.state.ui.panelOpen = open;
      Store.saveSoon();
      if (this.scale && this.scale !== 1) this.applyScale(this.scale, false);
      else window.native.setPanel(open);
    },

    setTopMode(on) {
      Store.state.ui.alwaysOnTop = on;
      Store.saveSoon();
      window.native.setTop(on);
      window.native.setSunTop(on);
      const btn = $('#btnTop');
      btn.classList.toggle('on', on);
      btn.textContent = on ? '置 顶' : '不 挡';
      btn.title = on ? '正在盖在其他软件上面，点一下改成"不挡"' : '现在不挡其他软件，点一下改回置顶';
      this.toast(on ? '已置顶：会盖在其他软件上面' : '已切到「不挡」：其他软件会盖住它');
    },

    applyUiFlags() {
      const ui = Store.state.ui;
      this.panelOpen = ui.panelOpen !== false;
      $('#panel').classList.toggle('open', this.panelOpen);
      $('#btnPanel').classList.toggle('on', this.panelOpen);
      window.native.setPanel(this.panelOpen);

      const topOn = ui.alwaysOnTop !== false;
      $('#btnTop').classList.toggle('on', topOn);
      $('#btnTop').textContent = topOn ? '置 顶' : '不 挡';
      $('#btnTop').title = topOn ? '正在盖在其他软件上面，点一下改成"不挡"' : '现在不挡其他软件，点一下改回置顶';
      this.userThrough = !!ui.passThrough;
      $('#btnThrough').classList.toggle('on', this.userThrough);
      if (this.userThrough) window.native.setThrough(true);
    },

    /* ---------- 事件 ---------- */
    bindStore() {
      ['xp', 'levelup', 'codex', 'journal', 'genes'].forEach((k) => {
        Store.on(k, (p) => Bus.emit(k, p));
      });

      Store.on('xp', () => this.updateBar());

      Store.on('levelup', ({ level, unlocked }) => {
        Store.state.picked = [];
        this.renderTree(true);
        this.updateFab();
        Store.addHarvest(this.built && this.built.stats ? this.built.stats.species : null);
        Store.state.stats.decoTotal = (Store.state.stats.decoTotal || 0) + (this.built ? this.built.stats.deco : 0);
        this.updateBar();
        setTimeout(() => this.renderDock(), 400);
        this.baseBurst(18);
        const pot = this.svgPt(230, 638);
        if (window.Fx && pot) window.Fx.levelUp(level, pot.x, pot.y - 24);
        this.toast(unlocked ? `生长周期 ${level} · 收录「${unlocked.name}」` : `生长周期 ${level}`);
        if (Store.state.level % 3 === 1) this.renderDock();
      });

      Store.on('codex', (item) => {
        if (Host.active === 'codex') Bus.emit('codex-updated', item);
      });

      Bus.on('refresh-tree', (animate) => this.renderTree(animate));
      Bus.on('burst', (n) => this.baseBurst(n));
      Bus.on('toast', (t) => this.toast(t));
      Bus.on('state-changed', () => {
        this.updateBar();
        this.renderDock();
      });
    },

    bindNative() {
      window.native.onCommand((cmd) => {
        if (!cmd || !cmd.type) return;
        if (cmd.type === 'toggle-panel') this.togglePanel();
        else if (cmd.type === 'feed') this.feed(window.innerWidth / 2 - 60, window.innerHeight - 110);
        else if (cmd.type === 'passthrough') {
          // 来自托盘/热键：只同步 UI，不再回写主进程
          this.userThrough = !!cmd.value;
          Store.state.ui.passThrough = this.userThrough;
          $('#btnThrough').classList.toggle('on', this.userThrough);
          if (!this.userThrough) {
            this.ignoring = false;
            window.native.setThrough(false);
          }
          this.toast(this.userThrough ? '鼠标已穿透' : '鼠标已恢复');
        }
      });

      window.addEventListener('beforeunload', () => Store.save());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) Store.save();
      });
      window.addEventListener('blur', () => Store.save());
    },

    startLoop() {
      let last = performance.now();
      setInterval(() => {
        const now = performance.now();
        const dt = now - last;
        last = now;
        if (document.hidden) return;
        Store.tick(dt);
        this.updateBar();
        this.updateSoil();
      }, 1000);
      setInterval(() => Store.save(), 30000);
    },

    /* ---------- 特效 ---------- */
    toast(text) {
      const el = $('#toast');
      el.textContent = text;
      el.classList.add('show');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    },

    floatText(x, y, text) {
      const el = document.createElement('div');
      el.className = 'float-txt';
      el.textContent = text;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      $('#floats').appendChild(el);
      setTimeout(() => el.remove(), 1600);
    },

    sparks(x, y, n) {
      const wrap = $('#floats');
      for (let i = 0; i < n; i++) {
        const s = document.createElement('div');
        s.className = 'spark';
        const a = Math.random() * Math.PI * 2;
        const d = 30 + Math.random() * 60;
        s.style.left = x + 'px';
        s.style.top = y + 'px';
        s.style.setProperty('--dx', Math.cos(a) * d + 'px');
        s.style.setProperty('--dy', Math.sin(a) * d - 20 + 'px');
        s.style.background = Math.random() < 0.5 ? 'var(--violet)' : 'var(--gold)';
        wrap.appendChild(s);
        setTimeout(() => s.remove(), 1200);
      }
    },

    baseBurst(n) {
      const r = $('#trunkHit').getBoundingClientRect();
      this.sparks(r.left + r.width / 2, r.bottom - 30, n);
    },

    fmtDur(sec) {
      if (sec < 60) return Math.round(sec) + ' 秒';
      if (sec < 3600) return Math.round(sec / 60) + ' 分钟';
      return (sec / 3600).toFixed(1) + ' 小时';
    }
  };

  window.__app = App;
  // 调试：换种子重绘（截图脚本使用）
  window.__setSeed = (sd) => {
    Store.state.genes.seed = Number(sd) || 1;
    App.renderTree(false);
  };
  document.addEventListener('DOMContentLoaded', () => App.boot());
})();
