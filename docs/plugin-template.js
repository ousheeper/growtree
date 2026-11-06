/**
 * 插件模板 —— 复制到 plugins/<你的id>/plugin.js 即可生效
 *
 * 目录结构：
 *   plugins/
 *     my-plugin/
 *       plugin.js      ← 唯一必需文件
 *
 * 写完点面板里的 ⚙ →「重新加载」，或重启应用。
 */
GrowTree.register({
  id: 'my-plugin',        // 唯一 id，建议与文件夹名一致
  name: '示范',            // 面板标签上显示的名字
  icon: '✦',              // 标签图标（任意单字符）
  desc: '一句话说明这个插件做什么',

  /**
   * @param {HTMLElement} el  面板容器，直接往里写 DOM
   * @param {object} ctx      宿主能力
   * @returns {{destroy?: Function, update?: Function}|void}
   */
  mount(el, ctx) {
    // ctx.state      → 全局状态（只读观察，写入请用 ctx.patch）
    // ctx.patch(fn)  → 修改状态并落盘，fn 收到 state
    // ctx.addXp(n)   → 加生长值，可能触发升级
    // ctx.log(t, k)  → 写入「手记」，k = grow | feed | codex | note
    // ctx.refreshTree(animate) → 重绘树
    // ctx.burst(n)   → 在树根爆一圈粒子
    // ctx.toast(msg) → 底部浮出提示
    // ctx.on(evt, fn)→ 订阅事件，返回取消函数
    //                   evt: xp | levelup | codex | journal | genes | tree-stats

    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <h3 style="font-size:14px;letter-spacing:3px;font-weight:500">示 范 插 件</h3>
        <p style="font-size:11px;color:#9b90b4;line-height:1.7">
          这棵树的生长周期是 <b style="color:#e6c684">${ctx.state.level}</b>，
          已收录 <b style="color:#e6c684">${ctx.state.codex.length}</b> 条词条。
        </p>
        <button class="btn primary" id="demo">给它浇一次水 (+10)</button>
      </div>`;

    el.querySelector('#demo').onclick = () => {
      ctx.addXp(10, 'manual');
      ctx.burst(12);
      ctx.toast('浇水 +10');
      ctx.log('有人从面板里递来一杯水。', 'feed');
    };

    // 订阅事件，记得在 destroy 里取消
    const off = ctx.on('levelup', ({ level }) => {
      el.querySelector('h3').textContent = `示 范 插 件 · LV${level}`;
    });

    return {
      destroy() {
        off();
      }
    };
  }
});
