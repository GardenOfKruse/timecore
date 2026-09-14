/* 音效引擎：WebAudio 全合成（无素材文件）
 * 节拍提示音按绝对时间节点调度到音频时钟，采样级精准；3/2/1 强提示与到点音效始终保留 */
(function () {
  let ctx = null, master = null, noiseBuf = null, anchored = null, wk = null;
  const tracks = {};   // 分轨音量：beat 提示 / cue 到点 / hit 击拍
  const scheduled = new Set();
  let queued = [];     // 已排入音频时钟的节点 {src, t0, cat}：cd:stop 时可撤销未开始的提示/到点音
  const metroFull = localStorage.getItem('tc.metrofull') !== '0';   // 倒计时全程节拍（节拍器开启时）

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
        // Worker 唤醒兜底：后台/遮挡时主线程定时器被钳到 ~1s，Worker 计时不受可见性节流，
        // 保证批量预排的入口（schedTick）在进入最后 10 秒时能及时跑一次
        try {
          wk = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),250)'], { type: 'text/javascript' })));
          wk.onmessage = () => schedTick();
        } catch (_) { wk = null; }
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
    queued.push({ src: o, t0, cat: cat || 'master' });
  }

  function noise(t0, dur, peak, freq, q, cat) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect((cat && tracks[cat]) || master);
    s.start(t0); s.stop(t0 + dur + 0.05);
    queued.push({ src: s, t0, cat: cat || 'master' });
  }

  // 撤销未开始的提示/到点音（cd:stop / 重新布防时调用；击拍音不受影响）；过期与已撤销的记录随手修剪
  function cancelPending() {
    if (!ctx) return;
    const cut = ctx.currentTime + 0.05;
    const keep = [];
    for (const q of queued) {
      if (q.t0 <= ctx.currentTime - 0.5) continue;   // 已响过：丢
      if (q.t0 > cut && (q.cat === 'beat' || q.cat === 'cue')) { try { q.src.stop(cut); } catch (_) {} continue; }   // 撤销：丢
      keep.push(q);
    }
    queued = keep;
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

  /* 节点调度器：扫描临近的绝对节点并预排；后台/遮挡时主线程定时器被钳到 ~1s，
   * 因此 hidden 时直接批量覆盖整个软节拍窗口（一次性排完 10 秒的所有音，之后 JS 睡着也不缺音），
   * 另有 Worker 每 250ms 唤醒本函数兜底 */
  function scheduleCd(e, look) {
    const cd = TC.Countdown.info();
    if (!(cd.armed && !cd.fired)) return;
    const kMin = Math.max(0, Math.ceil((cd.target - (e + look)) / 1000));
    const kMax = Math.floor((cd.target - (e - 40)) / 1000);
    const fr = TC.Beats.stats().freerun;
    for (let k = kMin; k <= kMax; k++) {
      const key = 'cd' + cd.target + ':' + k;
      if (scheduled.has(key)) continue;
      scheduled.add(key);
      const tt = tFor(cd.target - k * 1000);
      if (k === 0) { S.fire(tt); scheduled.add('fire:' + cd.target); }   // 登记 fire key：零点兜底以此判重（修既有双响）
      else if (k <= 3) S.beep(k, tt);
      else if (k <= softLead && tickOn) S.tick(tt);
      else if (tickOn && metroFull && fr) S.tick(tt);   // 全程节拍：软节拍窗口之外，节拍器开启即每秒提示
    }
  }

  function schedTick() {
    if (!ready()) return;
    const e = TC.time.epoch();
    if (anchored && e - anchored.e > 30000) anchor();

    const cd = TC.Countdown.info();
    if (cd.armed && !cd.fired) {
      // 隐藏时一次排完整个软节拍窗口（+3s 余量）；可见时贴近实时即可
      scheduleCd(e, document.hidden ? (softLead + 3) * 1000 : 220);
    } else if (TC.Beats.stats().freerun) {
      // 自由节拍器：与倒计时提示音同款可闻音量（此前是近乎听不见的极轻正弦）；
      // 不受「倒计时提示音」开关影响；倒计时进行中走上面分支不叠加，避免同一秒双音
      const next = Math.ceil((e + 180) / 1000) * 1000;
      const key = 'fr' + next;
      if (!scheduled.has(key)) { scheduled.add(key); S.tick(tFor(next)); }
    }
    if (scheduled.size > 4000) scheduled.clear();
  }

  TC.bus.on('cd:zero', ({ target }) => {
    // 双保险：调度器没排上（如音频被挂起）就在事件现场补放——fire key 现已正确登记，不会双响
    if (!scheduled.has('fire:' + target)) {
      if (!ensure()) return;
      if (ready()) S.fire(ctx.currentTime);
    }
  });
  TC.bus.on('cd:start', () => { scheduled.clear(); });
  TC.bus.on('cd:stop', () => { scheduled.clear(); cancelPending(); });   // 同时撤销已排未响的提示/到点音
  TC.bus.on('cd:advance', () => cancelPending());   // 上一轮残留的排音作废（正常情况下 fire 已响完，保险）
  TC.bus.on('phase', ph => {
    if (!ensure() || !ready()) return;
    if (ph === 'WARMUP' && document.hidden) scheduleCd(TC.time.epoch(), (softLead + 3) * 1000);   // 进入最后段瞬间批量预排（后台路径）
    if (ph === 'WARMUP') S.whooshUp();
    else if (ph === 'SURGE') S.whooshHi();
  });
  TC.bus.on('beat:judge', rec => { if (!ensure()) return; S.judge(rec.label); if (rec.combo > 0 && rec.combo % 5 === 0) S.combo(rec.combo); });

  TC.Audio = {
    unlock: ensure,
    get muted() { return muted; },
    get volume() { return vol; },
    get tickOn() { return tickOn; },
    info() {
      const ci = TC.Countdown.info();
      return { state: ctx ? ctx.state : 'none', muted, vol, tickOn, softLead, metroFull, worker: !!wk, scheduled: scheduled.size, queued: queued.length, hasFireKey: scheduled.has('fire:' + ci.target) };
    },
    // 测试/调试钩子：手动以指定预排窗口跑一次调度器（验证批量机制）
    debugSched(lookMs) { if (ensure()) scheduleCd(TC.time.epoch(), lookMs || 220); },
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
