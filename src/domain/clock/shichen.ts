namespace TimeCoreDomain {
  export interface ShichenInfo {
    index: number;        // 0..11 → 子丑寅卯辰巳午未申酉戌亥（子=23:00 起）
    branch: string;
    alias: string;        // 十二雅称：夜半/鸡鸣/平旦/日出/食时/隅中/日中/日昳/晡时/日入/黄昏/人定
    startEpoch: number;   // 当前时辰开始时刻（子时可能始于前一日 23:00）
    nextIndex: number;
    nextBranch: string;
    nextEpoch: number;
    minutesToNext: number;
    geng: string | null;  // 五更：19-21 一更 … 3-5 五更；白天为 null
  }

  export const SHICHEN_BRANCHES: readonly string[] = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  export const SHICHEN_ALIASES: readonly string[] = ['夜半', '鸡鸣', '平旦', '日出', '食时', '隅中', '日中', '日昳', '晡时', '日入', '黄昏', '人定'];
  // 五更：三更=23-1 时、四更=1-3、五更=3-5、一更=19-21、二更=21-23；5-19 点无更
  const GENG_BY_HOUR = ['三更', '四更', '四更', '五更', '五更', null, null, null, null, null, null, null, null, null, null, null, null, null, null, '一更', '一更', '二更', '二更', '三更'];
  const DAY_MS = 86400000;

  /** 24 小时制 → 时辰序号：子时 23:00 起，(h+1)/2 取商。23 点与 0 点同属子。 */
  export function shichenOfHour(hour24: number): number {
    if (!Number.isFinite(hour24)) return 0;
    const h = ((Math.floor(hour24) % 24) + 24) % 24;
    return ((h + 1) % 24) >> 1;
  }

  function shichenStartEpoch(now: number, index: number): number {
    const d = new Date(now);
    d.setMinutes(0, 0, 0);
    const startHour = (23 + 2 * index) % 24;
    d.setHours(startHour);
    while (d.getTime() > now) d.setTime(d.getTime() - 2 * 3600000);   // 子时凌晨场景最多回退 12 步到前一日 23:00
    return d.getTime();
  }

  /** 当前时辰、雅称、五更与距下一时辰的分钟数（向上取整）。 */
  export function shichenInfo(now: number): ShichenInfo {
    if (!Number.isFinite(now)) now = Date.now();
    const d = new Date(now);
    const index = shichenOfHour(d.getHours());
    const nextIndex = (index + 1) % 12;
    const startEpoch = shichenStartEpoch(now, index);
    const nextEpoch = startEpoch + 2 * 3600000;
    return {
      index,
      branch: SHICHEN_BRANCHES[index],
      alias: SHICHEN_ALIASES[index],
      startEpoch,
      nextIndex,
      nextBranch: SHICHEN_BRANCHES[nextIndex],
      nextEpoch,
      minutesToNext: Math.max(0, Math.ceil((nextEpoch - now) / 60000)),
      geng: GENG_BY_HOUR[d.getHours()] || null
    };
  }

  /** 五更文案（供 UI 直接显示；null = 白天无更）。 */
  export function gengOfHour(hour24: number): string | null {
    if (!Number.isFinite(hour24)) return null;
    return GENG_BY_HOUR[((Math.floor(hour24) % 24) + 24) % 24] || null;
  }

  // 时辰起点毫秒常量（对外换算用）
  export const SHICHEN_SPAN_MS = 2 * 3600000;
  export const SHICHEN_DAY_MS = DAY_MS;
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
