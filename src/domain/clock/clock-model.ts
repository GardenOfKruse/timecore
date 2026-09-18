namespace TimeCoreDomain {
export interface ClockModel {
  readonly offset: number;
  readonly targetOffset: number;
  epochAt(monotonicMs: number): number;
  tick(monotonicMs: number): number;
  setTargetOffset(value: number): void;
}

export interface ClockModelOptions {
  initialEpoch: number;
  initialMonotonicMs: number;
  initialOffset?: number;
  initialTargetOffset?: number;
  maxTickMs?: number;
  backwardRate?: number;
  forwardRate?: number;
  timeConstantMs?: number;
}

export function createClockModel(options: ClockModelOptions): ClockModel {
  const maxTickMs = options.maxTickMs == null ? 1000 : options.maxTickMs;
  const backwardRate = options.backwardRate == null ? 0.85 : options.backwardRate;
  const forwardRate = options.forwardRate == null ? 8 : options.forwardRate;
  const timeConstantMs = options.timeConstantMs == null ? 420 : options.timeConstantMs;
  let offset = options.initialOffset == null ? 0 : options.initialOffset;
  let targetOffset = options.initialTargetOffset == null ? offset : options.initialTargetOffset;
  let lastTickMs: number | undefined;

  function epochAt(monotonicMs: number): number {
    return options.initialEpoch + (monotonicMs - options.initialMonotonicMs) + offset;
  }

  function tick(monotonicMs: number): number {
    const real = Math.min(maxTickMs, monotonicMs - (lastTickMs == null ? monotonicMs : lastTickMs));
    lastTickMs = monotonicMs;
    if (real <= 0) return 0;

    const delta = targetOffset - offset;
    if (Math.abs(delta) < 0.5) {
      const moved = targetOffset - offset;
      offset = targetOffset;
      return moved;
    }

    const k = (1 - Math.exp(-real / timeConstantMs)) * Math.abs(delta);
    const moved = delta > 0
      ? Math.min(k, real * forwardRate)
      : Math.max(-k, -real * backwardRate);
    offset += moved;
    return moved;
  }

  return {
    get offset() { return offset; },
    get targetOffset() { return targetOffset; },
    epochAt,
    tick,
    setTargetOffset(value) { targetOffset = value; }
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
