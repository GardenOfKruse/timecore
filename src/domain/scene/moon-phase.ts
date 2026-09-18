namespace TimeCoreDomain {
  export interface MoonPhaseState {
    ageDays: number;      // 当前月龄（0..29.53 天）
    phase: number;        // 0 新月 → 0.5 满月 → 1 下一个新月
    angleRad: number;     // 轨道角：新月 0（位于太阳与星球连线之间），满月 π（背向太阳）
    waxing: boolean;      // 盈月（新月→满月）为 true
  }

  export const MOON_SYNODIC_DAYS = 29.530588853;
  // 参考新月：2000-01-06T18:14:00Z
  export const MOON_REFERENCE_NEW_MOON_MS = 947182440000;

  export function moonPhase(epochMs: number): MoonPhaseState {
    const days = (epochMs - MOON_REFERENCE_NEW_MOON_MS) / 86400000;
    const phase = (((days / MOON_SYNODIC_DAYS) % 1) + 1) % 1;
    return {
      ageDays: phase * MOON_SYNODIC_DAYS,
      phase,
      angleRad: phase * Math.PI * 2,
      waxing: phase < 0.5
    };
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
