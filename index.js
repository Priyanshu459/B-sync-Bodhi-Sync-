const { app, BrowserWindow, WebContentsView, ipcMain, session } = require('electron');
const { adblock } = require('adblock-rs');
const { autoUpdater } = require('electron-updater');
const fetch = require('cross-fetch');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
let vault = [];
let bookmarksPath = '';
let historyPath = '';
let vaultPath = '';

const ALGORITHM = 'aes-256-gcm';
function deriveKey(masterPassword) {
  return crypto.pbkdf2Sync(masterPassword, 'bodhi-sync-salt', 100000, 32, 'sha512');
}

function encryptVault(dataArray, masterPassword) {
  const key = deriveKey(masterPassword);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(JSON.stringify(dataArray), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return { iv: iv.toString('hex'), encrypted, authTag };
}

function decryptVault(encryptedObj, masterPassword) {
  try {
    const key = deriveKey(masterPassword);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encryptedObj.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));
    let decrypted = decipher.update(encryptedObj.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (e) {
    return null;
  }
}

function loadData() {
  try { if (fs.existsSync(bookmarksPath)) bookmarks = JSON.parse(fs.readFileSync(bookmarksPath, 'utf8')); } catch(e){}
  try { if (fs.existsSync(historyPath)) history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch(e){}
  try { if (fs.existsSync(vaultPath)) vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8')); } catch(e){}
}
function saveData() {
  fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks));
  fs.writeFileSync(historyPath, JSON.stringify(history));
  fs.writeFileSync(vaultPath, JSON.stringify(vault));
}

function recordHistory(url, title) {
  if (!url || url.startsWith('chrome://') || url.startsWith('file://')) return;
  if (history.length > 0 && history[0].url === url) return;
  history.unshift({ url, title, timestamp: Date.now() });
  if (history.length > 500) history.pop();
  saveData();
}

let tabIdCounter = 0;
const TITLEBAR_HEIGHT = 60;
const SIDEBAR_WIDTH = 240;

const windowStates = new Map();

function getWindowState(win) {
  if (!win) return null;
  if (!windowStates.has(win.id)) {
    windowStates.set(win.id, {
      tabs: new Map(),
      activeTabId: null,
      paletteWindow: null,
      syncWindow: null,
      win: win
    });
  }
  return windowStates.get(win.id);
}

function getMainWindowFromEvent(event) {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (!senderWin) return null;
  const parent = senderWin.getParentWindow();
  return parent || senderWin;
}

function setupGlobalShortcuts(wc, win) {
  wc.on('before-input-event', (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === 'k' && input.type === 'keyDown') {
      event.preventDefault();
      showPalette(win);
    }
  });
}

const updateViewBounds = (win) => {
  const state = getWindowState(win);
  if (!state || !state.activeTabId || !state.tabs.has(state.activeTabId)) return;
  
  const bounds = win.getContentBounds();
  const tab = state.tabs.get(state.activeTabId);
  
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

function setupViewListeners(view, tabId, pane, win) {
  const state = getWindowState(win);
  
  view.webContents.on('did-navigate', (event, newUrl) => {
    const tab = state.tabs.get(tabId);
    if (tab) {
      if (pane === 'main') tab.url = newUrl;
      else tab.splitUrl = newUrl;
      
      if (pane === 'main') win.webContents.send('tab-updated', { id: tabId, url: newUrl, title: tab.title });
      if (tabId === state.activeTabId && tab.activePane === pane) {
        win.webContents.send('url-updated', newUrl);
      }
    }
  });
  
  view.webContents.on('did-navigate-in-page', (event, newUrl) => {
    const tab = state.tabs.get(tabId);
    if (tab) {
      if (pane === 'main') tab.url = newUrl;
      else tab.splitUrl = newUrl;
      
      if (pane === 'main') win.webContents.send('tab-updated', { id: tabId, url: newUrl, title: tab.title });
      if (tabId === state.activeTabId && tab.activePane === pane) {
        win.webContents.send('url-updated', newUrl);
      }
    }
  });
  
  if (pane === 'main') {
    view.webContents.on('page-title-updated', (event, title) => {
      const tab = state.tabs.get(tabId);
      if (tab) {
        tab.title = title;
        win.webContents.send('tab-updated', { id: tabId, url: tab.url, title });
        if (!win.isIncognito) {
          recordHistory(tab.url, title);
        }
      }
    });
  } else {
    view.webContents.on('page-title-updated', (event, title) => {
      const tab = state.tabs.get(tabId);
      if (tab) {
        if (!win.isIncognito) {
          recordHistory(tab.splitUrl, title);
        }
      }
    });
  }
  
  view.webContents.on('focus', () => {
    const tab = state.tabs.get(tabId);
    if (tab) {
      tab.activePane = pane;
      if (tabId === state.activeTabId) {
        win.webContents.send('url-updated', pane === 'main' ? tab.url : tab.splitUrl);
      }
    }
  });

  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      createTab(url, win);
    }
    return { action: 'deny' };
  });
}

