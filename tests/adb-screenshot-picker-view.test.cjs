const assert = require('node:assert/strict');

require('../js/generated/adb-screenshot-picker-view.js');
const { createAdbScreenshotPickerView } = globalThis.TimeCoreDomain;

class FakeNode {
  constructor(rect = { left: 0, top: 0, width: 0, height: 0 }) {
    this.hidden = true;
    this.src = '';
    this.textContent = '';
    this.style = {};
    this.naturalWidth = 1000;
    this.naturalHeight = 2000;
    this.offsetWidth = 0;
    this.rect = rect;
    this.listeners = {};
    this.children = {};
    this.classes = new Set();
    this.context = null;
    this.classList = {
      add: (...tokens) => tokens.forEach(token => this.classes.add(token)),
      remove: (...tokens) => tokens.forEach(token => this.classes.delete(token))
    };
  }
  querySelector(selector) { return this.children[selector] || null; }
  getBoundingClientRect() { return this.rect; }
  getContext() { return this.context; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  fire(type, event = {}) { this.listeners[type]?.(event); }
}

const picker = new FakeNode();
const title = new FakeNode();
const xy = new FakeNode();
const stage = new FakeNode({ left: 0, top: 0, width: 800, height: 600 });
const frame = new FakeNode({ left: 100, top: 10, width: 296, height: 592 });
const image = new FakeNode({ left: 100, top: 10, width: 296, height: 592 });
const guides = new FakeNode();
const vertical = new FakeNode();
const horizontal = new FakeNode();
const cross = new FakeNode();
const magnifier = new FakeNode();
const closeButton = new FakeNode();
const okButton = new FakeNode();
const retakeButton = new FakeNode();
stage.children['.sp-frame'] = frame;
guides.children['.gv'] = vertical;
guides.children['.gh'] = horizontal;
const drawing = [];
magnifier.context = {
  imageSmoothingEnabled: true,
  strokeStyle: '',
  lineWidth: 0,
  drawImage(...args) { drawing.push(['drawImage', args.length]); },
  beginPath() { drawing.push(['beginPath']); },
  moveTo() {}, lineTo() {}, stroke() { drawing.push(['stroke']); }
};
const nodes = {
  'shot-picker': picker, 'sp-title': title, 'sp-xy': xy, 'sp-stage': stage,
  'sp-img': image, 'sp-guides': guides, 'sp-cross': cross, 'sp-mag': magnifier,
  'sp-close': closeButton, 'sp-ok': okButton, 'sp-retake': retakeButton
};
const windowPort = new FakeNode();
const documentPort = { getElementById(id) { return nodes[id] || null; } };
const windowAdapter = { addEventListener(type, listener) { windowPort.listeners[type] = listener; } };
const events = [];
const action = { id: 'pick-1', name: '选点', _shot: 'png', shotW: 1000, shotH: 2000, x: 100, y: 200 };
const view = createAdbScreenshotPickerView({
  document: documentPort,
  window: windowAdapter,
  handlers: {
    onSelect(target, x, y) { events.push(['select', x, y]); target.x = x; target.y = y; },
    onRetake(target) { events.push(['retake', target.id]); },
    onClose(target) { events.push(['close', target.id]); }
  }
});

assert.equal(view.isOpen(), false);
view.open(action);
assert.equal(view.isOpen(), true);
assert.equal(picker.hidden, false);
assert.equal(image.src, 'data:image/png;base64,png');
assert.equal(title.textContent.includes('选点'), true);
assert.equal(xy.textContent, '100 , 200');
assert.equal(frame.style.width, '296px');
assert.equal(frame.style.height, '592px');
assert.equal(cross.hidden, false);
assert.equal(cross.style.cssText, 'left:10.00%;top:10.00%');

image.fire('mousemove', { clientX: 248, clientY: 158 });
assert.equal(xy.textContent, '500 , 500');
assert.equal(guides.hidden, false);
assert.equal(magnifier.style.display, 'block');
assert.equal(drawing.some(item => item[0] === 'drawImage'), true);
assert.equal(drawing.some(item => item[0] === 'stroke'), true);
image.fire('mouseleave');
assert.equal(magnifier.style.display, 'none');
assert.equal(guides.hidden, true);

image.fire('click', { clientX: 248, clientY: 158 });
assert.deepEqual(events[0], ['select', 500, 500]);
assert.equal(action.x, 500);
assert.equal(action.y, 500);
assert.equal(cross.style.cssText, 'left:50.00%;top:25.00%');
assert.equal(cross.classes.has('pulse'), true);
retakeButton.fire('click');
assert.deepEqual(events[1], ['retake', 'pick-1']);
closeButton.fire('click');
assert.equal(view.isOpen(), false);
assert.deepEqual(events[2], ['close', 'pick-1']);

view.open(action);
windowPort.fire('keydown', { key: 'Escape' });
assert.equal(view.isOpen(), false);
assert.deepEqual(events[3], ['close', 'pick-1']);
view.open(action);
view.close();
assert.equal(view.isOpen(), false);
assert.throws(() => view.open({ id: 'empty' }), /screenshot/i);

console.log('adb-screenshot-picker-view contract: 29 assertions passed');
