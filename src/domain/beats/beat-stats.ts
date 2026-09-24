namespace TimeCoreDomain {
  export interface BeatDayStat {
    count: number;
    maxCombo: number;
    perfect: number;
    great: number;
    good: number;
    miss: number;
    score: number;   // 加权分：P=1 / G=0.7 / Go=0.4 / MISS=0
    hours: number[]; // 24 桶击拍数分布（本地小时，v1.17.0 起）
  }

  export interface BeatStatsSummary {
    days: Record<string, BeatDayStat>;
    today: (BeatDayStat & { date: string; accuracy: number }) | null;
    bestHour: number | null;   // 近 30 天击拍数最多的本地小时（0-23），无数据为 null
  }

  // 每日击拍统计：纯状态机，持久化由 Adapter（localStorage）承担。保留最近 30 天。
  export function createBeatStats() {
    let days: Record<string, BeatDayStat> = {};
    const WEIGHT = { PERFECT: 1, GREAT: 0.7, GOOD: 0.4, MISS: 0 };

    function zero(): BeatDayStat {
      return { count: 0, maxCombo: 0, perfect: 0, great: 0, good: 0, miss: 0, score: 0, hours: new Array(24).fill(0) };
    }
    function prune() {
      const keys = Object.keys(days).sort().slice(-30);
      const next: Record<string, BeatDayStat> = {};
      for (const k of keys) next[k] = days[k];
      days = next;
    }
    function validDay(v: unknown): BeatDayStat | null {
      if (!v || typeof v !== 'object') return null;
      const o = v as Record<string, unknown>;
      const num = (x: unknown) => (Number.isFinite(x) ? (x as number) : 0);
      // 旧版数据无 hours 字段：默认全零桶（向后兼容）
      const hours = Array.isArray(o.hours) && o.hours.length === 24
        ? (o.hours as unknown[]).map(h => (Number.isFinite(h) && (h as number) >= 0 ? Math.floor(h as number) : 0))
        : new Array(24).fill(0);
      return { count: num(o.count), maxCombo: num(o.maxCombo), perfect: num(o.perfect), great: num(o.great), good: num(o.good), miss: num(o.miss), score: num(o.score), hours };
    }

    function load(raw: unknown): void {
      days = {};
      if (!raw || typeof raw !== 'object') return;
      const o = (raw as { days?: unknown }).days;
      if (!o || typeof o !== 'object') return;
      for (const k of Object.keys(o as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
        const d = validDay((o as Record<string, unknown>)[k]);
        if (d) days[k] = d;
      }
      prune();
    }

    function record(dateKey: string, rec: { label?: unknown; combo?: unknown; hour?: unknown }): BeatDayStat {
      const label = String(rec.label || 'MISS') as keyof typeof WEIGHT;
      const w = WEIGHT[label] != null ? WEIGHT[label] : 0;
      const combo = Number.isFinite(rec.combo) ? (rec.combo as number) : 0;
      const d = days[dateKey] || zero();
      d.count += 1;
      d.maxCombo = Math.max(d.maxCombo, combo);
      if (label === 'PERFECT') d.perfect += 1;
      else if (label === 'GREAT') d.great += 1;
      else if (label === 'GOOD') d.good += 1;
      else d.miss += 1;
      d.score += w;
      const hour = Number.isInteger(rec.hour) && (rec.hour as number) >= 0 && (rec.hour as number) <= 23 ? (rec.hour as number) : null;
      if (hour != null) d.hours[hour] += 1;
      days[dateKey] = d;
      prune();
      return { ...d, hours: d.hours.slice() };
    }

    function accuracy(d: BeatDayStat): number {
      return d.count > 0 ? Math.round((d.score / d.count) * 100) : 0;
    }

    function bestHour(): number | null {
      const buckets = new Array(24).fill(0);
      for (const k of Object.keys(days)) {
        const h = days[k].hours;
        for (let i = 0; i < 24; i++) buckets[i] += h[i] || 0;
      }
      let best = -1, bestN = 0;
      for (let i = 0; i < 24; i++) {
        if (buckets[i] > bestN) { bestN = buckets[i]; best = i; }
      }
      return bestN > 0 ? best : null;
    }

    function summary(dateKey: string): BeatStatsSummary {
      const copy: Record<string, BeatDayStat> = {};
      for (const k of Object.keys(days)) copy[k] = { ...days[k], hours: days[k].hours.slice() };   // 深拷贝：调用方改动不得泄漏进内部状态
      const src = copy[dateKey];
      const today: (BeatDayStat & { date: string; accuracy: number }) | null = src
        ? { ...src, date: dateKey, accuracy: accuracy(days[dateKey]) }
        : null;
      return { days: copy, today, bestHour: bestHour() };
    }

    function serialize(): string {
      return JSON.stringify({ v: 1, days });
    }

    // 击拍统计导出 CSV（v1.23.0）：按日期升序，含准确率列
    function serializeCsv(): string {
      const lines = ['date,count,max_combo,perfect,great,good,miss,accuracy_percent'];
      for (const k of Object.keys(days).sort()) {
        const d = days[k];
        lines.push([k, d.count, d.maxCombo, d.perfect, d.great, d.good, d.miss, accuracy(d)].join(','));
      }
      return lines.join('\r\n');
    }

    return { load, record, summary, serialize, serializeCsv, accuracy };
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