function createTab(url = 'https://www.google.com', win) {
  const state = getWindowState(win);
  const id = `tab-${tabIdCounter++}`;
  const view = new WebContentsView();
  setupGlobalShortcuts(view.webContents, win);
  
  state.tabs.set(id, { id, view, splitView: null, activePane: 'main', url, splitUrl: '', title: 'New Tab' });
  setupViewListeners(view, id, 'main', win);
  view.webContents.loadURL(url);
  
  win.webContents.send('tab-created', { id, url, title: 'Loading...' });
  switchTab(id, win);
}

function switchTab(id, win) {
  const state = getWindowState(win);
  if (!state.tabs.has(id)) return;
  
  if (state.activeTabId && state.tabs.has(state.activeTabId)) {
    const oldTab = state.tabs.get(state.activeTabId);
    win.contentView.removeChildView(oldTab.view);
    if (oldTab.splitView) win.contentView.removeChildView(oldTab.splitView);
  }
  
  state.activeTabId = id;
  const newTab = state.tabs.get(id);
  win.contentView.addChildView(newTab.view);
  if (newTab.splitView) win.contentView.addChildView(newTab.splitView);
  
  updateViewBounds(win);
  
  win.webContents.send('tab-switched', id);
  win.webContents.send('url-updated', newTab.activePane === 'main' ? newTab.url : newTab.splitUrl);
}

function closeTab(id, win) {
  const state = getWindowState(win);
  if (!state.tabs.has(id)) return;
  const tabToClose = state.tabs.get(id);
  
  if (state.activeTabId === id) {
    win.contentView.removeChildView(tabToClose.view);
    if (tabToClose.splitView) win.contentView.removeChildView(tabToClose.splitView);
    state.activeTabId = null;
  }
  
  state.tabs.delete(id);
  win.webContents.send('tab-closed', id);
  
  if (state.tabs.size > 0 && state.activeTabId === null) {
    switchTab(Array.from(state.tabs.keys())[state.tabs.size - 1], win);
  } else if (state.tabs.size === 0) {
    win.close();
  }
}

function toggleSplitView(id, win) {
  const state = getWindowState(win);
  const tab = state.tabs.get(id);
  if (!tab) return;
  
  if (tab.splitView) {
    if (state.activeTabId === id) {
      win.contentView.removeChildView(tab.splitView);
    }
    tab.splitView = null;
    tab.activePane = 'main';
    updateViewBounds(win);
    win.webContents.send('url-updated', tab.url);
  } else {
    tab.splitView = new WebContentsView();
    setupGlobalShortcuts(tab.splitView.webContents, win);
    tab.splitUrl = 'https://www.google.com';
    setupViewListeners(tab.splitView, id, 'split', win);
    tab.splitView.webContents.loadURL(tab.splitUrl);
    
    if (state.activeTabId === id) {
      win.contentView.addChildView(tab.splitView);
    }
    tab.activePane = 'split'; 
    updateViewBounds(win);
    win.webContents.send('url-updated', tab.splitUrl);
  }
}

function showPalette(win) {
  const state = getWindowState(win);
  if (!state.paletteWindow) return;
  const tabData = Array.from(state.tabs.values()).map(t => ({ id: t.id, title: t.title }));
  state.paletteWindow.webContents.send('palette-data', {
    tabs: tabData,
    bookmarks,
    history
  });
  const bounds = win.getBounds();
  state.paletteWindow.setBounds({
    x: bounds.x + Math.floor((bounds.width - 600) / 2),
    y: bounds.y + Math.floor(bounds.height * 0.15),
    width: 600,
    height: 450
  });
  state.paletteWindow.show();
  state.paletteWindow.focus();
}

function showSync(win) {
  const state = getWindowState(win);
  if (!state.syncWindow) return;
  const bounds = win.getBounds();
  state.syncWindow.setBounds({
    x: bounds.x + 250, // Sidebar width
    y: bounds.y + 100,
    width: 350,
    height: 380
  });
  state.syncWindow.show();
  state.syncWindow.focus();
}

