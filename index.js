const { app, BrowserWindow, WebContentsView, ipcMain, session, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const fetch = require('cross-fetch');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isDev = !app.isPackaged;
if (isDev) {
  app.setPath('userData', path.join(app.getPath('appData'), 'BodhiSync-Dev'));
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('bodhisync', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('bodhisync');
}

// Hardware acceleration is enabled by default to ensure best performance.
// Compatibility flags below fix black screens/crashes on dual GPU setups (e.g. ASUS TUF).
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-features', 'WidgetLayering,IOSurfaceCapturer,HardwareMediaKeyHandling');

// Silence NodeJS deprecation warnings (e.g., punycode warning from Electron/Ghostery)
process.noDeprecation = true;

process.on('uncaughtException', (error) => {
  fs.writeFileSync(path.join(app.getPath('userData'), 'b-sync-crash.log'), error.stack || error.toString());
});
process.on('unhandledRejection', (reason) => {
  fs.writeFileSync(path.join(app.getPath('userData'), 'b-sync-rejection.log'), reason && reason.stack ? reason.stack : String(reason));
});

let bookmarks = [];
let history = [];
let vault = [];
let settings = { 
  searchEngine: 'google',
  themeColors: { bgMain: 'rgba(30, 30, 30, 0.85)', bgDark: 'rgba(15, 15, 15, 0.85)', accent: '#3b82f6' },
  sidebarPos: 'left',
  compactMode: false,
  urlBarPos: 'top',
  mods: { roundedTabs: false, hideNav: false, hideLib: false },
  isFirstRun: true,
  syncServerUrl: 'https://api.bodhisync.online',
  useHardwareAcceleration: true,
  favorites: [
    { url: 'https://youtube.com', title: 'YouTube' },
    { url: 'https://github.com', title: 'GitHub' }
  ]
};
let bookmarksPath = '';
let historyPath = '';
let vaultPath = '';
let settingsPath = '';

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
  try { if (fs.existsSync(settingsPath)) settings = Object.assign(settings, JSON.parse(fs.readFileSync(settingsPath, 'utf8'))); } catch(e){}
}
function saveData() {
  fs.writeFile(bookmarksPath, JSON.stringify(bookmarks), () => {});
  fs.writeFile(historyPath, JSON.stringify(history), () => {});
  fs.writeFile(vaultPath, JSON.stringify(vault), () => {});
  fs.writeFile(settingsPath, JSON.stringify(settings), () => {});
}

function getSearchUrl(query) {
  if (settings.searchEngine === 'bing') return `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  if (settings.searchEngine === 'brave') return `https://search.brave.com/search?q=${encodeURIComponent(query)}`;
  if (settings.searchEngine === 'duckduckgo') return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getHomepageUrl() {
  return require('url').pathToFileURL(path.join(__dirname, 'newtab.html')).href;
}

function recordHistory(url, title) {
  if (!url || url.startsWith('chrome://') || url.startsWith('file://')) return;
  if (history.length > 0 && history[0].url === url) return;
  history.unshift({ url, title, timestamp: Date.now() });
  if (history.length > 500) history.pop();
  saveData();
}

let tabIdCounter = 0;
const TITLEBAR_HEIGHT = 100;
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
      downloadsWindow: null,
      welcomeWindow: null,
      win: win,
      sidebarHovered: false,
      isHtmlFullScreen: false
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
    // Google Console / DevTools shortcuts
    if (input.key === 'F12' && input.type === 'keyDown') {
      event.preventDefault();
      wc.openDevTools({ mode: 'detach' });
    }
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i' && input.type === 'keyDown') {
      event.preventDefault();
      wc.openDevTools({ mode: 'detach' });
    }
    if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'j' && input.type === 'keyDown') {
      event.preventDefault();
      win.webContents.openDevTools({ mode: 'detach' });
    }
  });
}

