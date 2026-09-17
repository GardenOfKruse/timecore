const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  send: (cmd, arg) => ipcRenderer.send('win', cmd, arg),   // cmd: size/minimize/fullscreen/close/top/opacity/open/overlay
  get: () => ipcRenderer.invoke('win:get'),
  onState: cb => {   // 主进程状态推送（形态/全屏/置顶），渲染层即时同步类名
    const f = (_e, st) => cb(st);
    ipcRenderer.on('win:state', f);
    return () => ipcRenderer.removeListener('win:state', f);
  },
  adb: (cmd, payload) => {
    if (cmd !== 'detect' && cmd !== 'exec' && cmd !== 'download') return Promise.reject(new Error('bad adb cmd'));
    return ipcRenderer.invoke('adb:' + cmd, payload);
  }
});
