/* 循环#33 E2E：真实月相 —— 朔望周期/明暗面朝向/轨道角/测试覆盖 ?moonage */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ELECTRON = require('electron');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROFILE = path.join(os.tmpdir(), 'tc-c33-profile');
rmSync(path.join(PROFILE, 'tc-clock.json'), { force: true });
const PORT = 9266;
const SYNODIC = 29.530588853;
const REF = 947182440000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

let seq = 0;
const pending = new Map();
let ws = null;
function js(expr) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('eval timeout')); } }, 15000);
  }).then(r => {
    if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 150));
    return r.result && r.result.value;
  });
}
async function waitJs(expr, timeout = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await js(expr)) return true; await sleep(150); }
  return false;
}

const child = spawn(ELECTRON, [ROOT, '--remote-debugging-port=' + PORT], {
  cwd: ROOT, env: { ...process.env, TC_TMP_PROFILE: PROFILE }, stdio: 'ignore'
});
let page = null;
for (let i = 0; i < 40 && !page; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    page = targets.find(t => t.type === 'page' && t.url.includes('index.html')) || null;
  } catch (_) {}
  if (!page) await sleep(500);
}
if (!page) { console.error('主窗口未就绪'); process.exit(1); }
ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
};
await js('!!window.TC');
await sleep(800);
await js(`document.getElementById('wl-skip').click()`);
await sleep(600);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log((pass ? 'PASS' : 'FAIL') + '  ' + name + '  ' + JSON.stringify(detail ?? ''));
};
const expectedPhase = (epochMs) => {
  const days = (epochMs - REF) / 86400000;
  return (((days / SYNODIC) % 1) + 1) % 1;
};
async function reloadWith(param) {
  await js(`location.href = location.pathname + '?${param}'`);
  await sleep(2400);
  try { await js(`document.getElementById('wl-skip').click()`); } catch (_) {}
  await waitJs('!!window.TC && !!TC.Scene.debugMoon && TC.Scene.debugMoon()', 8000);
  await sleep(600);
}

// A: 实时月相——探针非空、与测试端同公式计算值一致、可见
const d0 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugMoon())`));
const exp0 = expectedPhase(Date.now());
check('实时月相：探针与期望一致', d0 && d0.visible === true && Math.abs(d0.phase - exp0) < 0.005, { got: d0 && d0.phase, exp: Math.round(exp0 * 10000) / 10000 });

// B: ?moonage=0 → 新月：位于日地连线上（litDot≈1），盈月起始
await reloadWith('moonage=0');
const d1 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugMoon())`));
check('新月：方位朝太阳 + phase≈0', d1.phase < 0.01 && d1.azimuthDot > 0.9 && d1.waxing === true, d1);

// C: ?moonage=7.3826 → 上弦：月日成直角（litDot≈0）
await reloadWith('moonage=7.3826');
const d2 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugMoon())`));
check('上弦：phase≈0.25 + 方位成直角', Math.abs(d2.phase - 0.25) < 0.01 && Math.abs(d2.azimuthDot) < 0.35, d2);

// D: ?moonage=14.7653 → 满月：背向太阳（litDot≈-1），转为亏月
await reloadWith('moonage=14.7653');
const d3 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugMoon())`));
check('满月：方位背太阳 + phase≈0.5', Math.abs(d3.phase - 0.5) < 0.01 && d3.azimuthDot < -0.9 && d3.waxing === false, d3);

// E: 太阳探针不受月亮接入影响
const s = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
check('太阳探针不受影响', !!s && s.override === null && s.stars === true, s);

// F/G: 一日进度环——随 ?sunhour 同步填充
await reloadWith('sunhour=21');
const s21 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
check('一日进度环：21 时 → 0.875', s21.dayFrac === 0.875 && s21.override === 21, s21);
await reloadWith('sunhour=6');
const s6 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
check('一日进度环：06 时 → 0.25', s6.dayFrac === 0.25 && s6.override === 6, s6);

// H: 音景昼夜四态——节点 epoch 决定音阶（结构断言；听感属人工走查）
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const dpAt = async h => JSON.parse(await js(`JSON.stringify(TC.Audio.debugDaypart(${midnight.getTime() + h * 3600000}))`));
const dMorn = await dpAt(8), dDay = await dpAt(12), dEve = await dpAt(20), dNight = await dpAt(2);
check('音景昼夜四态：08晨/12昼/20暮/02夜', dMorn.key === 'morning' && dDay.key === 'day' && dEve.key === 'evening' && dNight.key === 'night', { m: dMorn.key, d: dDay.key, e: dEve.key, n: dNight.key });
check('四态频率表互异且 8 音', new Set([dMorn, dDay, dEve, dNight].map(x => x.rootHz)).size === 4 && [dMorn, dDay, dEve, dNight].every(x => x.freqs.length === 8), { roots: [dMorn.rootHz, dDay.rootHz, dEve.rootHz, dNight.rootHz] });

