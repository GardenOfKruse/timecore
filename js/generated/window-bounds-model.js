"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    const CLOCK_WIDTH = 280;
    const CLOCK_HEIGHT = 96;
    const CLOCK_RATIO = CLOCK_WIDTH / CLOCK_HEIGHT;
    const CLOCK_MIN_WIDTH = 160;
    const CLOCK_MAX_WIDTH = 1180;
    const EDGE_PADDING = 10;
    const PRESETS = {
        standard: { width: 1180, height: 760 },
        small: { width: 480, height: 320 },
        clock: { width: CLOCK_WIDTH, height: CLOCK_HEIGHT },
        compact: { width: 660, height: 460 },
        mini: { width: 380, height: 300 }
    };
    function finite(value, name) {
        if (!Number.isFinite(value))
            throw new RangeError(name + ' must be finite');
    }
    function copyPreset(preset) {
        return { width: preset.width, height: preset.height };
    }
    function getPreset(name) {
        const preset = name ? PRESETS[name] : undefined;
        return preset ? copyPreset(preset) : null;
    }
    function clockSize(savedWidth) {
        const width = Math.min(CLOCK_MAX_WIDTH, Math.max(CLOCK_MIN_WIDTH, savedWidth || CLOCK_WIDTH));
        return { width, height: Math.round(width / CLOCK_RATIO) };
    }
    function clampToWork(bounds, workArea) {
        const width = Math.min(bounds.width, workArea.width - EDGE_PADDING);
        const height = Math.min(bounds.height, workArea.height - EDGE_PADDING);
        return {
            x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width)),
            y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height)),
            width,
            height
        };
    }
    function centerPreset(current, workArea, preset) {
        const width = Math.min(preset.width, workArea.width - EDGE_PADDING);
        const height = Math.min(preset.height, workArea.height - EDGE_PADDING);
        return {
            x: Math.max(workArea.x, Math.min(Math.round(current.x + current.width / 2 - width / 2), workArea.x + workArea.width - width)),
            y: Math.max(workArea.y, Math.min(Math.round(current.y + current.height / 2 - height / 2), workArea.y + workArea.height - height)),
            width,
            height
        };
    }
    function zoomClock(base, workArea, delta) {
        finite(delta, 'delta');
        const nextWidth = delta < 0 ? base.width * 1.1 : base.width / 1.1;
        const width = Math.round(Math.max(CLOCK_MIN_WIDTH, Math.min(CLOCK_MAX_WIDTH, nextWidth)));
        if (width === base.width)
            return null;
        const height = Math.round(width / CLOCK_RATIO);
        const centerX = base.x + base.width / 2;
        const centerY = base.y + base.height / 2;
        const x = Math.round(centerX - width / 2);
        const y = Math.round(centerY - height / 2);
        return {
            x: Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width)),
            y: Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height)),
            width,
            height
        };
    }
    function createWindowBoundsModel() {
        return { presets: PRESETS, getPreset, clockSize, clampToWork, centerPreset, zoomClock };
    }
    TimeCoreDomain.createWindowBoundsModel = createWindowBoundsModel;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
