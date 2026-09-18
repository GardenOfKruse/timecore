"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    function numberOr(value, fallback) {
        const number = Number(value);
        return number || fallback;
    }
    function opacity(value) {
        return Math.min(1, Math.max(0.3, numberOr(value, 1)));
    }
    function zoomInput(value) {
        const isObject = value !== null && typeof value === 'object';
        return {
            delta: numberOr(isObject ? value.delta : value, 0),
            buttons: isObject ? numberOr(value.buttons, 0) : 0
        };
    }
    function sizePreset(value) {
        if (value === null || typeof value !== 'object')
            return null;
        const preset = value.preset;
        return typeof preset === 'string' ? preset : null;
    }
    function externalUrl(value) {
        const url = String(value || '');
        return /^https:\/\/github\.com\/GardenOfKruse\/timecore/.test(url) ? url : null;
    }
    function route(command, arg) {
        switch (command) {
            case 'top': return { type: 'toggle-top' };
            case 'opacity': return { type: 'set-opacity', value: opacity(arg) };
            case 'minimize': return { type: 'minimize' };
            case 'fullscreen': return { type: 'toggle-fullscreen' };
            case 'size': {
                const preset = sizePreset(arg);
                return preset === null ? null : { type: 'size', preset };
            }
            case 'move-begin': return { type: 'move-begin' };
            case 'move-end': return { type: 'move-end' };
            case 'clock-button': return { type: 'set-left-button', held: Boolean(arg) };
            case 'clock-zoom': {
                const input = zoomInput(arg);
                return { type: 'zoom-clock', delta: input.delta, buttons: input.buttons };
            }
            case 'open': {
                const url = externalUrl(arg);
                return url === null ? null : { type: 'open', url };
            }
            case 'close': return { type: 'close' };
            default: return null;
        }
    }
    function snapshot(state) {
        return { clock: Boolean(state.clock), top: Boolean(state.top), fs: Boolean(state.fs) };
    }
    function createWindowCommandModel() {
        return { route, snapshot };
    }
    TimeCoreDomain.createWindowCommandModel = createWindowCommandModel;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
