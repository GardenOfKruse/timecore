const assert = require('node:assert/strict');

require('../js/generated/time-sync-sampler.js');
const { createTimeSyncSampler } = globalThis.TimeCoreDomain;

const source = { name: 'fake', url: 'https://fake.test/time', parse: payload => payload.epoch };
const timers = [];
const cleared = [];
const controllers = [];
const requests = [];
const times = [100, 150];
const platform = {
  baselineEpoch: 1_000_000,
  baselineMonotonicMs: 50,
  now: () => times.shift(),
  createAbortController() {
    const controller = { signal: {}, aborted: false, abort() { this.aborted = true; } };
    controllers.push(controller);
    return controller;
  },
  setTimeout(listener, delayMs) {
    const timer = { listener, delayMs };
    timers.push(timer);
    return timer;
  },
  clearTimeout(timer) { cleared.push(timer); },
  fetch(url, init) {
    requests.push({ url, init });
    return Promise.resolve({ text: async () => JSON.stringify({ epoch: 1_000_200 }) });
  }
};

(async () => {
  const sampler = createTimeSyncSampler(platform);
  const result = await sampler.sample(source);
  assert.equal(result.src, 'fake');
  assert.equal(result.rtt, 50);
  assert.equal(result.offset, 125);
  assert.equal(timers[0].delayMs, 2500);
  assert.equal(cleared[0], timers[0]);
  assert.equal(requests[0].url, source.url);
  assert.equal(requests[0].init.cache, 'no-store');
  assert.equal(requests[0].init.signal, controllers[0].signal);

  timers[0].listener();
  assert.equal(controllers[0].aborted, true);

  const invalid = createTimeSyncSampler({
    ...platform,
    now: (() => { const values = [0, 1]; return () => values.shift(); })(),
    fetch: () => Promise.resolve({ text: async () => '{"epoch":"nope"}' })
  });
  await assert.rejects(() => invalid.sample(source), /bad payload/);

  const slow = createTimeSyncSampler({
    ...platform,
    now: (() => { const values = [0, 1801]; return () => values.shift(); })(),
    fetch: () => Promise.resolve({ text: async () => JSON.stringify({ epoch: 1_000_000 }) })
  });
  await assert.rejects(() => slow.sample(source), /rtt too high/);

  const manyCalls = [];
  const many = createTimeSyncSampler({
    ...platform,
    now: (() => { const values = [0, 10, 20, 30]; return () => values.shift(); })(),
    fetch: url => {
      manyCalls.push(url);
      if (manyCalls.length === 1) return Promise.reject(new Error('offline'));
      return Promise.resolve({ text: async () => JSON.stringify({ epoch: 1_000_100 }) });
    }
  });
  const results = await many.sampleMany([
    source,
    { ...source, name: 'second', url: 'https://second.test/time' },
    { ...source, name: 'third', url: 'https://third.test/time' }
  ], 2);
  assert.equal(manyCalls.length, 3);
  assert.deepEqual(results.map(item => item.src), ['second', 'third']);

  const none = await many.sampleMany([source], 0);
  assert.deepEqual(none, []);
  console.log('time-sync-sampler contract: 18 assertions passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
