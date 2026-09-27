namespace TimeCoreDomain {
  export interface DailyDueResult {
    due: boolean;          // 是否应在本轮检查中自动布防
    targetEpoch: number;   // 今日 HH:MM:SS 的绝对 epoch
    dateKey: string;       // 目标时刻的本地日期键（YYYY-MM-DD，用于防重）
    secondsToTarget: number;
  }

  const DAY = 86400000;

  // 每日自动布防判定（纯计算）：每天 HH:MM:SS 自动开始倒数到该时刻。
  // leadMs = 提前多少毫秒开始布防（如 70000 → 提前 70 秒，让三阶段预备可见）。
  // 触发窗口 [target-lead, target]；过了 target 不补发（过期节点跳过，与绝对节点哲学一致）。
  // offsetMs = 本地时区偏移（调用方传 -new Date().getTimezoneOffset()*60000）。
  export function dailyDue(
    nowEpoch: number,
    hh: number, mm: number, ss: number,
    leadMs: number,
    offsetMs: number,
    firedDate: string | null
  ): DailyDueResult {
    const out: DailyDueResult = { due: false, targetEpoch: 0, dateKey: '', secondsToTarget: 0 };
    if (![nowEpoch, hh, mm, ss, leadMs, offsetMs].every(v => Number.isFinite(v))) return out;
    if (!(hh >= 0 && hh <= 23) || !(mm >= 0 && mm <= 59) || !(ss >= 0 && ss <= 59)) return out;
    const midnight = Math.floor((nowEpoch + offsetMs) / DAY) * DAY - offsetMs;
    let target = midnight + (hh * 3600 + mm * 60 + ss) * 1000;
    if (nowEpoch > target) target += DAY;   // 已过的时刻取下一次出现（23:59:30 的 00:00:00 目标指向即将到来的午夜）
    const targetDateKey = new Date(target + offsetMs).toISOString().slice(0, 10);
    out.targetEpoch = target;
    out.dateKey = targetDateKey;
    out.secondsToTarget = Math.round((target - nowEpoch) / 1000);
    const lead = Math.max(0, leadMs);
    out.due = nowEpoch >= target - lead && nowEpoch <= target && firedDate !== targetDateKey;
    return out;
  }

  export function dailyDateKey(nowEpoch: number, offsetMs: number): string {
    return new Date(nowEpoch + offsetMs).toISOString().slice(0, 10);
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