const updateViewBounds = (win) => {
  const state = getWindowState(win);
  if (!state || !state.activeTabId || !state.tabs.has(state.activeTabId)) return;
  
  const bounds = win.getContentBounds();
  const tab = state.tabs.get(state.activeTabId);
  
  if (state.isHtmlFullScreen) {
    if (!tab.splitView) {
      tab.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    } else {
      if (tab.activePane === 'main') {
        tab.view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
        tab.splitView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      } else {
        tab.splitView.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
        tab.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
    return;
  }
  
  const effSidebarWidth = (settings.compactMode && !state.sidebarHovered) ? 60 : SIDEBAR_WIDTH;
  const isRight = settings.sidebarPos === 'right';
  const viewX = isRight ? 0 : effSidebarWidth;
  const effWidth = bounds.width - effSidebarWidth;
  
  if (!tab.splitView) {
    tab.view.setBounds({ 
      x: viewX, 
      y: TITLEBAR_HEIGHT, 
      width: effWidth, 
      height: bounds.height - TITLEBAR_HEIGHT 
    });
  } else {
    const halfWidth = Math.floor(effWidth / 2);
    tab.view.setBounds({ 
      x: viewX, 
      y: TITLEBAR_HEIGHT, 
      width: halfWidth, 
      height: bounds.height - TITLEBAR_HEIGHT 
    });
    tab.splitView.setBounds({
      x: viewX + halfWidth,
      y: TITLEBAR_HEIGHT,
      width: effWidth - halfWidth,
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
  
  view.webContents.on('did-start-navigation', (event, newUrl) => {
    const isGoogleAuth = newUrl.includes('accounts.google.com') || newUrl.includes('mail.google.com') || newUrl.includes('myaccount.google.com');
    if (isGoogleAuth) {
      view.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0');
    } else {
      view.webContents.setUserAgent(app.userAgentFallback);
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

  view.webContents.on('dom-ready', () => {
    const url = view.webContents.getURL();
    if (url.includes('search.brave.com')) {
      view.webContents.insertCSS(`
        div[class*="promo"],
        div[class*="download-prompt"],
        a[href*="brave.com/download"],
        #b-promo,
        #download-brave-promo {
          display: none !important;
        }
      `);
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

  view.webContents.on('enter-html-full-screen', () => {
    state.isHtmlFullScreen = true;
    win.setFullScreen(true);
    updateViewBounds(win);
  });

  view.webContents.on('leave-html-full-screen', () => {
    state.isHtmlFullScreen = false;
    win.setFullScreen(false);
    updateViewBounds(win);
  });
}

function createTab(url, win) {
  if (!url) url = getHomepageUrl();
  const state = getWindowState(win);
  const id = `tab-${tabIdCounter++}`;
  const view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload-tab.js'),
      contextIsolation: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });
  view.setBackgroundColor('#FFFFFF');
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
  
  try { tabToClose.view.webContents.close(); } catch(e){}
  if (tabToClose.splitView) {
    try { tabToClose.splitView.webContents.close(); } catch(e){}
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
    tab.splitView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'preload-tab.js'),
        contextIsolation: true,
        autoplayPolicy: 'no-user-gesture-required'
      }
    });
    tab.splitView.setBackgroundColor('#FFFFFF');
    setupGlobalShortcuts(tab.splitView.webContents, win);
    tab.splitUrl = getHomepageUrl();
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

function showDownloads(win) {
  const state = getWindowState(win);
  if (!state.downloadsWindow) return;
  const bounds = win.getBounds();
  state.downloadsWindow.setBounds({
    x: bounds.x + bounds.width - 360, // 10px padding from right
    y: bounds.y + 40, // Below titlebar
    width: 350,
    height: 400
  });
  state.downloadsWindow.show();
  state.downloadsWindow.focus();
}

function createBrowserWindow(isIncognito = false) {
  let win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    transparent: true,
    backgroundMaterial: 'acrylic',
    vibrancy: 'fullscreen-ui',
    backgroundColor: '#00000000',
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

  state.downloadsWindow = new BrowserWindow({
    width: 350, height: 400, parent: win, frame: false, backgroundColor: '#1E1E1E', show: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-downloads.js'), contextIsolation: true, nodeIntegration: false }
  });
  state.downloadsWindow.loadFile(path.join(__dirname, 'downloads.html'));
  state.downloadsWindow.on('blur', () => state.downloadsWindow.hide());

  state.welcomeWindow = new BrowserWindow({
    width: 800, height: 600, parent: win, modal: true, frame: false, transparent: true, show: false, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, 'preload-welcome.js'), contextIsolation: true, nodeIntegration: false }
  });
  state.welcomeWindow.loadFile(path.join(__dirname, 'welcome.html'));

  win.on('resize', () => updateViewBounds(win));
  win.on('maximize', () => updateViewBounds(win));
  win.on('unmaximize', () => updateViewBounds(win));
  win.on('enter-full-screen', () => updateViewBounds(win));
  win.on('leave-full-screen', () => updateViewBounds(win));
  
  win.once('ready-to-show', () => {
    win.show();
    if (!isIncognito && settings.isFirstRun) {
      setTimeout(() => {
        state.welcomeWindow.show();
        state.welcomeWindow.focus();
        settings.isFirstRun = false;
        saveData();
        // Open the automated web onboarding alongside the local modal
        createTab('https://myauraprofile.vercel.app/welcome', win);
      }, 500);
    }
    createTab(getHomepageUrl(), win);
  });

  win.loadFile(path.join(__dirname, 'index.html'));
  setupGlobalShortcuts(win.webContents, win);
}

// Initial Setup
bookmarksPath = path.join(app.getPath('userData'), 'bookmarks.json');
historyPath = path.join(app.getPath('userData'), 'history.json');
vaultPath = path.join(app.getPath('userData'), 'vault_encrypted.json');
settingsPath = path.join(app.getPath('userData'), 'settings.json');
loadData();



if (settings.useHardwareAcceleration === false) {
  app.disableHardwareAcceleration();
}

app.on('gpu-process-crashed', (event, killed) => {
  if (settings.useHardwareAcceleration !== false) {
    settings.useHardwareAcceleration = false;
    saveData();
    app.relaunch();
    app.exit(0);
  }
});

// IPC Listeners
ipcMain.handle('get-search-url', (event, query) => {
  return getSearchUrl(query);
});

ipcMain.handle('get-window-source-id', (event) => {
  const win = getMainWindowFromEvent(event);
  return win ? win.getMediaSourceId() : null;
});

ipcMain.handle('save-recording', async (event, buffer) => {
  const win = getMainWindowFromEvent(event);
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save Screen Recording',
    defaultPath: 'browser_recording.webm',
    filters: [
      { name: 'WebM Video', extensions: ['webm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!canceled && filePath) {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, filePath };
  }
  return { success: false };
});
ipcMain.on('sidebar-hover', (event, hovered) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state.sidebarHovered !== hovered) {
    state.sidebarHovered = hovered;
    updateViewBounds(win);
  }
});

ipcMain.on('open-incognito', () => createBrowserWindow(true));

ipcMain.on('window-minimize', (event) => {
  const win = getMainWindowFromEvent(event);
  if (win) win.minimize();
});

ipcMain.on('modal-opened', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state.activeTabId && state.tabs.has(state.activeTabId)) {
    const tab = state.tabs.get(state.activeTabId);
    if (tab.view) {
      try { win.contentView.removeChildView(tab.view); } catch(e) {}
    }
    if (tab.splitView) {
      try { win.contentView.removeChildView(tab.splitView); } catch(e) {}
    }
  }
});

ipcMain.on('modal-closed', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state.activeTabId && state.tabs.has(state.activeTabId)) {
    const tab = state.tabs.get(state.activeTabId);
    if (tab.view) {
      try { win.contentView.addChildView(tab.view); } catch(e) {}
    }
    if (tab.splitView) {
      try { win.contentView.addChildView(tab.splitView); } catch(e) {}
    }
  }
});

ipcMain.on('open-downloads', (event) => {
  const win = getMainWindowFromEvent(event);
  if (win) showDownloads(win);
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

ipcMain.on('close-welcome', (event) => {
  const win = getMainWindowFromEvent(event);
  if (!win) return;
  const state = getWindowState(win);
  if (state && state.welcomeWindow) {
    state.welcomeWindow.hide();
  }
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
        finalUrl = getSearchUrl(finalUrl);
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
  if (win) createTab(getHomepageUrl(), win);
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
        finalUrl = getSearchUrl(finalUrl);
      }
    }
    if (!state.activeTabId || !state.tabs.has(state.activeTabId)) return;
    const tab = state.tabs.get(state.activeTabId);
    const wc = tab.activePane === 'main' ? tab.view.webContents : (tab.splitView ? tab.splitView.webContents : tab.view.webContents);
    if (wc) wc.loadURL(finalUrl);
  }
});

