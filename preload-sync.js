const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  authRegister: (username, password) => ipcRenderer.invoke('auth-register', { username, password }),
  authLogin: (username, password) => ipcRenderer.invoke('auth-login', { username, password }),
  syncPush: (token) => ipcRenderer.invoke('sync-push', token),
  syncPull: (token) => ipcRenderer.invoke('sync-pull', token),
  close: () => ipcRenderer.send('close-sync')
});
