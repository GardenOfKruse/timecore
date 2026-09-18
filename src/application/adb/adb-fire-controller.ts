namespace TimeCoreDomain {
export interface AdbFireAction {
  type: string;
  name?: string;
  [key: string]: unknown;
}

export interface AdbFireDevice {
  serial: string;
  name?: string;
  L?: number | null;
  [key: string]: unknown;
}

export interface AdbFireScriptBuilder {
  build(action: AdbFireAction, device: AdbFireDevice, options?: { compensate?: boolean }): string;
}

export interface AdbFireExecutor {
  exec(path: string, args: readonly string[], options?: { timeoutMs?: number }): Promise<unknown>;
}

export interface AdbFireClock {
  epoch(): number;
}

export interface AdbFireLogger {
  log(message: string): void;
}

export type AdbFireMode = 'scheduled' | 'test';

export interface AdbFireRequest {
  mode: AdbFireMode;
  action: AdbFireAction;
  device: AdbFireDevice;
  adbPath: string;
  dry: boolean;
  compensate: boolean;
  calibrated: boolean;
  precise?: boolean;
  tag?: string;
  /** Absolute epoch at which the command should reach the device in precise mode. */
  fireEpoch?: number;
}

export interface AdbFireController {
  dispatch(request: AdbFireRequest): void;
}

export interface AdbFireControllerOptions {
  executor: AdbFireExecutor;
  scriptBuilder: AdbFireScriptBuilder;
  clock: AdbFireClock;
  logger: AdbFireLogger;
}

function field(result: unknown, key: string): unknown {
  if (!result || typeof result !== 'object') return undefined;
  return (result as Record<string, unknown>)[key];
}

function deviceName(device: AdbFireDevice): string {
  return device.name || device.serial;
}

export function createAdbFireController(options: AdbFireControllerOptions): AdbFireController {
  function buildScript(request: AdbFireRequest): string {
    return options.scriptBuilder.build(request.action, request.device, { compensate: request.compensate });
  }

  async function runScript(request: AdbFireRequest, script: string, tag: string): Promise<void> {
    const result = await options.executor.exec(
      request.adbPath,
      ['-s', request.device.serial, 'shell', script],
      { timeoutMs: 90000 }
    );
    const ok = Boolean(field(result, 'ok'));
    const failure = String(field(result, 'stderr') || field(result, 'error') || '').trim().slice(0, 60)
      || ('exit ' + field(result, 'code'));
    options.logger.log(tag + ' ' + deviceName(request.device) + ' → ' + (ok
      ? '完成 ' + field(result, 'durMs') + 'ms'
      : '失败 ' + failure));
  }

  function dispatch(request: AdbFireRequest): void {
    const baseScript = buildScript(request);
    if (request.mode === 'test') {
      if (request.dry) {
        options.logger.log('【演练】→ ' + deviceName(request.device) + '：' + baseScript.slice(0, 120));
      } else {
        runScript(request, baseScript, request.tag || '试射');
      }
      return;
    }

    if (request.precise) {
      const fireEpoch = request.fireEpoch ?? options.clock.epoch();
      const halfLatency = request.calibrated && request.device.L != null ? request.device.L / 2 : 0;
      const sleepS = Math.max(0, (fireEpoch - (options.clock.epoch() + halfLatency)) / 1000);
      const script = (sleepS > 0.03 ? 'sleep ' + sleepS.toFixed(3) + '\n' : '') + baseScript;
      if (request.dry) {
        options.logger.log('【演练·预发射】→ ' + deviceName(request.device) + ' sleep=' + sleepS.toFixed(3) + 's：' + baseScript.slice(0, 120));
      } else {
        runScript(request, script, '⚡预');
      }
      return;
    }

    if (request.dry) {
      options.logger.log('【演练】→ ' + deviceName(request.device) + '：' + baseScript.slice(0, 120));
    } else {
      runScript(request, baseScript, '⚡');
    }
  }

  return { dispatch };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
