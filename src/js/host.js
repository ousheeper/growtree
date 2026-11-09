/**
 * 插件宿主：注册 / Tab 栏 / 挂载 / 插件管理面板
 */
(function () {
  'use strict';

  const registry = new Map();

  const Host = {
    active: null,
    instance: null,
    el: {},
    news: new Set(), // 没打开过的插件里发生了值得看的事（成就/收录）

    init() {
      this.el.tabs = document.getElementById('tabs');
      this.el.body = document.getElementById('panelBody');
      Bus.on('refresh-tabs', () => this.renderTabs());
      // 有成就解锁：给「成就」标签挂一个小金点，点进去就消掉
      Bus.on('achievement', () => {
        // 面板关着的时候，哪怕正停在成就页，也要点一下小点提醒
        const panelOpen = !Store.state || !Store.state.ui || Store.state.ui.panelOpen !== false;
        if (this.active !== 'achievements' || !panelOpen) {
          this.news.add('achievements');
          this.renderTabs();
        }
      });
    },

    register(meta) {
      if (!meta || !meta.id || typeof meta.mount !== 'function') {
        console.warn('[host] 插件注册信息不完整，已忽略', meta);
        return;
      }
      registry.set(meta.id, Object.assign({ icon: '◈', name: meta.id, desc: '' }, meta));
    },

    all() {
      return Array.from(registry.values());
    },

    /* 新版本带了一个新插件：老存档的启用列表里没有它，
     * 自动补进去一次；用户自己关掉的旧插件不受影响（known 里已经有它了） */
    syncNew() {
      const cfg = Store.state && Store.state.plugins;
      if (!cfg) return;
      const ids = this.all().map((p) => p.id);
      // 老存档没有 known：用 order 当「上次见过哪些插件」的近似，
      // 免得把用户故意关掉的旧插件又打开
      const known = Array.isArray(cfg.known) ? cfg.known : Array.isArray(cfg.order) ? cfg.order : [];
      const added = ids.filter((id) => !known.includes(id));
      if (Array.isArray(cfg.enabled)) {
        added.forEach((id) => {
          if (!cfg.enabled.includes(id)) cfg.enabled.push(id);
        });
      }
      cfg.known = ids.slice();
      if (added.length) Store.saveSoon();
    },

    /** 按用户配置（启用/顺序）过滤 */
    enabledList() {
      const cfg = Store.state.plugins;
      const list = this.all();
      const enabledIds = Array.isArray(cfg.enabled) ? cfg.enabled : null;
      const order = Array.isArray(cfg.order) ? cfg.order : [];
      const filtered = enabledIds ? list.filter((p) => enabledIds.includes(p.id)) : list.slice();
      filtered.sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      return filtered;
    },

    renderTabs() {
      const tabs = this.el.tabs;
      const list = this.enabledList();
      tabs.innerHTML = '';
      for (const p of list) {
        const b = document.createElement('button');
        b.className = 'tab' + (this.active === p.id ? ' on' : '') + (this.news.has(p.id) ? ' has-new' : '');
        b.dataset.id = p.id;
        b.title = p.desc || p.name;
        b.innerHTML = `<span class="tab-ico">${p.icon}</span><span class="tab-txt">${p.name}</span>`;
        b.onclick = () => this.mount(p.id);
        tabs.appendChild(b);
      }
      const gear = document.getElementById('tabGear');
      if (gear) {
        gear.classList.toggle('on', this.active === '__manager');
        gear.onclick = () => this.mount('__manager');
      }
    },

    ctx(id) {
      return {
        id,
        get state() {
          return Store.state;
        },
        patch(fn) {
          if (typeof fn === 'function') fn(Store.state);
          Store.notePalette();
          Store.saveSoon();
          Bus.emit('state-changed');
        },
        log: (t, k) => Store.log(t, k),
        addXp: (n, r) => Store.addXp(n, r),
        save: () => Store.save(),
        refreshTree: (animate) => Bus.emit('refresh-tree', animate !== false),
        burst: (n) => Bus.emit('burst', n || 8),
        toast: (text) => Bus.emit('toast', text),
        ask: (opts) => (window.__app ? window.__app.askConfirm(opts) : Promise.resolve(false)),
        on: (evt, fn) => Bus.on(evt, fn),
        scale: (v) => window.__app && window.__app.applyScale(v, true),
        uiFlag: (k, v) => window.__app && window.__app.setUiFlag(k, v),
        sunSize: (px) => window.__app && window.__app.setSunSize(px),
        plugins: () => this.all(),
        switchTo: (pid) => this.mount(pid)
      };
    },

    mount(id) {
      if (this.instance && typeof this.instance.destroy === 'function') {
        try {
          this.instance.destroy();
        } catch (e) {
          console.error('[host] destroy error', e);
        }
      }
      this.instance = null;
      this.el.body.innerHTML = '';
      this.el.body.classList.remove('has-detail');
      this.active = id;
      if (this.news.has(id)) {
        this.news.delete(id);
      }

      if (id === '__manager') {
        this.renderManager(this.el.body);
      } else {
        const p = registry.get(id);
        if (!p) {
          this.el.body.innerHTML = '<div class="empty">插件不存在</div>';
        } else {
          try {
            this.instance = p.mount(this.el.body, this.ctx(id)) || null;
            if (window.__app && window.__app.built) Bus.emit('tree-stats', window.__app.built.stats);
          } catch (e) {
            console.error('[host] mount error', id, e);
            this.el.body.innerHTML = `<div class="empty">插件 ${p.name} 加载失败<br><small>${String(e.message || e)}</small></div>`;
          }
          Store.state.plugins.active = id;
          Store.saveSoon();
        }
      }
      this.renderTabs();
    },

    /* ---------------- 插件管理 ---------------- */
    renderManager(el) {
      const all = this.all();
      const cfg = Store.state.plugins;
      const enabledIds = Array.isArray(cfg.enabled) ? cfg.enabled.slice() : all.map((p) => p.id);

      el.innerHTML = `
        <div class="pm">
          <div class="pm-head">
            <div class="pm-title">插件管理</div>
            <div class="pm-sub">插槽 ${enabledIds.length} / ${all.length} · 目录 <code>plugins/</code></div>
          </div>
          <div class="pm-list"></div>
          <div class="pm-actions">
            <button class="btn ghost" id="pmOpen">打开插件目录</button>
            <button class="btn ghost" id="pmReload">重新加载</button>
          </div>
          <div class="pm-tip">
            新建插件：在 <code>plugins/</code> 下建文件夹，放入 <code>plugin.js</code>，
            调用 <code>GrowTree.register({ id, name, icon, mount(el, ctx) })</code>。
            点「重新加载」即可生效。
          </div>
        </div>`;

      const listEl = el.querySelector('.pm-list');
      all.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'pm-row';
        row.innerHTML = `
          <span class="pm-ico">${p.icon}</span>
          <span class="pm-name">${p.name}<small>${p.id}</small></span>
          <span class="pm-move">
            <button class="mini" data-act="up">↑</button>
            <button class="mini" data-act="down">↓</button>
          </span>
          <label class="switch"><input type="checkbox" ${enabledIds.includes(p.id) ? 'checked' : ''}><i></i></label>`;
        row.querySelector('input').onchange = (e) => {
          let arr = Array.isArray(Store.state.plugins.enabled) ? Store.state.plugins.enabled.slice() : all.map((x) => x.id);
          if (e.target.checked) {
            if (!arr.includes(p.id)) arr.push(p.id);
          } else {
            arr = arr.filter((x) => x !== p.id);
          }
          Store.state.plugins.enabled = arr;
          Store.saveSoon();
          this.renderManager(el);
          this.renderTabs();
          if (!arr.length) Bus.emit('toast', '所有插件都已关闭，可以从插件目录再放回来');
        };
        const move = (dir) => {
          const order = Array.isArray(Store.state.plugins.order) && Store.state.plugins.order.length ? Store.state.plugins.order.slice() : all.map((x) => x.id);
          const i = order.indexOf(p.id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= order.length) return;
          [order[i], order[j]] = [order[j], order[i]];
          Store.state.plugins.order = order;
          Store.saveSoon();
          this.renderManager(el);
          this.renderTabs();
        };
        row.querySelector('[data-act="up"]').onclick = () => move(-1);
        row.querySelector('[data-act="down"]').onclick = () => move(1);
        listEl.appendChild(row);
      });

      el.querySelector('#pmOpen').onclick = async () => {
        const dir = await window.native.openPluginsDir();
        Bus.emit('toast', '已打开 ' + dir);
      };
      el.querySelector('#pmReload').onclick = () => window.native.reloadPlugins();
    }
  };

  window.GrowTree = {
    register: (meta) => Host.register(meta),
    host: Host
  };
  window.Host = Host;
})();
