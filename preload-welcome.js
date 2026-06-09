const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  closeWelcome: () => ipcRenderer.send('close-welcome')
});