function createBrowserWindow(isIncognito = false) {
  let win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    backgroundColor: isIncognito ? '#0F0F0F' : '#1E1E1E',
    webPreferences: {
      partition: isIncognito ? 'in-memory' : 'persist:default',
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  
  win.isIncognito = isIncognito;

  const state = getWindowState(win);
  
  state.paletteWindow = new BrowserWindow({
    width: 600, height: 450, parent: win, frame: false, backgroundColor: '#1E1E1E', show: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-palette.js'), contextIsolation: true, nodeIntegration: false }
  });
  state.paletteWindow.loadFile(path.join(__dirname, 'palette.html'));
  state.paletteWindow.on('blur', () => state.paletteWindow.hide());

  state.syncWindow = new BrowserWindow({
    width: 350, height: 380, parent: win, frame: false, backgroundColor: '#1E1E1E', show: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-sync.js'), contextIsolation: true, nodeIntegration: false }
  });
  state.syncWindow.loadFile(path.join(__dirname, 'sync.html'));
  state.syncWindow.on('blur', () => state.syncWindow.hide());

  win.on('resize', () => updateViewBounds(win));
  win.on('maximize', () => updateViewBounds(win));
  win.on('unmaximize', () => updateViewBounds(win));
  
  win.once('ready-to-show', () => {
    win.show();
    createTab('https://www.google.com', win);
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  setupGlobalShortcuts(win.webContents, win);
}

// Initial Setup
bookmarksPath = path.join(app.getPath('userData'), 'bookmarks.json');
historyPath = path.join(app.getPath('userData'), 'history.json');
vaultPath = path.join(app.getPath('userData'), 'vault_encrypted.json');
loadData();

// IPC Listeners
ipcMain.on('open-incognito', () => createBrowserWindow(true));

ipcMain.on('window-minimize', (event) => {
  const win = getMainWindowFromEvent(event);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window-close', (event) => {
  const win = getMainWindowFromEvent(event);
  if (win) win.close();
});

ipcMain.on('log-error', (event, msg) => {
  fs.appendFileSync(path.join(app.getPath('userData'), 'renderer-error.log'), new Date().toISOString() + ': ' + msg + '\n');
});

ipcMain.on('navigate', (event, url) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (!state.activeTabId || !state.tabs.has(state.activeTabId)) return;
  const tab = state.tabs.get(state.activeTabId);
  const wc = tab.activePane === 'main' ? tab.view.webContents : (tab.splitView ? tab.splitView.webContents : tab.view.webContents);
  
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

ipcMain.on('go-back', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (!state.activeTabId || !state.tabs.has(state.activeTabId)) return;
  const tab = state.tabs.get(state.activeTabId);
  const wc = tab.activePane === 'main' ? tab.view.webContents : (tab.splitView ? tab.splitView.webContents : tab.view.webContents);
  if (wc && wc.canGoBack()) wc.goBack();
});

ipcMain.on('go-forward', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (!state.activeTabId || !state.tabs.has(state.activeTabId)) return;
  const tab = state.tabs.get(state.activeTabId);
  const wc = tab.activePane === 'main' ? tab.view.webContents : (tab.splitView ? tab.splitView.webContents : tab.view.webContents);
  if (wc && wc.canGoForward()) wc.goForward();
});

ipcMain.on('reload', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (!state.activeTabId || !state.tabs.has(state.activeTabId)) return;
  const tab = state.tabs.get(state.activeTabId);
  const wc = tab.activePane === 'main' ? tab.view.webContents : (tab.splitView ? tab.splitView.webContents : tab.view.webContents);
  if (wc) wc.reload();
});

ipcMain.on('new-tab', (event) => {
  const win = getMainWindowFromEvent(event);
  if (win) createTab('https://www.google.com', win);
});

ipcMain.on('switch-tab', (event, id) => {
  const win = getMainWindowFromEvent(event);
  if (win) switchTab(id, win);
});

ipcMain.on('close-tab', (event, id) => {
  const win = getMainWindowFromEvent(event);
  if (win) closeTab(id, win);
});

ipcMain.on('toggle-split', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state.activeTabId) toggleSplitView(state.activeTabId, win);
});

ipcMain.on('open-sync', (event) => {
  const win = getMainWindowFromEvent(event);
  if (win) showSync(win);
});

