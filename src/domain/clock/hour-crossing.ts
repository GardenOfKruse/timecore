namespace TimeCoreDomain {
  // 整点跨界检测：prevEpoch → nowEpoch 之间跨过几个整点小时桶。
  // 错过多个整点（睡眠/挂起唤醒）合并为一次脉冲，返回值只会是 0 或 1；时间倒退返回 0。
  export function hourCrossed(prevEpochMs: number, nowEpochMs: number): boolean {
    if (!Number.isFinite(prevEpochMs) || !Number.isFinite(nowEpochMs)) return false;
    if (nowEpochMs <= prevEpochMs) return false;
    return Math.floor(nowEpochMs / 3600000) > Math.floor(prevEpochMs / 3600000);
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
