namespace TimeCoreDomain {
export interface AdbScreenshotAction {
  id: string;
  name?: string;
  _shot?: string;
  shotW?: number;
  shotH?: number;
  x?: unknown;
  y?: unknown;
  [key: string]: unknown;
}

export interface AdbScreenshotDevice {
  serial: string;
  name?: string;
  state?: string;
  W?: number;
  H?: number;
  [key: string]: unknown;
}

export interface AdbScreenshotExecutor {
  exec(path: string, args: readonly string[], options?: { timeoutMs?: number; binary?: boolean }): Promise<unknown>;
}

export interface AdbScreenshotPickerPort {
  open(action: AdbScreenshotAction): void;
}

export interface AdbScreenshotTargetResolver {
  resolve(action: AdbScreenshotAction): AdbScreenshotDevice | null;
}

// 截图存档端口（v1.20.0）：把选点截图按动作 id 落盘（Electron userData），打开浮层时自动捞回；
// 缺省（浏览器模式）不注入——行为保持「截图仅驻留内存」的旧语义。
export interface AdbScreenshotShotStore {
  save(name: string, b64: string): unknown;
  load(name: string): Promise<unknown>;
}

export interface AdbScreenshotControllerOptions {
  executor: AdbScreenshotExecutor;
  picker: AdbScreenshotPickerPort;
  targets: AdbScreenshotTargetResolver;
  getAdbPath(): string;
  save(): void;
  render(): void;
  log(message: string): void;
  shotStore?: AdbScreenshotShotStore;
}

export interface AdbScreenshotOpenOptions {
  capture?: boolean;
  show?: boolean;
}

export interface AdbScreenshotController {
  open(action: AdbScreenshotAction, options?: AdbScreenshotOpenOptions): Promise<void>;
  select(action: AdbScreenshotAction, x: number, y: number): void;
  retake(action: AdbScreenshotAction): Promise<void>;
  close(): void;
}

function field(result: unknown, key: string): unknown {
  if (!result || typeof result !== 'object') return undefined;
  return (result as Record<string, unknown>)[key];
}

function isShot(action: AdbScreenshotAction): boolean {
  return typeof action._shot === 'string' && action._shot.length > 0;
}

function validCoordinate(value: unknown): boolean {
  return value !== '' && Number.isFinite(Number(value));
}

export function createAdbScreenshotController(options: AdbScreenshotControllerOptions): AdbScreenshotController {
  async function capture(action: AdbScreenshotAction): Promise<boolean> {
    const device = options.targets.resolve(action);
    if (!device) {
      options.log('「' + action.name + '」没有在线设备，无法截屏选点');
      return false;
    }
    const result = await options.executor.exec(
      options.getAdbPath(),
      ['-s', device.serial, 'exec-out', 'screencap', '-p'],
      { timeoutMs: 15000, binary: true }
    );
    const b64 = field(result, 'b64');
    if (!field(result, 'ok') || typeof b64 !== 'string' || b64.length < 100) {
      const reason = String(field(result, 'stderr') || field(result, 'error') || '').trim().slice(0, 60) || '图像为空';
      options.log('截屏失败：' + reason);
      return false;
    }
    action._shot = b64;
    action.shotW = device.W || 1080;
    action.shotH = device.H || 2340;
    if (!validCoordinate(action.x) || !validCoordinate(action.y)) {
      action.x = Math.round(action.shotW / 2);
      action.y = Math.round(action.shotH / 2);
    }
    if (options.shotStore) {
      try { void options.shotStore.save(String(action.id), b64); } catch (_) { /* 存档失败不阻塞选点流程 */ }
    }
    options.render();
    options.log('已截取 ' + (device.name || device.serial) + ' 屏幕，点击截图选点');
    return true;
  }

  // 从磁盘存档恢复当时的截图（应用重启后内存 _shot 已失，但存档还在）
  async function restore(action: AdbScreenshotAction): Promise<boolean> {
    if (!options.shotStore) return false;
    try {
      const r = await options.shotStore.load(String(action.id)) as { ok?: unknown; b64?: unknown };
      if (r && r.ok === true && typeof r.b64 === 'string' && r.b64.length > 100) {
        action._shot = r.b64;
        return true;
      }
    } catch (_) { /* 读取失败静默降级为重新截屏 */ }
    return false;
  }

  async function open(action: AdbScreenshotAction, openOptions: AdbScreenshotOpenOptions = {}): Promise<void> {
    if (!isShot(action) && (await restore(action))) {
      if (openOptions.show !== false) options.picker.open(action);
      return;
    }
    const shouldCapture = openOptions.capture === true || !isShot(action);
    if (shouldCapture && !(await capture(action))) return;
    if (openOptions.show !== false) options.picker.open(action);
  }

  function select(action: AdbScreenshotAction, x: number, y: number): void {
    action.x = x;
    action.y = y;
    options.save();
    options.log('「' + action.name + '」选点 → ' + action.x + ',' + action.y);
  }

  function retake(action: AdbScreenshotAction): Promise<void> {
    return open(action, { capture: true, show: true });
  }

  function close(): void {
    options.render();
  }

  return { open, select, retake, close };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
