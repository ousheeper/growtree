/**
 * 成就：定义 + 判定 + 解锁落盘
 * 只读 Store.state 和树的统计，不参与渲染；界面在 plugins/achievements/。
 */
(function () {
  'use strict';

  const DAY = 86400000;
  const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const harvestTotal = (h) => n(h && h.flower) + n(h && h.fruit) + n(h && h.mushroom) + n(h && h.crystal);

  /* 稀度：只影响徽章配色，不影响判定 */
  const TIERS = {
    1: { name: '常规', color: '#9fd6bb' },
    2: { name: '稀有', color: '#8fb9d8' },
    3: { name: '传说', color: '#e6c684' }
  };

  const CATS = [
    { id: 'all', name: '全部' },
    { id: 'grow', name: '生长' },
    { id: 'care', name: '照料' },
    { id: 'harvest', name: '收获' },
    { id: 'explore', name: '探索' },
    { id: 'keep', name: '陪伴' }
  ];

  const LIST = [
    /* ---------- 生长 ---------- */
    { id: 'sprout', cat: 'grow', tier: 1, icon: 'seed', name: '破土', desc: '迎来第 3 个生长周期', goal: 3, value: (s) => n(s.level) },
    { id: 'young', cat: 'grow', tier: 1, icon: 'sprout', name: '成苗', desc: '迎来第 10 个生长周期', goal: 10, value: (s) => n(s.level) },
    { id: 'elder', cat: 'grow', tier: 2, icon: 'tree', name: '老树', desc: '迎来第 20 个生长周期', goal: 20, value: (s) => n(s.level) },
    { id: 'ancient', cat: 'grow', tier: 3, icon: 'tree', name: '古木', desc: '迎来第 30 个生长周期', goal: 30, value: (s) => n(s.level) },
    { id: 'limbs', cat: 'grow', tier: 2, icon: 'leaf', name: '枝繁', desc: '同一棵树上长出 80 根枝条', goal: 80, value: (s, t) => n(t.branches) },
    { id: 'canopy', cat: 'grow', tier: 3, icon: 'leaf', name: '叶茂', desc: '同一棵树上挂 400 片叶', goal: 400, value: (s, t) => n(t.leaves) },

    /* ---------- 照料 ---------- */
    { id: 'first_drop', cat: 'care', tier: 1, icon: 'drop', name: '第一滴', desc: '第一次给它浇水', goal: 1, value: (s) => n(s.stats.clicks) },
    { id: 'gardener', cat: 'care', tier: 1, icon: 'drop', name: '园丁', desc: '累计浇水 50 次', goal: 50, value: (s) => n(s.stats.clicks) },
    { id: 'waterbearer', cat: 'care', tier: 2, icon: 'drop', name: '汲水人', desc: '累计浇水 300 次', goal: 300, value: (s) => n(s.stats.clicks) },
    { id: 'monsoon', cat: 'care', tier: 3, icon: 'drop', name: '雨季', desc: '累计浇水 1000 次', goal: 1000, value: (s) => n(s.stats.clicks) },
    { id: 'soaked', cat: 'care', tier: 1, icon: 'drop', name: '浇透', desc: '把土壤浇到 100%', goal: 1, value: (s) => n(s.stats.soaked) },
    { id: 'first_cut', cat: 'care', tier: 1, icon: 'shears', name: '第一剪', desc: '第一次修剪枝条', goal: 1, value: (s) => n((s.pruned || []).length) },
    { id: 'topiary', cat: 'care', tier: 2, icon: 'shears', name: '园艺师', desc: '累计剪去 50 根枝条', goal: 50, value: (s) => n((s.pruned || []).length) },
    { id: 'sculptor', cat: 'care', tier: 3, icon: 'shears', name: '塑形者', desc: '累计剪去 200 根枝条', goal: 200, value: (s) => n((s.pruned || []).length) },

    /* ---------- 收获 ---------- */
    { id: 'first_pick', cat: 'harvest', tier: 1, icon: 'basket', name: '初收', desc: '累计收获 10 份花果菌晶', goal: 10, value: (s) => harvestTotal(s.stats.harvest) },
    { id: 'full_basket', cat: 'harvest', tier: 2, icon: 'basket', name: '满筐', desc: '累计收获 100 份', goal: 100, value: (s) => harvestTotal(s.stats.harvest) },
    { id: 'good_year', cat: 'harvest', tier: 3, icon: 'fruit', name: '丰年', desc: '累计收获 500 份', goal: 500, value: (s) => harvestTotal(s.stats.harvest) },
    { id: 'sweep', cat: 'harvest', tier: 2, icon: 'hand', name: '一扫而空', desc: '一次收下 10 份以上', goal: 10, value: (s) => n(s.stats.bigHarvest) },
    { id: 'crystal_gather', cat: 'harvest', tier: 2, icon: 'crystal', name: '拾晶者', desc: '累计收下 25 枚晶体', goal: 25, value: (s) => n(s.stats.harvest && s.stats.harvest.crystal) },

    /* ---------- 探索 ---------- */
    { id: 'codex12', cat: 'explore', tier: 1, icon: 'book', name: '拾遗', desc: '收录 12 条图鉴词条', goal: 12, value: (s) => n((s.codex || []).length) },
    { id: 'codex40', cat: 'explore', tier: 2, icon: 'book', name: '博识', desc: '收录 40 条图鉴词条', goal: 40, value: (s) => n((s.codex || []).length) },
    { id: 'codex_all', cat: 'explore', tier: 3, icon: 'book', name: '全知', desc: '收齐所有图鉴词条', goal: (window.CODEX_ITEMS && window.CODEX_ITEMS.length) || 72, value: (s) => n((s.codex || []).length) },
    { id: 'keys10k', cat: 'explore', tier: 1, icon: 'key', name: '指尖生风', desc: '全机累计敲击 10,000 次', goal: 10000, value: (s) => n(s.stats.keysTotal) },
    { id: 'keys50k', cat: 'explore', tier: 3, icon: 'key', name: '键盘炼金', desc: '全机累计敲击 50,000 次', goal: 50000, value: (s) => n(s.stats.keysTotal) },
    { id: 'palette4', cat: 'explore', tier: 2, icon: 'palette', name: '四色', desc: '四种花色都试过一遍', goal: 4, value: (s) => n((s.stats.palettes || []).length) },
    { id: 'sessions50', cat: 'explore', tier: 1, icon: 'sun', name: '常客', desc: '打开它 50 次', goal: 50, value: (s) => n(s.stats.sessions) },

    /* ---------- 陪伴 ---------- */
    { id: 'day1', cat: 'keep', tier: 1, icon: 'moon', name: '一日', desc: '这棵树活满 1 天', goal: 1, value: (s) => n((Date.now() - (s.bornAt || Date.now())) / DAY) },
    { id: 'day7', cat: 'keep', tier: 2, icon: 'moon', name: '一周', desc: '这棵树活满 7 天', goal: 7, value: (s) => n((Date.now() - (s.bornAt || Date.now())) / DAY) },
    { id: 'day30', cat: 'keep', tier: 3, icon: 'moon', name: '一月', desc: '这棵树活满 30 天', goal: 30, value: (s) => n((Date.now() - (s.bornAt || Date.now())) / DAY) }
  ];

  const MAP = {};
  LIST.forEach((d) => (MAP[d.id] = d));

  const Achieve = {
    LIST,
    MAP,
    CATS,
    TIERS,
    TOTAL: LIST.length,

    unlocked() {
      return (Store.state && Store.state.achievements) || {};
    },

    count() {
      const u = this.unlocked();
      return LIST.filter((d) => !!u[d.id]).length;
    },

    percent() {
      return Math.round((this.count() / LIST.length) * 100);
    },

    valueOf(def, tree) {
      if (!def || !Store.state) return 0;
      try {
        return Math.max(0, n(def.value(Store.state, tree || {})));
      } catch (e) {
        return 0;
      }
    },

    progressOf(def, tree) {
      const v = this.valueOf(def, tree);
      return {
        value: v,
        pct: Math.max(0, Math.min(100, Math.round((v / Math.max(1, def.goal)) * 100))),
        done: !!this.unlocked()[def.id]
      };
    },

    /* 检查所有未解锁项；有新达成时写盘、记手记、广播 achievement 事件 */
    check(tree) {
      const s = Store.state;
      if (!s) return [];
      const got = s.achievements || (s.achievements = {});
      const out = [];
      for (const d of LIST) {
        if (got[d.id]) continue;
        if (this.valueOf(d, tree) >= d.goal) {
          got[d.id] = Date.now();
          out.push(d);
        }
      }
      if (!out.length) return out;

      s.stats.achTotal = (s.stats.achTotal || 0) + out.length;
      if (out.length <= 3) {
        out.forEach((d) => Store.log('成就解锁：' + d.name + ' —— ' + d.desc, 'ach'));
      } else {
        Store.log('成就解锁 ' + out.length + ' 项：' + out.map((d) => d.name).join('、'), 'ach');
      }
      Store.saveSoon(300);
      Bus.emit('achievement', out);
      return out;
    }
  };

  window.Achieve = Achieve;
})();
