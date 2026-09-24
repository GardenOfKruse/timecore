const assert = require('node:assert/strict');

require('../js/generated/sound-pack.js');
const { SOUND_PACKS, soundPack } = globalThis.TimeCoreDomain;

(async () => {
  let n = 0;
  const ok = pass => { assert.ok(pass); n++; };
  const WAVES = ['sine', 'square', 'triangle', 'sawtooth'];
  const PARTS = ['tick', 'beep', 'hit', 'miss', 'fire'];

  // 4 包、key/label 唯一
  ok(SOUND_PACKS.length === 4);
  ok(new Set(SOUND_PACKS.map(p => p.key)).size === 4);
  ok(new Set(SOUND_PACKS.map(p => p.label)).size === 4);

  // classic 必须是恒等变换：行为与未引入主题包之前逐参数一致
  const classic = soundPack('classic');
  ok(classic.key === 'classic' && classic.label === '硅晶');
  for (const part of PARTS) {
    const t = classic[part];
    ok(t.bright === 1 && t.decay === 1 && t.peak === 1);
  }
  ok(classic.tick.wave === 'square' && classic.beep.wave === 'triangle' && classic.hit.wave === 'sine' && classic.miss.wave === 'sawtooth' && classic.fire.wave === 'triangle');

  // 全部包：字段完整、数值合法有限、wave 合法
  for (const p of SOUND_PACKS) {
    for (const part of PARTS) {
      const t = p[part];
      ok(WAVES.includes(t.wave) && Number.isFinite(t.bright) && t.bright > 0 && Number.isFinite(t.decay) && t.decay > 0 && Number.isFinite(t.peak) && t.peak > 0);
    }
  }

  // 任意两包至少一个声部可区分（主题切换必须听得出差别）
  for (let i = 0; i < SOUND_PACKS.length; i++) {
    for (let j = i + 1; j < SOUND_PACKS.length; j++) {
      const differs = PARTS.some(part => {
        const a = SOUND_PACKS[i][part], b = SOUND_PACKS[j][part];
        return a.wave !== b.wave || a.bright !== b.bright || a.decay !== b.decay || a.peak !== b.peak;
      });
      ok(differs);
    }
  }

  // 未知 key 回退默认包；非字符串同样回退
  ok(soundPack('nope').key === 'classic');
  ok(soundPack(null).key === 'classic' && soundPack(42).key === 'classic');

  // 确定性
  ok(soundPack('pixel') === soundPack('pixel'));

  console.log(`sound-pack contract: ${n} assertions passed`);
})();
