/**
 * 季节：春 → 夏 → 秋 → 冬，每个 4 小时，按顺序轮转。
 * 只做三件事：换视觉、改土壤风干速度、改卖价（卖价在 Economy 里读）。
 */
(function () {
  'use strict';

  const HOUR = 3600000;
  const DURATION = 4 * HOUR;

  const ICON = {
    flower:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<g fill="currentColor"><ellipse cx="8" cy="5" rx="2.2" ry="3.1" opacity=".9"/><ellipse cx="8" cy="11" rx="2.2" ry="3.1" opacity=".9"/>' +
      '<ellipse cx="5" cy="8" rx="3.1" ry="2.2" opacity=".9"/><ellipse cx="11" cy="8" rx="3.1" ry="2.2" opacity=".9"/></g>' +
      '<circle cx="8" cy="8" r="1.7" fill="#ffe6a8"/></svg>',
    sun:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="3" fill="currentColor"/>' +
      '<g stroke="currentColor" stroke-width="1.2" stroke-linecap="round"><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M12.8 3.2l-1.1 1.1M4.3 11.7l-1.1 1.1"/></g></svg>',
    leaf:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<path d="M3.4 12.8C3.4 7 8 3.2 13.6 2.6c.6 5.6-3.8 9.6-10.2 10.2Z" fill="currentColor"/>' +
      '<path d="M4.4 12l5.8-5.8" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".45"/></svg>',
    snow:
      '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1.6v12.8M2.4 4.8l11.2 6.4M13.6 4.8L2.4 11.2"/></g>' +
      '<circle cx="8" cy="8" r="1.3" fill="currentColor"/></svg>'
  };

  const TYPES = {
    spring: {
      id: 'spring',
      name: '春',
      icon: 'flower',
      color: '#ffb7d0',
      dry: 0.9,
      sell: 1.1,
      tip: '花瓣开始落了 · 卖价 +10%'
    },
    summer: {
      id: 'summer',
      name: '夏',
      icon: 'sun',
      color: '#ffd27a',
      dry: 1.25,
      sell: 1.0,
      tip: '阳光最盛 · 土干得快 25%'
    },
    autumn: {
      id: 'autumn',
      name: '秋',
      icon: 'leaf',
      color: '#ffb46b',
      dry: 1.0,
      sell: 1.25,
      tip: '落叶季 · 卖价 +25%'
    },
    winter: {
      id: 'winter',
      name: '冬',
      icon: 'snow',
      color: '#bfe6ff',
      dry: 0.7,
      sell: 1.15,
      tip: '土干得慢 30% · 晶体再 +30%'
    }
  };

  const ORDER = ['spring', 'summer', 'autumn', 'winter'];

  const Season = {
    TYPES,
    ORDER,
    DURATION,
    _last: null,
    _fade: null,

    current() {
      const s = Store.state;
      const id = s && s.season && s.season.id;
      return TYPES[id] || TYPES.spring;
    },

    nextId(id) {
      const i = ORDER.indexOf(id);
      return ORDER[(i < 0 ? 0 : i + 1) % ORDER.length];
    },

    init() {
      const s = Store.state;
      if (!s) return;
      if (!s.season || !TYPES[s.season.id]) {
        this.set('spring', { silent: true });
      } else if (Date.now() >= (s.season.until || 0)) {
        this.set(this.nextId(s.season.id), { silent: true });
      } else {
        this.apply();
      }
      this.bindChip();
    },

    set(id, opts) {
      const s = Store.state;
      if (!s) return;
      const def = TYPES[id] || TYPES.spring;
      const now = Date.now();
      const prev = s.season && s.season.id;
      s.season = { id: def.id, since: now, until: now + DURATION };
      if (!Array.isArray(s.stats.seasons)) s.stats.seasons = [];
      if (!s.stats.seasons.includes(def.id)) s.stats.seasons.push(def.id);
      if (prev && prev !== def.id) s.stats.seasonChanges = (s.stats.seasonChanges || 0) + 1;
      Store.saveSoon(400);
      this.apply();
      Bus.emit('season', s.season);

      if (opts && opts.silent) return;
      Store.log('季节换成' + def.name + '：' + def.tip, 'season');
      Bus.emit('toast', '换季了 · ' + def.name + ' · ' + def.tip);
      if (window.Sound && Sound.season) Sound.season();
    },

    tick() {
      const s = Store.state;
      if (!s) return;
      if (!s.season) {
        this.init();
        return;
      }
      if (Date.now() >= (s.season.until || 0)) this.set(this.nextId(s.season.id));
      else this.updateChip();
    },

    remaining() {
      const s = Store.state;
      if (!s || !s.season) return 0;
      return Math.max(0, (s.season.until || 0) - Date.now());
    },

    dryMul() {
      return this.current().dry;
    },

    sellMul() {
      return this.current().sell;
    },

    apply() {
      const def = this.current();
      document.body.classList.remove('season-spring', 'season-summer', 'season-autumn', 'season-winter');
      document.body.classList.add('season-' + def.id);

      const chip = document.getElementById('seasonChip');
      if (chip) {
        if (this._last !== def.id || !chip.innerHTML) {
          chip.innerHTML = '<span class="wx-ico">' + ICON[def.icon] + '</span><span class="wx-name">' + def.name + '</span>';
        }
        chip.dataset.season = def.id;
      }
      this._last = def.id;
      this.makeParticles();
      this.updateChip();
    },

    updateChip() {
      const chip = document.getElementById('seasonChip');
      if (!chip) return;
      const def = this.current();
      const left = Math.max(1, Math.round(this.remaining() / 60000));
      chip.title = def.name + ' · ' + def.tip + ' · 约 ' + Math.ceil(left / 60) + ' 小时后换季';
    },

    bindChip() {
      const chip = document.getElementById('seasonChip');
      if (!chip || chip._bound) return;
      chip._bound = true;
      chip.onclick = () => {
        const def = this.current();
        const h = Math.max(1, Math.round(this.remaining() / HOUR));
        Bus.emit('toast', def.name + ' · ' + def.tip + ' · 约 ' + h + ' 小时后换季');
      };
    },

    /* 12 个季节粒子；形状/颜色交给 CSS 的 body.season-* 决定 */
    makeParticles() {
      const layer = document.getElementById('seasonLayer');
      if (!layer) return;
      if (this._last === layer.dataset.season) return;
      layer.dataset.season = this._last;
      let html = '';
      for (let i = 0; i < 12; i++) {
        const x = (Math.random() * 100).toFixed(1);
        const s = (4 + Math.random() * 6).toFixed(1);
        const d = (5.5 + Math.random() * 6).toFixed(1);
        const delay = (-Math.random() * 8).toFixed(1);
        const r = Math.round(Math.random() * 360);
        html += '<i style="--x:' + x + '%;--s:' + s + 'px;--d:' + d + 's;--delay:' + delay + 's;--r:' + r + 'deg"></i>';
      }
      layer.innerHTML = html;
    }
  };

  window.Season = Season;
})();
