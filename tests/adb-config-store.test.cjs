const assert = require('node:assert/strict');

require('../js/generated/adb-config-store.js');
const { createAdbConfigStore } = globalThis.TimeCoreDomain;

class MemoryStorage {
  constructor(value = null) { this.value = value; this.writes = []; }
  getItem(key) { assert.equal(key, 'tc.adb.v1'); return this.value; }
  setItem(key, value) { assert.equal(key, 'tc.adb.v1'); this.value = value; this.writes.push(value); }
}

const defaults = {
  path: '',
  leadMs: 100,
  enabled: false,
  devices: {},
  actions: []
};
const emptyStorage = new MemoryStorage();
const emptyStore = createAdbConfigStore({ defaults, storage: emptyStorage });
const empty = emptyStore.load();
assert.equal(empty.leadMs, 100);
assert.equal(empty.enabled, false);
assert.deepEqual(empty.devices, {});
assert.notEqual(empty.devices, defaults.devices);

const invalidStore = createAdbConfigStore({ defaults, storage: new MemoryStorage('{broken') });
assert.equal(invalidStore.load().leadMs, 100);
const nonObjectStore = createAdbConfigStore({ defaults, storage: new MemoryStorage('[]') });
assert.equal(nonObjectStore.load().enabled, false);

const stored = {
  leadMs: 240,
  enabled: true,
  devices: { usb1: { name: '工作机', on: true } },
  legacy: 'preserved'
};
const storage = new MemoryStorage(JSON.stringify(stored));
const store = createAdbConfigStore({ defaults, storage });
const loaded = store.load();
assert.equal(loaded.leadMs, 240);
assert.equal(loaded.enabled, true);
assert.deepEqual(loaded.devices, stored.devices);
assert.equal(loaded.legacy, 'preserved');
assert.equal(loaded.path, '');

const config = {
  path: 'adb',
  devices: stored.devices,
  actions: [{ id: 'old' }],
  enabled: true
};
const actions = [
  { id: 'tap', type: 'tap', _shot: 'base64', x: 1, nested: { _shot: 'nested' } },
  { id: 'wake', type: 'wake', script: 'input tap {X} {Y}' }
];
store.save(config, actions);
assert.equal(storage.writes.length, 1);
const persisted = JSON.parse(storage.value);
assert.deepEqual(persisted.devices, stored.devices);
assert.deepEqual(persisted.actions, [
  { id: 'tap', type: 'tap', x: 1, nested: {} },
  { id: 'wake', type: 'wake', script: 'input tap {X} {Y}' }
]);
assert.equal(persisted.actions[0]._shot, undefined);
assert.deepEqual(config.actions, [{ id: 'old' }]);
assert.equal(actions[0]._shot, 'base64');

const customStorage = new MemoryStorage();
const customStore = createAdbConfigStore({ key: 'custom', defaults: { n: 1 }, storage: {
  getItem(key) { assert.equal(key, 'custom'); return customStorage.value; },
  setItem(key, value) { assert.equal(key, 'custom'); customStorage.value = value; }
} });
assert.equal(customStore.load().n, 1);
customStore.save({ n: 2 }, []);
assert.equal(JSON.parse(customStorage.value).n, 2);

console.log('adb-config-store contract: 26 assertions passed');
