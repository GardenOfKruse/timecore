"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    // 每日到点统计：纯状态机，持久化由 Adapter 承担。当日明细保留最近 30 天，total 跨日累计。
    function createFiredStats() {
        let days = {};
        let total = 0;
        function prune() {
            const keys = Object.keys(days).sort().slice(-30);
            const next = {};
            for (const k of keys)
                next[k] = days[k];
            days = next;
        }
        function load(raw) {
            days = {};
            total = 0;
            if (!raw || typeof raw !== 'object')
                return;
            const o = raw;
            if (o.days && typeof o.days === 'object') {
                const src = o.days;
                for (const k of Object.keys(src)) {
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(k))
                        continue;
                    const v = src[k].count;
                    if (Number.isFinite(v) && v >= 0)
                        days[k] = { count: Math.floor(v) };
                }
                prune();
            }
            if (Number.isFinite(o.total) && o.total >= 0)
                total = Math.floor(o.total);
        }
        function record(dateKey) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
                return { today: { count: 0 }, total, milestone: false };
            const d = days[dateKey] || { count: 0 };
            d.count += 1;
            days[dateKey] = d;
            total += 1;
            prune();
            const before = total - 1;
            const milestone = Math.floor(before / 100) < Math.floor(total / 100);
            return { today: { ...d }, total, milestone };
        }
        function summary(dateKey) {
            const copy = {};
            for (const k of Object.keys(days))
                copy[k] = { ...days[k] };
            return { days: copy, today: copy[dateKey] ? { ...copy[dateKey] } : null, total };
        }
        function serialize() {
            return JSON.stringify({ v: 1, days, total });
        }
        // 到点统计导出 CSV（v1.23.0）：按日期升序
        function serializeCsv() {
            const lines = ['date,count'];
            for (const k of Object.keys(days).sort()) {
                lines.push(k + ',' + days[k].count);
            }
            return lines.join('\r\n');
        }
        return { load, record, summary, serialize, serializeCsv };
    }
    TimeCoreDomain.createFiredStats = createFiredStats;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
