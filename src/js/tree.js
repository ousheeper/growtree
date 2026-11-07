/**
 * 程序化生长树 —— 纯 SVG 生成器
 *
 * 关键设计：每个枝节点用「路径 + 种子」派生的独立随机数（path hashing），
 * 所以同一棵树在等级变化、剪枝、换配色时，未受影响的部分不会乱跳——
 * 这样才能真的"慢慢长大"，剪掉的枝也真的不会再长回来。
 */
(function () {
  'use strict';

  const W = 460;
  const H = 800;
  const GROUND = H - 170;

  const PALETTES = {
    cthulhu: {
      name: '克苏鲁',
      barkA: '#574a40',
      barkB: '#c8bcaa',
      barkC: '#f0e8da',
      leaf: ['#255043', '#357055', '#1d3f36', '#3f7d5e'],
      flower: ['#ff9dc4', '#c79bff', '#f4d9ff', '#a98bff'],
      fruit: ['#7b3fb0', '#9d5ad0', '#4d2a74'],
      shroom: ['#e8ded1', '#cbb9a6'],
      crystal: ['#8fe6ff', '#b5a6ff'],
      heart: '#f3d08a',
      glow: '#9b6bff'
    },
    sakura: {
      name: '绯樱',
      barkA: '#6b5a4c',
      barkB: '#ddcfbe',
      barkC: '#f7ece0',
      leaf: ['#4c8059', '#67a878', '#3c6a49'],
      flower: ['#ffc2d6', '#ff8fb3', '#fff0f6', '#ffb3c9'],
      fruit: ['#ff6f91', '#ff9db1', '#d94f74'],
      shroom: ['#f7ead9', '#e2cdb8'],
      crystal: ['#bfe6ff', '#e6d9ff'],
      heart: '#ffe6a8',
      glow: '#ff9ec4'
    },
    ember: {
      name: '余烬',
      barkA: '#4d382c',
      barkB: '#cfb191',
      barkC: '#f2d9b8',
      leaf: ['#6d3a26', '#9c5a2f', '#4a2a1e'],
      flower: ['#ffb46b', '#ff7a3d', '#ffd9a0', '#e85f2a'],
      fruit: ['#ff7a3d', '#e0552a', '#b8401f'],
      shroom: ['#efdcb8', '#d8bd91'],
      crystal: ['#ffd39a', '#ffb46b'],
      heart: '#ffe6b0',
      glow: '#ff8a3d'
    },
    void: {
      name: '虚空',
      barkA: '#332e46',
      barkB: '#b9b2d6',
      barkC: '#e6e1f7',
      leaf: ['#33295a', '#4b3f85', '#241d42'],
      flower: ['#b58cff', '#7fe0ff', '#ff9dc4', '#d0b8ff'],
      fruit: ['#7c5bff', '#9d7bff', '#4b3fa8'],
      shroom: ['#cfc9e8', '#b3a9d6'],
      crystal: ['#7fe0ff', '#b58cff'],
      heart: '#e9d6ff',
      glow: '#7c5bff'
    }
  };

  const SPECIES = {
    bloom: { cat: 'flower', weight: 3.2, minLevel: 1 },
    bell: { cat: 'flower', weight: 2.0, minLevel: 2 },
    eye: { cat: 'flower', weight: 0.55, minLevel: 6 },
    fruit: { cat: 'fruit', weight: 3.4, minLevel: 2 },
    mushroom: { cat: 'mushroom', weight: 2.1, minLevel: 3 },
    crystal: { cat: 'crystal', weight: 1.7, minLevel: 4 }
  };

  const CAT_MAX = { flower: 13, fruit: 9, mushroom: 7, crystal: 6 };

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const r1 = (n) => Math.round(n * 10) / 10;

  /* ---------------- 构件 ---------------- */
  function leaf(x, y, rot, sc, color, op) {
    return `<path class="leaf" d="M0 0 C3.2 -4.3,8.4 -4.7,11 0 C8.4 4.7,3.2 4.3,0 0Z" fill="${color}"${op ? ` opacity="${op}"` : ''} transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(rot)}) scale(${sc.toFixed(2)})"/>`;
  }

  function bloom(x, y, sc, c1, c2, heart) {
    const g = [`<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc.toFixed(2)})"><g class="fl">`];
    g.push(`<circle r="11" fill="${c1}" opacity=".13"/>`);
    for (let i = 0; i < 5; i++) {
      g.push(`<ellipse cx="0" cy="-5.1" rx="3.3" ry="5.3" fill="${c1}" transform="rotate(${i * 72})" opacity=".95"/>`);
    }
    for (let i = 0; i < 5; i++) {
      g.push(`<ellipse cx="0" cy="-3" rx="1.4" ry="2.5" fill="${c2}" transform="rotate(${i * 72 + 36})" opacity=".7"/>`);
    }
    g.push(`<circle r="1.7" fill="${heart}"/>`);
    g.push('</g></g>');
    return g.join('');
  }

  function bell(x, y, sc, c1, c2) {
    const g = [`<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc.toFixed(2)})"><g class="fl">`];
    g.push(`<circle r="9" cy="4" fill="${c1}" opacity=".12"/>`);
    g.push(`<path d="M0 -12 q2.6 7 0.4 13" stroke="${c1}" stroke-width="1.2" fill="none" opacity=".6" stroke-linecap="round"/>`);
    const spots = [
      [-4.5, 1.5],
      [1.5, 5],
      [6, 0.5]
    ];
    for (const [bx, by] of spots) {
      g.push(`<path d="M${bx} ${by} c4.2 -2.2 6.4 2.6 2.2 6.4 c-4.2 3.2 -8.4 -1.2 -4.2 -6.4 Z" fill="${c1}" opacity=".95"/>`);
      g.push(`<path d="M${bx + 1} ${by + 2.6} c2.6 0.2 2.6 3 -0.2 3.8" stroke="${c2}" stroke-width=".7" fill="none" opacity=".75"/>`);
    }
    g.push('</g></g>');
    return g.join('');
  }

  function eye(x, y, sc, c1) {
    return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc.toFixed(2)})"><g class="fl eye">
      <ellipse rx="6.4" ry="3.9" fill="#f7f1e4"/>
      <circle r="2.7" fill="${c1}"/>
      <circle r="1" fill="#15111c"/>
      <circle cx="-0.9" cy="-0.9" r="0.7" fill="#fff" opacity=".9"/>
    </g></g>`;
  }

  function berry(x, y, sc, colors, stem) {
    const g = [`<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc.toFixed(2)})"><g class="fl">`];
    g.push(`<path d="M0 -15 q1.4 6 -1.6 9" stroke="${stem}" stroke-width="1.1" fill="none" opacity=".45" stroke-linecap="round"/>`);
    const pts = [
      [-4.2, -3.4, 3.7],
      [3.8, -0.6, 3.2],
      [-0.6, -10.2, 2.8]
    ];
    for (const [dx, dy, r] of pts) {
      g.push(`<circle cx="${dx}" cy="${dy}" r="${r}" fill="${colors[0]}"/>`);
      g.push(`<circle cx="${dx - r * 0.34}" cy="${dy - r * 0.38}" r="${r * 0.32}" fill="#fff" opacity=".5"/>`);
    }
    g.push(`<circle cx="3.8" cy="-0.6" r="3.2" fill="${colors[2] || colors[0]}" opacity=".35"/>`);
    g.push('</g></g>');
    return g.join('');
  }

  function shroom(x, y, sc, colors, dot) {
    const g = [`<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc.toFixed(2)})"><g class="fl">`];
    g.push(`<ellipse cx="0" cy="7" rx="8" ry="2.6" fill="${colors[0]}" opacity=".1"/>`);
    g.push(`<path d="M-1 7 V-2" stroke="${dot}" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>`);
    g.push(`<path d="M-6.4 -2 C-6.4 -8.4, 6.4 -8.4, 6.4 -2 Z" fill="${colors[0]}"/>`);
    g.push(`<path d="M-6.4 -2 h12.8" stroke="${colors[1]}" stroke-width=".8" opacity=".5"/>`);
    g.push(`<circle cx="-2.6" cy="-4.6" r="1.2" fill="#fff" opacity=".55"/>`);
    g.push(`<circle cx="1.8" cy="-3.2" r=".9" fill="#fff" opacity=".45"/>`);
    g.push('</g></g>');
    return g.join('');
  }

  function crystal(x, y, sc, colors) {
    const g = [`<g transform="translate(${r1(x)} ${r1(y)}) scale(${sc.toFixed(2)})"><g class="fl">`];
    g.push(`<path d="M7 -2 L9.8 3 L7 9 L4.2 3 Z" fill="${colors[1]}" opacity=".5"/>`);
    g.push(`<path d="M-6.4 1 L-8.4 5 L-6.4 10 L-4.4 5 Z" fill="${colors[1]}" opacity=".4"/>`);
    g.push(`<path d="M0 -14 L4.8 -4 L0 9 L-4.8 -4 Z" fill="${colors[0]}" opacity=".88"/>`);
    g.push(`<path d="M0 -14 L4.8 -4 L0 9 Z" fill="#fff" opacity=".3"/>`);
    g.push('</g></g>');
    return g.join('');
  }

  function drawDeco(d, pal) {
    const s = d.species;
    const stem = d.hang
      ? `<path d="M${r1(d.hang.ax)},${r1(d.hang.ay)} Q${r1(d.hang.cx)},${r1(d.hang.cy)} ${r1(d.x)},${r1(d.y - d.sc * 4)}" fill="none" stroke="${pal.barkB}" stroke-width="1.1" opacity=".9" stroke-linecap="round"/>`
      : '';
    if (s === 'bloom') return stem + bloom(d.x, d.y, d.sc, d.c1, d.c2, pal.heart);
    if (s === 'bell') return stem + bell(d.x, d.y, d.sc, d.c1, d.c2);
    if (s === 'eye') return stem + eye(d.x, d.y, d.sc, d.c1);
    if (s === 'fruit') return stem + berry(d.x, d.y, d.sc, pal.fruit, pal.barkA);
    if (s === 'mushroom') return stem + shroom(d.x, d.y, d.sc, pal.shroom, pal.heart);
    return stem + crystal(d.x, d.y, d.sc, pal.crystal);
  }

  /* ---------------- 生成 ---------------- */
  function generate(p, level) {
    const params = Object.assign(
      {
        seed: 20261106,
        height: 0.55,
        spread: 0.3,
        irregular: 0.36,
        branches: 3,
        leafDensity: 0.8,
        decoRate: 0.62,
        sunPull: 0.8,
        sun: null,
        pruned: [],
        picked: [],
        species: { flower: true, fruit: true, mushroom: true, crystal: true },
        palette: 'cthulhu'
      },
      p || {}
    );
    const speciesCfg = Object.assign({ flower: true, fruit: true, mushroom: true, crystal: true }, params.species || {});
    const pal = PALETTES[params.palette] || PALETTES.cthulhu;
    const pruned = new Set(params.pruned || []);
    const picked = new Set(params.picked || []);
    const rndOf = (k) => mulberry32(hash32(params.seed + '|' + k));

    const lv = Math.max(1, level | 0);
    const maxDepth = Math.min(6, 5 + Math.floor(lv / 6));
    // 10 级后，少数枝头会再冒一层新枝（长期生长）
    const extendChance = Math.max(0, Math.min(0.4, (lv - 9) / 45));
    const forkStart = 1;
    const trunkLen = 44 + params.height * 30 + Math.min(9, lv * 0.8);
    const trunkW = 12 + params.height * 10;

    const branches = [];
    const tips = [];
    const bx = W / 2;
    const by = GROUND + 4;

    /* ---------- 向光性 ----------
     * 关键：每根枝条"出生"时记下当时的太阳方向（sunTilt 冻结在 tiltMap 里），
     * 之后太阳再移动也不会改变它——只影响新长出来的枝。
     */
    const sunPull = params.sunPull == null ? 0.8 : Math.max(0, Math.min(1.2, params.sunPull));
    let sunTilt = 0; // 当前太阳角（只用于光照表现）
    if (typeof params.sunTilt === 'number') {
      // 推荐路径：渲染层直接算好"相对竖直方向的太阳角"（弧度），这里只做强度与夹紧
      sunTilt = Math.max(-0.3, Math.min(0.3, params.sunTilt * sunPull));
    } else if (params.sun && sunPull > 0) {
      const dx = params.sun.x - bx;
      const dy = params.sun.y - by;
      const dist = Math.hypot(dx, dy) || 1;
      let tilt = Math.atan2(dy, dx) + Math.PI / 2;
      tilt = (((tilt + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      tilt = Math.max(-1.1, Math.min(1.1, tilt));
      const near = Math.min(1, 0.3 + 260 / dist);
      // 太阳在树根下方时几乎不产生向光弯曲（光从地下来不合理）
      const above = dy < 0 ? 1 : Math.max(0, 1 - dy / 300);
      sunTilt = Math.max(-0.3, Math.min(0.3, tilt * sunPull * near * above));
    }

    const tiltMap = params.tiltMap || {};
    const newTilt = {};
    const tiltOf = (path) => {
      if (typeof newTilt[path] === 'number') return newTilt[path];
      const v = tiltMap[path];
      if (typeof v === 'number') return v;
      newTilt[path] = sunTilt;
      return sunTilt;
    };

    function grow(x, y, ang, len, w, d, path) {
      if (pruned.has(path)) return;
      // 这根枝条出生时的太阳方向（冻结）
      const nodeTilt = tiltOf(path);
      const targetDir = -Math.PI / 2 + nodeTilt;
      const R = rndOf('b' + path);
      const bend = (R() - 0.5) * params.irregular * len * (d < 2 ? 0.5 : 1.35);
      const ex = x + Math.cos(ang) * len;
      const ey = y + Math.sin(ang) * len;
      const mx = (x + ex) / 2 + Math.cos(ang + Math.PI / 2) * bend;
      const my = (y + ey) / 2 + Math.sin(ang + Math.PI / 2) * bend;
      branches.push({
        d: `M${r1(x)},${r1(y)} Q${r1(mx)},${r1(my)} ${r1(ex)},${r1(ey)}`,
        w: Math.max(0.6, w),
        depth: d,
        x,
        y,
        ex,
        ey,
        path
      });

      const canExtend = d === maxDepth && hash32(params.seed + '|x|' + path) / 4294967296 < extendChance;
      if ((d >= maxDepth && !canExtend) || w < 1.05 || len < 8) {
        tips.push({ x: ex, y: ey, ang, depth: d, path });
        return;
      }

      if (d < forkStart) {
        grow(ex, ey, ang + (R() - 0.5) * 0.1 + (targetDir - ang) * 0.22, len * 0.82, w * 0.88, d + 1, path + '.0');
        return;
      }

      const n = d === forkStart ? 3 : R() < 0.22 ? 2 : Math.max(2, Math.min(4, params.branches));
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
        let na = ang + t * params.spread * (0.8 + R() * 0.6) + (R() - 0.5) * params.irregular * 0.85;
        if (d === forkStart && Math.abs(t) < 0.2) na += (R() < 0.5 ? -1 : 1) * 0.3;
        const pull = 0.14 + 0.09 * (d / maxDepth);
        na = na * (1 - pull) + targetDir * pull;
        if (d > forkStart + 1 && R() < 0.09) na += (R() < 0.5 ? -1 : 1) * 0.6;
        const mid = Math.abs(t) < 0.2;
        const growK = d === forkStart ? 0.96 : mid ? 0.76 : 0.84;
        const sunK = 1 + 0.24 * Math.cos(na - targetDir) * sunPull;
        grow(ex, ey, na, len * (growK + R() * 0.08) * sunK, w * (0.64 + R() * 0.1), d + 1, path + '.' + i);
      }
    }

    const rootTilt = tiltOf('r');
    grow(bx, by, -Math.PI / 2 + rootTilt * 0.55 + (rndOf('root')() - 0.5) * 0.16, trunkLen, trunkW, 0, 'r');

    // 根须
    const roots = [];
    const RR = rndOf('roots');
    for (let i = 0; i < 7; i++) {
      const t = i / 6 - 0.5;
      const ex = bx + t * (78 + RR() * 36);
      const ey = by + 12 + Math.abs(t) * 10 + RR() * 8;
      roots.push({
        d: `M${r1(bx + t * 14)},${r1(by)} Q${r1(bx + t * 48)},${r1(by + 16 + RR() * 10)} ${r1(ex)},${r1(ey)}`,
        w: 3.2 - Math.abs(t) * 2.2
      });
    }

    /* ---------- 叶：分前后两层 ---------- */
    const backLeaves = [];
    const frontLeaves = [];
    const darkLeaf = pal.leaf[2] || pal.leaf[0];
    const leafColors = pal.leaf;

    const addLeaves = (tip, R, n, back, spreadR) => {
      for (let i = 0; i < n; i++) {
        const a = (R() - 0.5) * 200 - 20;
        const sc = (back ? 0.6 : 0.78) + R() * 0.95;
        const item = {
          x: tip.x + (R() - 0.5) * (spreadR || 8),
          y: tip.y + (R() - 0.5) * (spreadR || 8),
          rot: a,
          sc,
          c: back ? darkLeaf : leafColors[(R() * leafColors.length) | 0],
          op: back ? 0.82 : 1,
          delay: (R() * 5).toFixed(2)
        };
        (back ? backLeaves : frontLeaves).push(item);
      }
    };

    for (const t of tips) {
      const R = rndOf('l' + t.path);
      const lightBias = 1 + 0.5 * sunPull * Math.cos(t.ang - (-Math.PI / 2 + tiltOf(t.path)));
      const n = Math.max(1, Math.round(params.leafDensity * (3.8 + R() * 3.4) * lightBias));
      const nb = Math.round(n * 0.34);
      addLeaves(t, R, nb, true);
      addLeaves(t, R, n - nb, false);
    }

    // 枝干中段（只在前层，避免背面太乱）
    for (const b of branches) {
      if (b.depth < maxDepth - 3) continue;
      const R = rndOf('m' + b.path);
      const ang = (Math.atan2(b.ey - b.y, b.ex - b.x) * 180) / Math.PI;
      const k = b.depth >= maxDepth - 1 ? 3 : 2;
      for (let i = 0; i < k; i++) {
        const t = 0.42 + R() * 0.5;
        frontLeaves.push({
          x: b.x + (b.ex - b.x) * t + (R() - 0.5) * 6,
          y: b.y + (b.ey - b.y) * t + (R() - 0.5) * 6,
          rot: ang + (R() - 0.5) * 130,
          sc: 0.55 + R() * 0.6,
          c: leafColors[(R() * leafColors.length) | 0],
          delay: (R() * 5).toFixed(2)
        });
      }
    }

    const trim = (arr, max) => (arr.length > max ? arr.filter((_, i) => i % Math.ceil(arr.length / max) === 0) : arr);
    const backPicked = trim(backLeaves, 190);
    const frontPicked = trim(frontLeaves, 400);

    /* ---------- 挂果 ---------- */
    const allowed = Object.keys(SPECIES).filter((k) => speciesCfg[SPECIES[k].cat] !== false && lv >= SPECIES[k].minLevel);
    const catCount = { flower: 0, fruit: 0, mushroom: 0, crystal: 0 };
    const decos = [];
    const maxTotal = Math.round((6 + Math.min(17, lv * 1.45)) * (0.45 + params.decoRate));
    const perTip = Math.min(0.8, maxTotal / Math.max(1, tips.length));

    // 按"大枝"分配物种：大枝按枝头数量从多到少排序后轮换，保证四类都能出现
    const majorOf = (path) => path.split('.').slice(0, 3).join('.');
    const majorCount = new Map();
    for (const t of tips) {
      const m = majorOf(t.path);
      majorCount.set(m, (majorCount.get(m) || 0) + 1);
    }
    const catSpecies = { flower: [], fruit: [], mushroom: [], crystal: [] };
    for (const k of allowed) catSpecies[SPECIES[k].cat].push(k);
    const cats = Object.keys(catSpecies).filter((c) => catSpecies[c].length);

    const majorList = Array.from(majorCount.keys()).sort((a, b) => majorCount.get(b) - majorCount.get(a));
    const majorCat = new Map();
    if (cats.length) {
      let idx = hash32(params.seed + '|rot') % cats.length;
      for (const m of majorList) {
        majorCat.set(m, cats[idx % cats.length]);
        idx += 1;
      }
    }

    // 垂枝只挑树冠下半缘的枝头，否则会被叶子挡住看不见
    const tipYs = tips.map((t) => t.y).sort((a, b) => a - b);
    const lowHalfY = tipYs.length ? tipYs[Math.floor(tipYs.length * 0.55)] : GROUND;

    function pickSpecies(R) {
      const pool = [];
      for (const k of allowed) {
        const times = Math.max(1, Math.round(SPECIES[k].weight * 10));
        for (let i = 0; i < times; i++) pool.push(k);
      }
      if (!pool.length) return null;
      return pool[(R() * pool.length) | 0];
    }

    let hangCount = 0;
    for (const t of tips) {
      if (picked.has(t.path)) continue;
      const major = majorOf(t.path);
      const SR = rndOf('d' + t.path);
      const hh = hash32(params.seed + '|d|' + t.path);
      const hintCat = majorCat.get(major) || null;
      const rollA = (hh & 0xffff) / 65536; // 是否换一种
      const rollB = ((hh >>> 16) & 0xffff) / 65536; // 密度
      const rollC = SR(); // 颜色
      const rollD = SR(); // 尺寸
      if (rollB > perTip) continue;

      let sp = null;
      if (rollA < 0.72 && hintCat) {
        const poolC = catSpecies[hintCat];
        sp = poolC.length ? poolC[(SR() * poolC.length) | 0] : null;
      }
      if (!sp || !allowed.includes(sp)) sp = pickSpecies(SR);
      if (!sp) continue;

      catCount[SPECIES[sp].cat] += 1;
      const ci = (rollC * pal.flower.length) | 0;

      // 垂枝：有一部分不挂在枝头，而是从枝头垂下来
      const hangChance = { fruit: 0.8, bell: 0.85, bloom: 0.5 }[sp] || 0;
      const hangRoll = SR();
      // 至少保证一颗垂枝，否则低等级时可能一颗都看不到
      const inLow = t.y > lowHalfY && t.y < GROUND - 70;
      const inX = t.x > 26 && t.x < W - 26; // 太靠边的会被画布裁掉
      const forceHang = hangCount === 0 && hangChance > 0 && t.y < GROUND - 90 && inX;
      const canHang = hangChance > 0 && inX && t.y < GROUND - 70 && ((hangRoll < hangChance && inLow) || forceHang);
      if (canHang) hangCount += 1;
      const hangLen = canHang ? 22 + SR() * 20 : 0;
      const sway = canHang ? (SR() - 0.5) * 9 : 0;
      const hx = t.x + sway * 1.15;
      const hy = t.y + hangLen;

      decos.push({
        species: sp,
        id: t.path,
        x: canHang ? hx : t.x,
        y: canHang ? hy : t.y,
        sc: (canHang ? 1.02 : 0.82) + rollD * 0.42,
        c1: sp === 'eye' ? pal.flower[0] : pal.flower[ci],
        c2: pal.flower[(ci + 1) % pal.flower.length],
        delay: (rollD * 4).toFixed(2),
        hang: canHang
          ? { ax: t.x, ay: t.y, len: hangLen, cx: t.x + sway * 0.45, cy: t.y + hangLen * 0.62 }
          : null
      });
    }

    /* ---------- 自适应缩放 ---------- */
    const allLeaves = backPicked.concat(frontPicked);
    const xs = tips.map((t) => t.x).concat(allLeaves.map((l) => l.x));
    const ys = tips.map((t) => t.y).concat(allLeaves.map((l) => l.y));
    const minX = Math.min.apply(null, xs) - 26; // 叶片会向四周伸出约 20，留够余量
    const maxX = Math.max.apply(null, xs) + 26;
    const minY = Math.min.apply(null, ys) - 20;
    const up = (GROUND + 4 - 14) / Math.max(1, GROUND + 4 - minY);
    const sLeft = (bx - 8) / Math.max(1, bx - minX);
    const sRight = (W - 8 - bx) / Math.max(1, maxX - bx);
    const scale = Math.max(0.55, Math.min(1.18, up, sLeft, sRight));
    const px = r1(bx);
    const py = r1(GROUND + 4);
    const frame = `translate(${px} ${py}) scale(${scale.toFixed(3)}) translate(${-px} ${-py})`;

    branches.sort((a, b) => a.depth - b.depth);

    // 光照方向只跟"现在的太阳"走：明暗会随太阳变，但枝干形状不会
    const lightDir = -Math.PI / 2 + sunTilt;
    const lx = Math.cos(lightDir) * 1.5;
    const ly = Math.sin(lightDir) * 1.5;

    const out = [];
    out.push(`<defs>
      <linearGradient id="gt-bark" x1="0" y1="1" x2="0.15" y2="0">
        <stop offset="0" stop-color="${pal.barkA}"/>
        <stop offset="0.38" stop-color="${pal.barkB}"/>
        <stop offset="1" stop-color="${pal.barkC}"/>
      </linearGradient>
      <radialGradient id="gt-ground">
        <stop offset="0" stop-color="#000" stop-opacity=".55"/>
        <stop offset="1" stop-color="#000" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="gt-sun">
        <stop offset="0" stop-color="#ffe3a8" stop-opacity=".16"/>
        <stop offset=".38" stop-color="#ffd48a" stop-opacity=".07"/>
        <stop offset="1" stop-color="#ffc879" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="gt-pot" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#6b503b"/>
        <stop offset="0.45" stop-color="#3c2a22"/>
        <stop offset="1" stop-color="#170f1c"/>
      </linearGradient>
    </defs>`);

    if (params.sun) {
      out.push(`<circle cx="${r1(params.sun.x)}" cy="${r1(params.sun.y)}" r="250" fill="url(#gt-sun)"/>`);
    }

    // 地面
    out.push(`<ellipse cx="${bx}" cy="${GROUND + 48}" rx="126" ry="26" fill="url(#gt-ground)"/>`);
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      out.push(`<ellipse cx="${r1(bx + Math.sin(sunTilt) * 34)}" cy="${GROUND + 14}" rx="${30 + t * 86}" ry="${10 + t * 30}" fill="${pal.glow}" opacity="0.026"/>`);
    }

    out.push(`<g class="tree-frame" transform="${frame}">`);
    // 石盆
    const potTop = GROUND + 8;
    let runes = '';
    for (let i = -3; i <= 3; i++) {
      const rx = bx + i * 15;
      runes += `<path d="M${rx} ${potTop + 3} l3 6 l-6 0 z" fill="${pal.heart}" opacity=".34"/>`;
    }
    out.push(`<g class="pot">
      <ellipse cx="${bx}" cy="${potTop + 18}" rx="72" ry="18" fill="#08060d" opacity=".8"/>
      <path d="M${bx - 58} ${potTop} C ${bx - 47} ${potTop + 68}, ${bx + 47} ${potTop + 68}, ${bx + 58} ${potTop} Z"
            fill="url(#gt-pot)" stroke="rgba(0,0,0,.5)" stroke-width="1.2"/>
      <path d="M${bx - 47} ${potTop + 10} C ${bx - 38} ${potTop + 50}, ${bx + 38} ${potTop + 50}, ${bx + 47} ${potTop + 10}"
            fill="none" stroke="rgba(255,235,200,.14)" stroke-width="1"/>
      <ellipse cx="${bx}" cy="${potTop}" rx="58" ry="13" fill="#241a2c" stroke="rgba(230,198,132,.32)" stroke-width="1.2"/>
      <ellipse cx="${bx}" cy="${potTop - 1}" rx="50" ry="9.8" fill="#120d18"/>
      ${runes}
    </g>`);

    out.push(`<g class="tree-root">`);

    // 背层叶（在枝干之后面）
    out.push(`<g class="leaves back">`);
    for (const l of backPicked) {
      out.push(`<g class="lvg still">${leaf(l.x, l.y, l.rot, l.sc, l.c, l.op)}</g>`);
    }
    out.push(`</g>`);

    // 根须
    out.push(`<g stroke="url(#gt-bark)" stroke-linecap="round" fill="none" opacity=".72">`);
    for (const r of roots) out.push(`<path d="${r.d}" stroke-width="${r.w.toFixed(2)}"/>`);
    out.push(`</g>`);

    // 背光侧暗边
    out.push(`<g class="layer-shadow" fill="none" stroke="#0f0a16" stroke-opacity=".62" stroke-linecap="round" transform="translate(${r1(-lx)} ${r1(-ly)})">`);
    for (const b of branches) out.push(`<path data-path="${b.path}" d="${b.d}" stroke-width="${(b.w + (b.depth <= 3 ? 2.4 : 1.4)).toFixed(2)}"/>`);
    out.push(`</g>`);

    // 枝干
    out.push(`<g class="layer-branch" fill="none" stroke-linecap="round">`);
    for (const b of branches) {
      const cls = b.depth <= 5 ? 'br draw' : 'br';
      const stroke = b.depth >= 3 ? pal.barkB : 'url(#gt-bark)';
      const op = b.depth >= 3 ? 0.78 : 0.7 + b.depth * 0.03;
      out.push(
        `<path class="${cls}" data-path="${b.path}" d="${b.d}" stroke="${stroke}" stroke-width="${b.w.toFixed(2)}" opacity="${op.toFixed(2)}"/>`
      );
    }
    out.push(`</g>`);

    // 受光侧高光（让主干有圆柱感）
    out.push(`<g class="layer-hi" fill="none" stroke="#fffdf6" stroke-opacity=".62" stroke-linecap="round" transform="translate(${r1(lx)} ${r1(ly)})">`);
    for (const b of branches) {
      if (b.depth > 3) continue;
      out.push(`<path data-path="${b.path}" d="${b.d}" stroke-width="${(b.w * 0.34).toFixed(2)}"/>`);
    }
    out.push(`</g>`);

    // 前层叶
    out.push(`<g class="leaves">`);
    frontPicked.forEach((l, i) => {
      const cls = i % 6 === 0 ? 'lvg' : 'lvg still';
      out.push(`<g class="${cls}" style="animation-delay:-${l.delay}s">${leaf(l.x, l.y, l.rot, l.sc, l.c)}</g>`);
    });
    out.push(`</g>`);

    // 挂果
    out.push(`<g class="decos">`);
    for (const d of decos) {
      out.push(`<g class="deco" data-id="${d.id}" data-sp="${d.species}" style="--d:-${d.delay}s">${drawDeco(d, pal)}</g>`);
    }
    out.push(`</g>`);

    // 浮游孢子
    out.push(`<g class="motes">`);
    const MR = rndOf('motes');
    for (let i = 0; i < 12; i++) {
      out.push(
        `<circle cx="${r1(90 + MR() * 280)}" cy="${r1(120 + MR() * 380)}" r="${(0.8 + MR() * 1.4).toFixed(2)}" fill="${pal.glow}" opacity=".5" style="animation-delay:-${(MR() * 9).toFixed(2)}s;animation-duration:${(6 + MR() * 6).toFixed(1)}s"/>`
      );
    }
    out.push(`</g>`);

    out.push(`</g>`);
    out.push(`</g>`);

    return {
      svg: out.join(''),
      stats: {
        branches: branches.length,
        tips: tips.length,
        leaves: backPicked.length + frontPicked.length,
        deco: decos.length,
        harvestable: decos.length,
        species: catCount,
        pruned: pruned.size,
        picked: picked.size,
        height: GROUND - minY,
        scale: Number(scale.toFixed(3)),
        palette: pal.name,
        glow: pal.glow,
        maxDepth,
        sunTilt: Number((sunTilt * 57.3).toFixed(1)),
        newTilt
      }
    };
  }

  function mount(svg, params, level, animate) {
    const built = generate(params, level);
    svg.innerHTML = built.svg;
    if (animate !== false) {
      // 描边层 + 阴影层 + 高光层一起生长，否则生长过程中会露出黑色剪影
      const shadowMap = new Map();
      svg.querySelectorAll('.layer-shadow path').forEach((p) => shadowMap.set(p.dataset.path, p));
      const hiMap = new Map();
      svg.querySelectorAll('.layer-hi path').forEach((p) => hiMap.set(p.dataset.path, p));

      const pairs = [];
      svg.querySelectorAll('path.br.draw').forEach((p) => {
        const mates = [shadowMap.get(p.dataset.path), hiMap.get(p.dataset.path)].filter(Boolean);
        try {
          const L = p.getTotalLength();
          p.style.strokeDasharray = L;
          p.style.strokeDashoffset = L;
          mates.forEach((m) => {
            m.style.strokeDasharray = L;
            m.style.strokeDashoffset = L;
          });
        } catch (e) {
          /* ignore */
        }
        pairs.push({ p, mates });
      });
      requestAnimationFrame(() => {
        pairs.forEach(({ p, mates }, i) => {
          const tr = `stroke-dashoffset .95s cubic-bezier(.22,.61,.36,1) ${(i * 0.014).toFixed(2)}s`;
          p.style.transition = tr;
          p.style.strokeDashoffset = 0;
          mates.forEach((m) => {
            m.style.transition = tr;
            m.style.strokeDashoffset = 0;
          });
        });
      });
    }
    return built;
  }

  window.TreeGen = { generate, mount, PALETTES, SPECIES, W, H, GROUND };
})();
