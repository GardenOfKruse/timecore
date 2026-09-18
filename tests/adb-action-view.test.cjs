const assert = require('node:assert/strict');

require('../js/generated/adb-action-view.js');
const { createAdbActionView } = globalThis.TimeCoreDomain;

class FakeNode {
  constructor(tag = 'div') {
    this.tag = tag;
    this.className = '';
    this.dataset = {};
    this.children = [];
    this.value = '';
    this.checked = false;
    this.textContent = '';
    this.style = {};
    this.listeners = {};
    this._html = '';
  }

  set innerHTML(value) {
    this._html = String(value);
    this.children = [];
    const classes = [...this._html.matchAll(/class="([^"]+)"/g)];
    for (const match of classes) {
      const child = new FakeNode();
      child.className = match[1];
      if (child.className.includes('a-devchip')) continue;
      const valueMatch = this._html.slice(match.index).match(/value="([^"]*)"/);
      if (valueMatch) child.value = valueMatch[1];
      const textMatch = this._html.slice(match.index).match(/^[^>]*>([^<]*)</);
      if (textMatch) child.textContent = textMatch[1];
      child.checked = child.className.includes('a-on') && /class="[^"]*a-on[^"]*" checked/.test(this._html.slice(match.index));
      if (child.className.includes('a-devices')) {
        for (const chipMatch of this._html.slice(match.index).matchAll(/class="([^"]*a-devchip[^"]*)" data-serial="([^"]*)"/g)) {
          const chip = new FakeNode();
          chip.className = chipMatch[1];
          chip.dataset.serial = chipMatch[2];
          child.children.push(chip);
        }
      }
      this.children.push(child);
    }
    if (this.className.includes('a-devices')) {
      for (const chipMatch of this._html.matchAll(/class="([^"]*a-devchip[^"]*)" data-serial="([^"]*)"/g)) {
        const chip = new FakeNode();
        chip.className = chipMatch[1];
        chip.dataset.serial = chipMatch[2];
        this.children.push(chip);
      }
    }
    if (this._html.includes('<img')) this.children.push(new FakeNode('img'));
  }

  get innerHTML() { return this._html; }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = node => {
      for (const child of node.children) {
        if (selector === 'img' ? child.tag === 'img' : selector.startsWith('.') && child.className.split(/\s+/).includes(selector.slice(1))) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  addEventListener(type, listener) { this.listeners[type] = listener; }
  fire(type, value, checked) {
    const target = { value, checked };
    this.listeners[type]?.({ target });
  }
  appendChild(child) { this.children.push(child); }
}

const actionsRoot = new FakeNode();
const documentPort = {
  getElementById(id) { return id === 'adb-actions' ? actionsRoot : null; },
  createElement(tag) { return new FakeNode(tag); },
  querySelectorAll(selector) { return actionsRoot.querySelectorAll(selector); }
};

const tap = { id: 'tap-1', type: 'tap', name: '连点', devs: [], on: true, x: 10, y: 20, shotW: 100, shotH: 200, _shot: 'png', n: 5, gap: 400 };
const script = { id: 'script-1', type: 'adv', name: '脚本', devs: ['usb-1'], on: false, script: 'input tap {X} {Y}' };
const devices = [
  { serial: 'usb-1', name: '工作机', state: 'device' },
  { serial: 'ip:5555', name: '离线机', state: 'offline' }
];
const events = [];
const view = createAdbActionView({ document: documentPort });
view.render({ actions: [tap, script], devices }, {
  onEvent(event) {
    events.push(event);
    if (event.kind === 'field') {
      if (event.field === 'name') event.action.name = event.value;
      if (event.field === 'x') event.action.x = +event.value;
    }
    if (event.kind === 'device-toggle') {
      event.action.devs = event.action.devs.includes(event.serial)
        ? event.action.devs.filter(serial => serial !== event.serial)
        : event.action.devs.concat(event.serial);
    }
  }
});

assert.equal(actionsRoot.querySelectorAll('.adb-action').length, 2);
const tapCard = actionsRoot.querySelectorAll('.adb-action')[0];
const scriptCard = actionsRoot.querySelectorAll('.adb-action')[1];
assert.equal(tapCard.querySelector('.a-name').value, '连点');
assert.equal(scriptCard.querySelector('.a-script').value, 'input tap {X} {Y}');
assert.equal(tapCard.querySelectorAll('.a-devchip').length, 2);
assert.equal(tapCard.querySelector('.a-devcount').textContent, '全部启用设备');
assert.equal(tapCard.querySelector('.a-on').checked, true);
assert.equal(scriptCard.querySelector('.a-on').checked, false);
assert.equal(scriptCard.querySelectorAll('.a-devchip')[0].className.includes('on'), true);

tapCard.querySelector('.a-name').fire('input', '新的连点');
tapCard.querySelector('.a-x').fire('input', '44');
assert.equal(tap.name, '新的连点');
assert.equal(tap.x, 44);
assert.equal(events.at(-1).field, 'x');
assert.equal(tapCard.querySelector('.a-cross').style.cssText, 'left:44.00%;top:10.00%');

tapCard.querySelectorAll('.a-devchip')[0].fire('click');
assert.deepEqual(tap.devs, ['usb-1']);
assert.equal(tapCard.querySelector('.a-devcount').textContent, '指定 1 台');
assert.equal(tapCard.querySelectorAll('.a-devchip')[0].className.includes('on'), true);

tapCard.querySelector('.a-fire').fire('click');
tapCard.querySelector('.a-shotbtn').fire('click');
tapCard.querySelector('.a-shot').fire('click');
assert.deepEqual(events.slice(-3).map(event => event.kind), ['fire', 'screenshot', 'open-picker']);

scriptCard.querySelector('.a-del').fire('click');
assert.equal(events.at(-1).kind, 'remove');
view.refreshDevices({ actions: [tap], devices: [devices[0]] });
assert.equal(actionsRoot.querySelectorAll('.adb-action').length, 2, 'View 不负责删除动作，删除由 Controller 重绘');
assert.equal(actionsRoot.querySelectorAll('.adb-action')[0].querySelectorAll('.a-devchip').length, 1);

console.log('adb-action-view contract: 18 assertions passed');
