namespace TimeCoreDomain {
export interface TapTiming {
  n: number;
  gap: number;
}

export interface TapRateSpec {
  rate: number;
  seconds: number;
}

/** 每秒次数下限 0.5（两秒一击）；上限 20（对应间隔下限 50ms）。 */
export const TAP_RATE_MIN = 0.5;
export const TAP_RATE_MAX = 20;
export const TAP_SECONDS_MIN = 0.5;
export const TAP_SECONDS_MAX = 120;
export const TAP_GAP_MIN = 50;
export const TAP_GAP_MAX = 5000;
export const TAP_COUNT_MAX = 200;
export const HOLD_MS_MIN = 100;
export const HOLD_MS_MAX = 10000;

export interface TapRatePreset {
  label: string;
  rate: number;
}

/** 速度预设：一键填「每秒几次」，用户不需要理解毫秒间隔。 */
export const TAP_RATE_PRESETS: readonly TapRatePreset[] = [
  { label: '慢 · 每秒1次', rate: 1 },
  { label: '中 · 每秒3次', rate: 3 },
  { label: '快 · 每秒6次', rate: 6 },
  { label: '极速 · 每秒12次', rate: 12 }
];

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (value === '' || value === null || value === undefined) return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/** 「每秒几次 + 点几秒」→ 存储模型（次数 n + 间隔 gap ms）。旧字段 n/gap 保持兼容，老配置零迁移。 */
export function tapRateToTiming(rate: unknown, seconds: unknown): TapTiming {
  const r = clampNumber(rate, 5, TAP_RATE_MIN, TAP_RATE_MAX);
  const s = clampNumber(seconds, 2, TAP_SECONDS_MIN, TAP_SECONDS_MAX);
  const n = Math.max(1, Math.min(TAP_COUNT_MAX, Math.round(r * s)));
  const gap = Math.round(Math.min(TAP_GAP_MAX, Math.max(TAP_GAP_MIN, 1000 / r)));
  return { n, gap };
}

/** 长按版：间隔扣除单次按压时长，「每秒 X 次」按按压起点计。 */
export function holdRateToTiming(rate: unknown, seconds: unknown, holdMs: unknown): TapTiming {
  const r = clampNumber(rate, 1, TAP_RATE_MIN, TAP_RATE_MAX);
  const s = clampNumber(seconds, 3, TAP_SECONDS_MIN, TAP_SECONDS_MAX);
  const hold = clampNumber(holdMs, 800, HOLD_MS_MIN, HOLD_MS_MAX);
  const n = Math.max(1, Math.min(TAP_COUNT_MAX, Math.round(r * s)));
  const gap = Math.round(Math.min(TAP_GAP_MAX, Math.max(TAP_GAP_MIN, 1000 / r - hold)));
  return { n, gap };
}

/** 存储模型 → 界面回显（每秒次数与秒数均保留 1 位小数）。长按传入 holdMs 时周期 = 间隔 + 按压时长。 */
export function tapTimingToRate(n: unknown, gap: unknown, holdMs?: unknown): TapRateSpec {
  const g = clampNumber(gap, 400, TAP_GAP_MIN, TAP_GAP_MAX);
  const c = clampNumber(n, 5, 1, TAP_COUNT_MAX);
  const hold = holdMs === undefined || holdMs === null ? 0 : clampNumber(holdMs, 800, HOLD_MS_MIN, HOLD_MS_MAX);
  const period = g + hold;
  return {
    rate: Math.round(1000 / period * 10) / 10,
    seconds: Math.round(c * period / 100) / 10
  };
}
}

(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
