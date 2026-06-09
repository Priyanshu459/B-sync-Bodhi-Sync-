const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onDownloadStarted: (callback) => ipcRenderer.on('download-started', (e, info) => callback(info)),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (e, info) => callback(info)),
  onDownloadDone: (callback) => ipcRenderer.on('download-done', (e, info) => callback(info))
});
