namespace TimeCoreDomain {
  export interface GapEval {
    gapMs: number;    // 与上次活跃时刻的间隔
    crossed: boolean; // 是否构成一次「时间裂缝」（超过 minGapMs）
  }

  export const GAP_MIN_MS = 90000;   // 90 秒内不算裂缝（正常切走再切回）

  // 挂起唤醒/隔夜重开检测：prev 为上次可见时刻的 epoch，now 为当前。
  // prev 非法或时间倒退（prev > now，系统时钟校准所致）一律判无裂缝。
  export function evaluateGap(prevEpoch: unknown, nowEpoch: number, minGapMs?: number): GapEval {
    const min = Number.isFinite(minGapMs) && (minGapMs as number) >= 0 ? (minGapMs as number) : GAP_MIN_MS;
    if (!Number.isFinite(prevEpoch as number) || (prevEpoch as number) <= 0) return { gapMs: 0, crossed: false };
    const gapMs = Math.floor(nowEpoch - (prevEpoch as number));
    if (!Number.isFinite(gapMs) || gapMs <= 0) return { gapMs: 0, crossed: false };
    return { gapMs, crossed: gapMs > min };
  }

  // 裂缝时长的人读格式：2h13m / 5m / 42s
  export function formatGap(gapMs: number): string {
    if (!Number.isFinite(gapMs) || gapMs <= 0) return '';
    const totalSec = Math.floor(gapMs / 1000);
    if (totalSec < 60) return totalSec + 's';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    if (h > 0) return h + 'h' + String(m).padStart(2, '0') + 'm';
    return m + 'm';
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
