/* Synthetisierte Soundeffekte & Musik – keine Audiodateien nötig */
(function () {
  class Sfx {
    constructor() {
      this.ctx = null; this.master = null; this.musicBus = null;
      this.enabled = localStorage.getItem('sh_sfx') !== '0';
      this.musicOn = false; this._musicTimer = null; this._drone = null;
    }
    unlock() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.ctx) {
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.8;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp); comp.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0;
        this.musicBus.connect(this.master);
        this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = this.enabled ? 1 : 0;
        this.sfxBus.connect(this.master);
        this._noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const d = this._noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }
    get ready() { return !!this.ctx; }
    setEnabled(on) {
      this.enabled = on; localStorage.setItem('sh_sfx', on ? '1' : '0');
      if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    }
    tone(freq, dur, o = {}) {
      const c = this.ctx, t = c.currentTime + (o.delay || 0);
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
      if (o.detune) osc.detune.value = o.detune;
      const vol = o.vol ?? 0.25, att = o.attack ?? 0.01;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc;
      if (o.lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lowpass; node.connect(f); node = f; }
      node.connect(g); g.connect(o.bus || this.sfxBus);
      osc.start(t); osc.stop(t + dur + 0.05);
    }
    noise(dur, o = {}) {
      const c = this.ctx, t = c.currentTime + (o.delay || 0);
      const src = c.createBufferSource(); src.buffer = this._noiseBuf;
      const f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.setValueAtTime(o.freq || 2000, t);
      if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
      f.Q.value = o.q || 1;
      const g = c.createGain(), vol = o.vol ?? 0.3;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (o.attack ?? 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxBus);
      src.start(t, Math.random()); src.stop(t + dur + 0.05);
    }
    play(name) {
      if (!this.ctx || !this.enabled) return;
      try { (this.sounds[name] || (() => {})).call(this); } catch (e) { /* ignore */ }
    }
    vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }

    // ---------- Musik: dunkler, langsamer Ambient-Teppich ----------
    setMusic(on) {
      this.musicOn = on; localStorage.setItem('sh_music', on ? '1' : '0');
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setTargetAtTime(on ? 0.5 : 0, t, 0.8);
      if (on && !this._drone) this._startDrone();
    }
    _startDrone() {
      const c = this.ctx;
      const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 380; filt.Q.value = 4;
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 0.07; lfoG.gain.value = 180; lfo.connect(lfoG); lfoG.connect(filt.frequency); lfo.start();
      const g = c.createGain(); g.gain.value = 0.18;
      filt.connect(g); g.connect(this.musicBus);
      const oscs = [55, 55.4, 82.4, 110.2].map((f, i) => {
        const o = c.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.connect(filt); o.start(); return o;
      });
      this._drone = { oscs, filt };
      const chords = [[55, 82.4], [49, 73.4], [43.65, 65.4], [51.9, 77.8]];
      let ci = 0;
      const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
      this._musicTimer = setInterval(() => {
        if (!this.musicOn) return;
        const now = c.currentTime;
        ci = (ci + 1) % chords.length;
        const [a, b] = chords[ci];
        oscs[0].frequency.setTargetAtTime(a, now, 1.5); oscs[1].frequency.setTargetAtTime(a * 1.007, now, 1.5);
        oscs[2].frequency.setTargetAtTime(b, now, 1.5); oscs[3].frequency.setTargetAtTime(a * 2, now, 1.5);
        for (let k = 0; k < 3; k++) {
          if (Math.random() < 0.6) this.tone(scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.3 ? 0.5 : 1), 2.8, { type: 'triangle', vol: 0.05, attack: 0.4, delay: k * 1.6 + Math.random(), bus: this.musicBus, lowpass: 1600 });
        }
      }, 6000);
    }
  }

  Sfx.prototype.sounds = {
    click() { this.tone(900, 0.06, { type: 'square', vol: 0.06, lowpass: 2500 }); },
    select() { this.tone(660, 0.08, { type: 'triangle', vol: 0.15 }); this.tone(990, 0.1, { type: 'triangle', vol: 0.1, delay: 0.04 }); },
    join() { this.tone(523, 0.15, { type: 'triangle', vol: 0.2 }); this.tone(784, 0.25, { type: 'triangle', vol: 0.2, delay: 0.09 }); },
    leave() { this.tone(523, 0.15, { type: 'triangle', vol: 0.15 }); this.tone(349, 0.25, { type: 'triangle', vol: 0.15, delay: 0.09 }); },
    whoosh() { this.noise(0.45, { filter: 'bandpass', freq: 400, sweep: 3000, q: 1.5, vol: 0.25, attack: 0.15 }); },
    card() { this.noise(0.12, { filter: 'highpass', freq: 2500, vol: 0.2 }); this.tone(180, 0.08, { vol: 0.12 }); },
    stamp() { this.tone(110, 0.35, { vol: 0.7, slide: 40 }); this.noise(0.12, { freq: 900, vol: 0.45 }); this.noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.15 }); },
    liberal() {
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => this.tone(f, 1.2, { type: 'triangle', vol: 0.18, delay: i * 0.09 }));
      [1046.5, 1318.5].forEach((f, i) => this.tone(f, 1.6, { type: 'sine', vol: 0.08, delay: 0.4 + i * 0.1 }));
    },
    fascist() {
      [110, 130.8, 164.8].forEach((f) => this.tone(f, 1.8, { type: 'sawtooth', vol: 0.16, lowpass: 700, attack: 0.05 }));
      this.tone(55, 1.2, { vol: 0.6, slide: 35 });
      this.noise(0.5, { freq: 200, vol: 0.4 });
    },
    voteCast() { this.tone(440, 0.07, { type: 'square', vol: 0.05, lowpass: 1800 }); this.tone(660, 0.09, { type: 'square', vol: 0.05, lowpass: 1800, delay: 0.05 }); },
    drumroll() { for (let i = 0; i < 26; i++) this.noise(0.05, { freq: 600 + i * 30, vol: 0.05 + i * 0.012, delay: i * 0.045 }); this.tone(70, 0.3, { vol: 0.5, delay: 1.2, slide: 45 }); },
    ja() { this.tone(523, 0.18, { type: 'triangle', vol: 0.25 }); this.tone(659, 0.18, { type: 'triangle', vol: 0.25, delay: 0.12 }); this.tone(784, 0.5, { type: 'triangle', vol: 0.25, delay: 0.24 }); },
    nein() { this.tone(330, 0.25, { type: 'sawtooth', vol: 0.15, lowpass: 1200 }); this.tone(233, 0.6, { type: 'sawtooth', vol: 0.15, lowpass: 900, delay: 0.2 }); },
    tick() { this.tone(1400, 0.04, { type: 'square', vol: 0.06 }); this.tone(1000, 0.05, { type: 'square', vol: 0.05, delay: 0.12 }); },
    tracker() { this.tone(300, 0.12, { type: 'square', vol: 0.08, lowpass: 1500 }); this.tone(240, 0.3, { type: 'square', vol: 0.08, lowpass: 1500, delay: 0.12 }); this.noise(0.15, { freq: 1200, vol: 0.2, delay: 0.1 }); },
    chaos() {
      [98, 103.8, 146.8, 155.6].forEach((f, i) => this.tone(f, 2.2, { type: 'sawtooth', vol: 0.12, lowpass: 900, attack: 0.3, delay: i * 0.05 }));
      for (let i = 0; i < 6; i++) this.noise(0.18, { freq: 300, vol: 0.3, delay: i * 0.22 });
    },
    nominate() { this.tone(392, 0.15, { type: 'triangle', vol: 0.18 }); this.tone(587, 0.3, { type: 'triangle', vol: 0.18, delay: 0.1 }); },
    power() { this.tone(146.8, 0.9, { type: 'sawtooth', vol: 0.15, lowpass: 600 }); this.tone(138.6, 1.4, { type: 'sawtooth', vol: 0.15, lowpass: 600, delay: 0.5 }); this.tone(73.4, 1.6, { vol: 0.4, delay: 0.5 }); },
    investigate() { [880, 1174, 880, 1174].forEach((f, i) => this.tone(f, 0.2, { type: 'sine', vol: 0.1, delay: i * 0.18 })); },
    gunshot() {
      this.noise(0.9, { freq: 4000, sweep: 300, vol: 1, attack: 0.002 });
      this.tone(120, 0.5, { vol: 0.9, slide: 30, attack: 0.002 });
      this.noise(1.6, { freq: 500, vol: 0.12, delay: 0.25, attack: 0.2 });
    },
    veto() { this.tone(200, 0.15, { type: 'square', vol: 0.12, lowpass: 1000 }); this.tone(200, 0.3, { type: 'square', vol: 0.12, lowpass: 1000, delay: 0.2 }); this.noise(0.3, { freq: 2000, vol: 0.2, delay: 0.2 }); },
    alert() { this.tone(880, 0.12, { type: 'triangle', vol: 0.25 }); this.tone(1320, 0.25, { type: 'triangle', vol: 0.25, delay: 0.13 }); },
    reveal() { this.noise(0.25, { filter: 'bandpass', freq: 1500, sweep: 400, vol: 0.2 }); this.tone(330, 0.3, { type: 'triangle', vol: 0.12, delay: 0.1 }); },
    start() { [196, 246.9, 293.7, 392].forEach((f, i) => this.tone(f, 0.8, { type: 'sawtooth', vol: 0.1, lowpass: 1400, delay: i * 0.14 })); this.tone(49, 1.5, { vol: 0.5, delay: 0.5 }); },
    winLiberal() {
      const seq = [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5];
      seq.forEach((f, i) => this.tone(f, i === seq.length - 1 ? 1.8 : 0.3, { type: 'triangle', vol: 0.22, delay: i * 0.15 }));
      [523.3, 659.3, 784].forEach((f) => this.tone(f, 2.4, { type: 'sawtooth', vol: 0.06, lowpass: 2000, delay: 1.05 }));
    },
    winFascist() {
      [220, 207.7, 196, 174.6, 164.8].forEach((f, i) => this.tone(f, 0.9, { type: 'sawtooth', vol: 0.18, lowpass: 800, delay: i * 0.38 }));
      this.tone(41.2, 3, { vol: 0.8, delay: 1.9, slide: 30 });
      this.noise(2.5, { freq: 250, vol: 0.4, delay: 1.9 });
    },
  };

  window.SFX = new Sfx();
})();
