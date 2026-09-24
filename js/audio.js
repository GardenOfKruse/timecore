/* 音效引擎：WebAudio 全合成（无素材文件）
 * 节拍提示音按绝对时间节点调度到音频时钟，采样级精准；3/2/1 强提示与到点音效始终保留 */
(function () {
  let schedulerStarted = false;
  const audioOutput = globalThis.TimeCoreDomain.createAudioOutput();
  const schedulePlanner = globalThis.TimeCoreDomain.createAudioSchedulePlanner();
  const scheduleCoordinator = globalThis.TimeCoreDomain.createAudioScheduleCoordinator(schedulePlanner);
  const metroFull = localStorage.getItem('tc.metrofull') !== '0';   // 倒计时全程节拍（节拍器开启时）

  let vol = clampNum(parseFloat(localStorage.getItem('tc.vol')), 0, 1, 0.8);
  let muted = localStorage.getItem('tc.mute') === '1';
  let tickOn = localStorage.getItem('tc.tick') !== '0';   // 软节拍提示（起始秒可设）
  let softLead = clampNum(parseInt(localStorage.getItem('tc.softlead'), 10), 3, 60, 10);   // 距节点多少秒开始软节拍
  let pack = TimeCoreDomain.soundPack(localStorage.getItem('tc.sndpack'));   // 音效主题包（v1.12.0）

  function clampNum(v, a, b, d) { return isFinite(v) ? Math.min(b, Math.max(a, v)) : d; }

  function ensure() {
    let tv = {};
    try { tv = JSON.parse(localStorage.getItem('tc.track') || '{}'); } catch (_) {}
    const ok = audioOutput.ensure({
      masterGain: muted ? 0 : vol * 0.9,
      trackGains: tv,
      onWake: () => schedTick()
    });
    if (!ok) return false;   // 无音频设备等场景不得阻断击拍逻辑
    if (!schedulerStarted) {
      schedulerStarted = true;
      anchor();
      setInterval(schedTick, 90);
    }
    return true;
  }

  // epoch 时间轴 ↔ 音频时钟 映射（每 30s 重锚定消除漂移）
  function anchor() {
    if (audioOutput.state() !== 'none') {
      const e = TC.time.epoch();
      const t = audioOutput.currentTime();
      scheduleCoordinator.anchor(e, t);
    }
  }

  function osc(type, f0, f1, t0, dur, peak, cat, pan) {
    audioOutput.playOscillator({ type, fromHz: f0, toHz: f1, startAt: t0, duration: dur, peak, track: cat, pan });
  }

  function noise(t0, dur, peak, freq, q, cat) {
    audioOutput.playNoise({ startAt: t0, duration: dur, peak, frequency: freq, quality: q, track: cat });
  }

  // 撤销未开始的提示/到点音（cd:stop / 重新布防时调用；击拍音不受影响）；过期与已撤销的记录随手修剪
  function cancelPending() { audioOutput.cancelPending(); }

  const ready = () => audioOutput.ready();

  // 到点音景昼夜四态：按「节点时刻」的显示时区小时取音阶（预排发生在节点前 ≤63s，不能用调用时刻）
  let fireFmtTz = null, fireFmt = null;
  const fireHourCache = { k: 0, h: 12 };
  function fireHour(e) {
    const sec = Math.floor(e / 1000);
    if (fireHourCache.k === sec) return fireHourCache.h;
    const tz = (window.TC && TC.Clock) ? TC.Clock.tz : 'local';
    try {
      if (fireFmtTz !== tz) {
        fireFmtTz = tz;
        fireFmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz === 'local' ? undefined : tz, hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      const p = {};
      for (const it of fireFmt.formatToParts(e)) p[it.type] = it.value;
      if (p.hour === '24') p.hour = '00';
      fireHourCache.h = (+p.hour) + (+p.minute) / 60 + (+p.second) / 3600;
    } catch (_) { const d = new Date(e); fireHourCache.h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600; }
    fireHourCache.k = sec;
    return fireHourCache.h;
  }

  const S = {
    tick(t) {   // 走提示音轨：受「提示音量」滑杆控制；音色随主题包
      const k = pack.tick;
      osc(k.wave, 1900 * k.bright, 1400 * k.bright, t, 0.03 * k.decay, 0.10 * k.peak, 'beat');
    },
    beep(k, t) {   // 3/2/1 递升
      const b = pack.beep;
      const f = ({ 3: 880, 2: 988, 1: 1175 }[k] || 880) * b.bright;
      osc(b.wave, f, f, t, 0.10 * b.decay, 0.30 * b.peak, 'beat');
      osc('sine', f * 2, f * 2, t, 0.07 * b.decay, 0.10 * b.peak, 'beat');
    },
    fire(t, nodeEpoch) {
      // 到点音景（signature moment）三层：
      // ① sub 冲击：下坠正弦 + 二次谐波体 + 低频砰，撑起「释放」的物理感
      osc('sine', 82, 36, t, 0.9, 0.55, 'cue');
      osc('sine', 120, 60, t + 0.02, 0.35, 0.28, 'cue');
      noise(t, 0.5, 0.20, 180, 0.8, 'cue');
      noise(t, 0.9, 0.20, 4200, 0.5, 'cue');   // 高频空气感，拉出空间
      // ② 昼夜四态五声琶音（晨 C 大 / 昼 G 大 / 暮 E 小 / 夜 D 小，按节点时刻自动换色），
      //    音色随主题包（bright 不作用于音阶——保持音程关系）；逐音上扬，左右声像交替展开 + 镜像泛音 + 反声像幽灵回声
      const theme = TimeCoreDomain.daypartTheme(fireHour(nodeEpoch));
      const fr = pack.fire;
      theme.freqs.forEach((f, i) => {
        const tt = t + 0.03 + i * 0.055;
        const pan = (i % 2 ? 1 : -1) * Math.min(0.7, 0.25 + i * 0.06);
        osc(fr.wave, f, f, tt, (0.8 - i * 0.04) * fr.decay, (0.16 - i * 0.008) * fr.peak, 'cue', pan);
        osc('sine', f * 2, f * 2, tt + 0.01, 0.4, 0.05 * fr.peak, 'cue');
        osc(fr.wave, f, f, tt + 0.19, 0.5 * fr.decay, 0.05 * fr.peak, 'cue', -pan);
      });
      // ③ 高频钟簇慢衰减：闪光之后的余韵
      [2637, 3136, 3520].forEach((f, i) => osc('sine', f, f * 0.995, t + 0.25 + i * 0.09, 1.8, 0.045, 'cue'));
    },
    whooshUp() { if (!ready()) return; const t = audioOutput.currentTime(); noise(t, 0.5, 0.14, 600, 0.8); osc('sine', 220, 660, t, 0.5, 0.10); },
    whooshHi() { if (!ready()) return; const t = audioOutput.currentTime(); noise(t, 0.4, 0.18, 1400, 0.9); osc('sawtooth', 330, 880, t, 0.35, 0.07); },
    judge(label) {
      if (!ready()) return;
      const t = audioOutput.currentTime();
      const h = pack.hit, m = pack.miss;
      if (label === 'PERFECT') { osc(h.wave, 1568 * h.bright, 1568 * h.bright, t, 0.10 * h.decay, 0.24 * h.peak, 'hit'); osc('sine', 2093, 2093, t + 0.03, 0.16 * h.decay, 0.20 * h.peak, 'hit'); }
      else if (label === 'GREAT') osc(h.wave, 1046 * h.bright, 1046 * h.bright, t, 0.12 * h.decay, 0.20 * h.peak, 'hit');
      else if (label === 'GOOD') osc(h.wave, 784 * h.bright, 784 * h.bright, t, 0.12 * h.decay, 0.16 * h.peak, 'hit');
      else { osc(m.wave, 130, 60 * m.bright, t, 0.22 * m.decay, 0.22 * m.peak, 'hit'); noise(t, 0.18 * m.decay, 0.14 * m.peak, 240, 1, 'hit'); }
    },
    combo(n) {
      if (!ready()) return;
      const t = audioOutput.currentTime(), base = 880 * Math.pow(2, (n % 12) / 12);
      osc('sine', base, base, t, 0.07, 0.13, 'hit');
      osc('sine', base * 1.5, base * 1.5, t + 0.05, 0.09, 0.11, 'hit');
    },
    ui() { if (!ready()) return; osc('sine', 660, 520, audioOutput.currentTime(), 0.05, 0.07); }
  };

  /* 节点调度器：扫描临近的绝对节点并预排；后台/遮挡时主线程定时器被钳到 ~1s，
   * 因此 hidden 时直接批量覆盖整个软节拍窗口（一次性排完 10 秒的所有音，之后 JS 睡着也不缺音），
   * 另有 Worker 每 250ms 唤醒本函数兜底 */
  function scheduleCd(e, look) {
    const cd = TC.Countdown.info();
    if (!(cd.armed && !cd.fired)) return;
    const plan = scheduleCoordinator.planCountdown({
      armed: cd.armed,
      fired: cd.fired,
      targetEpoch: cd.target,
      nowEpoch: e,
      lookaheadMs: look,
      softLead,
      tickOn,
      metroFull,
      freerun: TC.Beats.stats().freerun
    });
    for (const item of plan) {
      const tt = item.audioTime;
      if (item.kind === 'fire') {
        S.fire(tt, cd.target);
      } else if (item.kind === 'beep') {
        S.beep(item.beatIndex, tt);
      } else {
        S.tick(tt);
      }
    }
  }

  function schedTick() {
    if (!ready()) return;
    const e = TC.time.epoch();
    scheduleCoordinator.reanchorIfDue(e, () => audioOutput.currentTime());

    const cd = TC.Countdown.info();
    if (cd.armed && !cd.fired) {
      // 隐藏时一次排完整个软节拍窗口（+3s 余量）；可见时贴近实时即可
      scheduleCd(e, document.hidden ? (softLead + 3) * 1000 : 220);
    } else if (TC.Beats.stats().freerun) {
      // 自由节拍器：与倒计时提示音同款可闻音量（此前是近乎听不见的极轻正弦）；
      // 不受「倒计时提示音」开关影响；倒计时进行中走上面分支不叠加，避免同一秒双音
      const next = scheduleCoordinator.planFreeRun(e);
      if (next) S.tick(next.audioTime);
    }
  }

  TC.bus.on('cd:zero', ({ target }) => {
    // 双保险：调度器没排上（如音频被挂起）就在事件现场补放——fire key 现已正确登记，不会双响
    if (!scheduleCoordinator.hasFireKey(target)) {
      if (!ensure()) return;
      if (ready()) S.fire(audioOutput.currentTime(), target);
    }
  });
  TC.bus.on('cd:start', () => { scheduleCoordinator.clearScheduled(); });
  TC.bus.on('cd:stop', () => { scheduleCoordinator.clearScheduled(); cancelPending(); });   // 同时撤销已排未响的提示/到点音
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
      return { state: audioOutput.state(), muted, vol, tickOn, softLead, metroFull, worker: audioOutput.workerActive(), scheduled: scheduleCoordinator.scheduledSize(), queued: audioOutput.queuedCount(), hasFireKey: scheduleCoordinator.hasFireKey(ci.target), daypart: TimeCoreDomain.daypartFor(fireHour(TC.time.epoch())) };
    },
    // 测试/调试钩子：给定节点 epoch 返回该时刻到点音景将使用的昼夜音阶（结构断言用）
    debugDaypart(nodeEpoch) {
      const th = TimeCoreDomain.daypartTheme(fireHour(nodeEpoch));
      return { key: th.key, rootHz: th.rootHz, freqs: th.freqs };
    },
    // 测试/调试钩子：手动以指定预排窗口跑一次调度器（验证批量机制）
    debugSched(lookMs) { if (ensure()) scheduleCd(TC.time.epoch(), lookMs || 220); },
    setMute(m) { muted = !!m; localStorage.setItem('tc.mute', m ? '1' : '0'); audioOutput.setMasterGain(muted ? 0 : vol * 0.9); TC.bus.emit('mute', muted); },
    setVolume(v) { vol = clampNum(v, 0, 1, 0.8); localStorage.setItem('tc.vol', String(vol)); if (!muted) audioOutput.setMasterGain(vol * 0.9); },
    setTick(on) { tickOn = !!on; localStorage.setItem('tc.tick', on ? '1' : '0'); },
    setSoftLead(v) { softLead = clampNum(parseInt(v, 10), 3, 60, 10); localStorage.setItem('tc.softlead', String(softLead)); },
    // 音效主题包：未知 key 落回默认包；立即生效（下一条调度音即用新音色）
    setPack(key) { pack = TimeCoreDomain.soundPack(key); localStorage.setItem('tc.sndpack', pack.key); },
    get packKey() { return pack.key; },
    debugSoundPack() { return JSON.parse(JSON.stringify(pack)); },
    track(cat) { return audioOutput.trackGain(cat); },
    setTrack(cat, v) { const value = Math.min(1, Math.max(0, v)); audioOutput.setTrackGain(cat, value); if (audioOutput.state() !== 'none') { let tv = {}; try { tv = JSON.parse(localStorage.getItem('tc.track') || '{}'); } catch (_) {} tv[cat] = audioOutput.trackGain(cat); localStorage.setItem('tc.track', JSON.stringify(tv)); } }
  };
})();
