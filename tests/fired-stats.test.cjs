const assert = require('node:assert/strict');

require('../js/generated/fired-stats.js');
const { createFiredStats } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };

  // 记录/累计/里程碑：第 100 次翻旗一次，101 不翻
  const s1 = createFiredStats();
  s1.load({ total: 99, days: { '2026-09-25': { count: 5 } } });
  const r100 = s1.record('2026-09-25');
  ok(r100.total === 100 && r100.today.count === 6 && r100.milestone === true);
  const r101 = s1.record('2026-09-25');
  ok(r101.total === 101 && r101.today.count === 7 && r101.milestone === false);
  const r200 = (() => { let m = false; for (let i = 0; i < 99; i++) m = s1.record('2026-09-25').milestone; return m; })();
  ok(r200 === true);

  // 跨日隔离与 summary 快照
  const sum = s1.summary('2026-09-25');
  ok(sum.today.count === 106 && sum.total === 200);
  ok(sum.days['2026-09-25'].count === 106 && sum.days['2026-09-24'] === undefined);
  sum.today.count = 999; sum.days['2026-09-25'].count = 999;
  ok(s1.summary('2026-09-25').today.count === 106);   // 深拷贝隔离

  // 序列化回环（total 不受 30 天滚动影响）
  const s2 = createFiredStats();
  s2.load(JSON.parse(s1.serialize()));
  ok(s2.summary('2026-09-25').total === 200 && s2.summary('2026-09-25').today.count === 106);

  // 坏数据隔离：非法日期键丢弃、total 非法归零、非对象入参归零
  const s3 = createFiredStats();
  s3.load({ total: -5, days: { 'bad-key': { count: 9 }, '2026-09-25': { count: 3 } } });
  ok(s3.summary('2026-09-25').total === 0 && s3.summary('2026-09-25').today.count === 3);
  s3.load('garbage'); s3.load(null);
  ok(s3.summary('2026-09-25').today === null && s3.summary('2026-09-25').total === 0);

  // 31 天滚动：最旧被裁，total 保留
  const s4 = createFiredStats();
  for (let i = 1; i <= 31; i++) s4.record('2026-08-' + String(i).padStart(2, '0'));
  const sum4 = s4.summary('2026-08-31');
  ok(Object.keys(sum4.days).length === 30 && sum4.days['2026-08-01'] === undefined && sum4.total === 31);

  // 非法 dateKey 记录被拒绝
  const s5 = createFiredStats();
  const bad = s5.record('nope');
  ok(bad.total === 0 && bad.milestone === false && s5.summary('nope').today === null);

  // 空状态
  ok(createFiredStats().summary('2026-09-25').today === null);

  // CSV 导出（v1.23.0）
  const fcsv = s1.serializeCsv().split('\r\n');
  ok(fcsv[0] === 'date,count' && fcsv[1] === '2026-09-25,106');
  ok(createFiredStats().serializeCsv() === 'date,count');

  console.log(`fired-stats contract: ${n} assertions passed`);
})();
