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

  /* 几何：页面按设计尺寸 1:1 排版，整体用 zoom 缩放；窗口 = 设计尺寸 × z。
   * 三个数必须和 main.js 里的一致，否则窗口和内容对不上就会「跳」。 */
  const DESIGN = { stageW: 470, panelW: 380, trayH: 74 };
  const Z_MIN = 0.6;
  const Z_MAX = 1.5;
  const STAGE_H_MIN = 560;
  const STAGE_H_MAX = 1400;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const App = {
    built: null,
    panelOpen: true,
    panelShown: true, // 窗口当前是否已经包含面板那一列
    userThrough: false,
    ignoring: false,
    z: 1,
    stageH: 940,
    bounds: null,
    workArea: null,

    async boot() {
      await Store.init();
      const ui = Store.state.ui;
      this.panelOpen = ui.panelOpen !== false;
      this.panelShown = this.panelOpen;
      this.z = clamp(Number(ui.scale) || 1, Z_MIN, Z_MAX);
      // 老存档没有 stageH：用窗口高度反推一次
      this.stageH = clamp(Number(ui.stageH) || 940, STAGE_H_MIN, STAGE_H_MAX);
      // 先套缩放，保证第一帧就和窗口对齐
      document.documentElement.style.zoom = this.z;
      Host.init();
      await this.loadPlugins();
      Host.syncNew();
      this.bindUi();
      this.bindStore();
      this.bindNative();
      await this.initGeom();
      this.applyUiFlags();
      this._booted = true;
      if (window.native && window.native.onKeys) window.native.onKeys((p) => this.onKeys(p));
      this.mountInitial();
      await this.initSun();
      this.setMode(ui.mode || 'water');
      this.renderTree(false);
      this.alignSunToTree();
      this.updateBar();
      this.checkAchievements();
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
      const slot = document.querySelector('[data-slot="soil"]');
      if (!slot) return;
      const n = Math.max(0, Math.min(100, Math.round(Store.state.soil || 0)));
      const el = slot.querySelector('.n');
      if (el) el.textContent = n;
      const m = slot.querySelector('.meter i');
      if (m) m.style.width = n + '%';
      const bonus = Store.soilBonus ? Store.soilBonus(n) : 0;
      slot.classList.toggle('wet', bonus > 0);
      slot.title = '土壤湿度 ' + n + '%' + (bonus ? ' · 湿润加成 +' + bonus + '/4s' : ' · 干了就没有加成');
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
          picked: Store.freshPicked()
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
        .map((i) => {
          const wet = i.id === 'soil' ? (Store.soilBonus ? Store.soilBonus(i.n) : 0) : 0;
          const tip = i.id === 'soil'
            ? `土壤湿度 ${i.n}%${wet ? ' · 湿润加成 +' + wet + '/4s' : ' · 干了就没有加成'}`
            : i.k;
          return `<div class="slot${wet ? ' wet' : ''}" data-slot="${i.id || ''}" style="--sc:${i.c}" title="${tip}">
            <i class="dot" style="background:${i.c}"></i>
            <span class="n">${i.n}</span><span class="k">${i.k}</span>
            ${i.id === 'soil' ? `<span class="meter"><i style="width:${Math.max(0, Math.min(100, i.n))}%"></i></span>` : ''}
          </div>`;
        })
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
      $('#xpFill').classList.toggle('near', p >= 88);
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
      this.checkAchievements();
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
      const pickedIds = [];
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
        pickedIds.push(id);
        const cat = window.TreeGen.SPECIES[sp] ? window.TreeGen.SPECIES[sp].cat : null;
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
        n += 1;
      });
      if (!n) return 0;
      if (n > (s.stats.bigHarvest || 0)) s.stats.bigHarvest = n;
      Store.markPicked(pickedIds);
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
      this.checkAchievements();
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
      const panelW = this.panelShown ? 380 : 0;
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
      // 用户拖顶栏挪窗口时也走这条路：把本地矩形同步回来，
      // 否则后面算缩放会拿着旧坐标，一算就歪
      if (payload.win && !this._rzDrag) this.bounds = Object.assign({}, payload.win);
      Store.state.sun = {
        x: payload.x,
        y: payload.y,
        size: payload.size || (Store.state.sun && Store.state.sun.size) || 108
      };
      Bus.emit('sun-size', Store.state.sun.size);
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
          Store.state.sun = { x: p.x, y: p.y, size: p.size || 108 };
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
      $('#zoomOut').onclick = () => this.applyScale(this.z - 0.05, true);
      $('#zoomIn').onclick = () => this.applyScale(this.z + 0.05, true);

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
          this.applyScale(this.z + (e.deltaY > 0 ? -0.05 : 0.05), true);
        },
        { passive: false }
      );

      this.bindResize();

      // 鼠标整个移出组件时不会再有 mousemove，这里补一刀
      document.addEventListener('mouseleave', () => {
        if (document.body.classList.contains('bars-auto')) document.body.classList.remove('bars-show');
      });

      // 透明区域穿透：只有真正落在 UI 上的鼠标才被窗口拦截
      let raf = null;
      let last = { x: 0, y: 0 };
      document.addEventListener('mousemove', (e) => {
        // 上下栏的显隐要放在穿透判断之前：穿透时也要跟着鼠标收放
        last = { x: e.clientX, y: e.clientY };
        this._lastPt = last;
        if (document.body.classList.contains('bars-auto')) {
          document.body.classList.toggle('bars-show', this.inStage(last.x, last.y));
        }
        if (this.userThrough || this._draggingSun || this._rzDrag) return;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const el = document.elementFromPoint(last.x, last.y);
          const hit = !!(el && el.closest('.ui-hit'));
          this.setIgnore(!hit);
        });
      });
    },

    /* 改太阳大小（设置里的滑杆调用；滚轮缩放走太阳窗口自己的 preload） */
    setSunSize(px) {
      if (!window.native.setSunSize) return;
      const v = Math.round(Number(px) || 108);
      window.native.setSunSize(v).then((applied) => {
        if (typeof applied === 'number' && Store.state.sun) {
          Store.state.sun.size = applied;
          Store.saveSoon();
          Bus.emit('sun-size', applied);
        }
      });
    },

    /* 鼠标是不是在树区（含上下栏所在的整列）里 */
    inStage(x, y) {
      const st = document.querySelector('.stage');
      if (!st) return false;
      const r = st.getBoundingClientRect();
      const pad = 6;
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    },

    /* 上下栏自动隐藏开关 */
    applyBarsAuto() {
      const on = !!Store.state.ui.barsAutoHide;
      document.body.classList.toggle('bars-auto', on);
      if (!on) {
        document.body.classList.remove('bars-show');
        return;
      }
      const p = this._lastPt;
      document.body.classList.toggle('bars-show', !p || this.inStage(p.x, p.y));
    },

    setUiFlag(key, value) {
      if (key !== 'barsAutoHide') return;
      Store.state.ui.barsAutoHide = !!value;
      Store.saveSoon();
      this.applyBarsAuto();
      this.toast(value ? '上下栏改成鼠标移入才出现' : '上下栏恢复常驻');
    },

    /* ---------- 窗口几何 ---------- */
    /* 页面是设计尺寸，整体 zoom；窗口 = 设计尺寸 × z，两边必须一致 */
    designW() {
      return DESIGN.stageW + (this.panelShown ? DESIGN.panelW : 0);
    },

    maxZFor(stageH) {
      const wa = this.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
      return Math.min(Z_MAX, (wa.width - 6) / this.designW(), (wa.height - 6) / (stageH || this.stageH));
    },

    /* 放大上限：不能超过工作区 */
    maxZ() {
      return this.maxZFor(this.stageH);
    },

    async initGeom() {
      try {
        const g = await window.native.geom();
        if (g) {
          this.bounds = g.bounds;
          this.workArea = g.workArea;
          this.firstRun = !!g.firstRun;
        }
      } catch (e) {
        /* ignore */
      }
      if (!this.bounds) {
        this.bounds = { x: 0, y: 0, width: Math.round(this.designW() * this.z), height: Math.round(this.stageH * this.z) };
      }
      // 换过显示器 / 存档比屏幕还大：先把缩放和高度收进工作区
      if (this.workArea) {
        const wa = this.workArea;
        const zCap = Math.min(Z_MAX, (wa.height - 8) / this.stageH, (wa.width - 8) / this.designW());
        if (this.z > zCap) {
          this.z = Math.max(Z_MIN, Math.round(zCap * 100) / 100);
          document.documentElement.style.zoom = this.z;
          Store.state.ui.scale = this.z;
        }
        const maxH = Math.floor((wa.height - 6) / this.z);
        if (this.stageH > maxH) this.stageH = Math.max(STAGE_H_MIN, maxH);
      }
      // 老存档的窗口尺寸可能被 minWidth/minHeight 卡歪过：按设计尺寸重新摆一遍，
      // 左边和底边不动（树在窗口左侧居中、树根贴底），所以树不会跳
      const w = Math.round(this.designW() * this.z);
      const h = Math.round(this.stageH * this.z);
      if (Math.abs(w - this.bounds.width) > 1 || Math.abs(h - this.bounds.height) > 1) {
        await this.commitBounds(
          { x: this.bounds.x, y: this.bounds.y + this.bounds.height - h, width: w, height: h },
          true
        );
      }
      this.syncZoomLabel();
      window.native.setGeom({ z: this.z, stageH: this.stageH, panelOpen: this.panelOpen });
    },

    /* 落位：immediate 用于布局性变更（开机 / 缩放），其余按帧合并，拖动时不会堆积 IPC */
    async commitBounds(next, immediate) {
      if (!next) return this.bounds;
      this.bounds = {
        x: Math.round(next.x),
        y: Math.round(next.y),
        width: Math.round(next.width),
        height: Math.round(next.height)
      };
      if (immediate) {
        try {
          const a = await window.native.setBounds(this.bounds);
          if (a) this.bounds = a;
        } catch (e) {
          /* ignore */
        }
        return this.bounds;
      }
      if (!this._boundsRaf) {
        this._boundsRaf = requestAnimationFrame(() => {
          this._boundsRaf = null;
          if (this.bounds) window.native.setBounds(this.bounds);
        });
      }
      return this.bounds;
    },

    setZoom(z) {
      this.z = z;
      Store.state.ui.scale = z;
      document.documentElement.style.zoom = z;
      window.native.setGeom({ z, stageH: this.stageH, panelOpen: this.panelOpen });
      this.syncZoomLabel();
      Bus.emit('scale', z);
    },

    syncZoomLabel() {
      const zl = document.getElementById('zoomVal');
      if (zl) zl.textContent = Math.round(this.z * 100) + '%';
    },

    /* 老存档没记过窗口位置：树现在的位置是重新摆的，太阳也得跟着挪到树冠上方，
     * 否则它会卡在树中间（太阳是独立窗口，画在树的上面）。 */
    alignSunToTree() {
      if (!this.firstRun || !this.sunPos || !window.native.placeSun) return;
      this.firstRun = false;
      const svg = document.getElementById('tree');
      const root = document.querySelector('#tree .layer-branch'); // 枝干层，比整棵（含浮游孢子）更贴近树冠
      if (!svg || !root || !root.getBBox) return;
      let bb;
      try {
        bb = root.getBBox();
      } catch (e) {
        return;
      }
      if (!bb || !bb.height) return;
      const r = svg.getBoundingClientRect();
      const k = Math.min(r.width / 460, r.height / 800) || 1;
      // viewBox y=800 对齐元素底边，树冠顶部就是 bbox.y
      const crownY = Math.round(screenY + r.bottom - (800 - bb.y) * k);
      window.native.placeSun(this.sunPos.x, crownY - 62);
    },

    /* 缩放：以树根（树区底边中点）为锚点，脚下的土不动，只是整体变大变小 */
    applyScale(next, persist) {
      if (!this.bounds) return;
      const want = Math.round((Number(next) || 1) * 100) / 100;
      const zMax = this.maxZ();
      const z = clamp(want, Z_MIN, zMax);
      if (Math.abs(z - this.z) < 0.001) {
        this.syncZoomLabel();
        if (persist) this.toast(want > zMax ? '已经放到最大了，屏幕装不下' : '已经缩到最小了');
        return;
      }
      const rootX = this.bounds.x + (DESIGN.stageW / 2) * this.z;
      const rootY = this.bounds.y + (this.stageH - DESIGN.trayH) * this.z;
      const w = Math.round(this.designW() * z);
      const h = Math.round(this.stageH * z);
      const wa = this.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
      // 树根尽量钉住；只有窗口顶到屏幕上边时才整体下移（下移多少，树就长多少）
      const x = Math.round(clamp(rootX - (DESIGN.stageW / 2) * z, wa.x - 20, wa.x + wa.width - w + 20));
      const y = Math.round(clamp(rootY - (this.stageH - DESIGN.trayH) * z, wa.y, wa.y + wa.height - h));
      this.setZoom(z);
      this.commitBounds({ x, y, width: w, height: h });
      if (persist) {
        Store.saveSoon();
        this.toast('缩放 ' + Math.round(z * 100) + '%');
      }
    },

    /* ---------- 拖边缩放 ---------- */
    bindResize() {
      document.querySelectorAll('.rz').forEach((h) => {
        h.addEventListener('pointerdown', (e) => this.startResize(e, h.dataset.edge));
      });
    },

    startResize(e, edge) {
      if (e.button !== 0 || !this.bounds) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      this._rz = {
        edge,
        sx: e.screenX,
        sy: e.screenY,
        b: Object.assign({}, this.bounds),
        z: this.z,
        stageH: this.stageH,
        panelOpen: this.panelOpen
      };
      this._rzDrag = true;
      document.body.classList.add('rz-on');
      const move = (ev) => this.onResizeMove(ev);
      const up = () => this.endResize();
      this._rz.move = move;
      this._rz.up = up;
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },

    onResizeMove(ev) {
      const s = this._rz;
      if (!s) return;
      const dx = ev.screenX - s.sx;
      const dy = ev.screenY - s.sy;
      const wa = this.workArea || { x: 0, y: 0, width: 1920, height: 1080 };
      const dw = this.designW();
      const right0 = s.b.x + s.b.width;
      const bottom0 = s.b.y + s.b.height;
      const horiz = s.edge.indexOf('w') >= 0 || s.edge.indexOf('e') >= 0;
      const vertN = s.edge.indexOf('n') >= 0;
      const vertS = s.edge.indexOf('s') >= 0;
      // 这次拖动能用多高：往上拖看上边余量，往下拖看下边余量
      const availH = vertN ? bottom0 - wa.y : wa.y + wa.height - s.b.y;

      let z = s.z;
      let stageH = s.stageH;
      // 横向拖 → 改缩放；纵向拖 → 改树区高度（只是多留点天空，树本身比例不变）
      if (horiz) {
        const w = Math.max(240, s.edge.indexOf('w') >= 0 ? s.b.width - dx : s.b.width + dx);
        z = clamp(w / dw, Z_MIN, Math.min(this.maxZFor(stageH), availH / s.stageH));
      }
      if (vertN || vertS) {
        const h = Math.max(280, vertS ? s.b.height + dy : s.b.height - dy);
        stageH = clamp(Math.min(h, availH) / z, STAGE_H_MIN, STAGE_H_MAX);
      }
      z = Math.round(z * 1000) / 1000;
      stageH = Math.round(stageH);

      const w = Math.round(dw * z);
      const h = Math.round(stageH * z);
      // 被拖的那条边跟手，对面那条边钉住
      const x = Math.round(clamp(s.edge.indexOf('w') >= 0 ? right0 - w : s.b.x, wa.x - 40, wa.x + wa.width - w + 40));
      const y = Math.round(vertN ? bottom0 - h : s.b.y);

      this.z = z;
      this.stageH = stageH;
      Store.state.ui.scale = z;
      Store.state.ui.stageH = stageH;
      document.documentElement.style.zoom = z;
      this.syncZoomLabel();
      this.commitBounds({ x, y, width: w, height: h });
    },

    endResize() {
      const s = this._rz;
      if (!s) return;
      window.removeEventListener('pointermove', s.move);
      window.removeEventListener('pointerup', s.up);
      window.removeEventListener('pointercancel', s.up);
      this._rz = null;
      this._rzDrag = false;
      document.body.classList.remove('rz-on');
      Store.state.ui.scale = this.z;
      Store.state.ui.stageH = this.stageH;
      Store.saveSoon(200);
      window.native.setGeom({ z: this.z, stageH: this.stageH, panelOpen: this.panelOpen });
      Bus.emit('scale', this.z);
      this.setIgnore(false);
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
        if (typeof soil === 'number' && soil > 92) {
          this.toast('土还挺湿（' + Math.round(soil) + '%），等干一点再浇');
        }
        return;
      }
      this.updateSoil();
      this.floatText(x, y, '+' + gain);
      this.sparks(x, y, 6);
      // 水壶就在你点的地方倒水，落点荡开两圈水波
      if (window.Fx) {
        window.Fx.water(x, y);
        window.Fx.ripple(x, y + 34);
      }
      this.updateBar();
      this.renderDock();
      this.updateSoil();
      this.checkAchievements();
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
      // 打开面板就当你已经看到了当前页的新东西
      if (open && window.Host && Host.news) {
        Host.news.delete(Host.active);
        Host.renderTabs();
      }
      window.native.setGeom({ z: this.z, stageH: this.stageH, panelOpen: open });
      clearTimeout(this._panelTimer);
      if (open) {
        this.panelShown = true;
        this.fitPanelWidth();
      } else {
        // 等面板滑出去再收窗口，不然是"啪"地一下消失
        this._panelTimer = setTimeout(() => {
          if (this.panelOpen) return;
          this.panelShown = false;
          this.fitPanelWidth();
        }, 260);
      }
    },

    /* 只改宽度：右边缘、上边缘、下边缘全部不动，
     * 所以树只会横向让出面板的位置，绝不会往下掉 */
    fitPanelWidth() {
      if (!this.bounds) return;
      const w = Math.round(this.designW() * this.z);
      const right = this.bounds.x + this.bounds.width;
      const wa = this.workArea || { x: 0, width: 1920 };
      this.commitBounds({
        x: Math.round(clamp(right - w, wa.x, wa.x + wa.width - w)),
        y: this.bounds.y,
        width: w,
        height: this.bounds.height
      });
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

      const topOn = ui.alwaysOnTop !== false;
      $('#btnTop').classList.toggle('on', topOn);
      $('#btnTop').textContent = topOn ? '置 顶' : '不 挡';
      $('#btnTop').title = topOn ? '正在盖在其他软件上面，点一下改成"不挡"' : '现在不挡其他软件，点一下改回置顶';
      this.userThrough = !!ui.passThrough;
      $('#btnThrough').classList.toggle('on', this.userThrough);
      if (this.userThrough) window.native.setThrough(true);
      this.applyBarsAuto();
    },

    /* ---------- 事件 ---------- */
    bindStore() {
      ['xp', 'levelup', 'codex', 'journal', 'genes'].forEach((k) => {
        Store.on(k, (p) => Bus.emit(k, p));
      });

      Store.on('xp', () => this.updateBar());

      Store.on('levelup', ({ level, unlocked }) => {
        Store.state.picked = [];
        Store.state.pickedAt = {};
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
      if (window.native.onBounds) {
        window.native.onBounds((b) => {
          if (b && !this._rzDrag) this.bounds = Object.assign({}, b);
        });
      }
      window.native.onCommand((cmd) => {
        if (!cmd || !cmd.type) return;
        if (cmd.type === 'toggle-panel') this.togglePanel();
        else if (cmd.type === 'flush-state') Store.save();
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
      let sec = 0;
      setInterval(() => {
        const now = performance.now();
        const dt = now - last;
        last = now;
        if (document.hidden) return;
        Store.tick(dt);
        this.updateBar();
        this.updateSoil();
        if (++sec % 2 === 0) this.checkAchievements();
        // 摘掉的花果到时间了会长回来，隔 45 秒查一次，有变化才重绘
        if (sec % 45 === 0 && Store.state.picked.length) {
          const before = Store.state.picked.length;
          if (Store.freshPicked().length < before) this.renderTree(true);
        }
      }, 1000);
      setInterval(() => Store.save(), 30000);
    },

    /* ---------- 特效 ---------- */
    /* 鼠标事件给的是视口坐标；页面整体 zoom 过，
     * #floats / #fx 里的 left/top 是设计坐标，得先除以 z，否则动画会歪。 */
    toLayer(x, y) {
      const host = document.getElementById('fx');
      const z = this.z || 1;
      if (!host) return { x: x / z, y: y / z };
      const r = host.getBoundingClientRect();
      return { x: (x - r.left) / z, y: (y - r.top) / z };
    },

    /* 提示改成队列：升级、成就、浇水提示挨在一起时不会互相顶掉 */
    toast(text, kind) {
      if (!text) return;
      this._toastQ = this._toastQ || [];
      this._toastQ.push({ text, kind: kind || '' });
      if (this._toastQ.length > 4) this._toastQ.splice(0, this._toastQ.length - 4);
      if (!this._toastBusy) this.runToast();
    },

    runToast() {
      const el = $('#toast');
      const item = this._toastQ && this._toastQ.shift();
      if (!item) {
        this._toastBusy = false;
        el.classList.remove('show');
        return;
      }
      this._toastBusy = true;
      el.className = 'toast show' + (item.kind ? ' ' + item.kind : '');
      el.textContent = item.text;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => {
          this._toastBusy = false;
          this.runToast();
        }, 300);
      }, 2400);
    },

    /* 成就判定：返回新解锁列表，弹一条提示 + 树根处一圈很淡的金光 */
    checkAchievements() {
      if (!window.Achieve) return;
      const now = Date.now();
      if (now - (this._achAt || 0) < 1500) return;
      this._achAt = now;
      const got = window.Achieve.check(this.built && this.built.stats);
      if (!got || !got.length) return;
      if (got.length === 1) this.toast('成就解锁 · ' + got[0].name, 'ach-toast');
      else this.toast('解锁 ' + got.length + ' 项成就 · 见「成就」页', 'ach-toast');
      this.baseBurst(Math.min(22, 8 + got.length * 3));
      const p = this.svgPt(230, 638);
      if (window.Fx && p) window.Fx.achievement(p.x, p.y - 46);
      Bus.emit('refresh-tabs');
    },

    floatText(x, y, text) {
      const p = this.toLayer(x, y);
      const el = document.createElement('div');
      el.className = 'float-txt';
      el.textContent = text;
      el.style.left = p.x + 'px';
      el.style.top = p.y + 'px';
      $('#floats').appendChild(el);
      setTimeout(() => el.remove(), 1600);
    },

    sparks(x, y, n) {
      const p = this.toLayer(x, y);
      const wrap = $('#floats');
      for (let i = 0; i < n; i++) {
        const s = document.createElement('div');
        s.className = 'spark';
        const a = Math.random() * Math.PI * 2;
        const d = 30 + Math.random() * 60;
        s.style.left = p.x + 'px';
        s.style.top = p.y + 'px';
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
