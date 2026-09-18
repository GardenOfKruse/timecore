namespace TimeCoreDomain {
  export interface DayProgressState {
    frac: number;       // 0..1：本地一日已流逝比例（0=午夜，0.5=正午，≈1=次日午夜前）
    hourFloat: number;  // 透传输入，便于调试
  }

  // 输入为本地时区的「小时浮点数」（0..24，与 scene3d sunHour 同源）；输出夹取到 [0,1]
  export function dayProgress(hourFloat: number): DayProgressState {
    const h = Number.isFinite(hourFloat) ? hourFloat : 0;
    const frac = Math.min(1, Math.max(0, h / 24));
    return { frac, hourFloat: h };
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
