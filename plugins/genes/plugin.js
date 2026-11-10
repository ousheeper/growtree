/**
 * 插件：基因编辑器 —— 树的形态、挂果种类、缩放，全部实时生效
 */
(function () {
  'use strict';

  const SLIDERS = [
    { key: 'height', group: 'shape', name: '主干高度', min: 0.2, max: 1, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'spread', group: 'shape', name: '分叉张角', min: 0.15, max: 0.8, step: 0.01, fmt: (v) => Math.round(v * 180) + '°' },
    { key: 'irregular', group: 'shape', name: '枝条扭曲', min: 0, max: 0.75, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'branches', group: 'shape', name: '分叉数量', min: 2, max: 4, step: 1, fmt: (v) => v + ' 叉' },
    { key: 'leafDensity', group: 'leaf', name: '叶片密度', min: 0, max: 1.5, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'decoRate', group: 'leaf', name: '挂果密度', min: 0, max: 1.4, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'sunPull', group: 'leaf', name: '向光强度', min: 0, max: 1.2, step: 0.01, fmt: (v) => Math.round(v * 100) + '%' }
  ];

  const SPECIES_TOGGLES = [
    { key: 'flower', name: '花', desc: '5 瓣花 / 垂铃 / 眼' },
    { key: 'fruit', name: '果', desc: '成串浆果' },
    { key: 'mushroom', name: '菌', desc: '小伞菌' },
    { key: 'crystal', name: '晶', desc: '晶簇' }
  ];

  const DEFAULTS = {
    seed: 20261106,
    height: 0.55,
    spread: 0.3,
    irregular: 0.36,
    branches: 3,
    leafDensity: 0.8,
    decoRate: 0.62,
    sunPull: 0.8,
    species: { flower: true, fruit: true, mushroom: true, crystal: true },
    palette: 'cthulhu'
  };

  window.GrowTree.register({
    id: 'genes',
    name: '基因',
    icon: '✎',
    desc: '调整树的形态、挂果种类、缩放与种子',
    mount(root, ctx) {
      const genes = ctx.state.genes;
      let pending = null;

      root.innerHTML = `
        <div class="gen">
          <div class="gen-head">
            <h3>基 因</h3>
            <p>改动立刻作用到桌面的树上。换一组种子，就是另一棵树。</p>
          </div>

          <div class="gen-group">
            <div class="gen-gt">形态</div>
            <div id="gShape"></div>
          </div>

          <div class="gen-group">
            <div class="gen-gt">枝叶与挂果</div>
            <div id="gLeaf"></div>
            <div class="gen-row" style="margin-top:10px">
              <div class="lb"><span>挂果种类</span><b class="hint">新枝头才会长</b></div>
              <div class="sp-toggles" id="gSpecies"></div>
            </div>
          </div>

          <div class="gen-group">
            <div class="gen-gt">显示</div>
            <div class="gen-row">
              <div class="lb"><span>整体缩放</span><b id="lb-scale"></b></div>
              <input type="range" id="gScale" min="0.7" max="1.5" step="0.05" value="${ctx.state.ui.scale || 1}">
            </div>
            <div class="hint-line">也可以按住 Ctrl 在小组件上滚动滚轮</div>
            <label class="gen-toggle">
              <span class="lb"><span>上下栏只在鼠标移入时出现</span><small>移开后淡出，桌面上只留一棵树</small></span>
              <span class="switch"><input type="checkbox" id="gBars" ${ctx.state.ui.barsAutoHide ? 'checked' : ''}><i></i></span>
            </label>
          </div>

          <div class="gen-group">
            <div class="gen-gt">声音</div>
            <label class="gen-toggle" style="margin-top:0">
              <span class="lb"><span>音效</span><small>浇水、修剪、收获、升级的轻音</small></span>
              <span class="switch"><input type="checkbox" id="gSound" ${ctx.state.ui.soundOn !== false ? 'checked' : ''}><i></i></span>
            </label>
            <div class="gen-row">
              <div class="lb"><span>音量</span><b id="lb-vol"></b></div>
              <input type="range" id="gVol" min="0" max="100" step="5" value="${Math.round((ctx.state.ui.soundVolume == null ? 0.5 : ctx.state.ui.soundVolume) * 100)}">
            </div>
            <div class="hint-line">下雨时会有很轻的雨声；关掉后完全静音</div>
          </div>

          <div class="gen-group">
            <div class="gen-gt">真实天气</div>
            <label class="gen-toggle" style="margin-top:0">
              <span class="lb"><span>联网获取真实天气</span><small>按你所在地的实时天气与温度来</small></span>
              <span class="switch"><input type="checkbox" id="gLive" ${ctx.state.ui.liveWeather ? 'checked' : ''}><i></i></span>
            </label>
            <div class="hint-line" style="line-height:1.7">开启后会自动按 IP 定位，从 Open-Meteo（免费、无需注册）拉取当前天气与温度，覆盖内置模拟天气；温度会微调土壤风干速度。<b style="color:var(--muted)">断网或拉取失败会自动回退到内置模拟，不会报错。</b>不联网时保持原来的模拟天气。</div>
          </div>

          <div class="gen-group">
            <div class="gen-gt">花色</div>
            <div class="palettes" id="gPal"></div>
          </div>

          <div class="gen-group">
            <div class="gen-gt">种子</div>
            <div class="seedrow">
              <input type="number" id="gSeed" min="1" max="99999999">
              <button class="btn" id="gDice" title="随机播种">⟳</button>
            </div>
            <div class="seedrow" style="margin-top:8px">
              <button class="btn primary" id="gApply">重新播种</button>
              <button class="btn ghost" id="gReset">恢复默认</button>
            </div>
          </div>
        </div>`;

      const rowsEl = { shape: root.querySelector('#gShape'), leaf: root.querySelector('#gLeaf') };

      function repaint(animate) {
        cancelAnimationFrame(pending);
        pending = requestAnimationFrame(() => ctx.refreshTree(!!animate));
      }

      SLIDERS.forEach((s) => {
        const wrap = document.createElement('div');
        wrap.className = 'gen-row';
        wrap.innerHTML = `
          <div class="lb"><span>${s.name}</span><b id="lb-${s.key}"></b></div>
          <input type="range" id="sl-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}" value="${genes[s.key] == null ? s.min : genes[s.key]}">`;
        rowsEl[s.group].appendChild(wrap);
        const input = wrap.querySelector('input');
        const lb = wrap.querySelector('b');
        const sync = () => (lb.textContent = s.fmt(Number(input.value)));
        sync();
        input.oninput = () => {
          genes[s.key] = Number(input.value);
          sync();
          ctx.patch(() => {});
          repaint(false);
        };
      });

      /* 挂果种类开关 */
      const spEl = root.querySelector('#gSpecies');
      spEl.innerHTML = SPECIES_TOGGLES.map(
        (s) => `<label class="sp-row" data-k="${s.key}">
          <span class="sp-n">${s.name}<small>${s.desc}</small></span>
          <span class="switch"><input type="checkbox" ${genes.species[s.key] !== false ? 'checked' : ''}><i></i></span>
        </label>`
      ).join('');
      spEl.querySelectorAll('input').forEach((cb) => {
        cb.onchange = () => {
          const k = cb.closest('.sp-row').dataset.k;
          genes.species[k] = cb.checked;
          ctx.patch(() => {});
          repaint(true);
        };
      });

      /* 缩放 */
      const scaleInput = root.querySelector('#gScale');
      const scaleLb = root.querySelector('#lb-scale');
      const syncScale = () => (scaleLb.textContent = Math.round(Number(scaleInput.value) * 100) + '%');
      syncScale();
      scaleInput.oninput = () => {
        syncScale();
        ctx.scale(Number(scaleInput.value));
      };

      /* 声音 */
      const sndCb = root.querySelector('#gSound');
      const volInput = root.querySelector('#gVol');
      const volLb = root.querySelector('#lb-vol');
      const syncVol = () => (volLb.textContent = volInput.value + '%');
      syncVol();
      sndCb.onchange = () => ctx.uiFlag('soundOn', sndCb.checked);
      volInput.oninput = () => {
        syncVol();
        ctx.uiFlag('soundVolume', Number(volInput.value) / 100);
      };

      /* 上下栏自动隐藏 */
      const barsCb = root.querySelector('#gBars');
      barsCb.onchange = () => ctx.uiFlag('barsAutoHide', barsCb.checked);

      /* 联网真实天气 */
      const liveCb = root.querySelector('#gLive');
      liveCb.onchange = () => ctx.uiFlag('liveWeather', liveCb.checked);

      /* 花色 */
      const pal = root.querySelector('#gPal');
      const paletteDots = {
        cthulhu: ['#255043', '#c79bff', '#ff9dc4'],
        sakura: ['#4c8059', '#ff8fb3', '#fff0f6'],
        ember: ['#6d3a26', '#ff7a3d', '#ffd9a0'],
        void: ['#4b3f85', '#7fe0ff', '#ff9dc4']
      };
      pal.innerHTML = Object.keys(window.TreeGen.PALETTES)
        .map(
          (k) => `<button class="pal${genes.palette === k ? ' on' : ''}" data-p="${k}">
            <span class="dots">${paletteDots[k].map((c) => `<i style="background:${c}"></i>`).join('')}</span>
            ${window.TreeGen.PALETTES[k].name}
          </button>`
        )
        .join('');
      pal.querySelectorAll('[data-p]').forEach((b) => {
        b.onclick = () => {
          genes.palette = b.dataset.p;
          pal.querySelectorAll('.pal').forEach((x) => x.classList.remove('on'));
          b.classList.add('on');
          ctx.patch(() => {});
          repaint(true);
        };
      });

      /* 种子 */
      const seedInput = root.querySelector('#gSeed');
      seedInput.value = genes.seed;

      function applySeed(v) {
        genes.seed = v;
        seedInput.value = v;
        ctx.patch(() => {});
        repaint(true);
      }

      root.querySelector('#gDice').onclick = () => applySeed(Math.floor(Math.random() * 99999999) + 1);
      root.querySelector('#gApply').onclick = () => {
        const v = parseInt(seedInput.value, 10) || Math.floor(Math.random() * 99999999) + 1;
        applySeed(v);
        ctx.log(`换了种子 #${v}，树在土里重新组织了一遍自己。`, 'grow');
        ctx.toast('已重新播种 #' + v);
      };
      root.querySelector('#gReset').onclick = () => {
        Object.assign(genes, JSON.parse(JSON.stringify(DEFAULTS)));
        ctx.patch(() => {});
        SLIDERS.forEach((s) => {
          root.querySelector('#sl-' + s.key).value = DEFAULTS[s.key];
          root.querySelector('#lb-' + s.key).textContent = s.fmt(DEFAULTS[s.key]);
        });
        spEl.querySelectorAll('input').forEach((cb) => (cb.checked = true));
        pal.querySelectorAll('.pal').forEach((x) => x.classList.toggle('on', x.dataset.p === 'cthulhu'));
        seedInput.value = DEFAULTS.seed;
        ctx.scale(1);
        scaleInput.value = 1;
        syncScale();
        repaint(true);
        ctx.toast('已恢复默认基因');
      };

      seedInput.onchange = () => {
        const v = parseInt(seedInput.value, 10);
        if (v > 0) applySeed(v);
      };

      return {
        destroy() {
          cancelAnimationFrame(pending);
        }
      };
    }
  });
})();
