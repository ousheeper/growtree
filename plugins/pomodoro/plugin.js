/**
 * 插件：专注钟（25 分钟）—— 完成时额外灌溉这棵树
 */
(function () {
  'use strict';

  const MIN = 25 * 60 * 1000;

  function mmss(ms) {
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }

  window.GrowTree.register({
    id: 'pomodoro',
    name: '专注',
    icon: '◷',
    desc: '番茄钟，完成后自动灌溉',
    mount(root, ctx) {
      const p = ctx.state.pomo || (ctx.state.pomo = { running: false, endsAt: 0, remain: MIN, total: MIN, done: 0 });

      root.innerHTML = `
        <div class="pomo">
          <h3>专 注</h3>
          <div class="ring" id="pRing">
            <div class="time" id="pTime">25:00</div>
            <div class="lbl" id="pLbl">待 机</div>
          </div>
          <div class="pomo-ctrls">
            <button class="btn primary" id="pStart">开始</button>
            <button class="btn ghost" id="pReset">重置</button>
          </div>
          <div class="pomo-tip">专注结束时，这棵树会额外长 60 点。<br>已完成 ${p.done} 轮</div>
        </div>`;

      const ring = root.querySelector('#pRing');
      const timeEl = root.querySelector('#pTime');
      const lbl = root.querySelector('#pLbl');
      const btn = root.querySelector('#pStart');
      const tip = root.querySelector('.pomo-tip');

      let timer = null;

      function left() {
        return p.running ? Math.max(0, p.endsAt - Date.now()) : p.remain;
      }

      function paint() {
        const ms = left();
        const ratio = 1 - ms / p.total;
        ring.style.setProperty('--deg', (ratio * 360).toFixed(1) + 'deg');
        timeEl.textContent = mmss(ms);
        lbl.textContent = p.running ? '专 注 中' : ms === p.total ? '待 机' : '已 暂 停';
        btn.textContent = p.running ? '暂停' : '开始';
      }

      function finish() {
        p.running = false;
        p.remain = p.total;
        p.endsAt = 0;
        p.done = (p.done || 0) + 1;
        ctx.patch(() => {});
        ctx.addXp(60, 'focus');
        ctx.log(`完成第 ${p.done} 轮专注，把攒下的注意力全浇进了树里。`, 'feed');
        ctx.toast('专注完成 · 额外生长 60 点');
        tip.innerHTML = `专注结束时，这棵树会额外长 60 点。<br>已完成 ${p.done} 轮`;
        paint();
      }

      function loop() {
        if (p.running && Date.now() >= p.endsAt) {
          finish();
          return;
        }
        paint();
      }

      btn.onclick = () => {
        if (p.running) {
          p.remain = left();
          p.running = false;
        } else {
          if (p.remain <= 1000) p.remain = p.total;
          p.endsAt = Date.now() + p.remain;
          p.running = true;
        }
        ctx.patch(() => {});
        paint();
      };

      root.querySelector('#pReset').onclick = () => {
        p.running = false;
        p.remain = p.total;
        p.endsAt = 0;
        ctx.patch(() => {});
        paint();
      };

      // 重新进入面板时补算离线进度
      if (p.running && Date.now() >= p.endsAt) finish();
      paint();
      timer = setInterval(loop, 500);

      return {
        destroy() {
          clearInterval(timer);
          if (p.running) p.remain = left();
          ctx.patch(() => {});
        }
      };
    }
  });
})();
