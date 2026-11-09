/**
 * 插件：商店
 * 花金币买肥料 / 保湿剂 / 催花剂 / 幸运露。
 */
(function () {
  'use strict';

  const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
  const COIN =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="8.2" fill="currentColor" opacity=".92"/>' +
    '<circle cx="12" cy="12" r="5.1" fill="none" stroke="#1a1420" stroke-width="1.4" opacity=".42"/>' +
    '<path d="M12 7.6v8.8" stroke="#1a1420" stroke-width="1.4" stroke-linecap="round" opacity=".42"/></svg>';

  const leftMin = (until) => Math.max(0, Math.ceil((until - Date.now()) / 60000));

  window.GrowTree.register({
    id: 'shop',
    name: '商店',
    icon: '⌂',
    desc: '用金币买肥料、保湿剂与催花剂',
    mount(root, ctx) {
      root.innerHTML = `
        <div class="eco">
          <div class="eco-head">
            <div class="eco-title">商 店</div>
            <div class="eco-coins">${COIN}<b id="spCoins">0</b><small>金币</small></div>
          </div>
          <div class="eco-sub" id="spBuffs"></div>
          <div class="eco-list" id="spList"></div>
          <div class="eco-actions">
            <button class="eco-btn" id="spGo">去仓库</button>
            <span class="eco-note" style="padding:4px 0">金币靠卖收货获得；商品价格固定，不受季节影响。</span>
          </div>
        </div>`;

      const coinsEl = root.querySelector('#spCoins');
      const buffsEl = root.querySelector('#spBuffs');
      const listEl = root.querySelector('#spList');

      function renderBuffs() {
        const s = ctx.state;
        const parts = [];
        if (Store.moistActive()) parts.push(`保湿 <b>${leftMin(s.buffs.moistUntil)}</b> 分`);
        if (Store.bloomActive()) parts.push(`催花 <b>${leftMin(s.buffs.bloomUntil)}</b> 分`);
        if (Store.luckyActive()) parts.push('幸运露 <b>待生效</b>');
        buffsEl.innerHTML = parts.length
          ? parts.map((p) => `<span class="eco-pill on">${p}</span>`).join('')
          : '<span class="eco-pill">没有生效中的道具</span>';
      }

      function render() {
        const s = ctx.state;
        coinsEl.textContent = fmt(s.coins);
        renderBuffs();
        listEl.innerHTML = (window.Economy ? Economy.SHOP : [])
          .map((item) => {
            const afford = (s.coins || 0) >= item.price;
            return `<div class="eco-card" style="--tc:var(--gold)">
              <div class="eco-ico">${Economy.icon(item.icon, 22)}</div>
              <div class="eco-body">
                <div class="eco-name">${item.name}<small>${item.tag}</small></div>
                <div class="eco-desc">${item.desc}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
                <div class="eco-price${afford ? '' : ' bad'}">${item.price} 金币</div>
                <button class="eco-btn primary" data-buy="${item.id}" ${afford ? '' : 'disabled'}>购买</button>
              </div>
            </div>`;
          })
          .join('');
        listEl.querySelectorAll('[data-buy]').forEach((b) => {
          b.onclick = () => buy(b.dataset.buy);
        });
      }

      function buy(id) {
        const r = Store.buy(id);
        if (!r.ok) {
          ctx.toast(r.reason === 'coins' ? '金币不够，先去仓库卖点收货' : '买不了这个');
          return;
        }
        if (window.Sound && Sound.buy) Sound.buy();
        ctx.toast(`买下「${r.item.name}」`);
        if (id === 'bloom') ctx.refreshTree(true);
        render();
      }

      root.querySelector('#spGo').onclick = () => ctx.switchTo('warehouse');

      render();
      const offs = [];
      offs.push(ctx.on('economy', render));
      offs.push(ctx.on('season', render));
      const timer = setInterval(renderBuffs, 20000);

      return {
        destroy() {
          offs.forEach((f) => f());
          clearInterval(timer);
        }
      };
    }
  });
})();
