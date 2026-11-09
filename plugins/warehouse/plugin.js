/**
 * 插件：仓库
 * 收货先入库，按当前季节价格卖出换金币。
 */
(function () {
  'use strict';

  const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
  const COIN =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="8.2" fill="currentColor" opacity=".92"/>' +
    '<circle cx="12" cy="12" r="5.1" fill="none" stroke="#1a1420" stroke-width="1.4" opacity=".42"/>' +
    '<path d="M12 7.6v8.8" stroke="#1a1420" stroke-width="1.4" stroke-linecap="round" opacity=".42"/></svg>';

  window.GrowTree.register({
    id: 'warehouse',
    name: '仓库',
    icon: '▤',
    desc: '收货入库，按季节价格卖出',
    mount(root, ctx) {
      let seasonId = window.Season ? Season.current().id : null;

      root.innerHTML = `
        <div class="eco">
          <div class="eco-head">
            <div class="eco-title">仓 库</div>
            <div class="eco-coins">${COIN}<b id="whCoins">0</b><small>金币</small></div>
          </div>
          <div class="eco-sub" id="whSub"></div>
          <div class="eco-list" id="whList"></div>
          <div class="eco-actions">
            <button class="eco-btn primary" id="whSellAll">全部卖出</button>
            <button class="eco-btn" id="whGoShop">去商店</button>
          </div>
          <div class="eco-note">收下来的花 / 果 / 菌 / 晶会先放进这里，不会自动卖。季节会改卖价：春 +10%，秋 +25%，冬天晶体再 +30%。</div>
        </div>`;

      const coinsEl = root.querySelector('#whCoins');
      const subEl = root.querySelector('#whSub');
      const listEl = root.querySelector('#whList');

      const seasonName = () => (window.Season ? Season.current().name : '—');

      function render() {
        const s = ctx.state;
        if (window.Season) seasonId = Season.current().id;
        const val = window.Economy ? Economy.valueOf(s.stock, seasonId) : { coins: 0, count: 0 };
        coinsEl.textContent = fmt(s.coins);
        subEl.innerHTML =
          `<span class="eco-pill">${seasonName()} · 卖价 ×${(window.Economy ? Economy.seasonMul(seasonId) : 1).toFixed(2).replace(/0$/, '')}</span>` +
          `<span class="eco-pill">库存 <b>${val.count}</b> 份</span>` +
          `<span class="eco-pill">约值 <b>${fmt(val.coins)}</b> 金币</span>`;

        listEl.innerHTML = (window.Economy ? Economy.TYPES : [])
          .map((t) => {
            const n = (s.stock && s.stock[t.id]) || 0;
            const unit = window.Economy ? Economy.priceOf(t.id, seasonId) : 0;
            return `<div class="eco-card" style="--tc:${t.color}">
              <div class="eco-ico">${Economy.icon(t.id, 22)}</div>
              <div class="eco-body">
                <div class="eco-name">${t.name}<small>库存 ${n}</small></div>
                <div class="eco-desc">单价 ${unit} 金币 · 小计 ${fmt(unit * n)}</div>
              </div>
              <button class="eco-btn" data-sell="${t.id}" ${n ? '' : 'disabled'}>卖出</button>
            </div>`;
          })
          .join('');

        listEl.querySelectorAll('[data-sell]').forEach((b) => {
          b.onclick = () => sell(b.dataset.sell);
        });
      }

      function sell(id) {
        const r = Store.sellType(id);
        if (!r) return ctx.toast('这一格还是空的');
        if (window.Sound && Sound.coin) Sound.coin();
        ctx.toast(`卖出 ${r.n} 份 · +${r.coins} 金币`);
        render();
      }

      root.querySelector('#whSellAll').onclick = async () => {
        const s = ctx.state;
        const val = window.Economy ? Economy.valueOf(s.stock, seasonId) : { coins: 0, count: 0 };
        if (!val.count) return ctx.toast('仓库是空的，先去树上收点东西');
        const ok = await ctx.ask({
          title: '全部卖出？',
          text: `一共 ${val.count} 份，按当前${seasonName()}价约 ${val.coins} 金币。卖完库存清空。`,
          ok: '全部卖出',
          cancel: '再想想'
        });
        if (!ok) return;
        const r = Store.sellAll();
        if (!r) return;
        if (window.Sound && Sound.coin) Sound.coin();
        ctx.toast(`卖出 ${r.n} 份 · +${r.coins} 金币`);
        render();
      };

      root.querySelector('#whGoShop').onclick = () => ctx.switchTo('shop');

      render();
      const offs = [];
      offs.push(ctx.on('economy', render));
      offs.push(ctx.on('season', render));

      return {
        destroy() {
          offs.forEach((f) => f());
        }
      };
    }
  });
})();
