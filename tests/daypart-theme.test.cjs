const assert = require('node:assert/strict');

require('../js/generated/daypart-theme.js');
const { daypartFor, daypartTheme } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };

  // 四态边界：5/11/17/23
  ok(daypartFor(5) === 'morning' && daypartFor(10.99) === 'morning');
  ok(daypartFor(11) === 'day' && daypartFor(16.99) === 'day');
  ok(daypartFor(17) === 'evening' && daypartFor(22.99) === 'evening');
  ok(daypartFor(23) === 'night' && daypartFor(4.99) === 'night');

  // 跨午夜回绕：25 点=次日 1 点（夜）、-1 点=23 点（夜）、29 点=次日 5 点（晨）
  ok(daypartFor(25) === 'night' && daypartFor(-1) === 'night' && daypartFor(29) === 'morning');
  ok(daypartFor(NaN) === 'day');   // 非法输入落正午

  // 四态互不同根
  const roots = ['morning', 'day', 'evening', 'night'].map(k => daypartTheme(k === 'day' ? 12 : k === 'morning' ? 8 : k === 'evening' ? 20 : 2).rootHz);
  ok(new Set(roots).size === 4);

  // 频率表：8 音、严格上行、全部为正、等于 root × 2^(semi/12)
  for (const h of [8, 12, 20, 2]) {
    const t = daypartTheme(h);
    ok(t.freqs.length === 8);
    ok(t.freqs.every((f, i) => f > 0 && (i === 0 || f > t.freqs[i - 1])));
    ok(t.freqs.every((f, i) => Math.abs(f - t.rootHz * Math.pow(2, t.semitones[i] / 12)) < 1e-9));
    // 五声族：相邻级差 ≥2 半音（防不协和小二度）
    ok(t.semitones.every((s, i) => i === 0 || s - t.semitones[i - 1] >= 2));
  }

  // 大/小五声分布：晨昼为大五声（含 4 半音），暮夜为小五声（含 3 半音、无 4）
  ok(daypartTheme(8).semitones.includes(4) && daypartTheme(12).semitones.includes(4));
  ok(daypartTheme(20).semitones.includes(3) && !daypartTheme(20).semitones.includes(4));
  ok(daypartTheme(2).semitones.includes(3) && !daypartTheme(2).semitones.includes(4));

  // 确定性 + 副本
  const a = daypartTheme(18), b = daypartTheme(18);
  ok(a.key === b.key && a.freqs.join() === b.freqs.join() && a.freqs !== b.freqs);

  console.log(`daypart-theme contract: ${n} assertions passed`);
})();
