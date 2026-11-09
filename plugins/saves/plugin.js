/**
 * 插件：存档
 * 3 个手动槽位 + 导出/导入 JSON；窗口与插件布局沿用当前，不跟着存档跳。
 */
(function () {
  'use strict';

  const fmt = (n) => Number(n || 0).toLocaleString('zh-CN');
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  const dateStr = (ts) => {
    const d = new Date(ts);
    return d.getMonth() + 1 + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  const seasonName = (id) => {
    if (!window.Season) return '—';
    const t = Season.TYPES[id];
    return t ? t.name : '—';
  };

  window.GrowTree.register({
    id: 'saves',
    name: '存档',
    icon: '▥',
    desc: '手动存档槽、导出与导入',
    mount(root, ctx) {
      let slots = [];

      root.innerHTML = `
        <div class="sv">
          <div class="sv-head">
            <h3>存 档</h3>
            <span class="sv-auto">自动存档 · 每 30 秒</span>
          </div>
          <div class="sv-current" id="svCur"></div>
          <div class="sv-list" id="svList"></div>
          <div class="sv-actions">
            <button class="eco-btn primary" id="svExport">导出当前存档</button>
            <button class="eco-btn" id="svImport">导入存档</button>
            <button class="eco-btn" id="svDir">打开存档目录</button>
            <button class="eco-btn" id="svRefresh">刷新槽位</button>
          </div>
          <div class="sv-tip">手动槽只记录树的进度（等级、金币、库存、成就、季节、天气…）；窗口大小、位置和插件布局沿用当前，不会因为读档跳走。</div>
        </div>`;

      const curEl = root.querySelector('#svCur');
      const listEl = root.querySelector('#svList');

      function renderCurrent() {
        const s = ctx.state;
        let ach = 0;
        try {
          ach = window.Achieve ? Achieve.count() : Object.keys(s.achievements || {}).length;
        } catch (e) {
          ach = Object.keys(s.achievements || {}).length;
        }
        const stock = s.stock ? Object.keys(s.stock).reduce((n, k) => n + (Number(s.stock[k]) || 0), 0) : 0;
        curEl.innerHTML =
          `当前 · LV <b>${s.level}</b> · <b>${fmt(s.coins)}</b> 金币 · <b>${stock}</b> 库存 · <b>${ach}</b> 成就 · ` +
          `第 <b>${s.stats ? s.stats.sessions || 1 : 1}</b> 次打开 · ${seasonName(s.season && s.season.id)}`;
      }

      function renderSlots() {
        listEl.innerHTML = [1, 2, 3]
          .map((n) => {
            const item = slots.find((x) => x.slot === n) || { slot: n, meta: null };
            const m = item.meta;
            return `<div class="sv-slot${m ? ' has' : ''}">
              <div class="sv-slot-h"><b>槽位 ${n}</b><span>${m ? dateStr(m.savedAt) : '空'}</span></div>
              <div class="sv-slot-b">${
                m
                  ? `LV ${m.level} · ${fmt(m.coins)} 金币 · ${m.achievements} 成就 · ${m.stock} 库存 · ${seasonName(m.season)}`
                  : '还没有存过。保存后可以随时读回来。'
              }</div>
              <div class="sv-slot-a">
                <button class="eco-btn primary" data-save="${n}">${m ? '覆盖保存' : '保存到此槽'}</button>
                ${m ? `<button class="eco-btn" data-load="${n}">读取</button><button class="eco-btn" data-del="${n}">删除</button>` : ''}
              </div>
            </div>`;
          })
          .join('');
        listEl.querySelectorAll('[data-save]').forEach((b) => {
          b.onclick = () => saveTo(Number(b.dataset.save));
        });
        listEl.querySelectorAll('[data-load]').forEach((b) => {
          b.onclick = () => loadFrom(Number(b.dataset.load));
        });
        listEl.querySelectorAll('[data-del]').forEach((b) => {
          b.onclick = () => removeSlot(Number(b.dataset.del));
        });
      }

      async function refresh() {
        renderCurrent();
        try {
          slots = (await window.native.listSaves()) || [];
        } catch (e) {
          slots = [];
        }
        renderSlots();
      }

      async function saveTo(n) {
        const has = slots.some((x) => x.slot === n && x.meta);
        if (has) {
          const ok = await ctx.ask({
            title: '覆盖槽位 ' + n + '？',
            text: '这个槽位里原来的进度会被当前进度替换。',
            ok: '覆盖',
            cancel: '取消'
          });
          if (!ok) return;
        }
        const r = await window.native.saveSlot(n, ctx.state);
        if (r && r.ok) {
          ctx.toast('已保存到槽位 ' + n);
          await refresh();
        } else {
          ctx.toast((r && r.msg) || '保存失败');
        }
      }

      async function loadFrom(n) {
        const ok = await ctx.ask({
          title: '读取槽位 ' + n + '？',
          text: '当前进度会被覆盖（会先备份到 state.json.bak），窗口和插件布局保持不变。',
          ok: '读取',
          cancel: '取消'
        });
        if (!ok) return;
        const r = await window.native.loadSlot(n);
        if (!r || !r.ok) ctx.toast((r && r.msg) || '读取失败');
      }

      async function removeSlot(n) {
        const ok = await ctx.ask({
          title: '删除槽位 ' + n + '？',
          text: '只会删除这个手动槽位，不影响当前进度。',
          ok: '删除',
          cancel: '取消',
          danger: true
        });
        if (!ok) return;
        const r = await window.native.deleteSlot(n);
        if (r && r.ok) {
          ctx.toast('槽位 ' + n + ' 已删除');
          await refresh();
        } else {
          ctx.toast((r && r.msg) || '删除失败');
        }
      }

      root.querySelector('#svExport').onclick = async () => {
        const r = await window.native.exportSave(ctx.state);
        if (r && r.ok) ctx.toast('已导出到 ' + r.path);
        else if (r && r.msg && r.msg !== '已取消') ctx.toast(r.msg);
      };

      root.querySelector('#svImport').onclick = async () => {
        const ok = await ctx.ask({
          title: '导入存档？',
          text: '当前进度会被导入的文件覆盖（会先备份到 state.json.bak）。',
          ok: '选择文件',
          cancel: '取消'
        });
        if (!ok) return;
        const r = await window.native.importSave();
        if (!r || !r.ok) {
          if (r && r.msg && r.msg !== '已取消') ctx.toast(r.msg);
        }
      };

      root.querySelector('#svDir').onclick = () => window.native.openSavesDir();
      root.querySelector('#svRefresh').onclick = () => refresh();

      refresh();
      const offs = [];
      offs.push(ctx.on('levelup', renderCurrent));
      offs.push(ctx.on('economy', renderCurrent));
      offs.push(ctx.on('achievement', renderCurrent));
      offs.push(ctx.on('season', renderCurrent));

      return {
        destroy() {
          offs.forEach((f) => f());
        }
      };
    }
  });
})();
