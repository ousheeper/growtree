/**
 * 插件：成就
 * 长期目标清单：分类筛选、进度条、达成日期；解锁时由主程序弹提示与金光。
 */
(function () {
  'use strict';

  /* 全部是 24×24 的线性/填充图形，不依赖任何图片资源 */
  const ICONS = {
    seed:
      '<ellipse cx="12" cy="13.6" rx="5.5" ry="6.4" fill="currentColor" opacity=".9"/>' +
      '<path d="M9.2 10.4c1.3-1.3 2.8-2 4.4-2.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>',
    sprout:
      '<path d="M12 20.5v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12 14.2C8.2 14.2 6.4 12 6.4 9.4c3.6 0 5.6 1.9 5.6 4.8Z" fill="currentColor"/>' +
      '<path d="M12 12.4c0-3 2-5 5.8-5.4.2 3.3-2.1 5.4-5.8 5.4Z" fill="currentColor" opacity=".72"/>',
    tree:
      '<path d="M12 21v-7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M12 16.5l-3.6-3.4M12 14.5l3.6-3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="12" cy="7.6" r="4.7" fill="currentColor" opacity=".85"/>',
    leaf:
      '<path d="M6 18.5C6 10.5 12 6 19.4 5.2c.8 8-5.4 13.3-13.4 13.3Z" fill="currentColor"/>' +
      '<path d="M7.4 17.4l8.2-8.2" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".45"/>',
    drop:
      '<path d="M12 3.4c3.8 4.6 5.9 7.5 5.9 10.1a5.9 5.9 0 0 1-11.8 0c0-2.6 2.1-5.5 5.9-10.1Z" fill="currentColor"/>' +
      '<path d="M9.8 13.6c.2 1.7 1.2 2.6 2.6 2.8" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>',
    shears:
      '<path d="M8.4 5.4l7.2 10.2M15.6 5.4L8.4 15.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
      '<circle cx="6.6" cy="18" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/>' +
      '<circle cx="17.4" cy="18" r="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
    basket:
      '<path d="M4 9.4h16l-1.6 9a2.2 2.2 0 0 1-2.2 1.9H7.8a2.2 2.2 0 0 1-2.2-1.9Z" fill="currentColor"/>' +
      '<path d="M8.2 9.4a3.8 3.8 0 0 1 7.6 0" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M5.6 13.2h12.8" stroke="#1a1420" stroke-width="1.1" opacity=".35"/>',
    fruit:
      '<circle cx="12" cy="14.2" r="5.3" fill="currentColor"/>' +
      '<path d="M12 8.9V5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12 6.8c1.9-1.7 3.5-1.8 4.9-1.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    crystal:
      '<path d="M12 3l6 6.4L12 21 6 9.4Z" fill="currentColor" opacity=".85"/>' +
      '<path d="M12 3l6 6.4H6Z" fill="#fff" opacity=".35"/>',
    book:
      '<path d="M5.2 5.6A2.2 2.2 0 0 1 7.4 3.4h11.4v15.2H7.4a2.2 2.2 0 0 0-2.2 2.2Z" fill="currentColor" opacity=".85"/>' +
      '<path d="M5.2 5.6v13.2" stroke="currentColor" stroke-width="1.6"/>' +
      '<path d="M9 7.4h6.2M9 10.2h5" stroke="#1a1420" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>',
    key:
      '<circle cx="8.2" cy="12" r="3.4" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
      '<path d="M11.6 12H20M17.2 12v3M19.6 12v2.2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    palette:
      '<path d="M12 4c4.9 0 8 3 8 6.5 0 3-2.2 4.2-4.4 4.2h-1.3c-1.2 0-1.9.9-1.5 2 .5 1.3-.2 2.5-1.8 2.5-4.2 0-7-3.4-7-7.2C4 7.2 7.4 4 12 4Z" fill="currentColor" opacity=".82"/>' +
      '<circle cx="8.4" cy="9.2" r="1.15" fill="#1a1420" opacity=".55"/><circle cx="12" cy="7.4" r="1.15" fill="#1a1420" opacity=".55"/>' +
      '<circle cx="15.4" cy="9.2" r="1.15" fill="#1a1420" opacity=".55"/>',
    sun:
      '<circle cx="12" cy="12" r="4.3" fill="currentColor"/>' +
      '<g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></g>',
    moon:
      '<path d="M15.4 3.6a8.2 8.2 0 1 0 4.9 14.7 8.7 8.7 0 0 1-4.9-14.7Z" fill="currentColor"/>',
    hand:
      '<path d="M6 3.2l11.4 8.2-5.4.8 2.9 6.3-2.4 1.1-2.9-6.3L6 17Z" fill="currentColor"/>'
  };

  function glyph(name, size) {
    const fn = ICONS[name] || ICONS.seed;
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${fn}</svg>`;
  }

  const fmt = (v) => (v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : String(v));
  const md = (ts) => {
    const d = new Date(ts);
    return d.getMonth() + 1 + '/' + d.getDate();
  };

  window.GrowTree.register({
    id: 'achievements',
    name: '成就',
    icon: '✦',
    desc: '长期目标与进度',
    mount(root, ctx) {
      if (!window.Achieve) {
        root.innerHTML = '<div class="empty">成就模块没有加载</div>';
        return;
      }
      const A = window.Achieve;
      let cat = 'all';
      let treeStats = (window.__app && window.__app.built && window.__app.built.stats) || {};
      let fresh = new Set();
      let timer = null;
      let lastSig = '';
      const offs = [];

      root.innerHTML = `
        <div class="ach">
          <div class="ach-head">
            <div class="ach-title">成 就<small>ACHIEVEMENTS</small></div>
            <div class="ach-count"><b id="acDone">0</b> / <span id="acAll">${A.TOTAL}</span><em id="acPct">0%</em></div>
          </div>
          <div class="ach-bar"><i id="acFill"></i></div>
          <div class="ach-tabs" id="acTabs"></div>
          <div class="ach-grid" id="acGrid"></div>
          <div class="hint-line" style="padding:0 2px">成就会在达成时自动记录；不消耗任何资源，也不影响树的生长。</div>
        </div>`;

      const doneEl = root.querySelector('#acDone');
      const pctEl = root.querySelector('#acPct');
      const fillEl = root.querySelector('#acFill');
      const tabsEl = root.querySelector('#acTabs');
      const gridEl = root.querySelector('#acGrid');

      function renderTabs() {
        const got = A.unlocked();
        tabsEl.innerHTML = A.CATS.map((c) => {
          const list = c.id === 'all' ? A.LIST : A.LIST.filter((d) => d.cat === c.id);
          const done = list.filter((d) => got[d.id]).length;
          return `<button class="ach-tab${c.id === cat ? ' on' : ''}" data-cat="${c.id}">
            ${c.name}<b>${done}/${list.length}</b>
          </button>`;
        }).join('');
        tabsEl.querySelectorAll('[data-cat]').forEach((b) => {
          b.onclick = () => {
            cat = b.dataset.cat;
            renderTabs();
            renderGrid();
          };
        });
      }

      function renderGrid() {
        const got = A.unlocked();
        const list = cat === 'all' ? A.LIST : A.LIST.filter((d) => d.cat === cat);
        gridEl.innerHTML = list
          .map((d) => {
            const done = !!got[d.id];
            const pr = A.progressOf(d, treeStats);
            const tier = A.TIERS[d.tier];
            const cls = ['ach-card', 't' + d.tier, done ? 'got' : 'lock', fresh.has(d.id) ? 'new' : ''].filter(Boolean).join(' ');
            return `<div class="${cls}" data-id="${d.id}" title="${done ? '已达成' : '进度 ' + pr.pct + '%'}">
              <div class="medal">${glyph(d.icon, 19)}</div>
              <div class="abody">
                <div class="line">
                  <span class="nm">${d.name}</span>
                  <span class="tier">${tier.name}</span>
                </div>
                <div class="ds">${d.desc}</div>
                ${
                  done
                    ? `<div class="foot"><span class="ok">${md(got[d.id])} 达成</span></div>`
                    : `<div class="ach-prog"><i style="width:${pr.pct}%"></i></div>
                       <div class="foot"><span>${fmt(pr.value)} / ${fmt(d.goal)}</span><span>${pr.pct}%</span></div>`
                }
              </div>
            </div>`;
          })
          .join('');
      }

      function render() {
        const n = A.count();
        doneEl.textContent = n;
        pctEl.textContent = Math.round((n / A.TOTAL) * 100) + '%';
        fillEl.style.width = ((n / A.TOTAL) * 100).toFixed(1) + '%';
        renderTabs();
        renderGrid();
      }

      function schedule() {
        clearTimeout(timer);
        timer = setTimeout(render, 160);
      }

      render();

      offs.push(
        ctx.on('achievement', (list) => {
          fresh = new Set((list || []).map((d) => d.id));
          render();
          // 去掉高亮，别让卡片一直闪
          setTimeout(() => {
            fresh = new Set();
            gridEl.querySelectorAll('.ach-card.new').forEach((c) => c.classList.remove('new'));
          }, 1000);
        })
      );
      // 只在「枝条 / 叶片」数量真的变了才重画：太阳挪动会高频触发 tree-stats，
      // 每 100ms 重建 29 张卡片没必要
      offs.push(ctx.on('tree-stats', (st) => {
        treeStats = st || {};
        const sig = [treeStats.branches, treeStats.leaves].join('/');
        if (sig === lastSig) return;
        lastSig = sig;
        schedule();
      }));
      offs.push(ctx.on('levelup', schedule));
      offs.push(ctx.on('codex', schedule));

      return {
        destroy() {
          offs.forEach((f) => f());
          clearTimeout(timer);
        }
      };
    }
  });
})();