ipcMain.on('close-sync', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state.syncWindow) state.syncWindow.hide();
});

ipcMain.on('open-palette', (event) => {
  const win = getMainWindowFromEvent(event);
  if (win) showPalette(win);
});

ipcMain.on('close-palette', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state.paletteWindow) state.paletteWindow.hide();
});

ipcMain.on('palette-action', (event, action) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state.paletteWindow) state.paletteWindow.hide();
  
  if (action.type === 'open-vault') {
    win.webContents.send('open-vault');
  } else if (action.type === 'switch-tab') {
    switchTab(action.id, win);
  } else if (action.type === 'navigate') {
    let finalUrl = action.url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      if (finalUrl.includes('.') && !finalUrl.includes(' ')) {
        finalUrl = `https://${finalUrl}`;
      } else {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
    }
    if (!state.activeTabId || !state.tabs.has(state.activeTabId)) return;
    const tab = state.tabs.get(state.activeTabId);
    const wc = tab.activePane === 'main' ? tab.view.webContents : (tab.splitView ? tab.splitView.webContents : tab.view.webContents);
    if (wc) wc.loadURL(finalUrl);
  }
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
      body: JSON.stringify({ bookmarks, history, vault })
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
    vault = data.vault || [];
    saveData();
    // Broadcast to all windows
    for (const [id, state] of windowStates.entries()) {
      state.win.webContents.send('sync-pulled', { bookmarks, history, vault });
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Password Vault IPC
ipcMain.handle('vault-unlock', (event, masterPassword) => {
  if (vault.length === 0) return { success: true, data: [] }; // Empty vault
  
  if (vault.encrypted && vault.iv) {
    const decrypted = decryptVault(vault, masterPassword);
    if (decrypted === null) return { success: false, error: 'Incorrect Master Password' };
    return { success: true, data: decrypted };
  }
  
  return { success: true, data: vault };
});

ipcMain.handle('vault-save', (event, { dataArray, masterPassword }) => {
  const encrypted = encryptVault(dataArray, masterPassword);
  vault = encrypted;
  saveData();
  return { success: true };
});

app.whenReady().then(async () => {
  async function setupAdblocker() {
    try {
      const { FilterSet, Engine } = require('adblock-rs');
      const res = await fetch('https://easylist.to/easylist/easylist.txt');
      const rules = await res.text();
      
      const filterSet = new FilterSet(true);
      filterSet.addFilters(rules.split('\n'));
      const engine = new Engine(filterSet, true);

      function attachSessionListeners(sess) {
        sess.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
          const resourceType = details.resourceType === 'mainFrame' ? 'document' : details.resourceType;
          const sourceUrl = details.referrer || details.url; 
          
          try {
            if (engine.check(details.url, sourceUrl, resourceType)) {
              console.log(`[adblock-rs] Blocked: ${details.url}`);
              return callback({ cancel: true });
            }
          } catch (e) {
            // Ignore parsing errors for unsupported protocols
          }
          callback({ cancel: false });
        });

        sess.on('will-download', (event, item, webContents) => {
          const targetWin = BrowserWindow.fromWebContents(webContents);
          if (!targetWin) return;
          targetWin.webContents.send('download-started', {
            id: Date.now().toString(),
            filename: item.getFilename(),
            totalBytes: item.getTotalBytes(),
            state: item.getState()
          });

          item.on('updated', (event, state) => {
            if (state === 'interrupted') {
              targetWin.webContents.send('download-interrupted', item.getFilename());
            } else if (state === 'progressing') {
              if (!item.isPaused()) {
                targetWin.webContents.send('download-progress', {
                  filename: item.getFilename(),
                  receivedBytes: item.getReceivedBytes(),
                  totalBytes: item.getTotalBytes()
                });
              }
            }
          });

          item.once('done', (event, state) => {
            targetWin.webContents.send('download-done', {
              filename: item.getFilename(),
              state: state
            });
          });
        });
      }

      attachSessionListeners(session.defaultSession);
      attachSessionListeners(session.fromPartition('in-memory'));
      console.log('Native Brave adblock-rs engine initialized for all sessions!');
    } catch (e) {
      console.log('Failed to initialize adblock-rs:', e.message);
    }
  }

  await setupAdblocker();
  createBrowserWindow(false);

  try {
    autoUpdater.checkForUpdatesAndNotify().catch(err => console.log('Updater info:', err.message));
  } catch (err) {
    console.log('Updater failed to start:', err.message);
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createBrowserWindow(false);
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
