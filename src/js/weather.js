/**
 * 天气：晴 / 阴 / 小雨 / 小雪
 * - 定期换天气、影响土壤干湿、切换视觉与声音
 * - 概率按季节给：夏天多晴、春天多雨、冬天只下雪
 * - 结果存在 Store.state.weather 里，重启后接着走
 */
(function () {
  'use strict';

  const MIN = 60000;

  const ICON = {
    sun:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="3.1" fill="currentColor"/>' +
      '<g stroke="currentColor" stroke-width="1.2" stroke-linecap="round">' +
      '<path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.3 3.3l1.2 1.2M11.5 11.5l1.2 1.2M12.7 3.3l-1.2 1.2M4.5 11.5l-1.2 1.2"/>' +
      '</g></svg>',
    cloud:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<path d="M4.5 11.6h7.1a2.6 2.6 0 0 0 .2-5.2A3.4 3.4 0 0 0 5.1 5.7a2.9 2.9 0 0 0-.6 5.9Z" fill="currentColor" opacity=".92"/>' +
      '</svg>',
    rain:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<path d="M4.5 9.5h7.1a2.5 2.5 0 0 0 .2-5A3.3 3.3 0 0 0 5.1 4.1a2.8 2.8 0 0 0-.6 5.4Z" fill="currentColor" opacity=".92"/>' +
      '<path d="M6 11.4l-.7 2.2M8.6 11.4l-.7 2.2M11.2 11.4l-.7 2.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' +
      '</svg>',
    snow:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<g stroke="currentColor" stroke-width="1.3" stroke-linecap="round">' +
      '<path d="M8 1.6v12.8M2.4 4.8l11.2 6.4M13.6 4.8L2.4 11.2"/></g>' +
      '<circle cx="8" cy="8" r="1.2" fill="currentColor"/></svg>'
  };

  const TYPES = {
    sunny: {
      id: 'sunny',
      name: '晴',
      icon: 'sun',
      min: 9,
      max: 22,
      dry: 1,
      wet: 0,
      tip: '阳光把土面晒得干一点'
    },
    cloudy: {
      id: 'cloudy',
      name: '阴',
      icon: 'cloud',
      min: 7,
      max: 16,
      dry: 0.5,
      wet: 0,
      tip: '云压着，土干得慢'
    },
    rain: {
      id: 'rain',
      name: '小雨',
      icon: 'rain',
      min: 6,
      max: 13,
      dry: 0,
      wet: 0.055,
      tip: '土壤会自动回润'
    },
    snow: {
      id: 'snow',
      name: '小雪',
      icon: 'snow',
      min: 7,
      max: 15,
      dry: 0,
      wet: 0.04,
      tip: '雪慢慢化进土里'
    }
  };

  // 各季节的气候：数字是权重，没列出的天气这个季节不会出现
  const CLIMATE = {
    spring: { sunny: 3.0, cloudy: 3.4, rain: 3.6 },
    summer: { sunny: 5.4, cloudy: 2.3, rain: 2.3 },
    autumn: { sunny: 3.6, cloudy: 3.8, rain: 2.2 },
    winter: { sunny: 3.2, cloudy: 3.4, snow: 3.6 }
  };

  const Weather = {
    TYPES,
    _lastType: null,

    seasonId() {
      return window.Season ? Season.current().id : 'spring';
    },

    climate() {
      return CLIMATE[this.seasonId()] || CLIMATE.spring;
    },

    current() {
      const s = Store.state;
      const id = s && s.weather && s.weather.type;
      return TYPES[id] || TYPES.sunny;
    },

    /* 按当前季节的权重抽一个天气，尽量不连着来同一个 */
    pick(exclude) {
      const table = this.climate();
      const pool = [];
      Object.keys(table).forEach((id) => {
        if (id === exclude) return;
        const w = Math.max(1, table[id]);
        for (let i = 0; i < w; i++) pool.push(id);
      });
      if (!pool.length) return Object.keys(table)[0] || 'sunny';
      return pool[(Math.random() * pool.length) | 0];
    },

    init() {
      const s = Store.state;
      if (!s) return;
      if (!s.weather || !TYPES[s.weather.type]) {
        // 第一次有天气：静默生成一段，不刷手记也不弹提示
        this.set(this.pick(), { silent: true });
      } else if (Date.now() >= (s.weather.until || 0) || !this.climate()[s.weather.type]) {
        // 存档里的天气过期了，或者季节变了之后这个天气不该出现（比如冬天还在下雨）
        this.set(this.pick(s.weather.type), { silent: true });
      } else {
        this.apply();
      }
      this.bindChip();
      // 换季：把不合时令的雨/雪当场换掉
      Bus.on('season', () => this.onSeason());
    },

    /* 季节变了：冬天不下雨、其他季节不下雪 */
    onSeason() {
      const s = Store.state;
      if (!s || !s.weather) return;
      const table = this.climate();
      if (table[s.weather.type]) return;
      if (table.snow) this.set(s.weather.type === 'rain' ? 'snow' : 'cloudy');
      else this.set('rain');
    },

    set(type, opts) {
      const s = Store.state;
      if (!s) return;
      const id = TYPES[type] ? type : 'sunny';
      const def = TYPES[id];
      const now = Date.now();
      const mins = def.min + Math.random() * (def.max - def.min);
      const prev = s.weather && s.weather.type;
      s.weather = { type: id, since: now, until: now + Math.round(mins * MIN) };
      if (id === 'rain' && prev !== 'rain') s.stats.rains = (s.stats.rains || 0) + 1;
      if (id === 'snow' && prev !== 'snow') s.stats.snows = (s.stats.snows || 0) + 1;
      Store.saveSoon(400);
      this.apply();
      Bus.emit('weather', s.weather);

      if (opts && opts.silent) return;
      const msg =
        id === 'rain'
          ? '下起小雨 · 土壤会慢慢回润'
          : id === 'snow'
          ? '飘起小雪 · 雪会慢慢化进土里'
          : id === 'cloudy'
          ? '云压下来了 · 土干得慢一些'
          : '转晴了 · 阳光会晒干土面';
      Store.log(msg, 'wx');
      Bus.emit('toast', msg);
    },

    /* 主循环里每 5 秒调一次：到点换天气，顺手刷新角标提示 */
    tick() {
      const s = Store.state;
      if (!s) return;
      if (!s.weather) {
        this.init();
        return;
      }
      if (Date.now() >= (s.weather.until || 0)) this.set(this.pick(s.weather.type));
      else this.updateChip();
    },

    remaining() {
      const s = Store.state;
      if (!s || !s.weather) return 0;
      return Math.max(0, (s.weather.until || 0) - Date.now());
    },

    apply() {
      const t = this.current();
      const prev = this._lastType;
      document.body.classList.remove('wx-sunny', 'wx-cloudy', 'wx-rain', 'wx-snow');
      document.body.classList.add('wx-' + t.id);
      // 雨/雪停了之后让最后一段落完再淡出，别让雨丝冻在半空
      if ((prev === 'rain' || prev === 'snow') && t.id !== 'rain' && t.id !== 'snow') {
        document.body.classList.add('rain-fading');
        clearTimeout(this._rainFade);
        this._rainFade = setTimeout(() => document.body.classList.remove('rain-fading'), 1700);
      }

      const chip = document.getElementById('wxChip');
      if (chip) {
        if (this._lastType !== t.id || !chip.innerHTML) {
          chip.innerHTML = '<span class="wx-ico">' + ICON[t.icon] + '</span><span class="wx-name">' + t.name + '</span>';
        }
        chip.dataset.wx = t.id;
      }
      this._lastType = t.id;
      this.makeDrops();
      this.updateChip();
      if (window.Sound) window.Sound.setRain(t.id === 'rain');
    },

    updateChip() {
      const chip = document.getElementById('wxChip');
      if (!chip) return;
      const t = this.current();
      const left = Math.max(1, Math.round(this.remaining() / MIN));
      chip.title = t.name + ' · ' + t.tip + ' · 约 ' + left + ' 分钟后变化';
    },

    bindChip() {
      const chip = document.getElementById('wxChip');
      if (!chip || chip._bound) return;
      chip._bound = true;
      chip.onclick = () => {
        const t = this.current();
        const left = Math.max(1, Math.round(this.remaining() / MIN));
        let delta;
        if (t.wet > 0) delta = '土壤 +' + (t.wet * 60).toFixed(1) + '%/分' + (t.id === 'snow' ? '（融雪）' : '');
        else delta = '土壤 -' + (0.09 * t.dry * 60).toFixed(1) + '%/分';
        Bus.emit('toast', t.name + ' · ' + delta + ' · 约 ' + left + ' 分钟后变化');
      };
    },

    /* 雨丝只建一次，之后靠 CSS 循环；雪的圆点也复用这一层 */
    makeDrops() {
      const layer = document.getElementById('rain');
      if (!layer || layer.childElementCount) return;
      let html = '';
      for (let i = 0; i < 46; i++) {
        const x = (Math.random() * 100).toFixed(2);
        const len = (9 + Math.random() * 15).toFixed(1);
        const dur = (0.5 + Math.random() * 0.55).toFixed(2);
        const delay = (-Math.random() * 2.4).toFixed(2);
        const op = (0.22 + Math.random() * 0.5).toFixed(2);
        const sz = (2 + Math.random() * 2.4).toFixed(1);
        html +=
          '<i style="--x:' + x + '%;--len:' + len + 'px;--d:' + dur + 's;--delay:' + delay +
          's;--o:' + op + ';--s:' + sz + 'px"></i>';
      }
      layer.innerHTML = html;
    }
  };

  window.Weather = Weather;
})();
