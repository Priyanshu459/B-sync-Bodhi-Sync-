const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  
  navigate: (url) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),
  onUrlUpdated: (callback) => ipcRenderer.on('url-updated', (_event, url) => callback(url)),

  // Tab Management
  newTab: () => ipcRenderer.send('new-tab'),
  switchTab: (id) => ipcRenderer.send('switch-tab', id),
  closeTab: (id) => ipcRenderer.send('close-tab', id),
  toggleSplit: () => ipcRenderer.send('toggle-split'),
  onTabCreated: (callback) => ipcRenderer.on('tab-created', (_event, tab) => callback(tab)),
  onTabSwitched: (callback) => ipcRenderer.on('tab-switched', (_event, id) => callback(id)),
  onTabUpdated: (callback) => ipcRenderer.on('tab-updated', (_event, tab) => callback(tab)),
  onTabClosed: (callback) => ipcRenderer.on('tab-closed', (_event, id) => callback(id)),

  // Library
  getData: () => ipcRenderer.invoke('get-data'),
  toggleBookmark: (url, title) => ipcRenderer.invoke('toggle-bookmark', { url, title }),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (index) => ipcRenderer.invoke('delete-history-item', index),
  deleteBookmark: (index) => ipcRenderer.invoke('delete-bookmark', index)
});
