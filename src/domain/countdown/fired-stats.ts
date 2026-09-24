namespace TimeCoreDomain {
  export interface FiredDayStat {
    count: number;
  }

  export interface FiredRecordResult {
    today: FiredDayStat;   // 记录后的当日计数（副本）
    total: number;         // 记录后的累计到点数（跨日累计，不受 30 天滚动影响）
    milestone: boolean;    // 本次记录是否恰好踩中 100 的整数倍（每满 100 翻旗一次）
  }

  export interface FiredStatsSummary {
    days: Record<string, FiredDayStat>;
    today: FiredDayStat | null;
    total: number;
  }

  // 每日到点统计：纯状态机，持久化由 Adapter 承担。当日明细保留最近 30 天，total 跨日累计。
  export function createFiredStats() {
    let days: Record<string, FiredDayStat> = {};
    let total = 0;

    function prune() {
      const keys = Object.keys(days).sort().slice(-30);
      const next: Record<string, FiredDayStat> = {};
      for (const k of keys) next[k] = days[k];
      days = next;
    }

    function load(raw: unknown): void {
      days = {};
      total = 0;
      if (!raw || typeof raw !== 'object') return;
      const o = raw as { days?: unknown; total?: unknown };
      if (o.days && typeof o.days === 'object') {
        const src = o.days as Record<string, unknown>;
        for (const k of Object.keys(src)) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
          const v = (src[k] as { count?: unknown }).count;
          if (Number.isFinite(v) && (v as number) >= 0) days[k] = { count: Math.floor(v as number) };
        }
        prune();
      }
      if (Number.isFinite(o.total) && (o.total as number) >= 0) total = Math.floor(o.total as number);
    }

    function record(dateKey: string): FiredRecordResult {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return { today: { count: 0 }, total, milestone: false };
      const d = days[dateKey] || { count: 0 };
      d.count += 1;
      days[dateKey] = d;
      total += 1;
      prune();
      const before = total - 1;
      const milestone = Math.floor(before / 100) < Math.floor(total / 100);
      return { today: { ...d }, total, milestone };
    }

    function summary(dateKey: string): FiredStatsSummary {
      const copy: Record<string, FiredDayStat> = {};
      for (const k of Object.keys(days)) copy[k] = { ...days[k] };
      return { days: copy, today: copy[dateKey] ? { ...copy[dateKey] } : null, total };
    }

    function serialize(): string {
      return JSON.stringify({ v: 1, days, total });
    }

    return { load, record, summary, serialize };
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
