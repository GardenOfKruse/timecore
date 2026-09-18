namespace TimeCoreDomain {
  export type Daypart = 'morning' | 'day' | 'evening' | 'night';

  export interface DaypartTheme {
    key: Daypart;
    rootHz: number;        // 音阶根音频率
    semitones: number[];   // 相对根音的半音序列（8 音上行，琶音用）
    freqs: number[];       // 直接可用的频率表 rootHz × 2^(semi/12)
  }

  // 昼夜四态边界（本地小时）：晨 5-11 / 昼 11-17 / 暮 17-23 / 夜 23-5。
  // 全部使用五声族音阶（相邻级差 ≥2 半音），四态互不同根，到点音景随节点时刻自动换色。
  const THEMES: Record<Daypart, { rootHz: number; semitones: number[] }> = {
    morning: { rootHz: 523.25, semitones: [0, 2, 4, 7, 9, 12, 14, 16] },   // C 大五声：明亮上行
    day: { rootHz: 783.99, semitones: [0, 2, 4, 7, 9, 12, 14, 16] },       // G 大五声：高亢清晰
    evening: { rootHz: 659.25, semitones: [0, 3, 5, 7, 10, 12, 15, 17] },  // E 小五声：柔和收束
    night: { rootHz: 587.33, semitones: [0, 3, 5, 7, 10, 12, 15, 17] }     // D 小五声：静谧低回
  };

  export function daypartFor(hourFloat: number): Daypart {
    const h = Number.isFinite(hourFloat) ? ((hourFloat % 24) + 24) % 24 : 12;
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'day';
    if (h >= 17 && h < 23) return 'evening';
    return 'night';
  }

  export function daypartTheme(hourFloat: number): DaypartTheme {
    const key = daypartFor(hourFloat);
    const t = THEMES[key];
    const freqs = t.semitones.map(s => t.rootHz * Math.pow(2, s / 12));
    return { key, rootHz: t.rootHz, semitones: t.semitones.slice(), freqs };
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
