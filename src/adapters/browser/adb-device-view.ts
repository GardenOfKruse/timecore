namespace TimeCoreDomain {
interface AdbDeviceViewNode {
  className: string;
  dataset: Record<string, string>;
  innerHTML: string;
  textContent: string;
  value: string;
  checked: boolean;
  querySelector(selector: string): AdbDeviceViewNode | null;
  addEventListener(type: string, listener: (event: AdbDeviceViewInputEvent) => void): void;
  appendChild(child: AdbDeviceViewNode): void;
}

interface AdbDeviceViewInputEvent {
  target: { value?: string; checked?: boolean } | null;
}

interface AdbDeviceViewDocument {
  getElementById(id: string): AdbDeviceViewNode | null;
  createElement(tagName: string): AdbDeviceViewNode;
}

export interface AdbDeviceViewDevice {
  serial: string;
  state?: string;
  name?: string;
  on?: boolean;
  L?: number | null;
  W?: number;
  H?: number;
}

export interface AdbDeviceViewSaved {
  name?: string;
  on?: boolean;
}

export interface AdbDeviceViewModel {
  devices: readonly AdbDeviceViewDevice[];
  saved: Record<string, AdbDeviceViewSaved>;
}

export type AdbDeviceViewEvent =
  | { kind: 'rename'; serial: string; name: string }
  | { kind: 'toggle'; serial: string; on: boolean }
  | { kind: 'calibrate'; serial: string }
  | { kind: 'tap'; serial: string }
  | { kind: 'reconnect'; serial: string }
  | { kind: 'remove'; serial: string };

export interface AdbDeviceViewHandlers {
  onEvent(event: AdbDeviceViewEvent): void;
}

export interface AdbDeviceView {
  render(model: AdbDeviceViewModel, handlers: AdbDeviceViewHandlers): void;
}

interface AdbDeviceViewOptions {
  document?: AdbDeviceViewDocument;
}

function runtimeDocument(): AdbDeviceViewDocument {
  const scope = globalThis as typeof globalThis & { document?: AdbDeviceViewDocument };
  if (!scope.document) throw new Error('AdbDeviceView requires a document');
  return scope.document;
}

function required(node: AdbDeviceViewNode | null, selector: string): AdbDeviceViewNode {
  if (!node) throw new Error('AdbDeviceView missing ' + selector);
  return node;
}

function valueOf(event: AdbDeviceViewInputEvent): string {
  return event.target && event.target.value !== undefined ? event.target.value : '';
}

function checkedOf(event: AdbDeviceViewInputEvent): boolean {
  return !!(event.target && event.target.checked);
}

function quoted(value: unknown): string {
  return String(value || '').replace(/"/g, '');
}

function deviceType(serial: string): 'IP' | 'USB' {
  return String(serial).includes(':') ? 'IP' : 'USB';
}

const removeIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';

export function createAdbDeviceView(options: AdbDeviceViewOptions = {}): AdbDeviceView {
  const doc = options.document || runtimeDocument();
  let handlers: AdbDeviceViewHandlers = { onEvent: () => {} };

  function bindOnline(row: AdbDeviceViewNode, device: AdbDeviceViewDevice): void {
    required(row.querySelector('.d-name'), '.d-name').addEventListener('change', event => {
      handlers.onEvent({ kind: 'rename', serial: device.serial, name: valueOf(event).trim() });
    });
    required(row.querySelector('.d-on'), '.d-on').addEventListener('change', event => {
      handlers.onEvent({ kind: 'toggle', serial: device.serial, on: checkedOf(event) });
    });
    required(row.querySelector('.d-cal'), '.d-cal').addEventListener('click', () => {
      handlers.onEvent({ kind: 'calibrate', serial: device.serial });
    });
    required(row.querySelector('.d-tap'), '.d-tap').addEventListener('click', () => {
      handlers.onEvent({ kind: 'tap', serial: device.serial });
    });
    required(row.querySelector('.d-del'), '.d-del').addEventListener('click', () => {
      handlers.onEvent({ kind: 'remove', serial: device.serial });
    });
    const rec = row.querySelector('.d-rec');
    if (rec) rec.addEventListener('click', () => {   // 离线/未授权行的一键重连（v1.27.0）
      handlers.onEvent({ kind: 'reconnect', serial: device.serial });
    });
  }

  function bindSaved(row: AdbDeviceViewNode, serial: string): void {
    required(row.querySelector('.d-name'), '.d-name').addEventListener('change', event => {
      handlers.onEvent({ kind: 'rename', serial, name: valueOf(event).trim() });
    });
    required(row.querySelector('.d-on'), '.d-on').addEventListener('change', event => {
      handlers.onEvent({ kind: 'toggle', serial, on: checkedOf(event) });
    });
    required(row.querySelector('.d-del'), '.d-del').addEventListener('click', () => {
      handlers.onEvent({ kind: 'remove', serial });
    });
  }

  function onlineRow(device: AdbDeviceViewDevice): AdbDeviceViewNode {
    const row = doc.createElement('div');
    const type = deviceType(device.serial);
    const state = device.state === 'device' ? '' : (device.state === 'unauthorized' ? '未授权' : '离线');
    row.className = 'adb-dev' + (device.state === 'device' ? '' : ' off');
    row.innerHTML =
      '<i class="dot" style="background:' + (device.state === 'device' ? '#4dffa6' : '#ff5d7a') + '"></i>' +
      '<span class="d-type t-' + type + '">' + type + '</span>' +
      '<input class="d-name" value="' + quoted(device.name) + '" title="设备名称">' +
      '<span class="d-serial" title="' + quoted(device.serial) + '">' + (state || quoted(device.serial)) + '</span>' +
      '<span class="d-lat" title="传输延迟（echo 往返中位）">' + (device.L != null ? device.L + 'ms' : '—') + '</span>' +
      '<button class="d-cal" title="测量传输延迟">校</button>' +
      '<button class="d-tap" title="点一下屏幕中心（测试）">点</button>' +
      (device.state === 'device' ? '' : '<button class="d-rec" title="重新连接（无线走 connect，USB 走 reconnect offline）">连</button>') +
      '<button class="d-del" title="从列表移除（重新连接会再次出现）">' + removeIcon + '</button>' +
      '<label class="ck-inline" title="参与齐射"><input type="checkbox" class="d-on"' + (device.on ? ' checked' : '') + '></label>';
    bindOnline(row, device);
    return row;
  }

  function savedRow(serial: string, saved: AdbDeviceViewSaved): AdbDeviceViewNode {
    const row = doc.createElement('div');
    const type = deviceType(serial);
    row.className = 'adb-dev off';
    row.innerHTML =
      '<i class="dot" style="background:#555"></i>' +
      '<span class="d-type t-' + type + '">' + type + '</span>' +
      '<input class="d-name" value="' + quoted(saved.name) + '" title="设备名称">' +
      '<span class="d-serial" title="' + quoted(serial) + '">未连接</span>' +
      '<button class="d-del" title="从列表移除">' + removeIcon + '</button>' +
      '<label class="ck-inline" title="连接后参与齐射"><input type="checkbox" class="d-on"' + (saved.on ? ' checked' : '') + '></label>';
    bindSaved(row, serial);
    return row;
  }

  function render(model: AdbDeviceViewModel, nextHandlers: AdbDeviceViewHandlers): void {
    handlers = nextHandlers;
    const box = doc.getElementById('adb-devices');
    if (!box) return;
    box.innerHTML = '';
    const onlineSerials = new Set(model.devices.map(device => device.serial));
    for (const device of model.devices) box.appendChild(onlineRow(device));
    for (const [serial, saved] of Object.entries(model.saved)) {
      if (!onlineSerials.has(serial)) box.appendChild(savedRow(serial, saved));
    }
    if (!model.devices.length && !Object.keys(model.saved).length) {
      box.innerHTML = '<div class="dim small" style="padding:4px 2px">尚未发现设备 —— 手机开启 USB 调试并连接后自动出现</div>';
    }
  }

  return { render };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
