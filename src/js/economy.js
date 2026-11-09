/**
 * 经济：收货价格、季节溢价、商店货架
 * 仓库和商店插件共用这里的定价，Store 负责真正加减金币/库存。
 */
(function () {
  'use strict';

  const TYPES = [
    { id: 'flower', name: '花', color: '#ff9dc4', base: 2 },
    { id: 'fruit', name: '果', color: '#a56ad8', base: 4 },
    { id: 'mushroom', name: '菌', color: '#e8ded1', base: 6 },
    { id: 'crystal', name: '晶', color: '#8fe6ff', base: 10 }
  ];

  /* 季节只改卖出价，不改基础价 */
  const SEASON_MUL = { spring: 1.1, summer: 1.0, autumn: 1.25, winter: 1.15 };

  const ICONS = {
    flower:
      '<g fill="currentColor"><ellipse cx="12" cy="7.4" rx="3.1" ry="4.4" opacity=".9"/>' +
      '<ellipse cx="12" cy="16.6" rx="3.1" ry="4.4" opacity=".9"/>' +
      '<ellipse cx="7.4" cy="12" rx="4.4" ry="3.1" opacity=".9"/>' +
      '<ellipse cx="16.6" cy="12" rx="4.4" ry="3.1" opacity=".9"/></g>' +
      '<circle cx="12" cy="12" r="2.5" fill="#ffe6a8"/>',
    fruit:
      '<circle cx="12" cy="14" r="6.2" fill="currentColor"/>' +
      '<path d="M12 8.4V4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M12 6.6c2.1-1.8 3.9-1.9 5.4-1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    mushroom:
      '<path d="M4 11.2c0-5.8 16-5.8 16 0 0 2-16 2-16 0Z" fill="currentColor"/>' +
      '<path d="M9.8 12h4.4v5.4a2.2 2.2 0 0 1-4.4 0Z" fill="currentColor" opacity=".55"/>' +
      '<circle cx="9" cy="8.6" r="1.2" fill="#fff" opacity=".65"/><circle cx="14.6" cy="9.4" r=".9" fill="#fff" opacity=".5"/>',
    crystal:
      '<path d="M12 2.6l6.4 7.2L12 21.4 5.6 9.8Z" fill="currentColor" opacity=".88"/>' +
      '<path d="M12 2.6l6.4 7.2H5.6Z" fill="#fff" opacity=".32"/>',
    fertilizer:
      '<path d="M6.4 8.4h11.2l1.4 10.2a2.2 2.2 0 0 1-2.2 2.4H7.2a2.2 2.2 0 0 1-2.2-2.4Z" fill="currentColor" opacity=".86"/>' +
      '<path d="M8.6 8.4V7a3.4 3.4 0 0 1 6.8 0v1.4" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M12 14.2c2.2 0 4 .9 4 2.6 0 1.4-1.8 2.2-4 2.2s-4-.8-4-2.2c0-1.7 1.8-2.6 4-2.6Z" fill="#1a1420" opacity=".28"/>',
    water:
      '<path d="M12 2.6c3.9 4.7 6 7.6 6 10.3a6 6 0 0 1-12 0c0-2.7 2.1-5.6 6-10.3Z" fill="currentColor"/>' +
      '<path d="M9.7 13.4c.2 1.8 1.2 2.7 2.7 2.9" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".5"/>',
    bloom:
      '<g fill="currentColor"><ellipse cx="12" cy="8" rx="2.7" ry="4" opacity=".88"/>' +
      '<ellipse cx="12" cy="16" rx="2.7" ry="4" opacity=".88"/>' +
      '<ellipse cx="8" cy="12" rx="4" ry="2.7" opacity=".88"/>' +
      '<ellipse cx="16" cy="12" rx="4" ry="2.7" opacity=".88"/></g>' +
      '<circle cx="12" cy="12" r="2.2" fill="#ffe6a8"/>' +
      '<path d="M19 3.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6Z" fill="#fff" opacity=".85"/>',
    lucky:
      '<path d="M12 3.4c2 0 3.2 1.4 3.2 3 0 .9-.4 1.7-1 2.3.6.6 1 1.4 1 2.3 0 1.6-1.2 3-3.2 3s-3.2-1.4-3.2-3c0-.9.4-1.7 1-2.3-.6-.6-1-1.4-1-2.3 0-1.6 1.2-3 3.2-3Z" fill="currentColor" opacity=".9"/>' +
      '<path d="M12 14.4V21" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="18.6" cy="5.4" r="1" fill="#fff" opacity=".8"/><circle cx="5.4" cy="7.4" r=".8" fill="#fff" opacity=".65"/>'
  };

  const SHOP = [
    {
      id: 'fertilizer',
      name: '腐殖肥料',
      price: 24,
      icon: 'fertilizer',
      tag: '生长',
      desc: '立刻 +80 生长值，树不会因此变形。'
    },
    {
      id: 'moist',
      name: '保湿剂',
      price: 18,
      icon: 'water',
      tag: '土壤',
      desc: '土壤直接浇到 100%，之后 30 分钟风干减半。'
    },
    {
      id: 'bloom',
      name: '催花剂',
      price: 40,
      icon: 'bloom',
      tag: '挂果',
      desc: '20 分钟内挂果密度 +20%，新枝头会更愿意开花。'
    },
    {
      id: 'lucky',
      name: '幸运露',
      price: 55,
      icon: 'lucky',
      tag: '图鉴',
      desc: '下一次升级必定收录一条还没见过的词条。'
    }
  ];

  const Economy = {
    TYPES,
    SHOP,
    SEASON_MUL,

    type(id) {
      return TYPES.find((t) => t.id === id) || null;
    },

    seasonMul(seasonId) {
      return SEASON_MUL[seasonId] || 1;
    },

    /* 冬天晶体额外贵一点：季节里唯一按品类加成的例外 */
    typeMul(id, seasonId) {
      if (seasonId === 'winter' && id === 'crystal') return 1.3;
      return 1;
    },

    priceOf(id, seasonId) {
      const t = this.type(id);
      if (!t) return 0;
      return Math.max(1, Math.round(t.base * this.seasonMul(seasonId) * this.typeMul(id, seasonId)));
    },

    valueOf(stock, seasonId) {
      let coins = 0;
      let count = 0;
      TYPES.forEach((t) => {
        const n = (stock && stock[t.id]) || 0;
        count += n;
        coins += n * this.priceOf(t.id, seasonId);
      });
      return { coins, count };
    },

    total(stock) {
      return TYPES.reduce((n, t) => n + ((stock && stock[t.id]) || 0), 0);
    },

    icon(name, size) {
      return (
        '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) + '" aria-hidden="true">' +
        (ICONS[name] || ICONS.flower) +
        '</svg>'
      );
    }
  };

  window.Economy = Economy;
})();
