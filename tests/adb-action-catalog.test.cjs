const assert = require('node:assert/strict');

require('../js/generated/adb-action-catalog.js');
const { createAdbActionCatalog } = globalThis.TimeCoreDomain;
let id = 0;
const catalog = createAdbActionCatalog([
  { id: 'legacy', type: 'adv', script: 'getprop ro.product.model', devs: ['old'], on: true },
  { id: 'keep', name: '保留', x: 12, on: true },
  { id: 'ref', type: 'tap', devs: ['phone-1', 3], on: false }
], { idFactory: kind => `generated-${kind}-${++id}` });

assert.equal(catalog.list().length, 2);
assert.equal(catalog.list()[0].type, 'adv');
assert.deepEqual(catalog.list()[0].devs, []);
assert.equal(catalog.list()[1].type, 'tap');
assert.deepEqual(catalog.list()[1].devs, ['phone-1']);
assert.equal(catalog.enabled().length, 1);
assert.equal(catalog.list(), catalog.list());

const tap = catalog.add('tap');
assert.equal(tap.type, 'tap');
assert.equal(tap.n, 5);
assert.equal(tap.gap, 400);
const wake = catalog.add('wake');
assert.equal(wake.type, 'wake');
assert.equal(wake.n, 3);
const script = catalog.add('unknown');
assert.equal(script.type, 'adv');
assert.equal(script.script, 'input tap {X} {Y}');
assert.equal(catalog.list().length, 5);

assert.equal(catalog.removeDevice('phone-1'), true);
assert.deepEqual(catalog.list().find(action => action.id === 'ref').devs, []);
assert.equal(catalog.removeDevice('missing'), false);
assert.equal(catalog.remove(tap), true);
assert.equal(catalog.remove('does-not-exist'), false);

const seeded = catalog.seed();
assert.equal(seeded.on, false);
assert.equal(catalog.enabled().some(action => action.id === seeded.id), false);
const serialized = catalog.serialize();
assert.equal(serialized.some(action => action.id === seeded.id), true);
serialized[0].devs.push('mutated');
assert.equal(catalog.list()[0].devs.includes('mutated'), false);
catalog.list()[0]._shot = 'not-persisted';
assert.equal(Object.prototype.hasOwnProperty.call(catalog.serialize()[0], '_shot'), false);

const replaced = catalog.replace([{ id: 'next', type: 'wake', devs: ['a'], on: true }]);
assert.equal(replaced.length, 1);
assert.equal(catalog.list()[0].id, 'next');
assert.equal(catalog.resetToSeed()[0].on, false);

console.log('adb-action-catalog contract: 28 assertions passed');
