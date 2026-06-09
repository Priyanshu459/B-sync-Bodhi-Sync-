const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { autoUpdater } = require('electron-updater');
const fetch = require('cross-fetch');
const path = require('path');
const fs = require('fs');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

process.on('uncaughtException', (error) => {
  fs.writeFileSync(path.join(app.getPath('userData'), 'b-sync-crash.log'), error.stack || error.toString());
});
process.on('unhandledRejection', (reason) => {
  fs.writeFileSync(path.join(app.getPath('userData'), 'b-sync-rejection.log'), reason && reason.stack ? reason.stack : String(reason));
});

let bookmarks = [];
let history = [];
let bookmarksPath = '';
let historyPath = '';

function loadData() {
  try { if (fs.existsSync(bookmarksPath)) bookmarks = JSON.parse(fs.readFileSync(bookmarksPath, 'utf8')); } catch(e){}
  try { if (fs.existsSync(historyPath)) history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch(e){}
}
function saveData() {
  fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks));
  fs.writeFileSync(historyPath, JSON.stringify(history));
}

function recordHistory(url, title) {
  if (!url || url.startsWith('chrome://') || url.startsWith('file://')) return;
  if (history.length > 0 && history[0].url === url) return;
  history.unshift({ url, title, timestamp: Date.now() });
  if (history.length > 500) history.pop();
  saveData();
}

let mainWindow;
let tabs = new Map();
let activeTabId = null;
let tabIdCounter = 0;

const TITLEBAR_HEIGHT = 60;
const SIDEBAR_WIDTH = 240;

