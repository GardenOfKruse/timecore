namespace TimeCoreDomain {
export interface ElectronIpcPort {
  send(channel: string, ...args: unknown[]): void;
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (...args: unknown[]) => void): void;
}

export interface ElectronBridge {
  readonly isElectron: true;
  send(command: string, arg?: unknown): void;
  get(): Promise<unknown>;
  onState(callback: (state: unknown) => void): () => void;
  adb(command: string, payload?: unknown): Promise<unknown>;
}

const WINDOW_COMMANDS: ReadonlySet<string> = new Set([
  'top', 'opacity', 'minimize', 'fullscreen', 'size',
  'move-begin', 'move-end', 'clock-button', 'clock-zoom', 'open', 'close'
]);
const ADB_COMMANDS: ReadonlySet<string> = new Set(['detect', 'exec', 'download', 'shot-save', 'shot-load']);

function sendWindow(ipc: ElectronIpcPort, command: string, arg?: unknown): void {
  // preload 是 renderer 的 capability 边界；未知窗口命令静默丢弃，保持主进程旧的 no-op 语义。
  if (typeof command !== 'string' || !WINDOW_COMMANDS.has(command)) return;
  ipc.send('win', command, arg);
}

function onState(ipc: ElectronIpcPort, callback: (state: unknown) => void): () => void {
  const listener = (_event: unknown, state: unknown) => callback(state);
  ipc.on('win:state', listener);
  return () => ipc.removeListener('win:state', listener);
}

function adb(ipc: ElectronIpcPort, command: string, payload?: unknown): Promise<unknown> {
  if (typeof command !== 'string' || !ADB_COMMANDS.has(command)) {
    return Promise.reject(new Error('bad adb cmd'));
  }
  return ipc.invoke('adb:' + command, payload);
}

export function createElectronBridge(ipc: ElectronIpcPort): ElectronBridge {
  return {
    isElectron: true,
    send: (command, arg) => sendWindow(ipc, command, arg),
    get: () => ipc.invoke('win:get'),
    onState: callback => onState(ipc, callback),
    adb: (command, payload) => adb(ipc, command, payload)
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
