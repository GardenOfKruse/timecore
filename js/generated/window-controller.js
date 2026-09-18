"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    const INITIAL_STATE = { clock: false, fs: false, top: false, ver: null };
    function copyState(state) {
        return { clock: state.clock, fs: state.fs, top: state.top, ver: state.ver };
    }
    function normalize(raw, previous) {
        const source = raw !== null && typeof raw === 'object' ? raw : {};
        return {
            clock: Boolean(source.clock),
            fs: Boolean(source.fs),
            top: Boolean(source.top),
            ver: typeof source.ver === 'string' ? source.ver : previous.ver
        };
    }
    function sameState(a, b) {
        return a.clock === b.clock && a.fs === b.fs && a.top === b.top && a.ver === b.ver;
    }
    function createWindowController(transport) {
        let current = copyState(INITIAL_STATE);
        const listeners = new Set();
        let detachPush = null;
        let poll = null;
        function apply(raw) {
            const next = normalize(raw, current);
            if (sameState(next, current))
                return copyState(current);
            current = next;
            const nextCopy = copyState(current);
            for (const listener of listeners)
                listener(nextCopy);
            return nextCopy;
        }
        function refresh() {
            return transport.get().then(apply);
        }
        function stopConnection() {
            if (detachPush) {
                detachPush();
                detachPush = null;
            }
            if (poll) {
                clearInterval(poll);
                poll = null;
            }
        }
        function connect(pollMs = 800) {
            stopConnection();
            if (transport.onState)
                detachPush = transport.onState(apply);
            if (Number.isFinite(pollMs) && pollMs > 0) {
                poll = setInterval(() => { void refresh().catch(() => { }); }, pollMs);
            }
            void refresh().catch(() => { });
            return stopConnection;
        }
        function send(command, arg) {
            transport.send(command, arg);
        }
        return {
            state: () => copyState(current),
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            refresh,
            connect,
            toggleTop: () => send('top'),
            setOpacity: value => send('opacity', value),
            minimize: () => send('minimize'),
            toggleFullscreen: () => send('fullscreen'),
            setSize: preset => send('size', { preset }),
            beginMove: () => send('move-begin'),
            endMove: () => send('move-end'),
            setLeftButton: held => send('clock-button', held),
            zoom: (delta, buttons) => send('clock-zoom', { delta, buttons }),
            open: url => send('open', url),
            close: () => send('close')
        };
    }
    TimeCoreDomain.createWindowController = createWindowController;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
