const assert = require('node:assert/strict');

require('../js/generated/beat-stats.js');
const { createBeatStats } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };

  // 记录聚合：分档计数、最高连击、加权分
  const s1 = createBeatStats();
  s1.record('2026-09-19', { label: 'PERFECT', combo: 1 });
  s1.record('2026-09-19', { label: 'GREAT', combo: 2 });
  s1.record('2026-09-19', { label: 'MISS', combo: 0 });
  const t1 = s1.summary('2026-09-19').today;
  ok(t1.count === 3 && t1.perfect === 1 && t1.great === 1 && t1.good === 0 && t1.miss === 1);
  ok(t1.maxCombo === 2);
  ok(Math.abs(t1.accuracy - Math.round((1 + 0.7 + 0) / 3 * 100)) <= 0);

  // 跨日隔离
  s1.record('2026-09-18', { label: 'GOOD', combo: 3 });
  ok(s1.summary('2026-09-18').today.count === 1 && s1.summary('2026-09-19').today.count === 3);
  ok(s1.summary('2026-09-18').today.maxCombo === 3);

  // 序列化 → 载入回环
  const s2 = createBeatStats();
  s2.load(JSON.parse(s1.serialize()));
  ok(s2.summary('2026-09-19').today.count === 3 && s2.summary('2026-09-18').today.count === 1);

  // 坏数据隔离：非法日期键与坏对象被丢弃
  const s3 = createBeatStats();
  s3.load({ days: { 'bad-key': { count: 9 }, '2026-09-19': { count: 5 }, junk: 'x' }, junk: 1 });
  ok(s3.summary('2026-09-19').today.count === 5 && s3.summary('bad-key').today === null);
  s3.load('garbage');
  s3.load(null);
  s3.load({ days: 42 });
  ok(Object.keys(s3.summary('2026-09-19').days).length === 0);

  // 30 天保留：31 天旧的被裁掉，最近 30 天在
  const s4 = createBeatStats();
  for (let i = 1; i <= 31; i++) {
    const k = '2026-08-' + String(i).padStart(2, '0');
    s4.record(k, { label: 'PERFECT', combo: 1 });
  }
  s4.record('2026-09-19', { label: 'PERFECT', combo: 1 });
  const days4 = s4.summary('2026-09-19').days;
  ok(Object.keys(days4).length === 30);
  ok(days4['2026-08-01'] === undefined && days4['2026-08-02'] === undefined && days4['2026-08-03'] !== undefined && days4['2026-09-19'] !== undefined);

  // 未知 label 记为 MISS，非法 combo 按 0
  const s5 = createBeatStats();
  const t5 = s5.record('2026-09-19', { label: 'WEIRD', combo: 'x' });
  ok(t5.miss === 1 && t5.maxCombo === 0);

  // 空日 summary.today 为 null
  ok(createBeatStats().summary('2026-09-19').today === null);

  // 副本：修改返回值不影响内部
  const s6 = createBeatStats();
  s6.record('2026-09-19', { label: 'PERFECT', combo: 4 });
  const snap = s6.summary('2026-09-19');
  snap.today.count = 999;
  snap.days['2026-09-19'].count = 999;
  snap.days['2026-09-19'].hours[3] = 999;
  ok(s6.summary('2026-09-19').today.count === 1 && s6.summary('2026-09-19').today.hours[3] === 0);

  // 小时分布（v1.17.0）：入桶、跨日聚合、非法小时忽略、旧数据向后兼容
  const s7 = createBeatStats();
  s7.record('2026-09-19', { label: 'PERFECT', combo: 1, hour: 21 });
  s7.record('2026-09-19', { label: 'GREAT', combo: 1, hour: 21 });
  s7.record('2026-09-19', { label: 'GOOD', combo: 1, hour: 9 });
  s7.record('2026-09-18', { label: 'PERFECT', combo: 1, hour: 21 });
  ok(s7.summary('2026-09-19').today.hours[21] === 2 && s7.summary('2026-09-19').today.hours[9] === 1);
  ok(s7.summary('2026-09-19').bestHour === 21);
  s7.record('2026-09-19', { label: 'PERFECT', combo: 1, hour: 25 });   // 非法小时忽略
  ok(s7.summary('2026-09-19').today.hours[21] === 2 && s7.summary('2026-09-19').today.hours[1] === 0);
  const s8 = createBeatStats();
  s8.load({ days: { '2026-09-19': { count: 5 } } });   // 旧版无 hours 字段
  ok(s8.summary('2026-09-19').today.count === 5 && s8.summary('2026-09-19').bestHour === null);
  ok(s8.summary('2026-09-19').today.hours.length === 24 && s8.summary('2026-09-19').today.hours.every(h => h === 0));

  // CSV 导出（v1.23.0）：表头 + 日期升序行 + 准确率列
  const csv = s1.serializeCsv();
  const rows = csv.split('\r\n');
  ok(rows[0] === 'date,count,max_combo,perfect,great,good,miss,accuracy_percent');
  ok(rows[1] === '2026-09-18,1,3,0,0,1,0,40');
  ok(rows.length === 3 && rows[2].startsWith('2026-09-19,3,2,1,1,0,1,57'));
  ok(createBeatStats().serializeCsv() === 'date,count,max_combo,perfect,great,good,miss,accuracy_percent');

  console.log(`beat-stats contract: ${n} assertions passed`);
})();
