/**
 * 操作特效层：水壶倒水 / 剪刀剪枝 / 收获入篮 / 升级光环
 * 全部是 DOM + CSS 动画，用完即焚，不参与树的渲染。
 * 坐标用视口坐标（clientX/Y），和 #fx 覆盖层一致。
 */
(function () {
  'use strict';

  const layer = () => document.getElementById('fx');

  function spawn(cls, x, y, inner, ttl) {
    const host = layer();
    if (!host) return null;
    const el = document.createElement('div');
    el.className = 'fx-item ' + cls;
    el.style.left = Math.round(x) + 'px';
    el.style.top = Math.round(y) + 'px';
    el.innerHTML = inner;
    host.appendChild(el);
    setTimeout(() => el.remove(), ttl || 1600);
    return el;
  }

  const CAN = `
    <svg class="fx-can-art" viewBox="0 0 78 62" width="86" height="68" aria-hidden="true">
      <defs>
        <linearGradient id="fxCanG" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#a9e6d7"/>
          <stop offset="0.55" stop-color="#63b3a4"/>
          <stop offset="1" stop-color="#3d7f76"/>
        </linearGradient>
      </defs>
      <path d="M30 18 L8 6 L3 12 L25 28 Z" fill="#4d8f85" stroke="#1d3b36" stroke-width="1.5" stroke-linejoin="round"/>
      <ellipse cx="6" cy="9" rx="6.5" ry="4.4" fill="#7fc6b8" stroke="#1d3b36" stroke-width="1.4" transform="rotate(-28 6 9)"/>
      <rect x="24" y="20" width="38" height="30" rx="9" fill="url(#fxCanG)" stroke="#1d3b36" stroke-width="1.5"/>
      <rect x="28" y="24" width="11" height="17" rx="5.5" fill="#ffffff" opacity=".3"/>
      <path d="M58 26 q13 4 11 15 q-2 9 -12 8" fill="none" stroke="#1d3b36" stroke-width="5" stroke-linecap="round"/>
      <path d="M58 26 q13 4 11 15 q-2 9 -12 8" fill="none" stroke="#63b3a4" stroke-width="2.6" stroke-linecap="round"/>
      <ellipse cx="39" cy="20" rx="13" ry="4.6" fill="#7fc6b8" stroke="#1d3b36" stroke-width="1.4"/>
      <ellipse cx="39" cy="19.4" rx="8.4" ry="2.8" fill="#bfeee2"/>
    </svg>
    <span class="fx-water"></span>
    <i class="fx-drop" style="--i:0"></i><i class="fx-drop" style="--i:1"></i>
    <i class="fx-drop" style="--i:2"></i><i class="fx-drop" style="--i:3"></i>
    <i class="fx-drop" style="--i:4"></i><i class="fx-drop" style="--i:5"></i>`;

  const SHEAR = `
    <svg class="fx-shear-art" viewBox="0 0 60 60" width="66" height="66" aria-hidden="true">
      <g class="fx-blade b1">
        <path d="M31 31 L8 9" stroke="#dfe5f2" stroke-width="5.4" stroke-linecap="round"/>
        <path d="M31 31 L48 48" stroke="#9aa3b8" stroke-width="3.2" stroke-linecap="round"/>
        <circle cx="50" cy="50" r="4.4" fill="none" stroke="#e0a94f" stroke-width="2.8"/>
      </g>
      <g class="fx-blade b2">
        <path d="M31 31 L19 5" stroke="#c9d1e2" stroke-width="5.4" stroke-linecap="round"/>
        <path d="M31 31 L53 42" stroke="#9aa3b8" stroke-width="3.2" stroke-linecap="round"/>
        <circle cx="54.5" cy="43" r="4.4" fill="none" stroke="#e0a94f" stroke-width="2.8"/>
      </g>
      <circle cx="31" cy="31" r="2.9" fill="#7e8699"/>
      <g class="fx-snip-flash"><circle cx="24" cy="20" r="11" fill="#ffe9b0" opacity=".5"/></g>
    </svg>
    <i class="fx-chip" style="--i:0"></i><i class="fx-chip" style="--i:1"></i>
    <i class="fx-chip" style="--i:2"></i><i class="fx-chip" style="--i:3"></i>`;

  const HAND = `
    <svg class="fx-hand-art" viewBox="0 0 40 44" width="56" height="62" aria-hidden="true">
      <path d="M25 19q7 0 7.6 5.6 0.6 5.6-5.6 6.6" fill="#ffe2c6" stroke="#3a2716" stroke-width="1.7" stroke-linejoin="round"/>
      <rect x="10.5" y="17" width="22" height="23" rx="9.5" fill="#ffe2c6" stroke="#3a2716" stroke-width="1.7"/>
      <path d="M17.5 29.5h9M16.5 34h11" stroke="#e2b08a" stroke-width="1.3" stroke-linecap="round" opacity=".9"/>
      <rect x="15.5" y="2" width="7.4" height="20" rx="3.7" fill="#ffe2c6" stroke="#3a2716" stroke-width="1.7"/>
      <path d="M19.6 8.5v6" stroke="#e8b893" stroke-width="1.1" stroke-linecap="round" opacity=".65"/>
    </svg>
    <span class="fx-tap"></span>`;

  const BASKET = `
    <svg class="fx-basket-art" viewBox="0 0 56 48" width="42" height="36" aria-hidden="true">
      <path d="M8 16 h40 l-5 24 a6 6 0 0 1 -6 5 H19 a6 6 0 0 1 -6 -5 Z" fill="#a97c4e"/>
      <path d="M8 16 h40 l-5 24 a6 6 0 0 1 -6 5 H19 a6 6 0 0 1 -6 -5 Z" fill="none" stroke="#7d5733" stroke-width="1.6"/>
      <path d="M11 24 h34 M12.5 33 h31" stroke="#7d5733" stroke-width="1.5" opacity=".55"/>
      <ellipse cx="28" cy="16" rx="20" ry="5.4" fill="#c79a67"/>
      <path d="M18 16 q10 -13 20 0" fill="none" stroke="#8a6238" stroke-width="2.6" stroke-linecap="round"/>
    </svg>`;

  window.Fx = {
    /** 浇水：水壶从右侧倾过来倒水 */
    water(x, y) {
      const el = spawn('fx-watering', x + 62, y - 104, CAN, 2100);
      if (el) el.style.setProperty('--tilt', '-1');
    },

    /** 修剪：剪刀在剪口闭合两下 + 木屑飞散 */
    shear(x, y) {
      spawn('fx-shearing', x, y, SHEAR, 1400);
    },

    /** 收获：小篮子从下方升起，果子往上飘 */
    pick(x, y, color) {
      const el = spawn('fx-picking', x, y + 26, BASKET +
        '<i class="fx-mote" style="--i:0"></i><i class="fx-mote" style="--i:1"></i><i class="fx-mote" style="--i:2"></i>', 1300);
      if (el && color) el.style.setProperty('--spark', color);
    },

    /** 点击：一只手伸过来点两下 */
    poke(x, y) {
      spawn('fx-poking', x, y + 27, HAND, 1100);
    },

    /** 升级：树根处扩散的光环 + 上升光点 + LV 文字 */
    levelUp(level, x, y) {
      const inner = `<span class="fx-ring"></span><span class="fx-ring d2"></span>
        <i class="fx-mote" style="--i:0"></i><i class="fx-mote" style="--i:1"></i>
        <i class="fx-mote" style="--i:2"></i><i class="fx-mote" style="--i:3"></i>
        <i class="fx-mote" style="--i:4"></i>
        <b class="fx-lv">LV ${level}</b>`;
      spawn('fx-leveling', x, y, inner, 2200);
    },
  };
})();
