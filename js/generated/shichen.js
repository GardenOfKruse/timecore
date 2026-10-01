"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    TimeCoreDomain.SHICHEN_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
    TimeCoreDomain.SHICHEN_ALIASES = ['夜半', '鸡鸣', '平旦', '日出', '食时', '隅中', '日中', '日昳', '晡时', '日入', '黄昏', '人定'];
    // 五更：三更=23-1 时、四更=1-3、五更=3-5、一更=19-21、二更=21-23；5-19 点无更
    const GENG_BY_HOUR = ['三更', '四更', '四更', '五更', '五更', null, null, null, null, null, null, null, null, null, null, null, null, null, null, '一更', '一更', '二更', '二更', '三更'];
    const DAY_MS = 86400000;
    /** 24 小时制 → 时辰序号：子时 23:00 起，(h+1)/2 取商。23 点与 0 点同属子。 */
    function shichenOfHour(hour24) {
        if (!Number.isFinite(hour24))
            return 0;
        const h = ((Math.floor(hour24) % 24) + 24) % 24;
        return ((h + 1) % 24) >> 1;
    }
    TimeCoreDomain.shichenOfHour = shichenOfHour;
    function shichenStartEpoch(now, index) {
        const d = new Date(now);
        d.setMinutes(0, 0, 0);
        const startHour = (23 + 2 * index) % 24;
        d.setHours(startHour);
        while (d.getTime() > now)
            d.setTime(d.getTime() - 2 * 3600000); // 子时凌晨场景最多回退 12 步到前一日 23:00
        return d.getTime();
    }
    /** 当前时辰、雅称、五更与距下一时辰的分钟数（向上取整）。 */
    function shichenInfo(now) {
        if (!Number.isFinite(now))
            now = Date.now();
        const d = new Date(now);
        const index = shichenOfHour(d.getHours());
        const nextIndex = (index + 1) % 12;
        const startEpoch = shichenStartEpoch(now, index);
        const nextEpoch = startEpoch + 2 * 3600000;
        return {
            index,
            branch: TimeCoreDomain.SHICHEN_BRANCHES[index],
            alias: TimeCoreDomain.SHICHEN_ALIASES[index],
            startEpoch,
            nextIndex,
            nextBranch: TimeCoreDomain.SHICHEN_BRANCHES[nextIndex],
            nextEpoch,
            minutesToNext: Math.max(0, Math.ceil((nextEpoch - now) / 60000)),
            geng: GENG_BY_HOUR[d.getHours()] || null
        };
    }
    TimeCoreDomain.shichenInfo = shichenInfo;
    /** 五更文案（供 UI 直接显示；null = 白天无更）。 */
    function gengOfHour(hour24) {
        if (!Number.isFinite(hour24))
            return null;
        return GENG_BY_HOUR[((Math.floor(hour24) % 24) + 24) % 24] || null;
    }
    TimeCoreDomain.gengOfHour = gengOfHour;
    // 时辰起点毫秒常量（对外换算用）
    TimeCoreDomain.SHICHEN_SPAN_MS = 2 * 3600000;
    TimeCoreDomain.SHICHEN_DAY_MS = DAY_MS;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
