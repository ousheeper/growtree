/**
 * 图鉴词条库（素材 / 造物 / 遗迹）
 * rarity: 1 常见 · 2 少见 · 3 稀有 · 4 神话
 */
(function () {
  const I = (id, name, cat, rarity, glyph, color, desc) => ({ id, name, cat, rarity, glyph, color, desc });

  const items = [
    // ---------- 素材 ----------
    I('moss', '潮湿的苔', 'material', 1, 'leaf', '#5f9e79', '从树皮裂缝里渗出的第一层绿意，摸起来像温热的呼吸。'),
    I('vine', '银线藤', 'material', 2, 'tentacle', '#c9c2e4', '会在夜里自己绕圈，绕到第七圈时轻轻勒住你的手指。'),
    I('shell', '空壳螺', 'material', 1, 'shell', '#d9bfa0', '壳口朝向北方，里面住着一段早已退潮的回声。'),
    I('eyeflower', '眼球花', 'material', 3, 'eye', '#c79bff', '花心的瞳孔会跟着你移动，据说它比主人更早知道结局。'),
    I('pale-fungus', '苍白菌簇', 'material', 1, 'mushroom', '#e6e0d2', '长在背光处，一碰就散成一片细雪般的孢子。'),
    I('silk', '蛛丝苔', 'material', 1, 'leaf', '#8fb9a0', '黏而凉，扯开时有极细的丝线在空气里震。'),
    I('dew', '夜露', 'material', 1, 'orb', '#7fe0ff', '凌晨三点凝成，四点就会自己蒸发，只有被记下的那滴能留下。'),
    I('obsidian', '黑曜碎片', 'material', 2, 'crystal', '#6d5ac0', '断面能照出不属于此刻的倒影。'),
    I('whisker', '垂丝触须', 'material', 2, 'tentacle', '#a98bff', '柔软却不可折断，越靠近根部它越兴奋地颤。'),
    I('leafsoil', '腐叶土', 'material', 1, 'leaf', '#7a5c3f', '一切生长最初的味道，湿、甜、微微发酸。'),
    I('spore', '磷光孢子', 'material', 2, 'orb', '#7fe6b0', '在暗处发蓝绿色的光，成群时会缓慢地排列成字。'),
    I('whalebone', '鲸骨屑', 'material', 2, 'bone', '#efe7d6', '很轻，握久了会听见远处的低频鼓动。'),
    I('whisperfruit', '低语果', 'material', 3, 'bloom', '#ff9dc4', '咬开前它会小声劝你别咬，但味道实在很像小时候的糖。'),
    I('salt', '盐晶', 'material', 1, 'crystal', '#cfe6f2', '苦涩的结晶体，是某片海被抽干后留下的证词。'),
    I('tearstone', '月泪石', 'material', 3, 'orb', '#f4d9ff', '只在满月的枝头出现，取出时必然碎掉一角。'),
    I('knot', '缠根结', 'material', 2, 'tentacle', '#8a6a4f', '十七根根须互相缠绕成的死结，从来没有被解开过。'),
    I('ash', '灰烬皮', 'material', 1, 'leaf', '#6b6560', '烧过又活下来的树才有的表皮，抠一小块像抠下夜色。'),
    I('scale', '深潜鳞', 'material', 3, 'shell', '#4f7f8f', '带着压强才会产生的纹路，贴耳能听见水压的嗡声。'),

    // ---------- 造物 ----------
    I('staff', '断枝权杖', 'creation', 2, 'rune', '#e6c684', '把最先生长的那根枝条折下，它就再也不会停止生长。'),
    I('bell', '瞳之铃', 'creation', 3, 'bell', '#ff9dc4', '摇动时响起的是别人的心跳。'),
    I('lantern', '絮语灯笼', 'creation', 2, 'orb', '#ffd9a0', '装着三句没能说出口的话，夜里会自己亮起来重复播放。'),
    I('mask', '根须面具', 'creation', 3, 'shell', '#c9a06a', '戴上之后你能听懂植物的语言，代价是忘记一句人话。'),
    I('seed', '眠梦种子', 'creation', 4, 'orb', '#a98bff', '里面封着一整片森林的梦，重量却比一片叶子还轻。'),
    I('amulet', '深潜者护符', 'creation', 3, 'eye', '#4f8f8f', '在深水里不会窒息，只是会开始想家——那个你从未去过的家。'),
    I('coral-crown', '珊瑚冠', 'creation', 2, 'branch', '#ff8fb3', '戴上它，头发会缓慢变成会开花的细枝。'),
    I('hollow-eye', '空洞之眼', 'creation', 4, 'eye', '#7fe0ff', '看进去只会看见自己正在看它，循环得让人头晕。'),
    I('star-needle', '星髓针', 'creation', 3, 'crystal', '#f4d9ff', '缝合伤口也缝合裂缝，缝过的地方面无表情。'),
    I('sunken-bell', '沉钟', 'creation', 2, 'bell', '#d9bfa0', '沉在泥里，却每隔一段时间在自己内部敲一下。'),
    I('book', '无名之书', 'creation', 4, 'rune', '#c79bff', '每读一页，书就少一页，而你多记得一件不属于你的事。'),
    I('vine-armor', '藤甲碎片', 'creation', 2, 'leaf', '#3f7d5e', '活着时会自己收紧，像被谁抱住。'),
    I('chrysalis', '蛹壳灯', 'creation', 2, 'orb', '#ffd9a0', '里面那点光还在按某种节律一明一暗。'),
    I('symbiote', '共生菌瓶', 'creation', 3, 'mushroom', '#7fe6b0', '瓶里的菌落会认主，认得久了会替你消化情绪。'),
    I('hourglass', '潮汐沙漏', 'creation', 3, 'rune', '#7fe0ff', '沙落得快慢取决于你离海的远近。'),
    I('silence-ring', '静默之环', 'creation', 4, 'orb', '#e9d6ff', '戴上它听不到任何声音，包括自己的。'),
    I('thorn-pen', '刺笔', 'creation', 1, 'rune', '#d9c9a8', '写下的字会慢慢长出小刺，提醒你别轻易许诺。'),
    I('lullaby', '摇篮曲匣', 'creation', 2, 'bell', '#b58cff', '打开就会有人替你哼完那段走调的旋律。'),

    // ---------- 遗迹 ----------
    I('altar', '沉没祭坛', 'relic', 3, 'rune', '#8a8f9f', '台阶上留着一种从未属于人类的三趾脚印。'),
    I('stair', '石阶残片', 'relic', 2, 'rune', '#a09a8c', '朝下走是完整的，朝上看却永远缺最后一级。'),
    I('stele', '无名碑文', 'relic', 3, 'rune', '#c9c2e4', '所有字都被磨平了，只有最边缘一个偏旁还清晰。'),
    I('throne', '藤蔓王座', 'relic', 4, 'tentacle', '#4f7f8f', '坐上去的人会成为这片林子的意志，然后再也不算人。'),
    I('aqueduct', '锈蚀水道', 'relic', 2, 'rune', '#8a6a4f', '管道里仍在流动，声音像一列远去的火车。'),
    I('mural', '苔痕壁画', 'relic', 2, 'leaf', '#5f9e79', '画上一棵树在吃一座城，画得很温柔。'),
    I('circle', '环形石阵', 'relic', 3, 'rune', '#a99cc4', '站在圆心，所有声音会延迟一秒才到达耳朵。'),
    I('tideye', '地底潮眼', 'relic', 4, 'eye', '#7fe0ff', '往下三十米还有一层海，它会定期眨眼。'),
    I('skull', '古树颅骨', 'relic', 3, 'bone', '#e6e0d2', '年轮长得像脑回，那年应该发生了很糟的事。'),
    I('arch', '珊瑚拱门', 'relic', 2, 'branch', '#ff8fb3', '穿过去的人会短暂地想起某段不属于自己的童年。'),
    I('pillar', '第七根支柱', 'relic', 3, 'crystal', '#c9c2e4', '六根支撑着穹顶，第七根支撑着别的东西。'),
    I('abyss-stair', '深渊阶梯', 'relic', 4, 'rune', '#6d5ac0', '往下数到第九十九级时，会开始听见有人喊你的名字。'),

    // ---------- 素材 · 补 ----------
    I('lumen', '萤囊', 'material', 2, 'orb', '#d9f27f', '一小团还没散尽的光，握久了会在掌纹里留下淡绿的痕。'),
    I('thorn', '枯枝刺', 'material', 1, 'branch', '#8a6a4f', '折下来不会立刻断，要等你松手的那一瞬。'),
    I('verdigris', '铜绿锈', 'material', 2, 'rune', '#6fae9a', '某种金属活过的证据，凑近闻有雨的腥味。'),
    I('wax', '蜂蜡', 'material', 1, 'orb', '#e8c87a', '温的，捏起来像一小块会呼吸的黄昏。'),
    I('shadefuzz', '影绒', 'material', 3, 'tentacle', '#5a5470', '从背光面剪下来的绒毛，在灯下会自己往暗处缩。'),
    I('coldash', '冷灰', 'material', 1, 'leaf', '#7b7a86', '烧过三次以上才会有的灰，摸起来一点温度也没有。'),
    I('scalepowder', '鳞粉', 'material', 3, 'orb', '#a8c6ff', '在指缝间流过时，会短暂地映出别人的手。'),
    I('ironvine', '铁线藤', 'material', 2, 'tentacle', '#9aa0b8', '硬得能当铁丝用，但它更喜欢自己决定往哪儿长。'),

    // ---------- 造物 · 补 ----------
    I('bonepipe', '骨笛', 'creation', 3, 'rune', '#e6e0d2', '吹出来的不是音，是一段被拉长的安静。'),
    I('echobottle', '回声瓶', 'creation', 2, 'orb', '#7fe0ff', '装着三年前某个下午的一句话，倒出来还是会回响。'),
    I('mosslamp', '苔藓灯罩', 'creation', 2, 'mushroom', '#7fe6b0', '越潮越亮，干燥的时候会闹脾气地暗下去。'),
    I('tricompass', '三相罗盘', 'creation', 4, 'rune', '#e6c684', '指针有三个，分别指向你失去的、未得的、和不敢看的。'),
    I('vinelock', '藤蔓锁', 'creation', 3, 'tentacle', '#3f7d5e', '钥匙就是你松开手这件事，很少有人做到。'),
    I('leafmark', '眠叶书签', 'creation', 1, 'leaf', '#ff9dc4', '夹进书里，那一页就永远停在最困的时刻。'),
    I('astrolabe', '星盘碎片', 'creation', 3, 'crystal', '#c79bff', '缺了一角，但缺的那角正好是它指得最准的方向。'),
    I('vineladder', '藤梯', 'creation', 2, 'branch', '#8a6a4f', '往下放会自己长，往上爬却总觉得少一级。'),

    // ---------- 遗迹 · 补 ----------
    I('oldbridge', '半埋拱桥', 'relic', 2, 'rune', '#9a9a8c', '桥面陷进土里一半，仍有一个影子每天从上面走过。'),
    I('stonewell', '石眼井', 'relic', 3, 'eye', '#8fa8b8', '往下看会看到自己抬头，慢半拍。'),
    I('stelefield', '苔碑群', 'relic', 2, 'rune', '#6f8f7f', '每一块都写着一模一样的名字，只是日期不同。'),
    I('burstpipe', '断裂水管', 'relic', 1, 'rune', '#8a6a4f', '断口处还在滴水，滴了不知道多少年。'),
    I('cellardoor', '地窖门', 'relic', 3, 'rune', '#6a5a4a', '门后没有地窖，只有更凉一点的空气。'),
    I('dryfountain', '干涸喷泉', 'relic', 2, 'orb', '#b0a8c0', '池底积着硬币，全都是同一年的。'),
    I('stumpaltar', '老树桩祭台', 'relic', 4, 'branch', '#a08868', '年轮中心有个洞，洞里能听见自己心跳的回声。'),
    I('keel', '沉船龙骨', 'relic', 3, 'bone', '#d8c8b0', '木头里还存着那天海的方向。')
  ];

  window.CODEX_ITEMS = items;
  window.CODEX_MAP = items.reduce((m, it) => ((m[it.id] = it), m), {});
  window.CODEX_CATS = [
    { id: 'material', name: '素材', icon: '❦' },
    { id: 'creation', name: '造物', icon: '✶' },
    { id: 'relic', name: '遗迹', icon: '⌘' }
  ];
  window.CODEX_RARITY = { 1: '常见', 2: '少见', 3: '稀有', 4: '神话' };
})();
