const assert = require('node:assert/strict');

require('../js/generated/audio-output.js');
const { createAudioOutput } = globalThis.TimeCoreDomain;

function param(value = 0) {
  return {
    value,
    setValueAtTime(next, time) { this.calls.push(['set', next, time]); },
    exponentialRampToValueAtTime(next, time) { this.calls.push(['ramp', next, time]); },
    calls: []
  };
}

function node() {
  return { connections: [], connect(target) { this.connections.push(target); } };
}

function fakeContext() {
  const made = { gains: 0, oscillators: [], sources: [], filters: 0, buffers: 0 };
  const ctx = {
    currentTime: 10,
    state: 'suspended',
    sampleRate: 8,
    destination: node(),
    resume() { this.state = 'running'; return Promise.resolve(); },
    createGain() {
      made.gains++;
      return Object.assign(node(), { gain: param() });
    },
    createDynamicsCompressor() {
      return Object.assign(node(), {
        threshold: param(), knee: param(), ratio: param(), attack: param(), release: param()
      });
    },
    createBuffer(_channels, length) {
      made.buffers++;
      return { getChannelData() { return new Float32Array(length); } };
    },
    createOscillator() {
      const o = Object.assign(node(), { type: '', frequency: param(), starts: [], stops: [], start(t) { this.starts.push(t); }, stop(t) { this.stops.push(t); } });
      made.oscillators.push(o);
      return o;
    },
    createBufferSource() {
      const s = Object.assign(node(), { buffer: null, loop: false, starts: [], stops: [], start(t) { this.starts.push(t); }, stop(t) { this.stops.push(t); } });
      made.sources.push(s);
      return s;
    },
    createBiquadFilter() {
      made.filters++;
      return Object.assign(node(), { type: '', frequency: param(), Q: param() });
    },
    createStereoPanner() { return Object.assign(node(), { pan: param() }); }
  };
  return { ctx, made };
}

(async () => {
  const { ctx, made } = fakeContext();
  let wakes = 0;
  let workers = 0;
  const output = createAudioOutput({
    createContext() { return ctx; },
    createWorker(onWake) { workers++; return { onmessage: () => onWake() }; }
  });
  assert.equal(output.ensure({ masterGain: 0.72, trackGains: { beat: 0.4, cue: 0.8 }, onWake: () => wakes++ }), true);
  assert.equal(output.ready(), true);
  assert.equal(output.state(), 'running');
  assert.equal(output.workerActive(), true);
  assert.equal(workers, 1);
  assert.equal(made.gains, 4); // master + three tracks
  assert.equal(output.trackGain('beat'), 0.4);
  assert.equal(output.trackGain('hit'), 1);

  output.playOscillator({ type: 'sine', fromHz: 100, toHz: 200, startAt: 10.1, duration: 0.2, peak: 0.2, track: 'cue', pan: -0.5 });
  output.playNoise({ startAt: 10.2, duration: 0.3, peak: 0.1, frequency: 500, quality: 0.8, track: 'beat' });
  assert.equal(output.queuedCount(), 2);
  assert.equal(made.oscillators[0].starts[0], 10.1);
  assert.equal(made.sources[0].starts[0], 10.2);

  ctx.currentTime = 10.01;
  output.cancelPending();
  assert.equal(output.queuedCount(), 0);
  assert.deepEqual(made.oscillators[0].stops, [10.35, 10.06]);
  assert.deepEqual(made.sources[0].stops, [10.55, 10.06]);

  output.setMasterGain(0.3);
  output.setTrackGain('cue', 0.25);
  assert.equal(output.trackGain('cue'), 0.25);
  assert.equal(output.ensure({ masterGain: 0.9, trackGains: {}, onWake: () => wakes++ }), true);
  assert.equal(workers, 1); // lazy graph/worker only once
  console.log('audio-output contract: 13 assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
