const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  logError: (msg) => ipcRenderer.send('log-error', msg),
  
  navigate: (url) => ipcRenderer.send('navigate', url),
  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  reload: () => ipcRenderer.send('reload'),
  onUrlUpdated: (callback) => ipcRenderer.on('url-updated', (_event, url) => callback(url)),
  modalOpened: () => ipcRenderer.send('modal-opened'),
  modalClosed: () => ipcRenderer.send('modal-closed'),
  sidebarHover: (hovered) => ipcRenderer.send('sidebar-hover', hovered),

  // Tab Management
  newTab: () => ipcRenderer.send('new-tab'),
  switchTab: (id) => ipcRenderer.send('switch-tab', id),
  closeTab: (id) => ipcRenderer.send('close-tab', id),
  toggleSplit: () => ipcRenderer.send('toggle-split'),
  onTabCreated: (callback) => ipcRenderer.on('tab-created', (_event, tab) => callback(tab)),
  onTabSwitched: (callback) => ipcRenderer.on('tab-switched', (_event, id) => callback(id)),
  onTabUpdated: (callback) => ipcRenderer.on('tab-updated', (_event, tab) => callback(tab)),
  onTabClosed: (callback) => ipcRenderer.on('tab-closed', (_event, id) => callback(id)),

  openPalette: () => ipcRenderer.send('open-palette'),
  openSync: () => ipcRenderer.send('open-sync'),
  openIncognito: () => ipcRenderer.send('open-incognito'),

  // Library
  getData: () => ipcRenderer.invoke('get-data'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', { key, value }),
  toggleBookmark: (url, title) => ipcRenderer.invoke('toggle-bookmark', { url, title }),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (index) => ipcRenderer.invoke('delete-history-item', index),
  deleteBookmark: (index) => ipcRenderer.invoke('delete-bookmark', index),

  // Sync
  authRegister: (username, password) => ipcRenderer.invoke('auth-register', { username, password }),
  authLogin: (username, password) => ipcRenderer.invoke('auth-login', { username, password }),
  syncPush: (token) => ipcRenderer.invoke('sync-push', token),
  syncPull: (token) => ipcRenderer.invoke('sync-pull', token),
  onSyncPulled: (callback) => ipcRenderer.on('sync-pulled', (_event, data) => callback(data)),

  // Vault
  vaultUnlock: (masterPassword) => ipcRenderer.invoke('vault-unlock', masterPassword),
  vaultSave: (dataArray, masterPassword) => ipcRenderer.invoke('vault-save', { dataArray, masterPassword }),
  onOpenVault: (callback) => ipcRenderer.on('open-vault', () => callback()),

  // Downloads
  openDownloads: () => ipcRenderer.send('open-downloads'),

  // Recording
  getWindowSourceId: () => ipcRenderer.invoke('get-window-source-id'),
  saveRecording: (buffer) => ipcRenderer.invoke('save-recording', buffer),

  // Auto Update
  onUpdateReady: (callback) => ipcRenderer.on('update-ready', callback),
  installUpdate: () => ipcRenderer.send('install-update')
});
