const assert = require('node:assert/strict');

require('../js/generated/adb-action-controller.js');
const { createAdbActionController } = globalThis.TimeCoreDomain;

const action = { id: 'a-1', devs: [], name: '', on: true };
const calls = [];
let saves = 0;
let renders = 0;
const catalog = {
  remove(target) {
    calls.push(['remove', target.id]);
    return true;
  }
};
const controller = createAdbActionController({
  catalog,
  save: () => { saves++; },
  render: () => { renders++; },
  onFire: target => calls.push(['fire', target.id]),
  onScreenshot: target => calls.push(['screenshot', target.id]),
  onOpenPicker: target => calls.push(['open-picker', target.id])
});

let assertions = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); assertions++; };
const deepEqual = (actual, expected) => { assert.deepEqual(actual, expected); assertions++; };

(async () => {
  controller.handle({ kind: 'field', action, field: 'name', value: '连点' });
  equal(action.name, '连点');
  equal(saves, 1);
  controller.handle({ kind: 'field', action, field: 'enabled', value: false });
  equal(action.on, false);
  controller.handle({ kind: 'field', action, field: 'lead', value: '' });
  equal(action.lead, '');
  controller.handle({ kind: 'field', action, field: 'lead', value: '120' });
  equal(action.lead, 120);
  controller.handle({ kind: 'field', action, field: 'offset', value: '-20' });
  equal(action.offsetMs, 0);
  controller.handle({ kind: 'field', action, field: 'offset', value: '35' });
  equal(action.offsetMs, 35);
  controller.handle({ kind: 'field', action, field: 'script', value: 'input tap {X} {Y}' });
  equal(action.script, 'input tap {X} {Y}');
  controller.handle({ kind: 'field', action, field: 'x', value: '' });
  equal(action.x, '');
  controller.handle({ kind: 'field', action, field: 'y', value: '7' });
  equal(action.y, 7);
  controller.handle({ kind: 'field', action, field: 'count', value: '' });
  equal(action.n, 5);
  controller.handle({ kind: 'field', action, field: 'gap', value: '' });
  equal(action.gap, 400);
  equal(saves, 11);

  controller.handle({ kind: 'device-toggle', action, serial: 'usb-1' });
  deepEqual(action.devs, ['usb-1']);
  controller.handle({ kind: 'device-toggle', action, serial: 'usb-1' });
  deepEqual(action.devs, []);
  equal(saves, 13);

  controller.handle({ kind: 'fire', action });
  controller.handle({ kind: 'screenshot', action });
  controller.handle({ kind: 'open-picker', action });
  deepEqual(calls.slice(-3), [['fire', 'a-1'], ['screenshot', 'a-1'], ['open-picker', 'a-1']]);

  controller.handle({ kind: 'remove', action });
  deepEqual(calls.at(-1), ['remove', 'a-1']);
  equal(saves, 14);
  equal(renders, 1);

  console.log('adb-action-controller contract: ' + assertions + ' assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
