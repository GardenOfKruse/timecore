"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function timbre(wave, bright, decay, peak) {
        return { wave, bright, decay, peak };
    }
    TimeCoreDomain.SOUND_PACKS = [
        {
            key: 'classic', label: '硅晶',
            tick: timbre('square', 1, 1, 1),
            beep: timbre('triangle', 1, 1, 1),
            hit: timbre('sine', 1, 1, 1),
            miss: timbre('sawtooth', 1, 1, 1),
            fire: timbre('triangle', 1, 1, 1)
        },
        {
            key: 'bell', label: '钟琴',
            tick: timbre('sine', 1.2, 1.6, 0.9),
            beep: timbre('sine', 1, 1.5, 0.9),
            hit: timbre('sine', 1.1, 1.5, 0.9),
            miss: timbre('triangle', 0.8, 1.2, 0.9),
            fire: timbre('sine', 1, 1.4, 0.95)
        },
        {
            key: 'wood', label: '木质',
            tick: timbre('triangle', 0.5, 0.45, 1.1),
            beep: timbre('triangle', 0.6, 0.5, 1.1),
            hit: timbre('triangle', 0.7, 0.5, 1.1),
            miss: timbre('triangle', 0.5, 0.5, 1.1),
            fire: timbre('triangle', 1, 0.7, 1.1)
        },
        {
            key: 'pixel', label: '芯片',
            tick: timbre('square', 1, 0.6, 0.8),
            beep: timbre('square', 1, 0.6, 0.8),
            hit: timbre('square', 1, 0.6, 0.8),
            miss: timbre('sawtooth', 1, 0.6, 0.8),
            fire: timbre('square', 1, 0.6, 0.8)
        }
    ];
    const FALLBACK = TimeCoreDomain.SOUND_PACKS[0];
    // 按 key 取音效包；未知 key（损坏的 localStorage 等）回退默认包
    function soundPack(key) {
        const k = typeof key === 'string' ? key : '';
        return TimeCoreDomain.SOUND_PACKS.find(p => p.key === k) || FALLBACK;
    }
    TimeCoreDomain.soundPack = soundPack;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
