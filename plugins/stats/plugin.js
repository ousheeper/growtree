/**
 * 插件：属性 —— 等级、结构统计、按种类分开的挂果数
 */
(function () {
  'use strict';

  function dur(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}<small>h</small>${m}<small>m</small>`;
    return `${m}<small>min</small>`;
  }

  const CATS = [
    { key: 'flower', name: '花' },
    { key: 'fruit', name: '果' },
    { key: 'mushroom', name: '菌' },
    { key: 'crystal', name: '晶' }
  ];

  window.GrowTree.register({
    id: 'stats',
    name: '属性',
    icon: '❖',
    desc: '等级、生长值与挂果统计',
    mount(root, ctx) {
      let treeStats = { branches: 0, leaves: 0, deco: 0, tips: 0, species: { flower: 0, fruit: 0, mushroom: 0, crystal: 0 } };
      const offs = [];

      root.innerHTML = `
        <div class="stats">
          <h3>属 性</h3>
          <div class="stat-grid" id="stTop"></div>
          <div class="hint-line" style="margin:-2px 2px 0">键盘为全局统计：每 40 次敲击 +1 生长值，每 200 次 +1 养分。</div>

          <div class="stat-sec">当前这棵树</div>
          <div class="stat-grid" id="stTree"></div>

          <div class="stat-sec">累计收获</div>
          <div class="stat-grid" id="stHarvest"></div>

          <div class="seedrow" style="gap:6px">
            <button class="btn ghost" id="stGrow">恢复所有修剪</button>
            <button class="btn ghost" id="stReset">重置全部数据</button>
          </div>
        </div>`;
      const topEl = root.querySelector('#stTop');
      const treeEl = root.querySelector('#stTree');
      const harvEl = root.querySelector('#stHarvest');

      const card = (k, v, big) => `<div class="stat${big ? ' big' : ''}"><div class="k">${k}</div><div class="v">${v}</div></div>`;

      function render() {
        const s = ctx.state;
        const alive = Date.now() - (s.bornAt || Date.now());
        const pal = window.TreeGen.PALETTES[s.genes.palette] || window.TreeGen.PALETTES.cthulhu;

        topEl.innerHTML = [
          card('生长周期', s.level, true),
          card('累计生长值', s.totalXp),
          card('本轮进度', Math.floor(Store.xpPercent) + '<small>%</small>'),
          card('已收录词条', `${s.codex.length}<small>/${window.CODEX_ITEMS.length}</small>`),
          card('浇灌次数', s.stats.clicks || 0),
          card('土壤湿度', Math.round(s.soil || 0) + '<small>%</small>'),
          card('今日敲击', (s.stats.keysToday || 0).toLocaleString()),
          card('累计敲击', (s.stats.keysTotal || 0).toLocaleString()),
          card('敲击换养分', s.stats.keyNut || 0),
          card('存活时长', dur(alive))
        ].join('');

        treeEl.innerHTML = [
          card('枝干', treeStats.branches),
          card('剪去', (s.pruned || []).length),
          card('叶片', treeStats.leaves),
          ...CATS.map((c) => card(c.name, treeStats.species ? treeStats.species[c.key] || 0 : 0)),
          card('挂果总数', treeStats.deco || 0),
          card('花色', pal.name)
        ].join('');

        const h = s.stats.harvest || {};
        harvEl.innerHTML = CATS.map((c) => card(c.name, h[c.key] || 0)).join('') + card('累计', s.stats.decoTotal || 0);
      }

      root.querySelector('#stGrow').onclick = () => {
        Store.state.pruned = [];
        Store.state.picked = [];
        Store.saveSoon();
        ctx.refreshTree(true);
        ctx.toast('枝条重新长回来了');
      };

      root.querySelector('#stReset').onclick = async () => {
        const ok = await ctx.ask({
          title: '重置全部数据？',
          text: '生长值、等级、图鉴、手记、剪枝记录全部清空，树会从种子重新开始。这个操作无法撤销。',
          ok: '清空重来',
          cancel: '取消'
        });
        if (ok) Store.resetAll();
      };

      render();
      offs.push(ctx.on('tree-stats', (st) => {
        treeStats = st;
        render();
      }));
      offs.push(ctx.on('xp', render));
      offs.push(ctx.on('levelup', render));
      offs.push(ctx.on('codex', render));
      const timer = setInterval(render, 20000);

      return {
        destroy() {
          offs.forEach((f) => f());
          clearInterval(timer);
        }
      };
    }
  });
})();
