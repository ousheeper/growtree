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

  const TICK_MS = 4000; // 每 4 秒来一次时间生长
  // 土壤湿度模型：
  //  - 浇一次 +24，自然风干 0.09/秒 → 一次能润 4 分半，浇满能撑 18 分钟
  //  - 湿土会加成时间生长（见 soilBonus），浇水不再只是个数字
  const SOIL_MAX = 100;
  const SOIL_POUR = 24;
  const SOIL_DRY = 0.09;
  const SOIL_GATE = 92; // 高于这个湿度就不再吸收，避免连点白浇

  /* 湿土加成：35 以上 +1，70 以上 +2（每次时间生长额外给） */
  function soilBonus(soil) {
    if (typeof soil !== 'number') return 0;
    if (soil >= 70) return 2;
    if (soil >= 35) return 1;
    return 0;
  }
  // 键盘：每 40 键 +1 生长值，每 200 键 +1 养分
  const KEY_XP_EVERY = 40;
  const KEY_NUT_EVERY = 200;
  // 摘掉的花果不是永远没了：隔一段时间会在同样的枝头重新长出来
  const REGROW_MS = 7 * 60 * 1000;
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
        soil: 62,
        totalXp: 0,
        bornAt: Date.now(),
        sun: null,
        pruned: [],
        picked: [],
        pickedAt: {},
        branchTilt: {},
        tiltSeed: null,
        lastSeen: Date.now(),
        genes: Object.assign({}, DEFAULT_GENES),
        codex: [],
        journal: [],
        achievements: {},
        coins: 30,
        stock: { flower: 0, fruit: 0, mushroom: 0, crystal: 0 },
        buffs: { moistUntil: 0, bloomUntil: 0, lucky: false },
        season: null,
        stats: { clicks: 0, sessions: 0, bornTrees: 1, harvest: { flower: 0, fruit: 0, mushroom: 0, crystal: 0 }, keysToday: 0, keysTotal: 0, keyDay: '', keyNut: 0, soaked: 0, bigHarvest: 0, palettes: [], rains: 0, sold: 0, coinsEarned: 0, coinsSpent: 0, purchases: 0, seasons: [], seasonChanges: 0 },
        weather: null,
        plugins: { enabled: null, order: null, active: 'codex', known: [] },
        ui: { panelOpen: true, alwaysOnTop: true, overlay: false, passThrough: false, scale: 1, stageH: 940, mode: 'water', barsAutoHide: false, soundOn: true, soundVolume: 0.5 }
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
      if (!s.achievements || typeof s.achievements !== 'object') s.achievements = {};
      if (!Array.isArray(s.stats.palettes)) s.stats.palettes = [];
      if (!Array.isArray(s.stats.seasons)) s.stats.seasons = [];
      if (typeof s.coins !== 'number' || !isFinite(s.coins)) s.coins = 30;
      s.stock = Object.assign({ flower: 0, fruit: 0, mushroom: 0, crystal: 0 }, s.stock || {});
      s.buffs = Object.assign({ moistUntil: 0, bloomUntil: 0, lucky: false }, s.buffs || {});
      if (!Array.isArray(s.pruned)) s.pruned = [];
      // 自愈：主干（'r' 或不含层级的路径）不能剪，历史存档里若有就丢掉，否则整棵树是空的
      s.pruned = s.pruned.filter((x) => typeof x === 'string' && x.indexOf('.') > 0);
      if (!Array.isArray(s.picked)) s.picked = [];
      if (!s.pickedAt || typeof s.pickedAt !== 'object') s.pickedAt = {};
      if (typeof s.soil !== 'number') s.soil = 62;
      // 键盘统计按天重置
      const today = new Date().toDateString();
      if (s.stats.keyDay !== today) {
        s.stats.keyDay = today;
        s.stats.keysToday = 0;
      }
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
      // 离线期间土壤也会风干
      s.soil = Math.max(0, s.soil - elapsed * SOIL_DRY);
      s.lastSeen = Date.now();
      this.state = s;
      this.tickAcc = 0;
      this.notePalette();

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
      const s = this.state;
      if (!s) return;
      if (typeof s.soil === 'number') {
        // 天气决定干湿：晴天干得快，阴天慢，小雨会自己回润
        const w = window.Weather && window.Weather.current ? window.Weather.current() : null;
        const dry = w ? w.dry : 1;
        const wet = w ? w.wet : 0;
        const seasonDry = window.Season ? window.Season.dryMul() : 1;
        const moist = this.moistActive ? (this.moistActive() ? 0.5 : 1) : 1;
        s.soil = Math.max(0, Math.min(SOIL_MAX, s.soil + (wet - SOIL_DRY * dry * seasonDry * moist) * (dt / 1000)));
      }
      this.tickAcc = (this.tickAcc || 0) + dt;
      while (this.tickAcc >= TICK_MS) {
        this.tickAcc -= TICK_MS;
        // 湿土才有加成：这是「浇水」唯一的长期回报，也是它的意义所在
        this.addXp(1 + soilBonus(s.soil), 'time');
      }
    },

    feed(source) {
      const now = Date.now();
      if (this._lastClick && now - this._lastClick < CLICK_CD) return null;
      const s = this.state;
      // 土壤接近湿透就不再吸收：这是浇水的硬上限
      const soil = typeof s.soil === 'number' ? s.soil : 62;
      if (soil > SOIL_GATE) {
        this._lastClick = now; // 也吃冷却，避免连点刷提示
        return null;
      }
      this._lastClick = now;
      s.soil = Math.min(SOIL_MAX, soil + SOIL_POUR);
      // 浇到满：记一次「浇透」
      if (s.soil >= SOIL_MAX - 0.01) s.stats.soaked = (s.stats.soaked || 0) + 1;
      s.stats.clicks = (s.stats.clicks || 0) + 1;
      s.nutrient += 1;
      const gain = CLICK_XP + (Math.random() < 0.18 ? 2 : 0);
      this.addXp(gain, 'feed');
      this.saveSoon();
      return gain;
    },

    /* 摸一下：只给一点生长值，冷却 1.2 秒，不产养分 */
    poke() {
      const now = Date.now();
      if (this._lastPoke && now - this._lastPoke < 1200) return null;
      this._lastPoke = now;
      const s = this.state;
      s.stats.pokes = (s.stats.pokes || 0) + 1;
      this.addXp(1, 'poke');
      this.saveSoon();
      return 1;
    },

    /* 键盘：由主进程按 2 秒一批推过来 */
    addKeys(n) {
      const s = this.state;
      if (!s || !n) return null;
      const st = s.stats;
      st.keysToday = (st.keysToday || 0) + n;
      st.keysTotal = (st.keysTotal || 0) + n;
      this._keyXpAcc = (this._keyXpAcc || 0) + n;
      this._keyNutAcc = (this._keyNutAcc || 0) + n;
      const xp = Math.floor(this._keyXpAcc / KEY_XP_EVERY);
      if (xp > 0) {
        this._keyXpAcc -= xp * KEY_XP_EVERY;
        this.addXp(xp, 'keys');
      }
      const nut = Math.floor(this._keyNutAcc / KEY_NUT_EVERY);
      if (nut > 0) {
        this._keyNutAcc -= nut * KEY_NUT_EVERY;
        s.nutrient += nut;
        st.keyNut = (st.keyNut || 0) + nut;
      }
      this.saveSoon(2500);
      return { xp, nut };
    },

    unlockRandom() {
      const s = this.state;
      const locked = (window.CODEX_ITEMS || []).filter((it) => !s.codex.includes(it.id));
      if (!locked.length) return null;
      let pick = null;
      // 幸运露：下一次升级直接从还没收录的里面挑
      if (s.buffs && s.buffs.lucky) {
        s.buffs.lucky = false;
        pick = locked[(Math.random() * locked.length) | 0];
      }
      if (!pick) {
        // 稀有度越高越难出
        const pool = [];
        locked.forEach((it) => {
          const w = Math.max(1, 6 - it.rarity);
          for (let i = 0; i < w; i++) pool.push(it);
        });
        pick = pool[(Math.random() * pool.length) | 0];
      }
      s.codex.push(pick.id);
      this.log(`图鉴解锁：${pick.name}（${window.CODEX_RARITY[pick.rarity]}）—— ${pick.desc}`, 'codex');
      emit('codex', pick);
      return pick;
    },

    /* 还没到「重新长出来」时间的枝头：这些才需要盖住不画
     * 老存档里 picked 没有时间戳，当作早就该长了，直接放出来（否则剪过头的树会一直是光的） */
    freshPicked() {
      const s = this.state;
      if (!s) return [];
      const at = s.pickedAt || (s.pickedAt = {});
      const now = Date.now();
      const keep = [];
      let changed = false;
      for (const id of s.picked || []) {
        if (at[id] && now - at[id] < REGROW_MS) keep.push(id);
        else {
          delete at[id];
          changed = true;
        }
      }
      if (changed || keep.length !== (s.picked || []).length) {
        s.picked = keep;
        this.saveSoon();
      }
      return keep;
    },

    /* 刚摘下来的枝头：记时间，到点自己长回来 */
    markPicked(ids) {
      const s = this.state;
      if (!s || !ids || !ids.length) return;
      const at = s.pickedAt || (s.pickedAt = {});
      const now = Date.now();
      for (const id of ids) at[id] = now;
    },

    log(text, kind) {
      const s = this.state;
      if (!s) return;
      s.journal.unshift({ t: Date.now(), kind: kind || 'note', text });
      if (s.journal.length > 240) s.journal.length = 240;
      emit('journal', s.journal[0]);
      this.saveSoon();
    },

    /* ---------- 仓库 / 金币 ---------- */
    stockTotal() {
      const st = this.state && this.state.stock;
      return ['flower', 'fruit', 'mushroom', 'crystal'].reduce((n, k) => n + ((st && st[k]) || 0), 0);
    },

    addStock(counts) {
      const s = this.state;
      if (!s || !counts) return 0;
      let n = 0;
      ['flower', 'fruit', 'mushroom', 'crystal'].forEach((k) => {
        const v = counts[k] || 0;
        if (v > 0) {
          s.stock[k] = (s.stock[k] || 0) + v;
          n += v;
        }
      });
      if (n) {
        this.saveSoon();
        Bus.emit('economy', { type: 'stock', n });
      }
      return n;
    },

    sellType(id) {
      const s = this.state;
      if (!s || !s.stock) return null;
      const n = s.stock[id] || 0;
      if (!n) return null;
      const sid = window.Season ? Season.current().id : null;
      const unit = window.Economy ? Economy.priceOf(id, sid) : 1;
      const coins = unit * n;
      s.stock[id] = 0;
      s.coins += coins;
      s.stats.sold = (s.stats.sold || 0) + n;
      s.stats.coinsEarned = (s.stats.coinsEarned || 0) + coins;
      const name = window.Economy ? (Economy.type(id) || {}).name || id : id;
      this.log(`卖出 ${n} 份${name}，得 ${coins} 金币。`, 'shop');
      this.saveSoon();
      Bus.emit('economy', { type: 'sell', id, n, coins });
      return { n, coins };
    },

    sellAll() {
      const s = this.state;
      if (!s || !s.stock) return null;
      let n = 0;
      let coins = 0;
      ['flower', 'fruit', 'mushroom', 'crystal'].forEach((id) => {
        const c = s.stock[id] || 0;
        if (!c) return;
        const sid = window.Season ? Season.current().id : null;
        coins += c * (window.Economy ? Economy.priceOf(id, sid) : 1);
        n += c;
        s.stock[id] = 0;
      });
      if (!n) return null;
      s.coins += coins;
      s.stats.sold = (s.stats.sold || 0) + n;
      s.stats.coinsEarned = (s.stats.coinsEarned || 0) + coins;
      this.log(`把仓库里的 ${n} 份全部卖出，得 ${coins} 金币。`, 'shop');
      this.saveSoon();
      Bus.emit('economy', { type: 'sell', n, coins });
      return { n, coins };
    },

    buy(id) {
      const s = this.state;
      const item = window.Economy && Economy.SHOP.find((x) => x.id === id);
      if (!item) return { ok: false, reason: 'item' };
      if ((s.coins || 0) < item.price) return { ok: false, reason: 'coins' };
      const now = Date.now();
      s.coins -= item.price;
      if (id === 'fertilizer') {
        this.addXp(80, 'shop');
      } else if (id === 'moist') {
        s.soil = 100;
        s.buffs.moistUntil = Math.max(now, s.buffs.moistUntil || 0) + 30 * 60000;
      } else if (id === 'bloom') {
        s.buffs.bloomUntil = Math.max(now, s.buffs.bloomUntil || 0) + 20 * 60000;
      } else if (id === 'lucky') {
        s.buffs.lucky = true;
      }
      s.stats.purchases = (s.stats.purchases || 0) + 1;
      s.stats.coinsSpent = (s.stats.coinsSpent || 0) + item.price;
      this.log(`买下「${item.name}」，花了 ${item.price} 金币。`, 'shop');
      this.saveSoon();
      Bus.emit('economy', { type: 'buy', id, price: item.price });
      return { ok: true, item };
    },

    moistActive() {
      const s = this.state;
      return !!s && !!s.buffs && Date.now() < (s.buffs.moistUntil || 0);
    },

    bloomActive() {
      const s = this.state;
      return !!s && !!s.buffs && Date.now() < (s.buffs.bloomUntil || 0);
    },

    bloomBonus() {
      return this.bloomActive() ? 0.2 : 0;
    },

    luckyActive() {
      const s = this.state;
      return !!s && !!s.buffs && !!s.buffs.lucky;
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
      this.notePalette();
      this.saveSoon();
      emit('genes', this.state.genes);
    },

    /* 记下用过的花色（成就用）。genes 插件是就地改 state 的，所以这里单独抽一个口子 */
    notePalette() {
      const s = this.state;
      if (!s || !s.genes || !s.genes.palette) return;
      const arr = s.stats.palettes || (s.stats.palettes = []);
      if (!arr.includes(s.genes.palette)) {
        arr.push(s.genes.palette);
        this.saveSoon();
      }
    },

    soilBonus,

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
