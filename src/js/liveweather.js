/**
 * 真实天气（联网可选）：用 Open-Meteo 拿用户所在地的当前温度和天气，
 * 把天气码映射成游戏的 晴/阴/雨/雪，温度用于微调土壤风干速度。
 *
 * - 只在设置里开启「联网获取真实天气」时工作；没开/失败/断网都回退到内置模拟天气
 * - 每 20 分钟拉一次，避免频繁请求
 * - 数据缓存在 Store.state.liveWeather，重启后先显示上次结果、再后台刷新
 */
(function () {
  'use strict';

  const REFRESH_MS = 20 * 60000;

  /* WMO 天气码 → 游戏天气。没列出的按「阴」处理，宁可保守。 */
  function codeToType(code) {
    if (code == null) return null;
    // 雷雨 / 毛毛雨 / 雨 / 阵雨 → 雨
    if ((code >= 45 && code <= 57) || (code >= 61 && code <= 82) || (code >= 95 && code <= 99)) {
      return code >= 71 && code <= 77 ? 'snow' : 'rain';
    }
    // 各种雪 → 雪
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return 'snow';
    // 雾、霾 → 阴
    if (code >= 45 && code <= 48) return 'cloudy';
    // 晴 / 基本晴 / 局部多云
    if (code === 0 || code === 1) return 'sunny';
    if (code === 2 || code === 3) return 'sunny';
    return 'cloudy';
  }

  /* 温度 → 风干倍率：20℃ 为基准 1，越热干得越快，越冷干得越慢 */
  function tempDryMul(temp) {
    if (temp == null) return 1;
    // 每高 1℃ 多干 2.5%，每低 1℃ 少干 2.5%，夹在 0.5 ~ 1.8
    const m = 1 + (temp - 20) * 0.025;
    return Math.max(0.5, Math.min(1.8, m));
  }

  const LiveWeather = {
    _timer: null,
    _fetching: false,

    enabled() {
      return !!Store.state.ui.liveWeather;
    },

    last() {
      const s = Store.state;
      return s && s.liveWeather ? s.liveWeather : null;
    },

    /* 温度对风干的倍率（联网且成功时生效，否则 1 = 不影响） */
    dryMul() {
      const w = this.last();
      if (!this.enabled() || !w || w.temp == null) return 1;
      return tempDryMul(w.temp);
    },

    init() {
      const s = Store.state;
      if (!s || !s.liveWeather) s.liveWeather = null;
      if (this.enabled()) {
        // 启动时先按缓存显示，再后台刷新一次
        if (s.liveWeather) this.apply(true);
        this.schedule();
      }
      Bus.on('wx-live', () => this.schedule());
    },

    schedule() {
      if (!this.enabled()) {
        this.stop();
        return;
      }
      if (this._timer) return;
      this._timer = setInterval(() => this.fetch(true), REFRESH_MS);
      // 启动即拉一次
      setTimeout(() => this.fetch(false), 1500);
    },

    stop() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    },

    async fetch(silent) {
      if (this._fetching) return;
      if (!window.native || !window.native.fetchWeather) return;
      this._fetching = true;
      try {
        const r = await window.native.fetchWeather();
        if (r && r.ok && r.data) {
          const d = r.data;
          const type = codeToType(d.code);
          Store.state.liveWeather = {
            type: type,
            temp: d.temp,
            city: d.city || '',
            isDay: !!d.isDay,
            at: d.at || Date.now(),
            ok: true
          };
          Store.saveSoon(800);
          this.apply(true);
        } else {
          // 失败：标记一下，界面显示「离线/回退」，保留内置模拟
          const prev = Store.state.liveWeather;
          Store.state.liveWeather = Object.assign({}, prev, { ok: false, at: Date.now() });
          if (!silent) this.apply(true);
        }
      } finally {
        this._fetching = false;
      }
    },

    /* 把真实天气结果体现到游戏：改写 Weather 的显示，并让风干系数生效 */
    apply(force) {
      if (window.Weather) Weather.apply();
      Bus.emit('weather', Store.state.weather);
      Bus.emit('wx-live-tick');
      if (force && window.__app) window.__app.updateSoil && window.__app.updateSoil();
    },

    /* 给角标/属性页用的一句话 */
    describe() {
      if (!this.enabled()) return null;
      const w = this.last();
      if (!w || !w.ok) return '联网天气 · 获取失败';
      const typeName = { sunny: '晴', cloudy: '阴', rain: '雨', snow: '雪' }[w.type] || '—';
      const temp = w.temp != null ? Math.round(w.temp) + '°' : '';
      const city = w.city ? ' ' + w.city : '';
      return '真实天气 · ' + typeName + temp + city;
    }
  };

  window.LiveWeather = LiveWeather;
})();
