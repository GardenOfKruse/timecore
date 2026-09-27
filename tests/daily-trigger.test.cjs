const assert = require('node:assert/strict');

require('../js/generated/daily-trigger.js');
const { dailyDue, dailyDateKey } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };
  const DAY = 86400000;
  const OFFSET = 8 * 3600000;   // UTC+8
  // 2026-09-27 00:00 UTC+8 = 2026-09-26T16:00:00Z
  const LOCAL_MIDNIGHT = Date.UTC(2026, 8, 26, 16, 0, 0);
  const at = (h, m, s) => LOCAL_MIDNIGHT + (h * 3600 + m * 60 + s) * 1000;
  const LEAD = 70000;

  // 目标 = 当天 09:00:00
  const t = dailyDue(at(8, 59, 0), 9, 0, 0, LEAD, OFFSET, null);
  ok(t.due === true && t.targetEpoch === at(9, 0, 0) && t.dateKey === '2026-09-27');
  ok(t.secondsToTarget === 60);

  // 窗口外：提前太多 / 已过点
  ok(dailyDue(at(8, 0, 0), 9, 0, 0, LEAD, OFFSET, null).due === false);
  ok(dailyDue(at(9, 0, 0) + 1, 9, 0, 0, LEAD, OFFSET, null).due === false);   // 过点不补
  ok(dailyDue(at(9, 0, 0), 9, 0, 0, LEAD, OFFSET, null).due === true);        // 恰好到点仍触发

  // 防重：firedDate 与目标日期相同则不再触发
  ok(dailyDue(at(8, 59, 30), 9, 0, 0, LEAD, OFFSET, '2026-09-27').due === false);

  // 次日恢复：firedDate 是昨天，今天窗口照常
  ok(dailyDue(at(8, 59, 0) + DAY, 9, 0, 0, LEAD, OFFSET, '2026-09-27').due === true);

  // 0:00:00 跨午夜目标：now 是前一天 23:59:30 + lead 70s → target 是今天 00:00:00
  const justBeforeMidnight = at(0, 0, 0) - 30000;
  const t0 = dailyDue(justBeforeMidnight, 0, 0, 0, LEAD, OFFSET, null);
  ok(t0.due === true && t0.targetEpoch === at(0, 0, 0));

  // 非法入参全部 due:false
  ok(dailyDue(NaN, 9, 0, 0, LEAD, OFFSET, null).due === false);
  ok(dailyDue(at(8, 59), 25, 0, 0, LEAD, OFFSET, null).due === false);
  ok(dailyDue(at(8, 59), 9, 60, 0, LEAD, OFFSET, null).due === false);
  ok(dailyDue(at(8, 59), 9, 0, -1, LEAD, OFFSET, null).due === false);

  // lead=0：到点那一毫秒才触发
  ok(dailyDue(at(9, 0, 0), 9, 0, 0, 0, OFFSET, null).due === true);
  ok(dailyDue(at(9, 0, 0) - 1, 9, 0, 0, 0, OFFSET, null).due === false);

  // dailyDateKey
  ok(dailyDateKey(at(9, 0, 0), OFFSET) === '2026-09-27');
  ok(dailyDateKey(at(0, 0, 0) - 1, OFFSET) === '2026-09-26');

  console.log(`daily-trigger contract: ${n} assertions passed`);
})();
