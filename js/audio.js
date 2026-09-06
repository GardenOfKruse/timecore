/* 音效引擎：WebAudio 全合成（无素材文件）
 * 节拍提示音按绝对时间节点调度到音频时钟，采样级精准；3/2/1 强提示与到点音效始终保留 */
(function () {
  let ctx = null, master = null, noiseBuf = null, anchored = null;
  const tracks = {};   // 分轨音量：beat 提示 / cue 到点 / hit 击拍
  const scheduled = new Set();

  let vol = clampNum(parseFloat(localStorage.getItem('tc.vol')), 0, 1, 0.8);
  let muted = localStorage.getItem('tc.mute') === '1';
  let tickOn = localStorage.getItem('tc.tick') !== '0';   // 软节拍提示（起始秒可设）
  let softLead = clampNum(parseInt(localStorage.getItem('tc.softlead'), 10), 3, 60, 10);   // 距节点多少秒开始软节拍

  function clampNum(v, a, b, d) { return isFinite(v) ? Math.min(b, Math.max(a, v)) : d; }

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : vol * 0.9;
        master.connect(ctx.destination);
        let tv = {};
      try { tv = JSON.parse(localStorage.getItem('tc.track') || '{}'); } catch (_) {}
      ['beat', 'cue', 'hit'].forEach(k => {
        tracks[k] = ctx.createGain();
        tracks[k].gain.value = (isFinite(tv[k]) ? Math.min(1, Math.max(0, tv[k])) : 1);
        tracks[k].connect(master);
      });
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        anchor();
        setInterval(schedTick, 90);
      } catch (_) { return false; }   // 无音频设备等场景不得阻断击拍逻辑
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  // epoch 时间轴 ↔ 音频时钟 映射（每 30s 重锚定消除漂移）
  function anchor() { if (ctx) anchored = { t: ctx.currentTime, e: TC.time.epoch() }; }
  function tFor(e) { if (!anchored) anchor(); return anchored.t + (e - anchored.e) / 1000; }

  function osc(type, f0, f1, t0, dur, peak, cat) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect((cat && tracks[cat]) || master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, peak, freq, q, cat) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect((cat && tracks[cat]) || master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  const ready = () => ctx && ctx.state === 'running';

  const S = {
    tick(t) { osc('square', 1900, 1400, t, 0.03, 0.10, 'beat'); },   // 走提示音轨：受「提示音量」滑杆控制
    beep(k, t) {   // 3/2/1 递升
      const f = { 3: 880, 2: 988, 1: 1175 }[k] || 880;
      osc('triangle', f, f, t, 0.10, 0.30, 'beat');
      osc('sine', f * 2, f * 2, t, 0.07, 0.10, 'beat');
    },
    fire(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc('triangle', f, f, t + i * 0.02, 0.9, 0.20, 'cue'));
      osc('sine', 70, 38, t, 0.5, 0.5, 'cue');
      noise(t, 0.7, 0.28, 3200, 0.6, 'cue');
    },
    whooshUp() { if (!ready()) return; const t = ctx.currentTime; noise(t, 0.5, 0.14, 600, 0.8); osc('sine', 220, 660, t, 0.5, 0.10); },
    whooshHi() { if (!ready()) return; const t = ctx.currentTime; noise(t, 0.4, 0.18, 1400, 0.9); osc('sawtooth', 330, 880, t, 0.35, 0.07); },
    judge(label) {
      if (!ready()) return;
      const t = ctx.currentTime;
      if (label === 'PERFECT') { osc('sine', 1568, 1568, t, 0.10, 0.24, 'hit'); osc('sine', 2093, 2093, t + 0.03, 0.16, 0.20, 'hit'); }
      else if (label === 'GREAT') osc('sine', 1046, 1046, t, 0.12, 0.20, 'hit');
      else if (label === 'GOOD') osc('sine', 784, 784, t, 0.12, 0.16, 'hit');
      else { osc('sawtooth', 130, 60, t, 0.22, 0.22, 'hit'); noise(t, 0.18, 0.14, 240, 1, 'hit'); }
    },
    combo(n) {
      if (!ready()) return;
      const t = ctx.currentTime, base = 880 * Math.pow(2, (n % 12) / 12);
      osc('sine', base, base, t, 0.07, 0.13, 'hit');
      osc('sine', base * 1.5, base * 1.5, t + 0.05, 0.09, 0.11, 'hit');
    },
    ui() { if (!ready()) return; osc('sine', 660, 520, ctx.currentTime, 0.05, 0.07); }
  };

  /* 节点调度器：扫描临近的绝对节点并预排；隐藏页定时器被钳到 ~1s，加大预排窗口 */
  function schedTick() {
    if (!ready()) return;
    const e = TC.time.epoch();
    if (anchored && e - anchored.e > 30000) anchor();

    const look = document.hidden ? 1600 : 220;
    const cd = TC.Countdown.info();
    if (cd.armed && !cd.fired) {
      const kMin = Math.max(0, Math.ceil((cd.target - (e + look)) / 1000));
      const kMax = Math.floor((cd.target - (e - 40)) / 1000);
      for (let k = kMin; k <= kMax; k++) {
        const key = 'cd' + cd.target + ':' + k;
        if (scheduled.has(key)) continue;
        scheduled.add(key);
        const tt = tFor(cd.target - k * 1000);
        if (k === 0) S.fire(tt);
        else if (k <= 3) S.beep(k, tt);
        else if (k <= softLead && tickOn) S.tick(tt);
      }
    } else if (TC.Beats.stats().freerun && tickOn) {
      // 自由节拍器：与倒计时提示音同款可闻音量（此前是近乎听不见的极轻正弦）；
      // 倒计时进行中走上面分支不叠加，避免同一秒双音
      const next = Math.ceil((e + 180) / 1000) * 1000;
      const key = 'fr' + next;
      if (!scheduled.has(key)) { scheduled.add(key); S.tick(tFor(next)); }
    }
    if (scheduled.size > 4000) scheduled.clear();
  }

  TC.bus.on('cd:zero', ({ target }) => {
    // 双保险：调度器没排上（如音频被挂起）就在事件现场补放
    if (!scheduled.has('fire:' + target)) {
      if (!ensure()) return;
      if (ready()) S.fire(ctx.currentTime);
    }
  });
  TC.bus.on('cd:start', () => scheduled.clear());
  TC.bus.on('cd:stop', () => scheduled.clear());
  TC.bus.on('phase', ph => {
    if (!ensure() || !ready()) return;
    if (ph === 'WARMUP') S.whooshUp();
    else if (ph === 'SURGE') S.whooshHi();
  });
  TC.bus.on('beat:judge', rec => { if (!ensure()) return; S.judge(rec.label); if (rec.combo > 0 && rec.combo % 5 === 0) S.combo(rec.combo); });

  TC.Audio = {
    unlock: ensure,
    get muted() { return muted; },
    get volume() { return vol; },
    get tickOn() { return tickOn; },
    info() { return { state: ctx ? ctx.state : 'none', muted, vol, tickOn, softLead }; },
    get softLead() { return softLead; },
    setSoftLead(v) { softLead = clampInt(parseInt(v, 10), 3, 60, 10); localStorage.setItem('tc.softlead', String(softLead)); },
    setMute(m) { muted = !!m; localStorage.setItem('tc.mute', m ? '1' : '0'); if (master) master.gain.value = muted ? 0 : vol * 0.9; TC.bus.emit('mute', muted); },
    setVolume(v) { vol = clampNum(v, 0, 1, 0.8); localStorage.setItem('tc.vol', String(vol)); if (master && !muted) master.gain.value = vol * 0.9; },
    setTick(on) { tickOn = !!on; localStorage.setItem('tc.tick', on ? '1' : '0'); },
    get softLead() { return softLead; },
    setSoftLead(v) { softLead = clampNum(parseInt(v, 10), 3, 60, 10); localStorage.setItem('tc.softlead', String(softLead)); },
    track(cat) { return tracks[cat] ? tracks[cat].gain.value : 1; },
    setTrack(cat, v) { if (tracks[cat]) { tracks[cat].gain.value = Math.min(1, Math.max(0, v)); let tv = {}; try { tv = JSON.parse(localStorage.getItem('tc.track') || '{}'); } catch (_) {} tv[cat] = tracks[cat].gain.value; localStorage.setItem('tc.track', JSON.stringify(tv)); } }
  };
})();
