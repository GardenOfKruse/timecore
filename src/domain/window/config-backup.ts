namespace TimeCoreDomain {
  export interface ConfigBackupParsed {
    ok: boolean;
    entries: Record<string, string>;
  }

  // 配置备份（v1.28.0）：localStorage 偏好的导出/导入纯计算。
  // 白名单由调用方持有（构造参数）；键不在白名单、值非字符串、结构/版本非法一律拒收——导入坏数据不可能污染配置。
  export function createConfigBackup(whitelist: readonly string[]) {
    const allowed = new Set(whitelist);

    function collect(get: (key: string) => string | null): Record<string, string> {
      const entries: Record<string, string> = {};
      for (const k of allowed) {
        const v = get(k);
        if (typeof v === 'string') entries[k] = v;
      }
      return entries;
    }

    function serialize(entries: Record<string, string>): string {
      return JSON.stringify({ v: 1, ts: new Date().toISOString(), entries });
    }

    function parse(raw: unknown): ConfigBackupParsed {
      let o: unknown;
      try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (_) { return { ok: false, entries: {} }; }
      if (!o || typeof o !== 'object') return { ok: false, entries: {} };
      const obj = o as { v?: unknown; entries?: unknown };
      if (obj.v !== 1 || !obj.entries || typeof obj.entries !== 'object' || Array.isArray(obj.entries)) return { ok: false, entries: {} };
      const entries: Record<string, string> = {};
      for (const k of Object.keys(obj.entries as Record<string, unknown>)) {
        if (!allowed.has(k)) continue;   // 白名单外静默丢弃
        const v = (obj.entries as Record<string, unknown>)[k];
        if (typeof v === 'string') entries[k] = v;
      }
      return { ok: true, entries };
    }

    return { collect, serialize, parse };
  }
}
(globalThis as typeof globalThis & { TimeCoreDomain: typeof TimeCoreDomain }).TimeCoreDomain = TimeCoreDomain;
