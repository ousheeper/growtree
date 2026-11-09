/**
 * 插件：图鉴（词条收集册）
 * 每个词条由程序化字形绘制，不依赖任何图片资源
 */
(function () {
  'use strict';

  const glyphPath = {
    /* ---------- 植物 / 菌类 ---------- */
    leaf: (c) =>
      `<path d="M8 24c0-10 8-16 17-17 1 10-6 18-17 17Z" fill="${c}" opacity=".85"/>` +
      `<path d="M9 23L22 9" stroke="#fff" stroke-width="1.1" opacity=".5"/>`,
    moss: (c) =>
      `<g fill="${c}"><circle cx="9" cy="20" r="4.6" opacity=".75"/><circle cx="16" cy="16" r="5.8"/>` +
      `<circle cx="23" cy="20" r="4.2" opacity=".8"/><circle cx="12.5" cy="24" r="3.4" opacity=".6"/>` +
      `<circle cx="20" cy="24" r="3.8" opacity=".66"/></g>`,
    mushroom: (c) =>
      `<path d="M5.5 15.5c0-6.5 21-6.5 21 0 0 2.2-21 2.2-21 0Z" fill="${c}"/>` +
      `<path d="M12.8 16.5h6.4v8a3.2 3.2 0 0 1-6.4 0Z" fill="${c}" opacity=".6"/>` +
      `<circle cx="11.6" cy="11.4" r="1.3" fill="#fff" opacity=".75"/><circle cx="20" cy="12.6" r="1" fill="#fff" opacity=".6"/>`,
    bloom: (c) => {
      let s = '';
      for (let i = 0; i < 5; i++) s += `<ellipse cx="16" cy="9.6" rx="3.5" ry="5.5" fill="${c}" opacity=".85" transform="rotate(${i * 72} 16 16)"/>`;
      return s + `<circle cx="16" cy="16" r="2.7" fill="#f7e0a8"/>`;
    },
    root: (c) =>
      `<path d="M16 4v9M16 13c-4 3-7 4.5-10 5M16 13c4 3 7 4.5 10 5" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="M6 18v5M6 23l-2.5 4M6 23l3 4M26 18v5M26 23l-2.5 4M26 23l3 4M16 13v9M16 22l-4 8M16 22l4 8" fill="none" stroke="${c}" stroke-width="1.7" opacity=".65" stroke-linecap="round"/>`,
    branch: (c) =>
      `<path d="M16 28V9M16 15l8-6M16 20l-8-6" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
      `<circle cx="24" cy="8.5" r="2.2" fill="${c}"/><circle cx="7.6" cy="13.5" r="2.2" fill="${c}"/>`,
    seed: (c) =>
      `<path d="M16 5c5.4 2.6 8 7 8 11.4 0 5-3.6 9.6-8 9.6s-8-4.6-8-9.6C8 12 10.6 7.6 16 5Z" fill="${c}" opacity=".85"/>` +
      `<path d="M16 8.5v13" stroke="#fff" stroke-width="1.2" opacity=".45"/>` +
      `<path d="M16 14l4-3M16 18l-4-3" stroke="#fff" stroke-width="1" opacity=".3"/>`,
    thorn: (c) =>
      `<path d="M6 26C9 19 13 13 20 9c2.4-1.4 4-2 6-2.4" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M10 20l-4-1M14 14l-1-4M18 10l-1-3.6M12.5 17l4 .6M17 12l3.6.4" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
    web: (c) =>
      `<g fill="none" stroke="${c}" stroke-width="1.25" stroke-linecap="round">` +
      `<path d="M16 3.5v25M4 15.5h24M7.4 6.9l17.2 17.2M24.6 6.9L7.4 24.1"/>` +
      `<path d="M16 9.6l4.8 3.4v5.4L16 21.8l-4.8-3.4V13z" opacity=".8"/>` +
      `<path d="M16 5.6l7.6 5.4v8.4L16 24.8l-7.6-5.4V11z" opacity=".45"/></g>`,
    soil: (c) =>
      `<g fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"><path d="M4 10h24"/>` +
      `<path d="M6 16h20" opacity=".7"/><path d="M8 22h16" opacity=".5"/><path d="M11 28h10" opacity=".32"/></g>`,
    ash: (c) =>
      `<path d="M6 26h20l-4-9-4 3-3-6-5 5z" fill="${c}" opacity=".7"/>` +
      `<g fill="${c}"><circle cx="12" cy="9" r="1.6" opacity=".7"/><circle cx="20" cy="7" r="1.2" opacity=".55"/>` +
      `<circle cx="24" cy="12" r="1" opacity=".45"/></g>`,
    wax: (c) =>
      `<path d="M16 4l9 5.2v10.4L16 25l-9-5.4V9.2z" fill="${c}" opacity=".82"/>` +
      `<path d="M16 10l4.6 2.6v5.2L16 20.4l-4.6-2.6v-5.2z" fill="#221a2e" opacity=".35"/>`,
    spiral: (c) =>
      `<path d="M18 14.6a2.9 2.9 0 1 1-2.9 2.9 6 6 0 0 0 6-6 9.2 9.2 0 0 0-9.2-3.2" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
    feather: (c) =>
      `<path d="M9 24C9 14 15 7.5 25 6c.6 9.5-6.5 16.5-16 18Z" fill="${c}" opacity=".82"/>` +
      `<path d="M9.5 23.5L24 9" stroke="#221a2e" stroke-width="1.2" opacity=".4"/>` +
      `<path d="M7.4 26.6l3.6-3.6" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
    flame: (c) =>
      `<path d="M16 3c5 6 8 9 8 13.4A8 8 0 0 1 8 16.4C8 12 11 9 16 3Z" fill="${c}" opacity=".84"/>` +
      `<path d="M16 13c2.6 3 4 4.6 4 6.6a4 4 0 0 1-8 0c0-2 1.4-3.6 4-6.6Z" fill="#fff" opacity=".5"/>`,

    /* ---------- 生物 / 身体 ---------- */
    eye: (c) =>
      `<ellipse cx="16" cy="16" rx="11.5" ry="7.4" fill="#f7f1e4" stroke="${c}" stroke-width="1.5"/>` +
      `<circle cx="16" cy="16" r="4.3" fill="${c}"/><circle cx="16" cy="16" r="1.7" fill="#221a2e"/>` +
      `<circle cx="11.4" cy="12.4" r="1.4" fill="#fff" opacity=".85"/>`,
    void: (c) =>
      `<circle cx="16" cy="16" r="11.5" fill="${c}" opacity=".9"/><circle cx="16" cy="16" r="5" fill="#0e0b16"/>` +
      `<circle cx="16" cy="16" r="7.8" fill="none" stroke="#fff" stroke-width=".9" opacity=".25"/>`,
    tentacle: (c) =>
      `<path d="M9 5c7 3 12 7 12 11.5 0 4-4.6 5-6.6 9.5" fill="none" stroke="${c}" stroke-width="3.1" stroke-linecap="round"/>` +
      `<circle cx="13" cy="9.6" r="1.2" fill="#fff" opacity=".65"/><circle cx="18" cy="13.6" r="1.1" fill="#fff" opacity=".6"/>` +
      `<circle cx="17.2" cy="19" r="1" fill="#fff" opacity=".55"/>`,
    shell: (c) =>
      `<path d="M16 16c0-2.6 2.2-4.6 4.7-4.6s4.8 2.4 4.8 5.2-2.4 6.2-5.6 7.8-8.4 1.6-11-1.4-2.4-8 1-10.6 9.4-3 12.8 0" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    skull: (c) =>
      `<path d="M16 4c6.6 0 11 4.4 11 10.2 0 3.4-1.6 5.4-3.2 6.8v3.4c0 1.6-1.2 2.6-2.8 2.6H15c-1.6 0-2.8-1-2.8-2.6V21c-1.6-1.4-3.2-3.4-3.2-6.8C9 8.4 9.4 4 16 4Z" fill="${c}" opacity=".85"/>` +
      `<circle cx="12.6" cy="14" r="2.6" fill="#221a2e"/><circle cx="19.4" cy="14" r="2.6" fill="#221a2e"/>` +
      `<path d="M14.4 22v4M17.6 22v4" stroke="#221a2e" stroke-width="1.2"/>`,
    mask: (c) =>
      `<path d="M16 4c6 0 10 3.4 10 8.6 0 6.6-4.4 15.4-10 15.4S6 19.2 6 12.6C6 7.4 10 4 16 4Z" fill="${c}" opacity=".82"/>` +
      `<path d="M10.5 13.5c1.8-1.6 3.8-1.6 5.6 0M15.9 13.5c1.8-1.6 3.8-1.6 5.6 0" stroke="#221a2e" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M13 20c1.8 1.6 4.2 1.6 6 0" stroke="#221a2e" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
    bone: (c) =>
      `<path d="M11 11l10 10" stroke="${c}" stroke-width="3.6" stroke-linecap="round"/>` +
      `<circle cx="9.5" cy="9.5" r="3" fill="${c}"/><circle cx="22.5" cy="22.5" r="3" fill="${c}"/>`,
    scale: (c) =>
      `<g fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round">` +
      `<path d="M7 9c0 6 4 10 9 10s9-4 9-10"/><path d="M7 17c0 6 4 10 9 10s9-4 9-10" opacity=".72"/></g>`,
    motes: (c) =>
      `<g fill="${c}"><circle cx="11" cy="12" r="3"/><circle cx="21" cy="9" r="2.2" opacity=".8"/>` +
      `<circle cx="18" cy="20" r="2.8" opacity=".9"/><circle cx="9" cy="23" r="1.7" opacity=".6"/>` +
      `<circle cx="24" cy="24" r="1.5" opacity=".5"/></g>`,
    cocoon: (c) =>
      `<path d="M16 3c5 4 7.4 8.6 7.4 13S21 27.4 16 29c-5-1.6-7.4-8.6-7.4-13S11 7 16 3Z" fill="${c}" opacity=".78"/>` +
      `<path d="M16 5.6v19M11.6 10c3 1 6 1 8.8 0M10.6 15c3.6 1.2 7.2 1.2 10.8 0M11.6 20c3 1 6 1 8.8 0" stroke="#221a2e" stroke-width="1.1" opacity=".35" fill="none"/>`,

    /* ---------- 矿物 / 器物 ---------- */
    crystal: (c) =>
      `<path d="M16 3l8 9-8 17-8-17z" fill="${c}" opacity=".85"/><path d="M16 3l8 9h-16z" fill="#fff" opacity=".45"/>`,
    orb: (c) =>
      `<circle cx="16" cy="16" r="10.5" fill="${c}" opacity=".8"/><circle cx="12.5" cy="12" r="3.2" fill="#fff" opacity=".5"/>`,
    salt: (c) =>
      `<g fill="${c}"><path d="M9 12l5-3 5 3-5 3z" opacity=".92"/><path d="M14 15v6l-5-3v-6z" opacity=".58"/>` +
      `<path d="M14 15v6l5-3v-6z" opacity=".78"/><path d="M18 8l4-2.4 4 2.4-4 2.4z" opacity=".7"/>` +
      `<path d="M22 10.4v4.6l-4-2.4V8z" opacity=".5"/><path d="M22 10.4V15l4-2.4V8z" opacity=".62"/></g>`,
    rune: (c) =>
      `<path d="M16 3v26M16 9l6.4 7-6.4 7-6.4-7z" stroke="${c}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>` +
      `<path d="M8 20h16" stroke="${c}" stroke-width="1.4" opacity=".6" stroke-linecap="round"/>`,
    chain: (c) =>
      `<g fill="none" stroke="${c}" stroke-width="2.2"><ellipse cx="11" cy="19" rx="6" ry="3.6" transform="rotate(-38 11 19)"/>` +
      `<ellipse cx="21" cy="13" rx="6" ry="3.6" transform="rotate(-38 21 13)"/></g>`,
    star: (c) =>
      `<path d="M16 3l2.6 8.4L27 14l-8.4 2.6L16 25l-2.6-8.4L5 14l8.4-2.6z" fill="${c}"/>`,
    moon: (c) =>
      `<path d="M20.5 4a12 12 0 1 0 7 21.6A13 13 0 0 1 20.5 4Z" fill="${c}"/>`,
    drop: (c) =>
      `<path d="M16 4c4.6 5.6 7.2 9 7.2 12.2a7.2 7.2 0 0 1-14.4 0C8.8 13 11.4 9.6 16 4Z" fill="${c}" opacity=".88"/>` +
      `<path d="M12.4 15.4a3.9 3.9 0 0 0 1.4 5.2" stroke="#fff" stroke-width="1.4" fill="none" opacity=".5" stroke-linecap="round"/>`,
    snow: (c) =>
      `<g stroke="${c}" stroke-width="2" stroke-linecap="round"><path d="M16 4v24M5.6 10l20.8 12M26.4 10L5.6 22"/>` +
      `<path d="M16 8l-3-3M16 8l3-3M16 24l-3 3M16 24l3 3" opacity=".7"/></g>`,
    wave: (c) =>
      `<g fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round">` +
      `<path d="M3 11c3-3 6-3 9 0s6 3 9 0 6-3 8 0"/><path d="M3 18c3-3 6-3 9 0s6 3 9 0 6-3 8 0" opacity=".7"/>` +
      `<path d="M3 25c3-3 6-3 9 0s6 3 9 0 6-3 8 0" opacity=".45"/></g>`,
    knot: (c) =>
      `<path d="M9.4 20.4c-3.4 0-4.6-4-1.6-6.4 2.6-2.2 6.6-.6 6.6 3.4 0 4.6-4 7.6-8 6.4M22.6 11.6c3.4 0 4.6 4 1.6 6.4-2.6 2.2-6.6.6-6.6-3.4 0-4.6 4-7.6 8-6.4" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>`,
    ring: (c) =>
      `<circle cx="16" cy="18" r="8" fill="none" stroke="${c}" stroke-width="3"/>` +
      `<path d="M12 10l4-5 4 5-4 3.4z" fill="${c}"/>`,
    bell: (c) =>
      `<path d="M9 20c0-7 2-11 7-11s7 4 7 11z" fill="${c}"/><path d="M16 9V5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>` +
      `<circle cx="16" cy="22" r="2.4" fill="${c}"/>`,
    bowl: (c) =>
      `<path d="M4 17a12 12 0 0 1 24 0Z" fill="${c}" opacity=".82"/><path d="M4 17h24" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M16 5V2.6" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
    staff: (c) =>
      `<path d="M13 29L19 9" stroke="${c}" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="20.4" cy="7" r="4.2" fill="none" stroke="${c}" stroke-width="2.2"/><circle cx="20.4" cy="7" r="1.6" fill="${c}"/>` +
      `<path d="M11 22l3.4 1" stroke="${c}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    lantern: (c) =>
      `<path d="M16 3v3" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M11 6h10" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>` +
      `<path d="M10 8h12l2 12a4 4 0 0 1-4 4.6H12A4 4 0 0 1 8 20z" fill="${c}" opacity=".78"/>` +
      `<path d="M12.6 12.5h6.8l1.2 8h-9.2z" fill="#fff" opacity=".4"/>`,
    shade: (c) =>
      `<path d="M11 5h10l5 15H6z" fill="${c}" opacity=".8"/><path d="M6 20h20" stroke="${c}" stroke-width="1.6" opacity=".5"/>` +
      `<path d="M16 20v5M12 25h8" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`,
    book: (c) =>
      `<path d="M6 7.5c3.4-1.6 6.8-1.6 10 0v18c-3.2-1.6-6.6-1.6-10 0z" fill="${c}" opacity=".7"/>` +
      `<path d="M26 7.5c-3.4-1.6-6.8-1.6-10 0v18c3.2-1.6 6.6-1.6 10 0z" fill="${c}" opacity=".92"/>` +
      `<path d="M16 7.5v18" stroke="#221a2e" stroke-width="1.1" opacity=".35"/>`,
    hourglass: (c) =>
      `<path d="M9 4h14M9 28h14" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M10.5 4c0 6 5.5 8 5.5 12s-5.5 6-5.5 12M21.5 4c0 6-5.5 8-5.5 12s5.5 6 5.5 12" fill="none" stroke="${c}" stroke-width="2"/>` +
      `<path d="M12.5 23.5h7L16 19z" fill="${c}" opacity=".8"/>`,
    compass: (c) =>
      `<circle cx="16" cy="16" r="11" fill="none" stroke="${c}" stroke-width="2"/>` +
      `<path d="M20.5 11.5l-3 6-6 3 3-6z" fill="${c}"/><circle cx="16" cy="16" r="1.4" fill="#fff" opacity=".7"/>`,
    disc: (c) =>
      `<circle cx="16" cy="16" r="11" fill="none" stroke="${c}" stroke-width="2"/>` +
      `<circle cx="16" cy="16" r="4.4" fill="none" stroke="${c}" stroke-width="1.4" opacity=".7"/>` +
      `<path d="M16 5v22M5 16h22M8.5 8.5l15 15M23.5 8.5l-15 15" stroke="${c}" stroke-width="1" opacity=".45"/>`,
    flask: (c) =>
      `<path d="M13 4h6v7l5.6 11.4A3.2 3.2 0 0 1 21.8 27H10.2a3.2 3.2 0 0 1-2.8-4.6L13 11z" fill="${c}" opacity=".78"/>` +
      `<path d="M9.6 20h12.8" stroke="#fff" stroke-width="1.4" opacity=".45"/><path d="M13 4h6" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`,
    bottle: (c) =>
      `<path d="M14 4h4v5c3 1.6 4.4 4 4.4 7.4v6.2A3.4 3.4 0 0 1 19 26h-6a3.4 3.4 0 0 1-3.4-3.4v-6.2C9.6 13 11 10.6 14 9z" fill="${c}" opacity=".78"/>` +
      `<path d="M12.4 16h7.2" stroke="#fff" stroke-width="1.3" opacity=".4"/>`,
    music: (c) =>
      `<path d="M13 24V9l11-3v13" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<ellipse cx="10.4" cy="24" rx="3.4" ry="2.8" fill="${c}"/><ellipse cx="21.4" cy="22" rx="3.4" ry="2.8" fill="${c}"/>`,
    flute: (c) =>
      `<path d="M5 20.5L24 8" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>` +
      `<g fill="#221a2e" opacity=".45"><circle cx="12" cy="16" r="1.2"/><circle cx="16.4" cy="13.2" r="1.2"/><circle cx="20.4" cy="10.6" r="1.2"/></g>`,
    ladder: (c) =>
      `<g stroke="${c}" stroke-width="2.2" stroke-linecap="round"><path d="M11 3v26M21 3v26"/>` +
      `<path d="M11 9h10M11 15h10M11 21h10" stroke-width="1.8"/></g>`,

    /* ---------- 建筑 / 遗迹 ---------- */
    altar: (c) =>
      `<path d="M5 12h22v3.4H5z" fill="${c}"/><path d="M8 15.4h16l-1.6 4H9.6z" fill="${c}" opacity=".62"/>` +
      `<path d="M11 19.4v6M21 19.4v6" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M8 26h16" stroke="${c}" stroke-width="1.6" opacity=".55"/>`,
    steps: (c) =>
      `<path d="M4 25h7v-5h6v-5h6V9h5" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    stair: (c) =>
      `<path d="M7 27V21h5v-5h5V11h5V6h4" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M7 21h5M12 16h5M17 11h5" stroke="${c}" stroke-width="1.2" opacity=".45"/>`,
    stele: (c) =>
      `<path d="M10 27V9a6 6 0 0 1 12 0v18z" fill="${c}" opacity=".78"/>` +
      `<path d="M13 12h6M13 16h6M13 20h4" stroke="#0e0b16" stroke-width="1.3" opacity=".42"/>` +
      `<path d="M7 27h18" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    stones: (c) =>
      `<g fill="${c}"><rect x="6" y="12" width="5" height="16" rx="1.6" opacity=".78"/>` +
      `<rect x="14" y="6" width="5.4" height="22" rx="1.8"/><rect x="22" y="15" width="4.6" height="13" rx="1.6" opacity=".68"/></g>`,
    stonecircle: (c) =>
      `<g fill="${c}"><rect x="14" y="3" width="4" height="9" rx="1.4"/><rect x="14" y="20" width="4" height="9" rx="1.4"/>` +
      `<rect x="3" y="14" width="9" height="4" rx="1.4"/><rect x="20" y="14" width="9" height="4" rx="1.4"/></g>` +
      `<circle cx="16" cy="16" r="3.2" fill="none" stroke="${c}" stroke-width="1.2" opacity=".5"/>`,
    pillar: (c) =>
      `<path d="M10 6h12M11.5 9h9M12.5 9v14M19.5 9v14M10 23h12M8 26h16" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M14 13h4M14 17h4" stroke="${c}" stroke-width="1.2" opacity=".5"/>`,
    arch: (c) =>
      `<path d="M6 27V15a10 10 0 0 1 20 0v12" fill="none" stroke="${c}" stroke-width="3.4"/>` +
      `<path d="M4 27h24" stroke="${c}" stroke-width="2" opacity=".5"/>`,
    aqueduct: (c) =>
      `<path d="M4 11h24v5H4z" fill="${c}" opacity=".85"/><path d="M8 16v11M16 16v11M24 16v11" stroke="${c}" stroke-width="2.4"/>` +
      `<path d="M6 22a2 2 0 0 1 4 0M14 22a2 2 0 0 1 4 0M22 22a2 2 0 0 1 4 0" fill="none" stroke="${c}" stroke-width="1.2" opacity=".45"/>`,
    bridge: (c) =>
      `<path d="M3 22c4-8 22-8 26 0" fill="none" stroke="${c}" stroke-width="2.4"/>` +
      `<path d="M3 22h26" stroke="${c}" stroke-width="1.6" opacity=".55"/>` +
      `<path d="M8 22v-4.4M13 22v-6.4M19 22v-6.4M24 22v-4.4" stroke="${c}" stroke-width="1.4" opacity=".65"/>`,
    well: (c) =>
      `<ellipse cx="16" cy="9" rx="3.2" ry="3.2" fill="none" stroke="${c}" stroke-width="1.8"/>` +
      `<path d="M6 14h20v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="${c}" opacity=".68"/><ellipse cx="16" cy="14" rx="10" ry="3" fill="${c}"/>`,
    fountain: (c) =>
      `<path d="M6 27h20l-2-6H8z" fill="${c}" opacity=".82"/><path d="M16 21V9" stroke="${c}" stroke-width="2"/>` +
      `<path d="M16 9c-3.4 2.4-6.6 3-9 2.4M16 9c3.4 2.4 6.6 3 9 2.4" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
    door: (c) =>
      `<path d="M8 27V10a8 8 0 0 1 16 0v17z" fill="${c}" opacity=".72"/>` +
      `<path d="M14 27V12a2 2 0 0 1 4 0v15z" fill="#0e0b16" opacity=".45"/><circle cx="20" cy="18" r="1.2" fill="#fff" opacity=".55"/>`,
    throne: (c) =>
      `<path d="M8 4h4v10h8V4h4v14H8z" fill="${c}" opacity=".8"/><path d="M9 18h14v6H9z" fill="${c}" opacity=".58"/>` +
      `<path d="M10 24v4M22 24v4" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
    frame: (c) =>
      `<rect x="4.5" y="6.5" width="23" height="19" rx="2" fill="none" stroke="${c}" stroke-width="2.2"/>` +
      `<path d="M7.5 20l5-6 4 4.4 3.4-3.6 4.6 5.2" fill="none" stroke="${c}" stroke-width="1.6" opacity=".65"/>` +
      `<circle cx="11" cy="11.6" r="1.8" fill="${c}" opacity=".65"/>`,
    pipe: (c) =>
      `<path d="M8 5v9a5 5 0 0 0 5 5h8" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M21 19v7" stroke="${c}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M5 5h6M18 26h6" stroke="${c}" stroke-width="1.4" opacity=".45"/>`,
    stump: (c) =>
      `<path d="M9 12c0-2.6 3.2-4.6 7-4.6s7 2 7 4.6v9c0 4-3.2 6.6-7 6.6s-7-2.6-7-6.6z" fill="${c}" opacity=".76"/>` +
      `<ellipse cx="16" cy="12" rx="7" ry="4.6" fill="${c}"/>` +
      `<ellipse cx="16" cy="12" rx="4" ry="2.5" fill="none" stroke="#221a2e" stroke-width="1.1" opacity=".38"/>` +
      `<ellipse cx="16" cy="12" rx="1.8" ry="1.1" fill="none" stroke="#221a2e" stroke-width="1" opacity=".32"/>`,
    ship: (c) =>
      `<path d="M5 18h22l-3.4 7.4a3 3 0 0 1-2.7 1.6H11a3 3 0 0 1-2.7-1.6z" fill="${c}" opacity=".85"/>` +
      `<path d="M16 4v13" stroke="${c}" stroke-width="2"/><path d="M17 6l6 5-6 1.6z" fill="${c}" opacity=".65"/>`
  };

  function glyph(item, size) {
    const key = item.g || item.glyph;
    const fn = glyphPath[key] || glyphPath.orb;
    // 同一个字形给不同词条一点点角度差，避免并排看时"完全一样"
    let h = 0;
    for (let i = 0; i < item.id.length; i++) h = (h * 31 + item.id.charCodeAt(i)) % 997;
    const rot = ((h % 9) - 4) * 1.1;
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" style="color:${item.color};filter:brightness(.62) saturate(1.25);transform:rotate(${rot.toFixed(1)}deg)">${fn(item.color)}</svg>`;
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