function createWindow() {
  bookmarksPath = path.join(app.getPath('userData'), 'bookmarks.json');
  historyPath = path.join(app.getPath('userData'), 'history.json');
  loadData();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    backgroundColor: '#1E1E1E',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  let paletteWindow = new BrowserWindow({
    width: 600,
    height: 450,
    parent: mainWindow,
    frame: false,
    backgroundColor: '#1E1E1E',
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-palette.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  paletteWindow.loadFile(path.join(__dirname, 'palette.html'));
  paletteWindow.on('blur', () => paletteWindow.hide());

  function showPalette() {
    const tabData = Array.from(tabs.values()).map(t => ({ id: t.id, title: t.title }));
    paletteWindow.webContents.send('palette-data', {
      tabs: tabData,
      bookmarks,
      history
    });
    const bounds = mainWindow.getBounds();
    paletteWindow.setBounds({
      x: bounds.x + Math.floor((bounds.width - 600) / 2),
      y: bounds.y + Math.floor(bounds.height * 0.15),
      width: 600,
      height: 450
    });
    paletteWindow.show();
    paletteWindow.focus();
  }

  let syncWindow = new BrowserWindow({
    width: 350,
    height: 380,
    parent: mainWindow,
    frame: false,
    backgroundColor: '#1E1E1E',
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-sync.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  syncWindow.loadFile(path.join(__dirname, 'sync.html'));
  syncWindow.on('blur', () => syncWindow.hide());

  function showSync() {
    const bounds = mainWindow.getBounds();
    syncWindow.setBounds({
      x: bounds.x + 250, // Sidebar width
      y: bounds.y + 100,
      width: 350,
      height: 380
    });
    syncWindow.show();
    syncWindow.focus();
  }

  ipcMain.on('open-sync', () => showSync());
  ipcMain.on('close-sync', () => syncWindow.hide());

  ipcMain.on('open-palette', () => showPalette());
  ipcMain.on('close-palette', () => paletteWindow.hide());
  ipcMain.on('palette-action', (event, action) => {
    paletteWindow.hide();
    if (action.type === 'switch-tab') {
      switchTab(action.id);
    } else if (action.type === 'navigate') {
      let finalUrl = action.url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
          finalUrl = `https://${finalUrl}`;
        } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
        }
      }
      const wc = getActiveWebContents();
      if (wc) wc.loadURL(finalUrl);
    }
  });

  function setupGlobalShortcuts(wc) {
    wc.on('before-input-event', (event, input) => {
      if ((input.control || input.meta) && input.key.toLowerCase() === 'k' && input.type === 'keyDown') {
        event.preventDefault();
        showPalette();
      }
    });
  }
  
  setupGlobalShortcuts(mainWindow.webContents);

  const updateViewBounds = () => {
    if (!activeTabId || !tabs.has(activeTabId)) return;
    const bounds = mainWindow.getContentBounds();
    const tab = tabs.get(activeTabId);
    
    if (!tab.splitView) {
      tab.view.setBounds({ 
        x: SIDEBAR_WIDTH, 
        y: TITLEBAR_HEIGHT, 
        width: bounds.width - SIDEBAR_WIDTH, 
        height: bounds.height - TITLEBAR_HEIGHT 
      });
    } else {
      const halfWidth = Math.floor((bounds.width - SIDEBAR_WIDTH) / 2);
      tab.view.setBounds({ 
        x: SIDEBAR_WIDTH, 
        y: TITLEBAR_HEIGHT, 
        width: halfWidth, 
        height: bounds.height - TITLEBAR_HEIGHT 
      });
      tab.splitView.setBounds({
        x: SIDEBAR_WIDTH + halfWidth,
        y: TITLEBAR_HEIGHT,
        width: bounds.width - SIDEBAR_WIDTH - halfWidth,
        height: bounds.height - TITLEBAR_HEIGHT
      });
    }
  };
  
  mainWindow.on('resize', updateViewBounds);
  mainWindow.on('maximize', updateViewBounds);
  mainWindow.on('unmaximize', updateViewBounds);
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    createTab('https://www.google.com');
  });

  function setupViewListeners(view, tabId, pane) {
    view.webContents.on('did-navigate', (event, newUrl) => {
      const tab = tabs.get(tabId);
      if (tab) {
        if (pane === 'main') tab.url = newUrl;
        else tab.splitUrl = newUrl;
        
        if (pane === 'main') mainWindow.webContents.send('tab-updated', { id: tabId, url: newUrl, title: tab.title });
        if (tabId === activeTabId && tab.activePane === pane) {
          mainWindow.webContents.send('url-updated', newUrl);
        }
      }
    });
    
    view.webContents.on('did-navigate-in-page', (event, newUrl) => {
      const tab = tabs.get(tabId);
      if (tab) {
        if (pane === 'main') tab.url = newUrl;
        else tab.splitUrl = newUrl;
        
        if (pane === 'main') mainWindow.webContents.send('tab-updated', { id: tabId, url: newUrl, title: tab.title });
        if (tabId === activeTabId && tab.activePane === pane) {
          mainWindow.webContents.send('url-updated', newUrl);
        }
      }
    });
    
    if (pane === 'main') {
      view.webContents.on('page-title-updated', (event, title) => {
        const tab = tabs.get(tabId);
        if (tab) {
          tab.title = title;
          mainWindow.webContents.send('tab-updated', { id: tabId, url: tab.url, title });
          recordHistory(tab.url, title);
        }
      });
    } else {
      view.webContents.on('page-title-updated', (event, title) => {
        const tab = tabs.get(tabId);
        if (tab) {
          recordHistory(tab.splitUrl, title);
        }
      });
    }
    
    // Listen for focus to know which pane is active
    view.webContents.on('focus', () => {
      const tab = tabs.get(tabId);
      if (tab) {
        tab.activePane = pane;
        if (tabId === activeTabId) {
          mainWindow.webContents.send('url-updated', pane === 'main' ? tab.url : tab.splitUrl);
        }
      }
    });

    // Prevent popups and enforce them to open as new tabs
    view.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        createTab(url);
      }
      return { action: 'deny' };
    });
  }

  // Tab Management Functions
  function createTab(url = 'https://www.google.com') {
    const id = `tab-${tabIdCounter++}`;
    const view = new WebContentsView();
    setupGlobalShortcuts(view.webContents);
    
    tabs.set(id, { id, view, splitView: null, activePane: 'main', url, splitUrl: '', title: 'New Tab' });
    setupViewListeners(view, id, 'main');
    view.webContents.loadURL(url);
    
    mainWindow.webContents.send('tab-created', { id, url, title: 'Loading...' });
    switchTab(id);
  }

  function switchTab(id) {
    if (!tabs.has(id)) return;
    
    if (activeTabId && tabs.has(activeTabId)) {
      const oldTab = tabs.get(activeTabId);
      mainWindow.contentView.removeChildView(oldTab.view);
      if (oldTab.splitView) mainWindow.contentView.removeChildView(oldTab.splitView);
    }
    
    activeTabId = id;
    const newTab = tabs.get(id);
    mainWindow.contentView.addChildView(newTab.view);
    if (newTab.splitView) mainWindow.contentView.addChildView(newTab.splitView);
    
    updateViewBounds();
    
    mainWindow.webContents.send('tab-switched', id);
    mainWindow.webContents.send('url-updated', newTab.activePane === 'main' ? newTab.url : newTab.splitUrl);
  }

  function closeTab(id) {
    if (!tabs.has(id)) return;
    const tabToClose = tabs.get(id);
    
    if (activeTabId === id) {
      mainWindow.contentView.removeChildView(tabToClose.view);
      if (tabToClose.splitView) mainWindow.contentView.removeChildView(tabToClose.splitView);
      activeTabId = null;
    }
    
    tabs.delete(id);
    mainWindow.webContents.send('tab-closed', id);
    
    if (tabs.size > 0 && activeTabId === null) {
      switchTab(Array.from(tabs.keys())[tabs.size - 1]);
    } else if (tabs.size === 0) {
      mainWindow.close();
    }
  }

  function toggleSplitView(id) {
    const tab = tabs.get(id);
    if (!tab) return;
    
    if (tab.splitView) {
      // Remove split view
      if (activeTabId === id) {
        mainWindow.contentView.removeChildView(tab.splitView);
      }
      tab.splitView = null;
      tab.activePane = 'main';
      updateViewBounds();
      mainWindow.webContents.send('url-updated', tab.url);
    } else {
      // Add split view
      tab.splitView = new WebContentsView();
      setupGlobalShortcuts(tab.splitView.webContents);
      tab.splitUrl = 'https://www.google.com';
      setupViewListeners(tab.splitView, id, 'split');
      tab.splitView.webContents.loadURL(tab.splitUrl);
      
      if (activeTabId === id) {
        mainWindow.contentView.addChildView(tab.splitView);
      }
      tab.activePane = 'split'; // Focus it automatically
      updateViewBounds();
      mainWindow.webContents.send('url-updated', tab.splitUrl);
    }
  }

  // Handle IPC from the renderer process
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window-close', () => mainWindow.close());
  
  const getActiveWebContents = () => {
    if (!activeTabId || !tabs.has(activeTabId)) return null;
    const tab = tabs.get(activeTabId);
    return tab.activePane === 'main' ? tab.view.webContents : (tab.splitView ? tab.splitView.webContents : tab.view.webContents);
  };

  ipcMain.on('navigate', (event, url) => {
    const wc = getActiveWebContents();
    if (!wc) return;
    let finalUrl = url.trim();
    if (finalUrl === '') return;
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
          finalUrl = `https://${finalUrl}`;
      } else {
          finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
    }
    wc.loadURL(finalUrl);
  });
  
  ipcMain.on('go-back', () => {
    const wc = getActiveWebContents();
    if (wc && wc.canGoBack()) wc.goBack();
  });
  
  ipcMain.on('go-forward', () => {
    const wc = getActiveWebContents();
    if (wc && wc.canGoForward()) wc.goForward();
  });
  
  ipcMain.on('reload', () => {
    const wc = getActiveWebContents();
    if (wc) wc.reload();
  });

  ipcMain.on('new-tab', () => createTab());
  ipcMain.on('switch-tab', (event, id) => switchTab(id));
  ipcMain.on('close-tab', (event, id) => closeTab(id));
  ipcMain.on('toggle-split', () => {
    if (activeTabId) toggleSplitView(activeTabId);
  });

  // Library IPC Handlers
  ipcMain.handle('get-data', () => ({ bookmarks, history }));
  ipcMain.handle('toggle-bookmark', (event, { url, title }) => {
    const index = bookmarks.findIndex(b => b.url === url);
    if (index >= 0) bookmarks.splice(index, 1);
    else bookmarks.push({ url, title: title || url, timestamp: Date.now() });
    saveData();
    return bookmarks;
  });
  ipcMain.handle('clear-history', () => {
    history = [];
    saveData();
    return history;
  });
  ipcMain.handle('delete-history-item', (event, index) => {
    history.splice(index, 1);
    saveData();
    return history;
  });
  ipcMain.handle('delete-bookmark', (event, index) => {
    bookmarks.splice(index, 1);
    saveData();
    return bookmarks;
  });

  // Sync
  ipcMain.handle('auth-register', async (event, { username, password }) => {
    try {
      const res = await fetch('http://13.233.208.184/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return { success: true, message: data.message };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('auth-login', async (event, { username, password }) => {
    try {
      const res = await fetch('http://13.233.208.184/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return { success: true, token: data.token, username: data.username };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sync-push', async (event, token) => {
    try {
      const res = await fetch('http://13.233.208.184/api/sync/data', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bookmarks, history })
      });
      if (!res.ok) throw new Error('Failed to push sync');
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('sync-pull', async (event, token) => {
    try {
      const res = await fetch('http://13.233.208.184/api/sync/data', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      bookmarks = data.bookmarks || [];
      history = data.history || [];
      saveData();
      mainWindow.webContents.send('sync-pulled', { bookmarks, history });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
}

app.whenReady().then(() => {
  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then((blocker) => {
    blocker.enableBlockingInSession(session.defaultSession);
    console.log('Ad blocker enabled!');
  }).catch(err => console.log('Adblocker failed to load:', err.message));

  createWindow();

  // Check for updates (wrapped in try/catch to prevent crashes in development)
  try {
    autoUpdater.checkForUpdatesAndNotify().catch(err => console.log('Updater info:', err.message));
  } catch (err) {
    console.log('Updater failed to start:', err.message);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
