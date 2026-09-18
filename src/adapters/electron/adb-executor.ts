namespace TimeCoreDomain {
export interface AdbTransport {
  adb(command: string, payload?: unknown): Promise<unknown>;
}

export interface AdbExecOptions {
  timeoutMs?: number;
  binary?: boolean;
}

export interface AdbExecutor {
  detect(explicitPath?: unknown): Promise<unknown>;
  exec(path: string, args: readonly string[], options?: AdbExecOptions): Promise<unknown>;
  download(): Promise<unknown>;
}

function detect(transport: AdbTransport, explicitPath?: unknown): Promise<unknown> {
  return transport.adb('detect', { path: explicitPath != null ? explicitPath : '' });
}

function exec(transport: AdbTransport, path: string, args: readonly string[], options?: AdbExecOptions): Promise<unknown> {
  const payload: { path: string; args: string[]; timeoutMs?: number; binary?: boolean } = {
    path: path || 'adb',
    args: Array.isArray(args) ? [...args] : []
  };
  if (options && options.timeoutMs !== undefined) payload.timeoutMs = options.timeoutMs;
  if (options && options.binary) payload.binary = true;
  return transport.adb('exec', payload);
}

function download(transport: AdbTransport): Promise<unknown> {
  return transport.adb('download', {});
}

export function createAdbExecutor(transport: AdbTransport): AdbExecutor {
  return {
    detect: explicitPath => detect(transport, explicitPath),
    exec: (path, args, options) => exec(transport, path, args, options),
    download: () => download(transport)
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
