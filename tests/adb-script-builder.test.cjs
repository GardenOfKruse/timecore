const assert = require('node:assert/strict');

require('../js/generated/adb-script-builder.js');
const { createAdbScriptBuilder } = globalThis.TimeCoreDomain;

const builder = createAdbScriptBuilder();
const device = { serial: 'usb-1', W: 2160, H: 4680, TI: 150 };

assert.equal(
  builder.build({ type: 'tap', x: 100, y: 200, n: 1, gap: 500 }, device),
  'input tap 100 200'
);
assert.equal(
  builder.build({ type: 'tap', n: 1 }, { serial: 'usb-1', W: 1080, H: 2340 }),
  'input tap 540 1170'
);

const compensated = builder.build({ type: 'tap', x: 5, y: 6, n: 16, gap: 500 }, device, { compensate: true });
assert.match(compensated, /seq 1 16/);
assert.match(compensated, /sleep 0\.350/);
assert.match(compensated, /if \[ \$i -lt 16 \]; then sleep 0\.350; fi; done$/);
assert.doesNotMatch(compensated, /fi; sleep/);

const uncompensated = builder.build({ type: 'tap', x: 5, y: 6, n: 2, gap: 500 }, device, { compensate: false });
assert.match(uncompensated, /sleep 0\.500/);
assert.doesNotMatch(uncompensated, /sleep 0\.350/);

const noCompensation = builder.build({ type: 'tap', x: 5, y: 6, n: 2, gap: 500 }, { ...device, TI: 30 }, { compensate: true });
assert.match(noCompensation, /sleep 0\.500/);
const lowerBound = builder.build({ type: 'tap', x: 5, y: 6, n: 4, gap: 100 }, device, { compensate: true });
assert.match(lowerBound, /sleep 0\.050/);

const scaled = builder.build({ type: 'tap', x: 100, y: 200, shotW: 1080, shotH: 2340, n: 1 }, device);
assert.equal(scaled, 'input tap 200 400');
assert.equal(
  builder.build({ type: 'tap', x: 100, y: 200, n: 999 }, { serial: 'usb-1', W: 1080, H: 2340 }),
  'for i in $(seq 1 200); do input tap 100 200; if [ $i -lt 200 ]; then sleep 0.400; fi; done'
);
assert.match(
  builder.build({ type: 'tap', x: 1, y: 2, n: 0 }, { serial: 'usb-1', W: 1080, H: 2340 }),
  /seq 1 5/
);
assert.equal(
  builder.build({ type: 'tap', x: 1, y: 2, n: -2 }, { serial: 'usb-1', W: 1080, H: 2340 }),
  'input tap 1 2'
);

const wake = builder.build({ type: 'wake', x: 20, y: 30, n: 2, gap: 100 }, { serial: 'usb-1', W: 1080, H: 2340 });
assert.match(wake, /^input keyevent 224; sleep 0\.6; input swipe 540 1685 540 702 300; sleep 1; /);
assert.match(wake, /input tap 20 30/);

assert.equal(
  builder.build({ type: 'adv', script: 'input tap {X} {Y}; echo {serial} {W}x{H}', x: 100, y: 200, shotW: 1080, shotH: 2340 }, device),
  'input tap 200 400; echo usb-1 2160x4680'
);

console.log('adb-script-builder contract: 17 assertions passed');
