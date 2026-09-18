namespace TimeCoreDomain {
export interface AdbConnectionAvailability {
  path: string;
  version: string;
  ancient: boolean;
}

export interface AdbConnectionExecutor {
  exec(path: string, args: readonly string[], options?: { timeoutMs?: number }): Promise<unknown>;
}

export interface AdbConnectionDevice {
  state?: unknown;
  name?: unknown;
}

export interface AdbConnectionControllerOptions {
  executor: AdbConnectionExecutor;
  availability(): AdbConnectionAvailability;
  scan(): void | Promise<unknown>;
  device(serial: string): AdbConnectionDevice | undefined;
  log(message: string): void;
}

export interface AdbConnectionController {
  connect(ip: string): Promise<void>;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function isWirelessEndpoint(value: string): boolean {
  return /^\d+(\.\d+){3}:\d+$/.test(value);
}

function resultText(response: unknown): string {
  const result = response as { stdout?: unknown; stderr?: unknown; error?: unknown } | null | undefined;
  return text(result?.stdout || result?.stderr || result?.error).trim().slice(0, 60);
}

export function createAdbConnectionController(options: AdbConnectionControllerOptions): AdbConnectionController {
  async function connect(ip: string): Promise<void> {
    const availability = options.availability();
    if (availability.ancient && isWirelessEndpoint(ip)) {
      options.log('⚠ adb ' + availability.version + ' 不支持 Android 11+ 无线调试（TLS 握手）——先点「⬇ 升级 adb」再连接');
    }

    const response = await options.executor.exec(availability.path, ['connect', ip], { timeoutMs: 8000 });
    options.log('connect ' + ip + ' → ' + resultText(response));
    await options.scan();

    const device = options.device(ip);
    if (device && device.state === 'offline') {
      options.log(availability.ancient
        ? '⚠ ' + ip + ' 一直离线：旧版 adb 无法完成无线调试握手——「⬇ 升级 adb」装官方最新组件后重连即可'
        : '⚠ ' + ip + ' 离线：请确认手机「无线调试」仍开启，必要时重新配对后重连');
    } else if (device && device.state === 'device') {
      options.log('✓ ' + ip + ' 已就绪（' + (text(device.name) || '设备') + '）');
    }
  }

  return { connect };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
