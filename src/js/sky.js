/**
 * 天空：太阳 / 月亮是一幅画面，不是一个可以拖的窗口。
 *
 * - 位置由真实时间决定：按季节的日出日落时间，在树区上方画一段弧线
 * - 月相由真实日历算（朔望月 29.53 天，以 2000-01-06 18:14 UTC 的朔为基准）
 * - 天气会盖住太阳 / 月亮（阴天一层云、雨雪时更暗），夜里出星星
 * - 树只读取天体的方位来做向光与明暗，枝条形状仍然是冻结的
 */
(function () {
  'use strict';

  const DAY = 86400000;
  const SYNODIC = 29.530588853;
  const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);

  // 各季的日出 / 日落（本地小时）。冬天日照短、太阳低，夏天相反。
  const DAYLIGHT = {
    spring: [6.0, 18.0],
    summer: [5.1, 19.1],
    autumn: [6.2, 17.8],
    winter: [7.2, 16.8]
  };

  // 天体的横向范围；纵向在 band() 里算：工具栏下面、树冠上面
  const ARC = { left: 0.12, right: 0.88 };

  const Sky = {
    el: null,
    x: 0.5,
    y: 0.2,
    t: 0.5,
    isDay: true,
    phase: 0,
    _lastTilt: null,
    _lastLight: null,
    _renderAt: 0,

    init() {
      this.el = {
        sky: document.getElementById('sky'),
        sun: document.getElementById('skySun'),
        moon: document.getElementById('skyMoon'),
        lit: document.getElementById('moonLit'),
        stars: document.getElementById('skyStars')
      };
      if (!this.el.sky) return;
      this.makeStars();
      this.tick(true);
      // 一分钟走一格：太阳一分钟才挪零点几像素，没必要每秒算。
      // 位置是按分钟连续计算的（不是几个固定档位），只是刷新节流到一分钟。
      setInterval(() => this.tick(), 60000);
      window.addEventListener('resize', () => this.tick(false));
      Bus.on('weather', () => this.tick(true));
      Bus.on('season', () => this.tick(true));
    },

    makeStars() {
      const box = this.el.stars;
      if (!box || box.childElementCount) return;
      let h = '';
      for (let i = 0; i < 28; i++) {
        const x = (3 + Math.random() * 94).toFixed(2);
        const y = (3 + Math.random() * 52).toFixed(2);
        const s = (1 + Math.random() * 1.6).toFixed(2);
        const d = (2.4 + Math.random() * 3.6).toFixed(2);
        const delay = (-Math.random() * 6).toFixed(2);
        const o = (0.35 + Math.random() * 0.65).toFixed(2);
        h += `<i style="--x:${x}%;--y:${y}%;--s:${s}px;--d:${d}s;--delay:${delay}s;--o:${o}"></i>`;
      }
      box.innerHTML = h;
    },

    seasonId() {
      return window.Season ? Season.current().id : 'spring';
    },

    /* 现在是不是白天、在白天的第几成（0=日出，1=日落） */
    daylight() {
      const span = DAYLIGHT[this.seasonId()] || DAYLIGHT.spring;
      const rise = span[0];
      const set = span[1];
      const d = new Date();
      const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
      const isDay = h >= rise && h < set;
      let t;
      if (isDay) {
        t = (h - rise) / Math.max(0.01, set - rise);
      } else {
        const night = 24 - (set - rise);
        let nh = h - set;
        if (nh < 0) nh += 24;
        t = nh / Math.max(0.01, night);
      }
      return { isDay, t: Math.max(0, Math.min(1, t)), rise, set };
    },

    /* 只更新位置：日出到日落之间是一条连续的弧，不是几个档位 */
    move() {
      if (!this.el || !this.el.sky) return;
      if (document.hidden) return;
      const w = this.daylight();
      this.isDay = w.isDay;
      this.t = w.t;

      const skyH = this.el.sky.clientHeight || 800;
      const x = ARC.left + (ARC.right - ARC.left) * w.t;
      const band = this.band(skyH);
      // 日出/日落贴着树冠，正午在最高处：整条弧线都在树的上方，不会和枝干叠在一起
      const yPx = band.bottom - (band.bottom - band.top) * Math.sin(Math.PI * w.t);
      this.x = x;
      this.y = yPx / skyH;

      this.place(this.el.sun, x, this.y, w.isDay);
      this.place(this.el.moon, x, this.y, !w.isDay);
      document.body.classList.toggle('is-day', w.isDay);
      document.body.classList.toggle('is-night', !w.isDay);
    },

    tick(force) {
      if (!this.el || !this.el.sky) return;
      this.move();

      this.setPhase();
      this.applyLight();

      // 方位变了才重绘树：枝干形状是冻结的，这里只影响明暗
      const tilt = this.tilt();
      if (tilt == null) return;
      const changed = this._lastTilt == null || Math.abs(tilt - this._lastTilt) > 0.008;
      this._lastTilt = tilt;
      if (!changed && !force) return;
      const app = window.__app;
      if (!app || !app.built || !app.renderTree) return;
      const now = performance.now();
      if (!force && now - this._renderAt < 2000) return;
      this._renderAt = now;
      app.renderTree(false);
    },

    /* 天体只能待的竖条：工具栏下沿到树冠上方。
     * 树越长越高，所以每次都用枝干层的实际位置重新算。 */
    band(skyH) {
      // 树冠位置每 3 秒量一次就够了（树要长也是分钟级的）
      const now = performance.now();
      if (this._band && this._band.h === skyH && now - this._band.at < 3000) return this._band.v;
      const sr = this.el.sky.getBoundingClientRect();
      const z = (window.__app && window.__app.z) || 1;
      // 顶部让过工具栏（工具栏高度可能随缩放变），再留出天体半径
      let top = 76;
      const bar = document.getElementById('topbar');
      if (bar) {
        const barBottom = (bar.getBoundingClientRect().bottom - sr.top) / z;
        if (isFinite(barBottom) && barBottom > 0) top = barBottom + 46;
      }
      top = Math.min(Math.max(top, 58), skyH * 0.26);
      let bottom = skyH * 0.36;
      const lay = document.querySelector('#tree .layer-branch');
      if (lay && lay.getBoundingClientRect) {
        const r = lay.getBoundingClientRect();
        const crown = (r.top - sr.top) / z;
        // 留出球体半径 + 一点呼吸余量
        if (isFinite(crown) && crown > top + 30) bottom = crown - 46;
      }
      const v = { top, bottom: Math.max(top + 18, Math.min(bottom, skyH - 45)) };
      this._band = { h: skyH, at: now, v };
      return v;
    },

    place(el, x, y, visible) {
      if (!el) return;
      el.style.setProperty('--x', (x * 100).toFixed(2) + '%');
      el.style.setProperty('--y', (y * 100).toFixed(2) + '%');
      el.style.setProperty('--o', visible ? '1' : '0');
    },

    /* 真实月相：返回 0~1 的月龄比例，并画出被照亮的那一块 */
    setPhase(forceP) {
      const age = (((Date.now() - NEW_MOON) / DAY) % SYNODIC + SYNODIC) % SYNODIC;
      const p = typeof forceP === 'number' ? forceP : age / SYNODIC;
      this.phase = p;
      const th = p * Math.PI * 2;
      const cos = Math.cos(th);
      const R = 42;
      const rx = Math.abs(cos) * R;
      const waxing = p < 0.5; // 上半月：右边亮
      const outer = waxing ? 1 : 0;
      // 明暗交界线是一条椭圆弧：新月时与亮侧边缘重合，满月时与暗侧边缘重合
      const inner = waxing ? (cos >= 0 ? 0 : 1) : cos < 0 ? 0 : 1;
      const d =
        `M50 ${50 - R} A ${R} ${R} 0 0 ${outer} 50 ${50 + R} ` +
        `A ${rx.toFixed(2)} ${R} 0 0 ${inner} 50 ${50 - R} Z`;
      if (this.el.lit) this.el.lit.setAttribute('d', d);
      // 新月前后几乎看不见月亮：这时候连"挡着它的云"也别画，否则天上会多一团灰
      const lit = (1 - cos) / 2;
      if (this.el.moon) {
        this.el.moon.classList.toggle('moon-dark', lit < 0.06);
        this.el.moon.title = this.phaseName(p) + ' · ' + (p * SYNODIC).toFixed(1) + ' 天';
      }
    },

    phaseName(p) {
      if (p < 0.033 || p > 0.967) return '新月';
      if (p < 0.217) return '娥眉月';
      if (p < 0.283) return '上弦月';
      if (p < 0.467) return '盈凸月';
      if (p < 0.533) return '满月';
      if (p < 0.717) return '亏凸月';
      if (p < 0.783) return '下弦月';
      return '残月';
    },

    /* 天体方位 → 相对竖直向上的倾角（弧度）。太阳比月亮拉得动树。 */
    tilt() {
      if (this.x == null) return null;
      const stage = document.getElementById('stage');
      const w = stage ? stage.clientWidth : 470;
      const h = stage ? stage.clientHeight : 940;
      const fy = this.y * (1 - 74 / Math.max(1, h));
      const dx = (this.x - 0.5) * (w / Math.max(1, h));
      const dy = fy - 0.86;
      const ang = Math.atan2(dx, -dy);
      const up = dy < 0 ? 1 : Math.max(0, 1 + dy * 2.6);
      const k = this.isDay ? 0.35 : 0.16;
      return Number((Math.max(-1.35, Math.min(1.35, ang)) * k * up).toFixed(4));
    },

    /* 画面整体亮度：夜里压暗，阴雨雪再压一点 */
    light() {
      const wx = window.Weather ? Weather.current().id : 'sunny';
      let v = this.isDay ? 1 : 0.74;
      if (this.isDay) {
        const edge = Math.min(this.t, 1 - this.t); // 0 = 贴着地平线
        v *= 0.9 + 0.1 * Math.min(1, edge * 4);
      }
      if (wx === 'cloudy') v *= 0.93;
      else if (wx === 'rain') v *= 0.84;
      else if (wx === 'snow') v *= 0.9;
      return Math.round(v * 100) / 100;
    },

    applyLight() {
      const v = this.light();
      if (v === this._lastLight) return;
      this._lastLight = v;
      document.documentElement.style.setProperty('--light', v);
      document.body.dataset.light = String(v);
    },

    /* 给属性页 / 调试用的一句话 */
    describe() {
      const w = this.daylight();
      const nm = this.phaseName(this.phase);
      return (w.isDay ? '白天' : '夜里') + ' · ' + nm;
    }
  };

  window.Sky = Sky;
})();