// I: 每日击拍统计——自由节拍下真实击拍入库 + 抽屉展示
const st0 = JSON.parse(await js(`JSON.stringify(TC.Beats.debugStats())`));
const beatRec = JSON.parse(await js(`(async () => {
  TC.Beats.toggleFreerun(true);
  await new Promise(r2 => setTimeout(r2, 120));
  const rec = TC.Beats.hit(TC.time.epoch());
  TC.Beats.toggleFreerun(false);
  return JSON.stringify({ label: rec ? rec.label : null });
})()`));
const st1 = JSON.parse(await js(`JSON.stringify(TC.Beats.debugStats())`));
const domTxt = await js(`document.getElementById('beat-stats').textContent`);
check('每日击拍统计：击拍入库 +1 + 抽屉展示', beatRec.label !== null && st1.today && st1.today.count === (st0.today ? st0.today.count : 0) + 1 && /今日击拍 \d/.test(domTxt), { label: beatRec.label, c0: st0.today && st0.today.count, c1: st1.today && st1.today.count, domTxt });

// J: 整点深呼吸——强制触发 +1、布防让位规则生效
const hp0 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`)).hourPulses;
const hpForced = await js(`TC.Scene.hourPulse()`);
const hp1 = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`)).hourPulses;
check('整点深呼吸：强制触发 +1', hpForced === true && hp1 === hp0 + 1, { hp0, hp1 });
const hpBlocked = await js(`(async () => {
  TC.Countdown.startSingle(TC.time.epoch() + 60000);   // 布防中
  await new Promise(r2 => setTimeout(r2, 300));
  const denied = TC.Scene.hourPulse();
  TC.Countdown.stop();
  await new Promise(r2 => setTimeout(r2, 200));
  return { denied, allowedAfter: TC.Scene.hourPulse() };
})()`);
check('整点深呼吸：布防期间让位、停止后恢复', hpBlocked.denied === false && hpBlocked.allowedAfter === true, hpBlocked);
const hpHold = await js(`(async () => {
  TC.Countdown.startSingle(TC.time.epoch() + 3500);   // 等到归零驻留期（armed 在驻留期仍为 true）
  while (!TC.Countdown.info().fired) await new Promise(r2 => setTimeout(r2, 40));
  const denied = TC.Scene.hourPulse();
  TC.Countdown.stop();
  await new Promise(r2 => setTimeout(r2, 200));
  return denied;
})()`);
check('整点深呼吸：归零驻留期同样让位', hpHold === false, { hpHold });

// K: 月相调制夜光——满月夜的月光补光强于新月夜（debugSun.moon 为 moonLight 强度）
await reloadWith('sunhour=0&moonage=14.77');
const nightFull = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
await reloadWith('sunhour=0&moonage=0.5');
const nightNew = JSON.parse(await js(`JSON.stringify(TC.Scene.debugSun())`));
check('月相调制夜光：满月夜 > 新月夜（0.5 倍以上差距）', nightFull.moon > nightNew.moon * 2, { full: nightFull.moon, new: nightNew.moon });

// L: 音效主题包——切换生效 + 持久化 + 默认恒等
const pk0 = await js(`TC.Audio.packKey`);
const pkSwitch = JSON.parse(await js(`(async () => {
  TC.Audio.setPack('pixel');
  const after = { key: TC.Audio.packKey, tickWave: TC.Audio.debugSoundPack().tick.wave, saved: localStorage.getItem('tc.sndpack') };
  TC.Audio.setPack('classic');
  const back = TC.Audio.packKey;
  const ident = TC.Audio.debugSoundPack().tick;
  return JSON.stringify({ after, back, ident });
})()`));
check('音效主题包：切换生效+持久化+切回恒等', pk0 === 'classic' && pkSwitch.after.key === 'pixel' && pkSwitch.after.tickWave === 'square' && pkSwitch.after.saved === 'pixel' && pkSwitch.back === 'classic' && pkSwitch.ident.bright === 1 && pkSwitch.ident.decay === 1 && pkSwitch.ident.peak === 1, pkSwitch);

// M: 年度进度环——实时 frac 与测试端同公式一致（(doy-1+dayFrac)/365|366，闰年感知）
const yNow = JSON.parse(await js(`JSON.stringify({ yearFrac: TC.Scene.debugSun().yearFrac, dayFrac: TC.Scene.debugSun().dayFrac, ...(() => { const f = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }); const p = {}; for (const it of f.formatToParts(new Date())) p[it.type] = it.value; return { y: +p.year, m: +p.month, d: +p.day }; })() })`));
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const doyNow = CUM[yNow.m - 1] + yNow.d + ((yNow.m > 2 && ((yNow.y % 4 === 0 && yNow.y % 100 !== 0) || yNow.y % 400 === 0)) ? 1 : 0);
const daysNow = ((yNow.y % 4 === 0 && yNow.y % 100 !== 0) || yNow.y % 400 === 0) ? 366 : 365;
const expYFrac = (doyNow - 1 + yNow.dayFrac) / daysNow;
check('年度进度环：实时 frac 与期望一致', Math.abs(yNow.yearFrac - expYFrac) < 0.001, { got: yNow.yearFrac, exp: Math.round(expYFrac * 100000) / 100000, doy: doyNow });

await js(`electronAPI.send('close')`).catch(() => {});
const okN = results.filter(Boolean).length;
console.log(`\n==== 循环#33 真实月相：${okN}/${results.length} 通过 ====`);
process.exit(okN === results.length ? 0 : 1);
