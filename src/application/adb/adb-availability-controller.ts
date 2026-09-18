namespace TimeCoreDomain {
export interface AdbAvailabilityExecutor {
  detect(explicitPath?: unknown): Promise<unknown>;
  download(): Promise<unknown>;
}

export interface AdbAvailabilityState {
  ok: boolean;
  path: string;
  version: string;
  ancient: boolean;
}

export interface AdbAvailabilityControllerOptions {
  executor: AdbAvailabilityExecutor;
  initial?: Partial<AdbAvailabilityState>;
  isSupported(): boolean;
  setPath(path: string): void;
  persist(): void;
  render(): void;
  scan(): void | Promise<void>;
  log(message: string): void;
}

export interface AdbAvailabilityController {
  state(): AdbAvailabilityState;
  detect(explicitPath?: unknown): Promise<unknown>;
  download(): Promise<unknown>;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

function isAncient(version: string): boolean {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  return !!match && +match[1] === 1 && +match[2] === 0 && +match[3] < 41;
}

function failed(error: unknown): { ok: false; error: string } {
  return { ok: false, error: text(error) };
}

export function createAdbAvailabilityController(options: AdbAvailabilityControllerOptions): AdbAvailabilityController {
  const initial = options.initial || {};
  let current: AdbAvailabilityState = {
    ok: Boolean(initial.ok),
    path: text(initial.path),
    version: text(initial.version),
    ancient: initial.ancient == null ? isAncient(text(initial.version)) : Boolean(initial.ancient)
  };

  function state(): AdbAvailabilityState {
    return { ...current };
  }

  async function detect(explicitPath?: unknown): Promise<unknown> {
    if (!options.isSupported()) return { ok: false };
    let response: { ok?: unknown; path?: unknown; version?: unknown; error?: unknown };
    try {
      response = await options.executor.detect(explicitPath) as typeof response;
    } catch (error) {
      response = failed(error);
    }
    current.ok = Boolean(response?.ok);
    if (current.ok) {
      current.path = text(response.path);
      current.version = text(response.version);
      current.ancient = isAncient(current.version);
      options.setPath(current.path);
      options.persist();
    }
    options.render();
    return response;
  }

  async function download(): Promise<unknown> {
    if (!options.isSupported()) return { ok: false };
    options.log('开始下载 adb（官方 platform-tools，约 6MB）…');
    let response: { ok?: unknown; error?: unknown };
    try {
      response = await options.executor.download() as typeof response;
    } catch (error) {
      response = failed(error);
    }
    if (!response?.ok) {
      options.log('下载失败：' + (text(response?.error) || '未知错误'));
      return response;
    }
    options.log('adb 下载完成，已自动放置');
    options.setPath('');
    options.persist();
    await detect();
    await options.scan();
    return response;
  }

  return { state, detect, download };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