// Library IPC Handlers
ipcMain.handle('get-settings', () => settings);
ipcMain.handle('update-setting', (event, { key, value }) => {
  settings[key] = value;
  saveData();
  const win = getMainWindowFromEvent(event);
  if (win && ['sidebarPos', 'compactMode'].includes(key)) {
    updateViewBounds(win);
  }
  return settings;
});
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
    const serverUrl = settings.syncServerUrl || 'http://13.233.208.184';
    const res = await fetch(`${serverUrl}/api/auth/register`, {
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
    const serverUrl = settings.syncServerUrl || 'http://13.233.208.184';
    const res = await fetch(`${serverUrl}/api/auth/login`, {
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
    const serverUrl = settings.syncServerUrl || 'http://13.233.208.184';
    const res = await fetch(`${serverUrl}/api/sync/data`, {
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
    const serverUrl = settings.syncServerUrl || 'http://13.233.208.184';
    const res = await fetch(`${serverUrl}/api/sync/data`, {
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

const gotTheLock = isDev ? true : app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    let deepLinkUrl = commandLine.find(arg => arg.startsWith('bodhisync://'));
    
    if (windowStates.size > 0) {
      const state = Array.from(windowStates.values())[0];
      if (state.win) {
        if (state.win.isMinimized()) state.win.restore();
        state.win.focus();
        
        if (deepLinkUrl) {
          const targetUrl = deepLinkUrl.replace('bodhisync://', 'https://');
          createTab(targetUrl, state.win);
        }
      }
    }
  });

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (windowStates.size > 0) {
      const state = Array.from(windowStates.values())[0];
      if (state.win) {
        if (state.win.isMinimized()) state.win.restore();
        state.win.focus();
        const targetUrl = url.replace('bodhisync://', 'https://');
        createTab(targetUrl, state.win);
      }
    } else {
      app.whenReady().then(() => {
        // App will create a window on ready, we should open this URL in it
        // A simple way is to push it to a global variable or wait for win to be created
        // We'll rely on createBrowserWindow creating the default window and we can add the tab later,
        // but for simplicity, we let the default flow create the first tab.
      });
    }
  });

  app.whenReady().then(async () => {
  // Prevent MaxListenersExceededWarning when multiple modules (like adblocker) attach to WebContents
  app.on('web-contents-created', (event, contents) => {
    contents.setMaxListeners(100);
  });

  // Dynamically spoof a standard Chrome User-Agent using the current Chromium version
  const defaultUA = session.defaultSession.getUserAgent();
  const cleanUA = defaultUA.replace(/b-sync\/[0-9.-]+\s*/, '').replace(/Electron\/[0-9.-]+\s*/, '');
  app.userAgentFallback = cleanUA;
  session.defaultSession.setUserAgent(cleanUA);
  session.fromPartition('in-memory').setUserAgent(cleanUA);

  const chromeVersionMatch = cleanUA.match(/Chrome\/(\d+)/);
  const chromeVersion = chromeVersionMatch ? chromeVersionMatch[1] : '123';
  const secChUa = `"Google Chrome";v="${chromeVersion}", "Not:A-Brand";v="8", "Chromium";v="${chromeVersion}"`;

  const setupHeaders = (sess) => {
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
      details.requestHeaders['Sec-CH-UA'] = secChUa;
      details.requestHeaders['Sec-CH-UA-Mobile'] = '?0';
      details.requestHeaders['Sec-CH-UA-Platform'] = '"Windows"';
      details.requestHeaders['User-Agent'] = cleanUA;
      callback({ cancel: false, requestHeaders: details.requestHeaders });
    });
  };
  setupHeaders(session.defaultSession);
  setupHeaders(session.fromPartition('in-memory'));

  async function setupAdblocker() {
    try {
      const { ElectronBlocker } = require('@ghostery/adblocker-electron');
      
      const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
      
      try { blocker.enableBlockingInSession(session.defaultSession); } catch (e) {}
      try { blocker.enableBlockingInSession(session.fromPartition('in-memory')); } catch (e) {}
      
      console.log('Ghostery adblocker-electron initialized for all sessions!');
      
      let sessionBlockedCount = 0;
      blocker.on('request-blocked', () => {
        sessionBlockedCount++;
        for (const [win] of windowStates) {
          if (!win.isDestroyed()) {
            win.webContents.send('ad-blocked', sessionBlockedCount);
          }
        }
      });
      
      function attachDownloadListener(sess) {
        sess.on('will-download', (event, item, webContents) => {
          const mainState = Array.from(windowStates.values())[0];
          if (!mainState || !mainState.win) return;
          const targetWin = mainState.win;
          const state = getWindowState(targetWin);
          if (!state || !state.downloadsWindow) return;
          
          showDownloads(targetWin);
          
          let tabIdToClose = null;
          for (const [id, tab] of state.tabs) {
            if ((tab.view && tab.view.webContents === webContents) ||
                (tab.splitView && tab.splitView.webContents === webContents)) {
              if (!webContents.navigationHistory.canGoBack()) {
                tabIdToClose = id;
              }
              break;
            }
          }
          if (tabIdToClose) {
            closeTab(tabIdToClose, targetWin);
          }
          
          state.downloadsWindow.webContents.send('download-started', {
            id: Date.now().toString(),
            filename: item.getFilename(),
            totalBytes: item.getTotalBytes(),
            state: item.getState()
          });

          item.on('updated', (event, dlState) => {
            if (dlState === 'interrupted') {
              state.downloadsWindow.webContents.send('download-interrupted', item.getFilename());
            } else if (dlState === 'progressing') {
              if (!item.isPaused()) {
                state.downloadsWindow.webContents.send('download-progress', {
                  filename: item.getFilename(),
                  receivedBytes: item.getReceivedBytes(),
                  totalBytes: item.getTotalBytes()
                });
              }
            }
          });

          item.once('done', (event, dlState) => {
            state.downloadsWindow.webContents.send('download-done', {
              filename: item.getFilename(),
              state: dlState
            });
          });
        });
      }

      attachDownloadListener(session.defaultSession);
      attachDownloadListener(session.fromPartition('in-memory'));
    } catch (e) {
      console.log('Failed to initialize adblocker:', e.message);
    }
  }

  await setupAdblocker();
  createBrowserWindow(false);

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  ipcMain.on('download-update', () => {
    autoUpdater.downloadUpdate();
  });

  try {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-available', (info) => {
      BrowserWindow.getAllWindows().forEach(w => {
        w.webContents.send('update-available', info.version);
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      BrowserWindow.getAllWindows().forEach(w => {
        w.webContents.send('update-ready');
      });
    });
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
} // End of single instance lock
