namespace TimeCoreDomain {
export interface AdbScanExecutionResult {
  ok?: boolean;
  stdout?: unknown;
  stderr?: unknown;
  error?: unknown;
}

export interface AdbScanExecutorPort {
  exec(path: string, args: readonly string[], options?: { timeoutMs?: number }): Promise<unknown>;
}

export interface AdbScanControllerRunInput {
  stdout: string;
  nowEpoch: number;
  previousSignature: string;
  silent: boolean;
}

export interface AdbScanControllerRunResult {
  changed: boolean;
  nameCount: number;
  snapshot: { signature: string };
  seen: readonly string[];
}

export interface AdbScanCoordinatorPort {
  run(input: AdbScanControllerRunInput): Promise<AdbScanControllerRunResult>;
}

export type AdbScanControllerResult =
  | { status: 'skipped'; changed: false; nameCount: 0; seenCount: 0 }
  | { status: 'failed'; changed: false; nameCount: 0; seenCount: 0; error: string }
  | { status: 'completed'; changed: boolean; nameCount: number; seenCount: number };

export interface AdbScanControllerOptions {
  executor: AdbScanExecutorPort;
  coordinator: AdbScanCoordinatorPort;
  isAvailable(): boolean;
  getPath(): string;
  nowEpoch(): number;
  onChanged(result: AdbScanControllerRunResult): void;
  onPersist(): void;
  onGuide(): void;
  onLog(message: string): void;
}

export interface AdbScanController {
  scan(silent?: boolean): Promise<AdbScanControllerResult>;
  invalidate(): void;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

export function createAdbScanController(options: AdbScanControllerOptions): AdbScanController {
  let previousSignature = '';

  async function scan(silent = false): Promise<AdbScanControllerResult> {
    if (!options.isAvailable()) {
      return { status: 'skipped', changed: false, nameCount: 0, seenCount: 0 };
    }

    let response: AdbScanExecutionResult;
    try {
      response = await options.executor.exec(options.getPath(), ['devices', '-l'], { timeoutMs: 8000 }) as AdbScanExecutionResult;
    } catch (error) {
      response = { ok: false, error };
    }

    if (!response || !response.ok) {
      const error = text(response?.stderr || response?.error).slice(0, 80);
      options.onLog('扫描失败：' + error);
      return { status: 'failed', changed: false, nameCount: 0, seenCount: 0, error };
    }

    const result = await options.coordinator.run({
      stdout: text(response.stdout),
      nowEpoch: options.nowEpoch(),
      previousSignature,
      silent: !!silent
    });
    if (result.changed) {
      previousSignature = result.snapshot.signature;
      options.onChanged(result);
    }
    if (result.changed || result.nameCount) options.onPersist();
    options.onGuide();
    if (!silent || result.changed) options.onLog('扫描完成：' + result.seen.length + ' 台设备');
    return {
      status: 'completed',
      changed: result.changed,
      nameCount: result.nameCount,
      seenCount: result.seen.length
    };
  }

  return {
    scan,
    invalidate() { previousSignature = ''; }
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
