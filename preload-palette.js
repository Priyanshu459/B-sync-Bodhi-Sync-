const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onPaletteData: (callback) => ipcRenderer.on('palette-data', (_event, data) => callback(data)),
  sendAction: (action) => ipcRenderer.send('palette-action', action),
  close: () => ipcRenderer.send('close-palette')
});
