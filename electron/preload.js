"use strict";
var TimeCoreDomain;
(function (TimeCoreDomain) {
    const WINDOW_COMMANDS = new Set([
        'top', 'opacity', 'minimize', 'fullscreen', 'size',
        'move-begin', 'move-end', 'clock-button', 'clock-zoom', 'open', 'flash', 'set-login', 'close'
    ]);
    const ADB_COMMANDS = new Set(['detect', 'exec', 'download', 'shot-save', 'shot-load']);
    function sendWindow(ipc, command, arg) {
        // preload 是 renderer 的 capability 边界；未知窗口命令静默丢弃，保持主进程旧的 no-op 语义。
        if (typeof command !== 'string' || !WINDOW_COMMANDS.has(command))
            return;
        ipc.send('win', command, arg);
    }
    function onState(ipc, callback) {
        const listener = (_event, state) => callback(state);
        ipc.on('win:state', listener);
        return () => ipc.removeListener('win:state', listener);
    }
    function adb(ipc, command, payload) {
        if (typeof command !== 'string' || !ADB_COMMANDS.has(command)) {
            return Promise.reject(new Error('bad adb cmd'));
        }
        return ipc.invoke('adb:' + command, payload);
    }
    function createElectronBridge(ipc) {
        return {
            isElectron: true,
            send: (command, arg) => sendWindow(ipc, command, arg),
            get: () => ipc.invoke('win:get'),
            onState: callback => onState(ipc, callback),
            adb: (command, payload) => adb(ipc, command, payload)
        };
    }
    TimeCoreDomain.createElectronBridge = createElectronBridge;
})(TimeCoreDomain || (TimeCoreDomain = {}));
globalThis.TimeCoreDomain = TimeCoreDomain;
const preloadElectron = require('electron');
const preloadBridge = TimeCoreDomain.createElectronBridge(preloadElectron.ipcRenderer);
preloadElectron.contextBridge.exposeInMainWorld('electronAPI', preloadBridge);
