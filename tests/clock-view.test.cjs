const assert = require('node:assert/strict');

require('../js/generated/clock-view.js');
const { createClockView } = globalThis.TimeCoreDomain;
require('../js/generated/clock-motion-model.js');
const { createClockMotionModel } = globalThis.TimeCoreDomain;

function classList() {
  const values = new Set();
  return {
    add(...tokens) { tokens.forEach(token => values.add(token)); },
    remove(...tokens) { tokens.forEach(token => values.delete(token)); },
    contains(token) { return values.has(token); }
  };
}

function element(withAnimation = true) {
  const output = {
    textContent: '',
    className: '',
    classList: classList(),
    style: {},
    offsetWidth: 0,
    children: [],
    animations: [],
    appendChild(child) { this.children.push(child); }
  };
  if (withAnimation) {
    output.animate = (keyframes, options) => {
      const animation = { playState: 'running', keyframes, options, cancel() { this.playState = 'idle'; } };
      output.animations.push(animation);
      return animation;
    };
  }
  return output;
}

function documentFixture(withAnimation = true) {
  const nodes = {
    hms: element(withAnimation),
    ms: element(false),
    date: element(false),
    panel: element(false),
    ring: element(false),
    breath: element(withAnimation)
  };
  const media = {
    matches: false,
    listeners: [],
    addEventListener(_type, listener) { this.listeners.push(listener); }
  };
  const selectors = {
    '.clock-panel': nodes.panel,
    '.sec-ring rect': nodes.ring,
    '.clock-breath': nodes.breath
  };
  return {
    nodes,
    media,
    body: element(false),
    getElementById(id) { return nodes[id === 'clock-hms' ? 'hms' : id === 'clock-ms' ? 'ms' : 'date']; },
    querySelector(selector) { return selectors[selector] || null; },
    createElement() { return element(false); },
    defaultView: {
      matchMedia() { return media; },
      getComputedStyle(target) { return { opacity: target.style.opacity || '', transform: target.style.transform || '' }; }
    }
  };
}

const fixture = documentFixture(true);
const view = createClockView({ document: fixture, motion: createClockMotionModel() });
view.mount();
assert.equal(fixture.nodes.hms.children.length, 5);
assert.equal(fixture.nodes.hms.children[0].className, 'd-pair');
assert.equal(fixture.nodes.hms.children[1].textContent, ':');

view.render({ hour: '12', minute: '34', second: '56', millisecond: 789, dateKey: '20260918', dateText: '2026-09-18 周五' });
assert.equal(fixture.nodes.hms.children[0].textContent, '12');
assert.equal(fixture.nodes.hms.children[2].textContent, '34');
assert.equal(fixture.nodes.hms.children[4].textContent, '56');
assert.equal(fixture.nodes.ms.textContent, '.789');
assert.equal(fixture.nodes.ring.style.strokeDashoffset, '211');
assert.equal(fixture.nodes.date.textContent, '2026-09-18 周五');
view.render({ hour: '12', minute: '34', second: '56', millisecond: 789.9, dateKey: '20260918', dateText: '2026-09-18 周五' });
assert.equal(fixture.nodes.ms.textContent, '.789');

view.setClockMode(true);
view.setPhase('NORMAL');
assert.equal(fixture.nodes.panel.classList.contains('clock-armed'), true);
assert.equal(fixture.nodes.panel.classList.contains('clock-phase-normal'), true);
assert.equal(view.debugMotion().animations, 2);
assert.equal(view.debugMotion().supported, true);

view.setPhase('ZERO');
assert.equal(fixture.nodes.panel.classList.contains('clock-phase-zero'), true);
assert.equal(view.debugMotion().animations, 2);
view.zeroPulse();
assert.equal(fixture.nodes.panel.classList.contains('zero-pulse'), true);

view.setClockMode(false);
assert.equal(view.debugMotion().animations, 0);
assert.equal(fixture.nodes.breath.style.opacity, '0');

fixture.media.matches = true;
fixture.media.listeners[0]();
view.setClockMode(true);
view.setPhase('WARMUP');
assert.equal(view.debugMotion().reduced, true);
assert.equal(view.debugMotion().animations, 0);
assert.equal(fixture.nodes.breath.style.opacity, '0.24');
view.setPhase('ZERO');
assert.equal(fixture.nodes.breath.style.opacity, '0.58');

fixture.media.matches = false;
fixture.media.listeners[0]();
view.setPhase('PULSE');
assert.equal(view.debugMotion().animations, 2);
assert.equal(fixture.nodes.breath.animations.at(-1).options.duration, 620);

view.resetTime();
view.render({ hour: '01', minute: '02', second: '03', millisecond: 4, dateKey: '20260919', dateText: '2026-09-19 周六' });
assert.equal(fixture.nodes.hms.children[0].textContent, '01');
assert.equal(fixture.nodes.ms.textContent, '.004');
assert.equal(fixture.nodes.date.textContent, '2026-09-19 周六');

const unsupported = documentFixture(false);
const fallback = createClockView({ document: unsupported, motion: createClockMotionModel() });
fallback.mount();
fallback.setClockMode(true);
fallback.setPhase('NORMAL');
assert.equal(fallback.debugMotion().supported, false);
assert.equal(fallback.debugMotion().animations, 0);
assert.equal(unsupported.nodes.breath.style.opacity, '0.24');

console.log('clock-view contract: 25 assertions passed');
