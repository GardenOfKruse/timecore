namespace TimeCoreDomain {
export interface RuntimeLoopInfo {
  armed: boolean;
  fired: boolean;
  remainingMs: number;
  progress: number;
  phase: string;
}

export interface RuntimeSceneFrame {
  epoch: number;
  phase: string;
  progress: number;
  pulse: number;
  armed: boolean;
}

export interface RuntimeLoopPlatform {
  now(): number;
  epoch(): number;
  requestFrame(listener: (timestamp: number) => void): unknown;
  cancelFrame(handle: unknown): void;
  setInterval(listener: () => void, delayMs: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface RuntimeLoopPorts {
  logical(epoch: number): RuntimeLoopInfo;
  watchdog(): void;
  renderScene(dt: number, frame: RuntimeSceneFrame): void;
}

export interface RuntimeLoop {
  start(): void;
  stop(): void;
}

function idleProgress(epoch: number): number {
  return ((epoch / 1000) % 60) / 60;
}

export function createRuntimeLoop(
  platform: RuntimeLoopPlatform,
  ports: RuntimeLoopPorts
): RuntimeLoop {
  let running = false;
  let refreshTimer: unknown = null;
  let watchdogTimer: unknown = null;
  let frameHandle: unknown = null;
  let lastFrameAt: number | null = null;
  let pulse = 0;
  let lastSecLeft = -1;

  function observe(info: RuntimeLoopInfo): void {
    if (info.armed && !info.fired) {
      const secLeft = Math.ceil(info.remainingMs / 1000);
      if (secLeft !== lastSecLeft) {
        lastSecLeft = secLeft;
        pulse = Math.max(pulse, 0.5);
      }
    } else {
      lastSecLeft = -1;
    }
  }

  function refresh(epoch: number): RuntimeLoopInfo {
    const info = ports.logical(epoch);
    observe(info);
    return info;
  }

  function frame(): void {
    if (!running) return;
    frameHandle = platform.requestFrame(frame);
    const now = platform.now();
    const dt = Math.min(0.05, (now - (lastFrameAt || now)) / 1000);
    lastFrameAt = now;
    const epoch = platform.epoch();
    const info = refresh(epoch);
    const progress = (info.armed || info.fired) ? info.progress : idleProgress(epoch);
    ports.renderScene(dt, {
      epoch,
      phase: info.phase,
      progress,
      pulse,
      armed: info.armed
    });
    pulse *= Math.exp(-dt * 5);
  }

  function prime(timestamp: number): void {
    if (!running) return;
    lastFrameAt = timestamp;
    frameHandle = platform.requestFrame(frame);
  }

  function start(): void {
    if (running) return;
    running = true;
    refreshTimer = platform.setInterval(() => refresh(platform.epoch()), 66);
    watchdogTimer = platform.setInterval(() => ports.watchdog(), 120);
    frameHandle = platform.requestFrame(prime);
  }

  function stop(): void {
    if (!running) return;
    running = false;
    if (refreshTimer !== null) platform.clearInterval(refreshTimer);
    if (watchdogTimer !== null) platform.clearInterval(watchdogTimer);
    if (frameHandle !== null) platform.cancelFrame(frameHandle);
    refreshTimer = null;
    watchdogTimer = null;
    frameHandle = null;
    lastFrameAt = null;
    pulse = 0;
    lastSecLeft = -1;
  }

  return { start, stop };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
