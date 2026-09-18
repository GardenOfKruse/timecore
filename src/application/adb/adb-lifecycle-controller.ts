namespace TimeCoreDomain {
export interface AdbLifecycleState {
  enabled: boolean;
}

export interface AdbLifecycleCountdownSnapshot {
  armed: boolean;
  target?: number;
}

export interface AdbLifecycleControllerOptions {
  initialEnabled?: boolean;
  isSupported(): boolean;
  setConfigEnabled(enabled: boolean): void;
  persist(): void;
  halt(): void;
  detect(): Promise<unknown>;
  isAvailable(): boolean;
  hasDevices(): boolean;
  scan(): void | Promise<unknown>;
  countdown(): AdbLifecycleCountdownSnapshot;
  arm(target: number): void;
  render(): void;
  log(message: string): void;
}

export interface AdbLifecycleController {
  state(): AdbLifecycleState;
  setEnabled(enabled: boolean): Promise<AdbLifecycleState>;
}

export function createAdbLifecycleController(options: AdbLifecycleControllerOptions): AdbLifecycleController {
  let current = Boolean(options.initialEnabled);
  let generation = 0;

  function state(): AdbLifecycleState {
    return { enabled: current };
  }

  function isCurrent(token: number): boolean {
    return token === generation && current;
  }

  async function activate(token: number): Promise<void> {
    try {
      await options.detect();
      if (!isCurrent(token) || !options.isAvailable()) return;
      if (options.hasDevices()) await options.scan();
      if (!isCurrent(token)) return;
      const info = options.countdown();
      if (info.armed && Number.isFinite(info.target)) options.arm(info.target as number);
    } catch (_) {
      // Detection and scanning adapters own their user-facing errors. A stale or failed
      // activation must not turn a toggle event into an unhandled rejection.
    }
  }

  async function setEnabled(enabled: boolean): Promise<AdbLifecycleState> {
    current = Boolean(enabled);
    const token = ++generation;
    options.setConfigEnabled(current);
    options.persist();
    if (!current) options.halt();
    options.render();
    options.log(current ? 'ADB 齐射已启用' : 'ADB 齐射已停用（不扫描、不发射）');

    if (current && options.isSupported()) await activate(token);
    return state();
  }

  return { state, setEnabled };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
