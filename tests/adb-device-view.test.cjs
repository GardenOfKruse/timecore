const assert = require('node:assert/strict');

require('../js/generated/adb-device-view.js');
const { createAdbDeviceView } = globalThis.TimeCoreDomain;

class FakeNode {
  constructor(tag = 'div') {
    this.tag = tag;
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.value = '';
    this.checked = false;
    this.textContent = '';
    this.listeners = {};
    this._html = '';
  }

  set innerHTML(value) {
    this._html = String(value);
    this.children = [];
    for (const match of this._html.matchAll(/<(input|button|span|label|i)/g)) {
      const child = new FakeNode(match[1]);
      const tail = this._html.slice(match.index);
      const classes = tail.match(/class="([^"]+)"/);
      child.className = classes ? classes[1] : '';
      const valueMatch = tail.match(/value="([^"]*)"/);
      if (valueMatch) child.value = valueMatch[1];
      child.checked = child.className.includes('d-on') && /checked/.test(tail.slice(0, tail.indexOf('>') + 1));
      this.children.push(child);
    }
  }

  get innerHTML() { return this._html; }

  querySelector(selector) {
    return this.children.find(child => child.className.split(/\s+/).includes(selector.slice(1))) || null;
  }

  addEventListener(type, listener) { this.listeners[type] = listener; }
  fire(type, value, checked) { this.listeners[type]?.({ target: { value, checked } }); }
  appendChild(child) { this.children.push(child); }
}

const root = new FakeNode();
const documentPort = {
  getElementById(id) { return id === 'adb-devices' ? root : null; },
  createElement(tag) { return new FakeNode(tag); }
};

const events = [];
const view = createAdbDeviceView({ document: documentPort });
const online = { serial: 'usb-1', name: '工作机', state: 'device', on: true, L: 42, W: 1080, H: 2340 };
const unauthorized = { serial: '192.168.1.7:5555', name: '无线机', state: 'unauthorized', on: false, L: null };
view.render({
  devices: [online, unauthorized],
  saved: { 'old-usb': { name: '离线机', on: true } }
}, { onEvent: event => events.push(event) });

assert.equal(root.children.length, 3);
assert.equal(root.children[0].querySelector('.d-name').value, '工作机');
assert.equal(root.children[0].querySelector('.d-on').checked, true);
assert.equal(root.children[0].querySelector('.d-cal') !== null, true);
assert.equal(root.children[1].className.includes('off'), true);
assert.equal(root.children[1].querySelector('.d-type') !== null, true);
assert.equal(root.children[1].querySelector('.d-type').className.includes('t-IP'), true);
assert.equal(root.children[2].querySelector('.d-name').value, '离线机');
assert.equal(root.children[2].querySelector('.d-cal'), null);

root.children[0].querySelector('.d-name').fire('change', '新名称');
root.children[0].querySelector('.d-on').fire('change', '', false);
root.children[0].querySelector('.d-cal').fire('click');
root.children[0].querySelector('.d-tap').fire('click');
root.children[0].querySelector('.d-del').fire('click');
root.children[2].querySelector('.d-on').fire('change', '', false);
root.children[2].querySelector('.d-del').fire('click');
assert.deepEqual(events.map(event => event.kind), ['rename', 'toggle', 'calibrate', 'tap', 'remove', 'toggle', 'remove']);
assert.deepEqual(events[0], { kind: 'rename', serial: 'usb-1', name: '新名称' });
assert.deepEqual(events[1], { kind: 'toggle', serial: 'usb-1', on: false });
assert.deepEqual(events[2], { kind: 'calibrate', serial: 'usb-1' });
assert.deepEqual(events[3], { kind: 'tap', serial: 'usb-1' });
assert.deepEqual(events[4], { kind: 'remove', serial: 'usb-1' });
assert.deepEqual(events[5], { kind: 'toggle', serial: 'old-usb', on: false });
assert.deepEqual(events[6], { kind: 'remove', serial: 'old-usb' });

view.render({ devices: [], saved: {} }, { onEvent: event => events.push(event) });
assert.equal(root.innerHTML.includes('尚未发现设备'), true);
assert.equal(root.children.length, 0);

console.log('adb-device-view contract: 19 assertions passed');
