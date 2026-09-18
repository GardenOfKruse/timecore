const assert = require('node:assert/strict');

require('../js/generated/adb-guide-view.js');
const { createAdbGuideView } = globalThis.TimeCoreDomain;

class FakeNode {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.innerHTML = '';
    this.textContent = '';
    this.title = '';
    this.style = {};
    this.listeners = {};
    this.generation = 0;
  }

  set innerHTML(value) {
    this._html = String(value);
    this.generation++;
  }

  get innerHTML() { return this._html; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  fire(type) { this.listeners[type]?.(); }
}

const nodes = {
  'adb-guide': new FakeNode('adb-guide'),
  'adb-status': new FakeNode('adb-status'),
  'adb-download': new FakeNode('adb-download'),
  'adb-dot': new FakeNode('adb-dot')
};
const dynamic = {};
const documentPort = {
  getElementById(id) {
    if (nodes[id]) return nodes[id];
    if (id !== 'ag-dl' && id !== 'ag-scan') return null;
    if (!nodes['adb-guide'].innerHTML.includes('id="' + id + '"')) return null;
    const node = dynamic[id];
    if (!node || node.generation !== nodes['adb-guide'].generation) {
      dynamic[id] = new FakeNode(id);
      dynamic[id].generation = nodes['adb-guide'].generation;
    }
    return dynamic[id];
  }
};

const events = [];
const view = createAdbGuideView({ document: documentPort });
view.render({
  enabled: false,
  adbOk: false,
  adbAncient: false,
  adbVersion: '',
  adbPath: '',
  readyCount: 0,
  actionCount: 0,
  unauthorized: false
}, { onEvent: event => events.push(event) });
assert.equal(nodes['adb-status'].textContent, '未找到 adb');
assert.equal(nodes['adb-status'].style.color, 'var(--warm)');
assert.equal(nodes['adb-download'].hidden, false);
assert.equal(nodes['adb-download'].textContent, '⬇ 下载 adb');
assert.equal(nodes['adb-guide'].hidden, false);
assert.equal(nodes['adb-dot'].style.background, '#777');
assert.equal(nodes['adb-guide'].innerHTML.includes('安装 adb'), true);
assert.equal(nodes['adb-guide'].innerHTML.includes('USB 连接手机'), true);
dynamic['ag-dl'].fire('click');
dynamic['ag-scan'].fire('click');
assert.deepEqual(events, [{ kind: 'download' }, { kind: 'scan' }]);

view.render({
  enabled: true,
  adbOk: true,
  adbAncient: true,
  adbVersion: '1.0.36',
  adbPath: 'E:\\Tools\\adb\\adb.exe',
  readyCount: 0,
  actionCount: 0,
  unauthorized: true
}, { onEvent: event => events.push(event) });
assert.equal(nodes['adb-status'].textContent, '⚠ adb 过旧（1.0.36）');
assert.equal(nodes['adb-status'].title.includes('Android 11+'), true);
assert.equal(nodes['adb-download'].textContent, '⬇ 升级 adb');
assert.equal(nodes['adb-download'].hidden, false);
assert.equal(nodes['adb-dot'].style.background, '#39d7ff');
assert.equal(nodes['adb-guide'].innerHTML.includes('检测到未授权设备'), true);

view.render({
  enabled: true,
  adbOk: true,
  adbAncient: false,
  adbVersion: '1.0.41',
  adbPath: 'adb',
  readyCount: 1,
  actionCount: 2,
  unauthorized: false
}, { onEvent: event => events.push(event) });
assert.equal(nodes['adb-status'].textContent, '✓ 就绪 · adb 1.0.41');
assert.equal(nodes['adb-status'].title, 'adb');
assert.equal(nodes['adb-download'].hidden, true);
assert.equal(nodes['adb-guide'].hidden, true);
assert.equal(nodes['adb-guide'].innerHTML.includes('ADB 齐射已就绪'), true);
assert.equal(nodes['adb-dot'].style.background, '#4dffa6');

console.log('adb-guide-view contract: 21 assertions passed');
