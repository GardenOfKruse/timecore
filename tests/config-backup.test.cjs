const assert = require('node:assert/strict');

require('../js/generated/config-backup.js');
const { createConfigBackup } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };

  const backup = createConfigBackup(['tc.vol', 'tc.tz', 'tc.beatstats.v1']);

  // collect：白名单逐键、缺失键跳过
  const store = { 'tc.vol': '0.8', 'tc.tz': 'Asia/Tokyo', junk: 'x' };
  const entries = backup.collect(k => (k in store ? store[k] : null));
  ok(entries['tc.vol'] === '0.8' && entries['tc.tz'] === 'Asia/Tokyo' && entries['tc.beatstats.v1'] === undefined);
  ok(Object.keys(entries).length === 2 && !('junk' in entries));

  // serialize：版本 + 时间戳 + entries
  const raw = backup.serialize(entries);
  const parsed = JSON.parse(raw);
  ok(parsed.v === 1 && typeof parsed.ts === 'string' && parsed.entries['tc.vol'] === '0.8');

  // parse：合法回环
  const back = backup.parse(raw);
  ok(back.ok === true && back.entries['tc.vol'] === '0.8' && back.entries['tc.tz'] === 'Asia/Tokyo');

  // parse：坏 JSON / 非对象 / 错版本 / 错结构 全部拒收
  ok(backup.parse('{bad json').ok === false);
  ok(backup.parse('garbage').ok === false);
  ok(backup.parse(null).ok === false);
  ok(backup.parse(42).ok === false);
  ok(backup.parse('{"v":2,"entries":{}}').ok === false);
  ok(backup.parse('{"v":1}').ok === false);
  ok(backup.parse('{"v":1,"entries":[]}').ok === false);

  // parse：白名单外键静默丢弃、非字符串值丢弃
  const mixed = backup.parse('{"v":1,"entries":{"tc.vol":"0.5","evil-key":"1","tc.tz":42}}');
  ok(mixed.ok === true && mixed.entries['tc.vol'] === '0.5' && !('evil-key' in mixed.entries) && !('tc.tz' in mixed.entries));

  // 空 entries 合法
  ok(backup.parse('{"v":1,"ts":"2026-09-26","entries":{}}').ok === true);

  console.log(`config-backup contract: ${n} assertions passed`);
})();
