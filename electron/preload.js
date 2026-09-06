const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  send: (cmd, arg) => ipcRenderer.send('win', cmd, arg),
  get: () => ipcRenderer.invoke('win:get'),
  adb: (cmd, payload) => {
    if (cmd !== 'detect' && cmd !== 'exec' && cmd !== 'download') return Promise.reject(new Error('bad adb cmd'));
    return ipcRenderer.invoke('adb:' + cmd, payload);
  }
});
