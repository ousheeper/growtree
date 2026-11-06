/**
 * 插件：图鉴（词条收集册）
 * 每个词条由程序化字形绘制，不依赖任何图片资源
 */
(function () {
  'use strict';

  const glyphPath = {
    eye: (c) =>
      `<ellipse cx="16" cy="16" rx="11.5" ry="7.4" fill="#f7f1e4" stroke="${c}" stroke-width="1.5"/>` +
      `<circle cx="16" cy="16" r="4.3" fill="${c}"/><circle cx="16" cy="16" r="1.7" fill="#221a2e"/>` +
      `<circle cx="11.4" cy="12.4" r="1.4" fill="#fff" opacity=".85"/>`,
    tentacle: (c) =>
      `<path d="M9 5c7 3 12 7 12 11.5 0 4-4.6 5-6.6 9.5" fill="none" stroke="${c}" stroke-width="3.1" stroke-linecap="round"/>` +
      `<circle cx="13" cy="9.6" r="1.2" fill="#fff" opacity=".65"/><circle cx="18" cy="13.6" r="1.1" fill="#fff" opacity=".6"/>` +
      `<circle cx="17.2" cy="19" r="1" fill="#fff" opacity=".55"/>`,
    mushroom: (c) =>
      `<path d="M5.5 15.5c0-6.5 21-6.5 21 0 0 2.2-21 2.2-21 0Z" fill="${c}"/>` +
      `<path d="M12.8 16.5h6.4v8a3.2 3.2 0 0 1-6.4 0Z" fill="${c}" opacity=".6"/>` +
      `<circle cx="11.6" cy="11.4" r="1.3" fill="#fff" opacity=".75"/><circle cx="20" cy="12.6" r="1" fill="#fff" opacity=".6"/>`,
    bloom: (c) => {
      let s = '';
      for (let i = 0; i < 5; i++) s += `<ellipse cx="16" cy="9.6" rx="3.5" ry="5.5" fill="${c}" opacity=".85" transform="rotate(${i * 72} 16 16)"/>`;
      return s + `<circle cx="16" cy="16" r="2.7" fill="#f7e0a8"/>`;
    },
    rune: (c) =>
      `<path d="M16 4v24M7.5 10.5l8.5 6 8.5-6M7.5 21.5l8.5-6 8.5 6" stroke="${c}" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    crystal: (c) => `<path d="M16 3l8 9-8 17-8-17z" fill="${c}" opacity=".85"/><path d="M16 3l8 9h-16z" fill="#fff" opacity=".45"/>`,
    bone: (c) =>
      `<path d="M11 11l10 10" stroke="${c}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<circle cx="9.5" cy="9.5" r="3" fill="${c}"/><circle cx="22.5" cy="22.5" r="3" fill="${c}"/>`,
    shell: (c) =>
      `<path d="M16 16c0-2.6 2.2-4.6 4.7-4.6s4.8 2.4 4.8 5.2-2.4 6.2-5.6 7.8-8.4 1.6-11-1.4-2.4-8 1-10.6 9.4-3 12.8 0" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    orb: (c) => `<circle cx="16" cy="16" r="10.5" fill="${c}" opacity=".8"/><circle cx="12.5" cy="12" r="3.2" fill="#fff" opacity=".55"/>`,
    bell: (c) =>
      `<path d="M9 20c0-7 2-11 7-11s7 4 7 11z" fill="${c}"/><path d="M16 9V5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>` +
      `<circle cx="16" cy="22" r="2.4" fill="${c}"/>`,
    leaf: (c) => `<path d="M8 24c0-10 8-16 17-17 1 10-6 18-17 17Z" fill="${c}" opacity=".85"/><path d="M9 23L22 9" stroke="#fff" stroke-width="1.1" opacity=".5"/>`,
    branch: (c) =>
      `<path d="M16 28V9M16 15l8-6M16 20l-8-6" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
      `<circle cx="24" cy="8.5" r="2.2" fill="${c}"/><circle cx="7.6" cy="13.5" r="2.2" fill="${c}"/>`
  };

  function glyph(item, size) {
    const fn = glyphPath[item.glyph] || glyphPath.orb;
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="color:${item.color};filter:brightness(.62) saturate(1.25)">${fn(item.color)}</svg>`;
  }

  window.GrowTree.register({
    id: 'codex',
    name: '图鉴',
    icon: '◈',
    desc: '已收录的素材、造物与遗迹',
    mount(root, ctx) {
      let cat = 'material';
      let sel = null;
      const offs = [];

      root.innerHTML = `
        <div class="codex">
          <div class="codex-book">
            <div class="codex-head"><span class="t">图 鉴</span><span class="n" id="cxCount"></span></div>
            <div class="codex-tabs" id="cxTabs"></div>
            <div class="codex-grid" id="cxGrid"></div>
          </div>
          <div class="codex-detail" id="cxDetail"></div>
        </div>`;

      const countEl = root.querySelector('#cxCount');
      const tabsEl = root.querySelector('#cxTabs');
      const gridEl = root.querySelector('#cxGrid');
      const detailEl = root.querySelector('#cxDetail');

      function renderDetail() {
        const s = ctx.state;
        const it = window.CODEX_MAP[sel];
        if (!it) {
          const lockedCount = window.CODEX_ITEMS.length - s.codex.length;
          detailEl.innerHTML = `<div class="ph">点击格子查看词条。<br>还有 ${lockedCount} 条未收录 —— 继续生长或点击树根可以解锁。</div>`;
          return;
        }
        const got = s.codex.includes(it.id);
        detailEl.innerHTML = `
          <div class="glyph">${got ? glyph(it, 30) : '<span style="color:#c26a7c;font-size:20px">✕</span>'}</div>
          <div class="meta">
            <div class="nm">${got ? it.name : '未收录'}
              <span class="rar" style="color:${['', '#9aa88f', '#8fb9d8', '#d6b168', '#c79bff'][it.rarity]}">${window.CODEX_RARITY[it.rarity]}</span>
            </div>
            <div class="ds">${got ? it.desc : '这一格还空着，土里有些东西正在成形。'}</div>
          </div>`;
      }

      function render(animId) {
        const s = ctx.state;
        countEl.textContent = `已合成 ${s.codex.length} / ${window.CODEX_ITEMS.length}`;

        tabsEl.innerHTML = window.CODEX_CATS.map(
          (c) => `<button class="codex-tab${c.id === cat ? ' on' : ''}" data-cat="${c.id}">${c.icon} ${c.name}</button>`
        ).join('');
        tabsEl.querySelectorAll('[data-cat]').forEach((b) => {
          b.onclick = () => {
            cat = b.dataset.cat;
            render();
          };
        });

        const items = window.CODEX_ITEMS.filter((i) => i.cat === cat);
        gridEl.innerHTML = items
          .map((it) => {
            const got = s.codex.includes(it.id);
            const cls = ['cell', got ? 'unlocked' : 'locked', 'r' + it.rarity, sel === it.id ? 'sel' : '', animId === it.id ? 'new' : '']
              .filter(Boolean)
              .join(' ');
            return `<div class="${cls}" data-id="${it.id}" title="${got ? it.name : '未收录'}">
              ${got ? glyph(it, 20) : '✕'}
              ${got ? `<span class="rk">${it.rarity}</span>` : ''}
            </div>`;
          })
          .join('');

        renderDetail();
      }

      gridEl.onclick = (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        sel = cell.dataset.id;
        gridEl.querySelectorAll('.cell.sel').forEach((c) => c.classList.remove('sel'));
        cell.classList.add('sel');
        renderDetail();
      };

      // 新收录：自动跳到对应页并高亮
      offs.push(
        ctx.on('codex-updated', (item) => {
          if (!item) return;
          cat = item.cat;
          sel = item.id;
          render(item.id);
          setTimeout(() => {
            const c = gridEl.querySelector(`[data-id="${item.id}"]`);
            if (c) c.classList.remove('new');
          }, 900);
        })
      );

      render();

      return {
        destroy() {
          offs.forEach((f) => f());
        }
      };
    }
  });
})();
