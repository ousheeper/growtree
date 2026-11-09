/**
 * 轻量音效：全部用 Web Audio 现场合成，不加载任何音频文件。
 * 设计目标：贴耳但不抢戏；默认 50% 音量，关掉后不创建 AudioContext。
 */
(function () {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const S = {
    ctx: null,
    master: null,
    comp: null,
    noiseBuf: null,
    enabled: true,
    volume: 0.5,
    visible: true,
    gestured: false, // 用户还没点过：先不建 AudioContext，也不放雨声
    wantRain: false,
    rain: null,
    rainTimer: null,

    init(opts) {
      const o = opts || {};
      this.enabled = o.enabled !== false;
      const v = Number(o.volume);
      this.volume = isFinite(v) ? clamp(v, 0, 1) : 0.5;
      // 首次交互再建 AudioContext：Electron 里没有手势直接建会被挂起
      const wake = () => {
        this.gestured = true;
        this.resume();
      };
      document.addEventListener('pointerdown', wake, { passive: true });
      document.addEventListener('keydown', wake);
      document.addEventListener('visibilitychange', () => {
        this.visible = !document.hidden;
        this.applyGain(0.08);
      });
    },

    ensure() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -20;
        this.comp.knee.value = 18;
        this.comp.ratio.value = 4;
        this.comp.attack.value = 0.004;
        this.comp.release.value = 0.2;
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);
        this.noiseBuf = this.makeNoise();
        this.applyGain(0.03);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    },

    resume() {
      this.gestured = true;
      const ctx = this.ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      this.applyGain(0.06);
      if (this.wantRain) this.startRain();
    },

    targetGain() {
      return this.enabled && this.visible ? this.volume * 0.9 : 0;
    },

    applyGain(ramp) {
      if (!this.ctx || !this.master) return;
      const t = this.ctx.currentTime;
      const g = this.targetGain();
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(g, t, ramp == null ? 0.03 : ramp);
    },

    setEnabled(on) {
      this.enabled = !!on;
      if (!this.enabled) {
        this.stopRain();
      } else if (this.wantRain) {
        this.startRain();
      }
      this.applyGain(0.08);
    },

    setVolume(v) {
      this.volume = clamp(Number(v) || 0, 0, 1);
      this.applyGain(0.08);
    },

    makeNoise() {
      const len = Math.floor(this.ctx.sampleRate * 2);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = last * 0.86 + w * 0.14;
        d[i] = last;
      }
      return buf;
    },

    /* 一个带包络的振荡器 */
    tone(freq, dur, opts) {
      const o = opts || {};
      const ctx = this.ensure();
      if (!ctx || !this.enabled) return;
      const t = ctx.currentTime + (o.delay || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
      const peak = o.gain == null ? 0.05 : o.gain;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.03);
    },

    /* 一段过滤噪声（水、木屑、风声都用它） */
    noise(dur, opts) {
      const o = opts || {};
      const ctx = this.ensure();
      if (!ctx || !this.enabled) return;
      const t = ctx.currentTime + (o.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = o.type || 'bandpass';
      f.frequency.setValueAtTime(o.freq || 900, t);
      f.Q.value = o.q == null ? 1 : o.q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.gain == null ? 0.08 : o.gain, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t, Math.random() * 1.2, dur + 0.02);
      src.stop(t + dur + 0.04);
    },

    /* ---------- 动作音效 ---------- */
    water() {
      this.noise(0.45, { type: 'bandpass', freq: 1150, q: 1.1, gain: 0.07 });
      [0, 0.11, 0.23].forEach((d, i) => {
        this.tone(780 + i * 70, 0.13, { delay: d, to: 420, gain: 0.032, type: 'sine' });
      });
    },

    snip() {
      this.noise(0.05, { type: 'highpass', freq: 2400, gain: 0.055 });
      this.noise(0.05, { type: 'highpass', freq: 2700, gain: 0.045, delay: 0.085 });
      this.tone(2800, 0.05, { gain: 0.01, type: 'triangle', delay: 0.03 });
    },

    pick() {
      this.tone(659.25, 0.32, { gain: 0.038, type: 'sine' });
      this.tone(987.77, 0.38, { gain: 0.024, type: 'sine', delay: 0.07 });
    },

    poke() {
      this.tone(190, 0.11, { to: 130, gain: 0.032, type: 'sine' });
      this.noise(0.04, { type: 'lowpass', freq: 700, gain: 0.018 });
    },

    levelUp() {
      // 一次加很多经验可能连升好几级：别把四音阶叠成一片
      const now = Date.now();
      if (now - (this._lvAt || 0) < 600) return;
      this._lvAt = now;
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        this.tone(f, 0.95, { delay: i * 0.1, gain: 0.032, type: 'sine' });
      });
      this.tone(130.81, 1.4, { gain: 0.018, type: 'triangle' });
      this.noise(0.25, { type: 'highpass', freq: 5000, gain: 0.012, delay: 0.02 });
    },

    achievement() {
      this.tone(659.25, 0.85, { gain: 0.032, type: 'triangle' });
      this.tone(987.77, 0.95, { gain: 0.026, type: 'sine', delay: 0.12 });
      this.noise(0.22, { type: 'highpass', freq: 5200, gain: 0.011, delay: 0.03 });
    },

    ui() {
      this.tone(1200, 0.03, { gain: 0.009, type: 'sine' });
    },

    droplet() {
      this.tone(1100 + Math.random() * 500, 0.09, { to: 520, gain: 0.01, type: 'sine' });
    },

    /* ---------- 雨声：噪声循环 + 稀疏雨滴 ---------- */
    setRain(on) {
      this.wantRain = !!on;
      if (this.wantRain && this.enabled) this.startRain();
      else this.stopRain();
    },

    startRain() {
      if (this.rain || !this.wantRain || !this.enabled || !this.gestured) return;
      const ctx = this.ensure();
      if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 320;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      src.start();
      g.gain.setTargetAtTime(0.032, ctx.currentTime, 1.4);
      this.rain = { src, g };
      const drop = () => {
        if (!this.rain || !this.enabled) return;
        this.droplet();
        this.rainTimer = setTimeout(drop, 1200 + Math.random() * 2600);
      };
      clearTimeout(this.rainTimer);
      this.rainTimer = setTimeout(drop, 900);
    },

    stopRain() {
      clearTimeout(this.rainTimer);
      this.rainTimer = null;
      const r = this.rain;
      this.rain = null;
      if (!r || !this.ctx) return;
      const t = this.ctx.currentTime;
      r.g.gain.cancelScheduledValues(t);
      r.g.gain.setTargetAtTime(0.0001, t, 0.25);
      setTimeout(() => {
        try {
          r.src.stop();
        } catch (e) {
          /* already stopped */
        }
      }, 1400);
    },

    /* 测试用：返回当前音频状态，不产生声音 */
    state() {
      return {
        created: !!this.ctx,
        ctxState: this.ctx ? this.ctx.state : null,
        enabled: this.enabled,
        volume: this.volume,
        visible: this.visible,
        wantRain: this.wantRain,
        raining: !!this.rain,
        masterGain: this.master ? Number(this.master.gain.value.toFixed(3)) : null
      };
    }
  };

  window.Sound = S;
})();
