/**
 * 插件：手记 —— 生长日志
 */
(function () {
  'use strict';

  window.GrowTree.register({
    id: 'journal',
    name: '手记',
    icon: '❦',
    desc: '这棵树经历过的所有事',
    mount(root, ctx) {
      const offs = [];
      root.innerHTML = `
        <div class="jr">
          <div class="jr-head"><h3>手 记</h3><span id="jrN"></span></div>
          <div class="jr-list" id="jrList"></div>
        </div>`;
      const list = root.querySelector('#jrList');
      const nEl = root.querySelector('#jrN');

      function render() {
        const items = ctx.state.journal || [];
        nEl.textContent = `共 ${items.length} 条`;
        if (!items.length) {
          list.innerHTML = '<div class="jr-empty">还没有记录</div>';
          return;
        }
        list.innerHTML = items
          .slice(0, 120)
          .map(
            (it) => `<div class="jr-item" data-k="${it.kind || 'note'}">
              <time>${Store.dayStamp(new Date(it.t))}</time>${it.text}
            </div>`
          )
          .join('');
      }

      render();
      offs.push(ctx.on('journal', render));

      return {
        destroy() {
          offs.forEach((f) => f());
        }
      };
    }
  });
})();
