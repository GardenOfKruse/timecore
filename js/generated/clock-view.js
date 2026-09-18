"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function runtimeDocument() {
        const scope = globalThis;
        if (!scope.document)
            throw new Error('ClockView requires a document');
        return scope.document;
    }
    function runtimeMotion() {
        const scope = globalThis;
        return scope.TimeCoreDomain.createClockMotionModel();
    }
    function createClockView(options = {}) {
        const doc = options.document || runtimeDocument();
        const motionModel = options.motion || runtimeMotion();
        const pairs = {};
        let hms = null;
        let ms = null;
        let date = null;
        let ring = null;
        let breath = null;
        let panel = null;
        let media = null;
        let mounted = false;
        let clockMode = false;
        let phase = 'IDLE';
        let reduced = false;
        let supported = false;
        let animations = [];
        let last = { h: '', m: '', s: '', day: '' };
        function cancelMotion() {
            for (const animation of animations) {
                try {
                    animation.cancel();
                }
                catch (_) { /* 动效已被浏览器回收 */ }
            }
            animations = [];
            if (breath)
                breath.style.opacity = '0';
            if (hms) {
                hms.style.transform = '';
                hms.style.opacity = '';
            }
        }
        function applyMotionPhase(value) {
            phase = motionModel.normalizePhase(value);
            reduced = !!(media && media.matches);
            cancelMotion();
            // 动效严格限定在小时间窗口；正常窗口只保留阶段类供其他 UI 使用。
            const visualActive = clockMode && !!breath && !!hms;
            if (!visualActive || !breath || !hms)
                return;
            const breathElement = breath;
            const hmsElement = hms;
            const canAnimate = typeof breathElement.animate === 'function' && typeof hmsElement.animate === 'function';
            supported = canAnimate;
            const plan = motionModel.plan(phase, { clockMode: visualActive, reduced, supported: canAnimate });
            if (plan.mode === 'static') {
                breathElement.style.opacity = String(plan.staticOpacity);
                return;
            }
            hmsElement.style.transformOrigin = '50% 50%';
            if (plan.mode === 'release') {
                const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
                animations = [
                    breathElement.animate([
                        { opacity: 0.08 }, { opacity: 0.88, offset: 0.28 }, { opacity: 0.24 }
                    ], { duration: 560, easing, fill: 'both' }),
                    hmsElement.animate([
                        { transform: 'scale(1)', opacity: 1 },
                        { transform: 'scale(1.012)', opacity: 1, offset: 0.34 },
                        { transform: 'scale(1)', opacity: 1 }
                    ], { duration: 560, easing, fill: 'both' })
                ];
                return;
            }
            const profile = plan.profile;
            if (plan.mode !== 'heartbeat' || !profile)
                return;
            const linear = 'linear';
            animations = [
                breathElement.animate([
                    { opacity: 0.10, offset: 0 },
                    { opacity: profile.peak, offset: 0.18 },
                    { opacity: 0.16, offset: 0.25 },
                    { opacity: profile.second, offset: 0.34 },
                    { opacity: 0.10, offset: 0.46 },
                    { opacity: 0.10, offset: 1 }
                ], { duration: profile.duration, iterations: Infinity, easing: linear }),
                hmsElement.animate([
                    { transform: 'scale(1)', opacity: 1, offset: 0 },
                    { transform: 'scale(' + profile.scale + ')', opacity: 1, offset: 0.18 },
                    { transform: 'scale(1)', opacity: profile.dip, offset: 0.25 },
                    { transform: 'scale(' + (1 + (profile.scale - 1) * 0.45) + ')', opacity: 1, offset: 0.34 },
                    { transform: 'scale(1)', opacity: 1, offset: 0.46 },
                    { transform: 'scale(1)', opacity: 1, offset: 1 }
                ], { duration: profile.duration, iterations: Infinity, easing: linear })
            ];
        }
        function setPhase(value) {
            const normalized = motionModel.normalizePhase(value);
            if (panel) {
                panel.classList.remove('clock-armed', 'clock-phase-normal', 'clock-phase-warmup', 'clock-phase-surge', 'clock-phase-pulse', 'clock-phase-zero');
                if (normalized !== 'IDLE')
                    panel.classList.add('clock-armed', 'clock-phase-' + normalized.toLowerCase());
            }
            applyMotionPhase(normalized);
        }
        function mount() {
            if (mounted)
                return;
            mounted = true;
            hms = doc.getElementById('clock-hms');
            if (hms) {
                hms.textContent = '';
                for (const key of ['h', 'm', 's']) {
                    if (key !== 'h') {
                        const colon = doc.createElement('span');
                        colon.className = 'd-colon';
                        colon.textContent = ':';
                        hms.appendChild(colon);
                    }
                    const pair = doc.createElement('span');
                    pair.className = 'd-pair';
                    pair.textContent = '--';
                    hms.appendChild(pair);
                    pairs[key] = pair;
                }
            }
            ms = doc.getElementById('clock-ms');
            date = doc.getElementById('clock-date');
            panel = doc.querySelector('.clock-panel');
            ring = doc.querySelector('.sec-ring rect');
            breath = doc.querySelector('.clock-breath');
            const view = doc.defaultView;
            media = view && view.matchMedia ? view.matchMedia('(prefers-reduced-motion: reduce)') : null;
            reduced = !!(media && media.matches);
            supported = !!(breath && hms && typeof breath.animate === 'function' && typeof hms.animate === 'function');
            if (media) {
                const onMotionPreference = () => applyMotionPhase(phase);
                if (media.addEventListener)
                    media.addEventListener('change', onMotionPreference);
                else if (media.addListener)
                    media.addListener(onMotionPreference);
            }
        }
        function render(frame) {
            const current = { h: frame.hour, m: frame.minute, s: frame.second };
            for (const key of ['h', 'm', 's']) {
                if (current[key] === last[key])
                    continue;
                last[key] = current[key];
                const pair = pairs[key];
                if (!pair)
                    continue;
                pair.textContent = current[key];
                pair.classList.remove('tick');
                void pair.offsetWidth;
                pair.classList.add('tick');
            }
            if (ms) {
                const value = ((frame.millisecond % 1000) + 1000) % 1000;
                ms.textContent = '.' + String(Math.floor(value)).padStart(3, '0');
            }
            if (ring) {
                const value = ((frame.millisecond % 1000) + 1000) % 1000;
                ring.style.strokeDashoffset = String(1000 - value);
            }
            if (frame.dateKey !== last.day) {
                last.day = frame.dateKey;
                if (date)
                    date.textContent = frame.dateText;
            }
        }
        function resetTime() {
            last = { h: '', m: '', s: '', day: '' };
        }
        function setClockMode(active) {
            clockMode = !!active;
            applyMotionPhase(phase);
        }
        function zeroPulse() {
            if (!clockMode || !panel)
                return;
            panel.classList.remove('zero-pulse');
            void panel.offsetWidth;
            panel.classList.add('zero-pulse');
        }
        function computed(element) {
            const getComputedStyle = doc.defaultView && doc.defaultView.getComputedStyle;
            if (getComputedStyle)
                return getComputedStyle(element);
            return element.style;
        }
        function debugMotion() {
            const active = animations.filter(animation => {
                try {
                    return !!animation && animation.playState !== 'idle';
                }
                catch (_) {
                    return !!animation;
                }
            }).length;
            const breathStyle = breath ? computed(breath) : null;
            const hmsStyle = hms ? computed(hms) : null;
            return {
                phase,
                reduced,
                supported,
                animations: active,
                breathOpacity: breathStyle && breathStyle.opacity !== undefined ? breathStyle.opacity : null,
                hmsTransform: hmsStyle && hmsStyle.transform !== undefined ? hmsStyle.transform : null
            };
        }
        return { mount, render, resetTime, setPhase, setClockMode, zeroPulse, debugMotion };
    }
    TimeCoreDomain.createClockView = createClockView;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
