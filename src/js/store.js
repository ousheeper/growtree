/**
 * 状态层：生长 / 等级 / 图鉴 / 手记 / 持久化
 */
(function () {
  'use strict';

  const DEFAULT_GENES = {
    seed: 20261106,
    height: 0.55,
    spread: 0.3,
    irregular: 0.36,
    branches: 3,
    leafDensity: 0.8,
    decoRate: 0.62,
    sunPull: 0.8,
    species: { flower: true, fruit: true, mushroom: true, crystal: true },
    palette: 'cthulhu'
  };

  const TICK_MS = 4000; // 每 4 秒 +1 生长值
  const CLICK_XP = 4;
  const CLICK_CD = 650;

  const listeners = {};
  function emit(evt, payload) {
    (listeners[evt] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error('[store] listener error', evt, e);
      }
    });
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  function stamp(d) {
    d = d || new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function dayStamp(d) {
    d = d || new Date();
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const Store = {
    state: null,
    overlay: null, // 离线结算信息

    defaults() {
      return {
        v: 1,
        level: 1,
        xp: 0,
        nutrient: 0,
        totalXp: 0,
        bornAt: Date.now(),
        sun: null,
        pruned: [],
        picked: [],
        branchTilt: {},
        tiltSeed: null,
        lastSeen: Date.now(),
        genes: Object.assign({}, DEFAULT_GENES),
        codex: [],
        journal: [],
        stats: { clicks: 0, sessions: 0, bornTrees: 1, harvest: { flower: 0, fruit: 0, mushroom: 0, crystal: 0 } },
        plugins: { enabled: null, order: null, active: 'codex' },
        ui: { panelOpen: true, alwaysOnTop: true, overlay: false, passThrough: false, scale: 1, mode: 'water' }
      };
    },

    async init() {
      const loaded = (await window.native.loadState()) || {};
      const base = this.defaults();
      const s = Object.assign({}, base, loaded);
      s.genes = Object.assign({}, base.genes, loaded.genes || {});
      s.stats = Object.assign({}, base.stats, loaded.stats || {});
      s.plugins = Object.assign({}, base.plugins, loaded.plugins || {});
      s.ui = Object.assign({}, base.ui, loaded.ui || {});
      s.stats.harvest = Object.assign({ flower: 0, fruit: 0, mushroom: 0, crystal: 0 }, (loaded.stats && loaded.stats.harvest) || {});
      s.genes.species = Object.assign({ flower: true, fruit: true, mushroom: true, crystal: true }, (loaded.genes && loaded.genes.species) || {});
      if (!Array.isArray(s.codex)) s.codex = [];
      if (!Array.isArray(s.journal)) s.journal = [];
      if (!Array.isArray(s.pruned)) s.pruned = [];
      if (!Array.isArray(s.picked)) s.picked = [];
      s.stats.sessions = (s.stats.sessions || 0) + 1;

      // 离线生长结算
      const elapsed = Math.max(0, (Date.now() - (s.lastSeen || Date.now())) / 1000);
      if (elapsed > 120) {
        const gain = Math.floor(Math.min(elapsed, 1800) * 0.12);
        if (gain > 0) {
          s.totalXp += gain;
          this.overlay = { seconds: elapsed, gain };
        }
      }
      s.lastSeen = Date.now();
      this.state = s;
      this.tickAcc = 0;

      if (!s.journal.length) {
        s.journal.push({ t: Date.now(), kind: 'sys', text: '种子落进桌面，第一次呼吸发生在你看不见的时候。' });
      }
      // 保底初始词条
      if (!s.codex.length) {
        ['moss', 'dew', 'leafsoil', 'shell'].forEach((id) => s.codex.push(id));
      }
      this.recomputeXp();
      this.saveSoon(1200);
      return s;
    },

    threshold(level) {
      return Math.round(32 + level * 16 + Math.pow(level, 1.4) * 3);
    },

    get xpPercent() {
      const th = this.threshold(this.state.level);
      return Math.max(0, Math.min(100, (this.state.xp / th) * 100));
    },

    recomputeXp() {
      const s = this.state;
      let guard = 0;
      let leveled = false;
      while (s.xp >= this.threshold(s.level) && guard++ < 200) {
        s.xp -= this.threshold(s.level);
        s.level += 1;
        leveled = true;
        this.onLevelUp(s.level);
      }
      return leveled;
    },

    onLevelUp(level) {
      const s = this.state;
      this.log(`第 ${level} 个生长周期开始，枝干又向外多探出一点。`, 'grow');
      const unlocked = this.unlockRandom();
      emit('levelup', { level, unlocked });
    },

    addXp(n, reason) {
      const s = this.state;
      if (!s) return;
      s.totalXp += n;
      s.xp += n;
      const leveled = this.recomputeXp();
      if (!leveled) emit('xp', { gain: n, reason });
      this.saveSoon();
    },

    tick(dt) {
      this.tickAcc = (this.tickAcc || 0) + dt;
      while (this.tickAcc >= TICK_MS) {
        this.tickAcc -= TICK_MS;
        this.addXp(1, 'time');
      }
    },

    feed(source) {
      const now = Date.now();
      if (this._lastClick && now - this._lastClick < CLICK_CD) return null;
      this._lastClick = now;
      const s = this.state;
      s.stats.clicks = (s.stats.clicks || 0) + 1;
      s.nutrient += 1;
      const gain = CLICK_XP + (Math.random() < 0.18 ? 2 : 0);
      this.addXp(gain, 'feed');
      this.saveSoon();
      return gain;
    },

    unlockRandom() {
      const s = this.state;
      const locked = (window.CODEX_ITEMS || []).filter((it) => !s.codex.includes(it.id));
      if (!locked.length) return null;
      // 稀有度越高越难出
      const pool = [];
      locked.forEach((it) => {
        const w = Math.max(1, 6 - it.rarity);
        for (let i = 0; i < w; i++) pool.push(it);
      });
      const pick = pool[(Math.random() * pool.length) | 0];
      s.codex.push(pick.id);
      this.log(`图鉴解锁：${pick.name}（${window.CODEX_RARITY[pick.rarity]}）—— ${pick.desc}`, 'codex');
      emit('codex', pick);
      return pick;
    },

    log(text, kind) {
      const s = this.state;
      if (!s) return;
      s.journal.unshift({ t: Date.now(), kind: kind || 'note', text });
      if (s.journal.length > 240) s.journal.length = 240;
      emit('journal', s.journal[0]);
      this.saveSoon();
    },

    addHarvest(species) {
      if (!species) return;
      const h = this.state.stats.harvest;
      Object.keys(h).forEach((k) => {
        h[k] = (h[k] || 0) + (species[k] || 0);
      });
      this.saveSoon();
    },

    patchGenes(genes) {
      this.state.genes = Object.assign({}, this.state.genes, genes);
      this.saveSoon();
      emit('genes', this.state.genes);
    },

    saveSoon(delay) {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.save(), delay || 700);
    },

    async resetAll() {
      await window.native.saveState({});
      location.reload();
    },

    save() {
      if (!this.state) return;
      this.state.lastSeen = Date.now();
      window.native.saveState(this.state);
    },

    on(evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return () => {
        listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn);
      };
    },

    emit,
    stamp,
    dayStamp
  };

  window.Store = Store;
})();
