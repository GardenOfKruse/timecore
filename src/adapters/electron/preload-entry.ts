interface PreloadElectronModule {
  contextBridge: {
    exposeInMainWorld(name: string, api: unknown): void;
  };
  ipcRenderer: TimeCoreDomain.ElectronIpcPort;
}

const preloadElectron = require('electron') as unknown as PreloadElectronModule;
const preloadBridge = TimeCoreDomain.createElectronBridge(preloadElectron.ipcRenderer);
preloadElectron.contextBridge.exposeInMainWorld('electronAPI', preloadBridge);
