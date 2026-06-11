window.onerror = function(message, source, lineno, colno, error) {
  if (window.api && window.api.logError) {
    window.api.logError(message + ' at ' + source + ':' + lineno);
  }
};

const addressBar = document.getElementById('address-bar');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnSplit = document.getElementById('btn-split');
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

const btnNewTab = document.getElementById('btn-new-tab');
const btnIncognito = document.getElementById('btn-incognito');
const tabsContainer = document.getElementById('tabs-container');

// Library Elements
const btnBookmark = document.getElementById('btn-bookmark');
const tabBookmarks = document.getElementById('tab-bookmarks');
const tabHistory = document.getElementById('tab-history');
const libraryList = document.getElementById('library-list');

// State
let tabs = new Map();
let activeTabId = null;
let currentLibraryTab = 'bookmarks';
let libraryData = { bookmarks: [], history: [] };

const sidebarEl = document.querySelector('.sidebar');
const titlebarEl = document.querySelector('.titlebar');
const addressBarContainer = document.querySelector('.address-bar-container');

function applyZenSettings(settings) {
  if (settings.themeColors) {
    document.documentElement.style.setProperty('--bg-main', settings.themeColors.bgMain);
    document.documentElement.style.setProperty('--bg-dark', settings.themeColors.bgDark);
    document.documentElement.style.setProperty('--accent-color', settings.themeColors.accent);
  }
  if (settings.sidebarPos === 'right') document.body.classList.add('sidebar-right');
  else document.body.classList.remove('sidebar-right');
  
  if (settings.urlBarPos === 'sidebar') {
    document.body.classList.add('url-in-sidebar');
    sidebarEl.insertBefore(addressBarContainer, sidebarEl.firstChild);
  } else {
    document.body.classList.remove('url-in-sidebar');
    if (addressBarContainer.parentElement !== titlebarEl) {
      titlebarEl.insertBefore(addressBarContainer, titlebarEl.children[1]);
    }
  }
  
  if (settings.compactMode) document.body.classList.add('compact-mode');
  else document.body.classList.remove('compact-mode');
  
  if (settings.mods) {
    if (settings.mods.roundedTabs) document.body.classList.add('mod-rounded-tabs'); else document.body.classList.remove('mod-rounded-tabs');
    if (settings.mods.hideNav) document.body.classList.add('mod-hide-nav'); else document.body.classList.remove('mod-hide-nav');
    if (settings.mods.hideLib) document.body.classList.add('mod-hide-lib'); else document.body.classList.remove('mod-hide-lib');
  }
}

let favoritesData = [];

function renderFavorites() {
  const list = document.getElementById('favorites-list');
  if (!list) return;
  list.innerHTML = '';
  favoritesData.forEach((fav, index) => {
    const el = document.createElement('div');
    el.className = 'fav-item';
    
    const icon = document.createElement('img');
    try {
      const urlObj = new URL(fav.url);
      if (urlObj.protocol === 'file:' || !urlObj.hostname) {
        throw new Error('Local file');
      }
      icon.src = `https://s2.googleusercontent.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch(e) {
      icon.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2318181b"/><text x="50%25" y="50%25" font-family="monospace" font-weight="bold" font-size="55" fill="%23fafafa" text-anchor="middle" dominant-baseline="central">B</text><circle cx="80" cy="20" r="8" fill="%2310b981"/></svg>';
    }
    
    const text = document.createElement('span');
    text.textContent = fav.title;
    
    const del = document.createElement('button');
    del.className = 'fav-delete';
    del.innerHTML = '<i class="ph ph-x"></i>';
    del.title = 'Remove';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      favoritesData.splice(index, 1);
      await window.api.updateSetting('favorites', favoritesData);
      renderFavorites();
    });
    
    el.appendChild(icon);
    el.appendChild(text);
    el.appendChild(del);
    
    el.addEventListener('click', () => {
      window.api.navigate(fav.url);
    });
    
    list.appendChild(el);
  });
}

document.getElementById('btn-add-favorite').addEventListener('click', async () => {
  const currentUrl = addressBar.value;
  if (!currentUrl || !currentUrl.startsWith('http')) return;
  
  let currentTitle = currentUrl;
  if (activeTabId && tabs.has(activeTabId)) currentTitle = tabs.get(activeTabId).title;
  
  if (!favoritesData.some(f => f.url === currentUrl)) {
    favoritesData.push({ url: currentUrl, title: currentTitle });
    await window.api.updateSetting('favorites', favoritesData);
    renderFavorites();
  }
});

window.api.getSettings().then(settings => {
  applyZenSettings(settings);
  favoritesData = settings.favorites || [];
  renderFavorites();
});

// Initial Load
window.api.getData().then(data => {
  libraryData = data;
  renderLibrary();
});

// Navigation
addressBar.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    window.api.navigate(addressBar.value);
    addressBar.blur();
  }
});

btnBack.addEventListener('click', () => window.api.goBack());
btnForward.addEventListener('click', () => window.api.goForward());
btnReload.addEventListener('click', () => window.api.reload());
btnSplit.addEventListener('click', () => window.api.toggleSplit());

// Window Controls
btnMinimize.addEventListener('click', () => window.api.windowMinimize());
btnMaximize.addEventListener('click', () => window.api.windowMaximize());
btnClose.addEventListener('click', () => window.api.windowClose());

// URL Updates & Bookmark State
function updateBookmarkStar(url) {
  if (libraryData.bookmarks.some(b => b.url === url)) {
    btnBookmark.classList.add('active');
    btnBookmark.innerHTML = '<i class="ph-fill ph-star"></i>';
  } else {
    btnBookmark.classList.remove('active');
    btnBookmark.innerHTML = '<i class="ph ph-star"></i>';
  }
}

window.api.onUrlUpdated(async (url) => {
  if (url.startsWith('file://') && url.endsWith('newtab.html')) {
    addressBar.value = '';
  } else {
    addressBar.value = url;
  }
  libraryData = await window.api.getData();
  updateBookmarkStar(url);
  if (currentLibraryTab === 'history') {
    renderLibrary();
  }
});

// Tab Management
btnNewTab.addEventListener('click', () => {
  window.api.newTab();
});

btnIncognito.addEventListener('click', () => {
  window.api.openIncognito();
});

function renderTabs() {
  tabsContainer.innerHTML = '';
  tabs.forEach((tab, id) => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${id === activeTabId ? 'active' : ''}`;
    tabEl.draggable = true;
    
    tabEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', id);
      tabEl.classList.add('dragging');
    });
    
    tabEl.addEventListener('dragend', () => {
      tabEl.classList.remove('dragging');
    });
    
    tabEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      tabEl.classList.add('drag-over');
    });
    
    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('drag-over');
    });
    
    tabEl.addEventListener('drop', (e) => {
      e.preventDefault();
      tabEl.classList.remove('drag-over');
      const draggedId = Number(e.dataTransfer.getData('text/plain'));
      if (draggedId !== id) {
        // Reorder map entries by rebuilding the map
        const newTabs = new Map();
        const draggedTab = tabs.get(draggedId);
        
        tabs.forEach((t, tId) => {
          if (tId === id) newTabs.set(draggedId, draggedTab); // Insert before
          if (tId !== draggedId) newTabs.set(tId, t);
        });
        
        tabs = newTabs;
        renderTabs();
      }
    });
    
    const iconEl = document.createElement('img');
    iconEl.className = 'tab-icon';
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('file://')) {
      try {
        const urlObj = new URL(tab.url);
        if (!urlObj.hostname) throw new Error('Empty hostname');
        iconEl.src = `https://s2.googleusercontent.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
      } catch (e) {
        iconEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2318181b"/><text x="50%25" y="50%25" font-family="monospace" font-weight="bold" font-size="55" fill="%23fafafa" text-anchor="middle" dominant-baseline="central">B</text><circle cx="80" cy="20" r="8" fill="%2310b981"/></svg>';
      }
    } else {
      iconEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2318181b"/><text x="50%25" y="50%25" font-family="monospace" font-weight="bold" font-size="55" fill="%23fafafa" text-anchor="middle" dominant-baseline="central">B</text><circle cx="80" cy="20" r="8" fill="%2310b981"/></svg>';
    }
    
    const titleEl = document.createElement('span');
    titleEl.className = 'tab-title';
    titleEl.textContent = tab.title || 'New Tab';
    titleEl.title = tab.title || 'New Tab';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '<i class="ph ph-x"></i>';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.api.closeTab(id);
    });
    
    tabEl.addEventListener('click', () => {
      if (id !== activeTabId) window.api.switchTab(id);
    });
    
    tabEl.appendChild(iconEl);
    tabEl.appendChild(titleEl);
    tabEl.appendChild(closeBtn);
    tabsContainer.appendChild(tabEl);
  });
}

window.api.onTabCreated((tab) => {
  tabs.set(tab.id, tab);
  renderTabs();
});

window.api.onTabUpdated(async (tab) => {
  if (tabs.has(tab.id)) {
    tabs.set(tab.id, tab);
    renderTabs();
    libraryData = await window.api.getData(); // Refresh data to catch history
    if (currentLibraryTab === 'history') {
      renderLibrary();
    }
  }
});

window.api.onTabSwitched((id) => {
  activeTabId = id;
  renderTabs();
});

window.api.onTabClosed((id) => {
  tabs.delete(id);
  renderTabs();
});

// Library Logic
tabBookmarks.addEventListener('click', () => {
  currentLibraryTab = 'bookmarks';
  tabBookmarks.classList.add('active');
  tabHistory.classList.remove('active');
  renderLibrary();
});

tabHistory.addEventListener('click', () => {
  currentLibraryTab = 'history';
  tabHistory.classList.add('active');
  tabBookmarks.classList.remove('active');
  renderLibrary();
});

btnBookmark.addEventListener('click', async () => {
  const currentUrl = addressBar.value;
  if (!currentUrl) return;
  
  // Find current title
  let currentTitle = currentUrl;
  if (activeTabId && tabs.has(activeTabId)) currentTitle = tabs.get(activeTabId).title;

  libraryData.bookmarks = await window.api.toggleBookmark(currentUrl, currentTitle);
  updateBookmarkStar(currentUrl);
  if (currentLibraryTab === 'bookmarks') {
    renderLibrary();
  }
});

function renderLibrary() {
  libraryList.innerHTML = '';
  const items = currentLibraryTab === 'bookmarks' ? libraryData.bookmarks : libraryData.history;
  
  if (currentLibraryTab === 'history' && items.length > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'new-tab-btn';
    clearBtn.style.marginBottom = '10px';
    clearBtn.style.color = '#ff6b6b';
    clearBtn.innerHTML = '<i class="ph ph-trash"></i> Clear History';
    clearBtn.addEventListener('click', async () => {
      libraryData.history = await window.api.clearHistory();
      renderLibrary();
    });
    libraryList.appendChild(clearBtn);
  }

  if (items.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.padding = '20px';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.color = 'rgba(255,255,255,0.5)';
    emptyMsg.style.fontSize = '12px';
    emptyMsg.textContent = `No ${currentLibraryTab} yet.`;
    libraryList.appendChild(emptyMsg);
    return;
  }

  items.forEach((item, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'library-item';
    
    const content = document.createElement('div');
    content.className = 'lib-content';
    
    const titleEl = document.createElement('div');
    titleEl.className = 'lib-title';
    titleEl.textContent = item.title;
    
    const urlEl = document.createElement('div');
    urlEl.className = 'lib-url';
    urlEl.textContent = item.url;
    
    content.appendChild(titleEl);
    content.appendChild(urlEl);
    content.addEventListener('click', () => {
      window.api.navigate(item.url);
    });
    
    const delBtn = document.createElement('button');
    delBtn.className = 'lib-delete';
    delBtn.innerHTML = '<i class="ph ph-trash"></i>';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (currentLibraryTab === 'bookmarks') {
        libraryData.bookmarks = await window.api.deleteBookmark(index);
        updateBookmarkStar(addressBar.value);
      } else {
        libraryData.history = await window.api.deleteHistoryItem(index);
      }
      renderLibrary();
    });

    itemEl.appendChild(content);
    itemEl.appendChild(delBtn);
    libraryList.appendChild(itemEl);
  });
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    window.api.openPalette();
  }
});

// Sync Logic
const btnSync = document.getElementById('btn-sync');

btnSync.addEventListener('click', () => {
  window.api.openSync();
});



window.api.onSyncPulled((data) => {
  if (data.bookmarks) libraryData.bookmarks = data.bookmarks;
  if (data.history) libraryData.history = data.history;
  renderLibrary();
  updateBookmarkStar(addressBar.value);
});

// Downloads Logic
const btnDownloads = document.getElementById('btn-downloads');

btnDownloads.addEventListener('click', () => {
  window.api.openDownloads();
});

// Settings Logic
const btnSettings = document.getElementById('btn-settings');
const settingsOverlay = document.getElementById('settings-overlay');
const btnCloseSettings = document.getElementById('btn-close-settings');
const searchEngineSelect = document.getElementById('search-engine-select');
const syncUrlInput = document.getElementById('sync-url-input');
const hwAccelCheck = document.getElementById('hw-accel-check');
const btnSaveSettings = document.getElementById('btn-save-settings');

const recResSelect = document.getElementById('rec-res-select');
const recFpsSelect = document.getElementById('rec-fps-select');
const recBitrateSelect = document.getElementById('rec-bitrate-select');
const recAudioCheck = document.getElementById('rec-audio-check');

const sidebarPosSelect = document.getElementById('sidebar-pos-select');
const urlPosSelect = document.getElementById('url-pos-select');
const compactModeCheck = document.getElementById('compact-mode-check');
const modRoundedTabs = document.getElementById('mod-rounded-tabs');
const modHideNav = document.getElementById('mod-hide-nav');
const modHideLib = document.getElementById('mod-hide-lib');

const themeEditorOverlay = document.getElementById('theme-editor-overlay');
const btnCloseTheme = document.getElementById('btn-close-theme');
const btnSaveTheme = document.getElementById('btn-save-theme');
const themeBgMain = document.getElementById('theme-bg-main');
const themeBgDark = document.getElementById('theme-bg-dark');
const themeAccent = document.getElementById('theme-accent');

sidebarEl.addEventListener('mouseenter', () => {
  if (document.body.classList.contains('compact-mode')) window.api.sidebarHover(true);
});
sidebarEl.addEventListener('mouseleave', () => {
  if (document.body.classList.contains('compact-mode')) window.api.sidebarHover(false);
});

sidebarEl.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const settings = await window.api.getSettings();
  const colors = settings.themeColors || { bgMain: 'rgba(30, 30, 30, 0.85)', bgDark: 'rgba(15, 15, 15, 0.85)', accent: '#3b82f6' };
  themeBgMain.value = colors.bgMain;
  themeBgDark.value = colors.bgDark;
  themeAccent.value = colors.accent;
  
  themeEditorOverlay.classList.remove('hidden');
  window.api.modalOpened();
});

btnCloseTheme.addEventListener('click', () => {
  themeEditorOverlay.classList.add('hidden');
  window.api.modalClosed();
});

btnSaveTheme.addEventListener('click', async () => {
  const colors = { bgMain: themeBgMain.value, bgDark: themeBgDark.value, accent: themeAccent.value };
  const settings = await window.api.updateSetting('themeColors', colors);
  applyZenSettings(settings);
  themeEditorOverlay.classList.add('hidden');
  window.api.modalClosed();
});

btnSettings.addEventListener('click', async () => {
  window.api.modalOpened();
  const settings = await window.api.getSettings();
  searchEngineSelect.value = settings.searchEngine || 'google';
  syncUrlInput.value = settings.syncServerUrl || 'http://13.233.208.184';
  hwAccelCheck.checked = settings.useHardwareAcceleration !== false;
  sidebarPosSelect.value = settings.sidebarPos || 'left';
  urlPosSelect.value = settings.urlBarPos || 'top';
  compactModeCheck.checked = settings.compactMode || false;
  if (settings.mods) {
    modRoundedTabs.checked = settings.mods.roundedTabs || false;
    modHideNav.checked = settings.mods.hideNav || false;
    modHideLib.checked = settings.mods.hideLib || false;
  }
  const recSet = settings.recording || {};
  recResSelect.value = recSet.resolution || '1080';
  recFpsSelect.value = recSet.fps || '60';
  recBitrateSelect.value = recSet.bitrate || '10000000';
  recAudioCheck.checked = recSet.audio !== false; // true by default
  settingsOverlay.classList.remove('hidden');
});

btnCloseSettings.addEventListener('click', () => {
  settingsOverlay.classList.add('hidden');
  window.api.modalClosed();
});

btnSaveSettings.addEventListener('click', async () => {
  await window.api.updateSetting('searchEngine', searchEngineSelect.value);
  if (syncUrlInput.value) {
    await window.api.updateSetting('syncServerUrl', syncUrlInput.value);
  }
  await window.api.updateSetting('useHardwareAcceleration', hwAccelCheck.checked);
  await window.api.updateSetting('recording', {
    resolution: recResSelect.value,
    fps: recFpsSelect.value,
    bitrate: recBitrateSelect.value,
    audio: recAudioCheck.checked
  });
  settingsOverlay.classList.add('hidden');
  window.api.modalClosed();
});

[sidebarPosSelect, urlPosSelect].forEach(el => {
  el.addEventListener('change', async () => {
    const key = el.id === 'sidebar-pos-select' ? 'sidebarPos' : 'urlBarPos';
    const settings = await window.api.updateSetting(key, el.value);
    applyZenSettings(settings);
  });
});

compactModeCheck.addEventListener('change', async () => {
  const settings = await window.api.updateSetting('compactMode', compactModeCheck.checked);
  applyZenSettings(settings);
});

[modRoundedTabs, modHideNav, modHideLib].forEach(el => {
  el.addEventListener('change', async () => {
    const settings = await window.api.getSettings();
    settings.mods = settings.mods || {};
    if (el.id === 'mod-rounded-tabs') settings.mods.roundedTabs = el.checked;
    if (el.id === 'mod-hide-nav') settings.mods.hideNav = el.checked;
    if (el.id === 'mod-hide-lib') settings.mods.hideLib = el.checked;
    const newSet = await window.api.updateSetting('mods', settings.mods);
    applyZenSettings(newSet);
  });
});

searchEngineSelect.addEventListener('change', async (e) => {
  await window.api.updateSetting('searchEngine', e.target.value);
});

// Vault Logic
const vaultOverlay = document.getElementById('vault-overlay');
const btnCloseVault = document.getElementById('btn-close-vault');
const vaultLogin = document.getElementById('vault-login');
const vaultContent = document.getElementById('vault-content');
const btnUnlockVault = document.getElementById('btn-unlock-vault');
const vaultMasterPwd = document.getElementById('vault-master-pwd');
const vaultError = document.getElementById('vault-error');
const vaultList = document.getElementById('vault-list');

let decryptedVault = [];
let currentMasterPassword = '';

function openVault() {
  vaultOverlay.classList.remove('hidden');
  document.getElementById('command-palette-overlay').classList.add('hidden');
}

window.api.onOpenVault(() => {
  window.api.modalOpened();
  vaultLogin.classList.remove('hidden');
  vaultContent.classList.add('hidden');
  vaultOverlay.classList.remove('hidden');
  vaultMasterPwd.value = '';
  vaultError.style.display = 'none';
  decryptedVault = [];
});

btnCloseVault.addEventListener('click', () => {
  vaultOverlay.classList.add('hidden');
  vaultLogin.classList.remove('hidden');
  vaultContent.classList.add('hidden');
  vaultMasterPwd.value = '';
  currentMasterPassword = '';
  decryptedVault = [];
  window.api.modalClosed();
});

btnUnlockVault.addEventListener('click', async () => {
  const pwd = vaultMasterPwd.value;
  if (!pwd) return;
  const res = await window.api.vaultUnlock(pwd);
  if (res.success) {
    currentMasterPassword = pwd;
    decryptedVault = res.data;
    vaultError.style.display = 'none';
    vaultLogin.classList.add('hidden');
    vaultContent.classList.remove('hidden');
    renderVault();
  } else {
    vaultError.style.display = 'block';
  }
});

function renderVault() {
  vaultList.innerHTML = '';
  decryptedVault.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'vault-pwd-item';
    const textContainer = document.createElement('div');
    const siteStrong = document.createElement('strong');
    siteStrong.textContent = item.site;
    const br = document.createElement('br');
    const userSmall = document.createElement('small');
    userSmall.textContent = item.username;
    textContainer.appendChild(siteStrong);
    textContainer.appendChild(br);
    textContainer.appendChild(userSmall);

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'pwd-actions';

    const copyBtn = document.createElement('button');
    copyBtn.title = 'Copy Password';
    copyBtn.innerHTML = '<i class="ph ph-copy"></i>';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(item.password);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'del-pwd';
    delBtn.title = 'Delete';
    delBtn.innerHTML = '<i class="ph ph-trash"></i>';
    delBtn.addEventListener('click', async () => {
      decryptedVault.splice(index, 1);
      await window.api.vaultSave(decryptedVault, currentMasterPassword);
      renderVault();
    });

    actionsContainer.appendChild(copyBtn);
    actionsContainer.appendChild(delBtn);

    el.appendChild(textContainer);
    el.appendChild(actionsContainer);

    vaultList.appendChild(el);
  });
}

document.getElementById('btn-add-pwd').addEventListener('click', async () => {
  const site = document.getElementById('vault-site-input').value;
  const username = document.getElementById('vault-user-input').value;
  const password = document.getElementById('vault-pwd-input').value;
  if (!site || !username || !password) return;
  
  decryptedVault.push({ site, username, password });
  await window.api.vaultSave(decryptedVault, currentMasterPassword);
  
  document.getElementById('vault-site-input').value = '';
  document.getElementById('vault-user-input').value = '';
  document.getElementById('vault-pwd-input').value = '';
  renderVault();
});

// Screen Recording Logic
const btnRecord = document.getElementById('btn-record');
let mediaRecorder = null;
let recordedChunks = [];

if (btnRecord) {
  btnRecord.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      btnRecord.classList.remove('recording');
      btnRecord.title = "Record Browser";
    } else {
      try {
        const sourceId = await window.api.getWindowSourceId();
        if (!sourceId) throw new Error("Could not get window source ID");
        
        const settings = await window.api.getSettings();
        const recSet = settings.recording || { resolution: '1080', fps: '60', bitrate: '10000000', audio: true };
        const maxDim = recSet.resolution === '2160' ? 2160 : (recSet.resolution === '1440' ? 1440 : 1080);
        const maxWidth = recSet.resolution === '2160' ? 3840 : (recSet.resolution === '1440' ? 2560 : 1920);
        const maxFps = parseInt(recSet.fps, 10);
        const bitrate = parseInt(recSet.bitrate, 10);
        
        const audioConstraint = recSet.audio ? { mandatory: { chromeMediaSource: 'desktop' } } : false;
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraint,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              minWidth: 1280,
              maxWidth: maxWidth,
              minHeight: 720,
              maxHeight: maxDim,
              maxFrameRate: maxFps
            }
          }
        });
        
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: bitrate });
        
        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) recordedChunks.push(e.data);
        };
        
        mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(track => track.stop());
          const blob = new Blob(recordedChunks, { type: 'video/webm; codecs=vp9' });
          const arrayBuffer = await blob.arrayBuffer();
          const res = await window.api.saveRecording(arrayBuffer);
          if (res && res.success) {
            console.log('Saved to', res.filePath);
          }
        };
        
        mediaRecorder.start(1000);
        btnRecord.classList.add('recording');
        btnRecord.title = "Stop Recording";
      } catch (err) {
        console.error("Recording failed:", err);
        if (window.api.logError) window.api.logError("Recording failed: " + err.message);
      }
    }
  });
}

// Auto Update Logic
const updatePanel = document.getElementById('update-panel');
const updateTextContainer = document.getElementById('update-text-container');
const updateActionsContainer = document.getElementById('update-actions-container');

if (window.api.onUpdateAvailable) {
  window.api.onUpdateAvailable((version) => {
    updateTextContainer.innerHTML = `
      <strong>Update Available</strong>
      <p>Version ${version} is available. Do you want to download it?</p>
    `;
    updateActionsContainer.innerHTML = `
      <button id="btn-update-dismiss" class="btn-secondary">Later</button>
      <button id="btn-update-download" class="btn-primary">Download</button>
    `;
    
    document.getElementById('btn-update-dismiss').addEventListener('click', () => {
      updatePanel.classList.add('hidden');
    });
    
    document.getElementById('btn-update-download').addEventListener('click', () => {
      updateTextContainer.innerHTML = `
        <strong>Downloading Update</strong>
        <p>Please wait, downloading in background...</p>
      `;
      updateActionsContainer.innerHTML = ``;
      window.api.downloadUpdate();
    });

    updatePanel.classList.remove('hidden');
  });
}

if (window.api.onUpdateReady) {
  window.api.onUpdateReady(() => {
    updateTextContainer.innerHTML = `
      <strong>Update Ready</strong>
      <p>A new version of Bodhi Sync is ready to install.</p>
    `;
    updateActionsContainer.innerHTML = `
      <button id="btn-update-later" class="btn-secondary">Later</button>
      <button id="btn-update-install" class="btn-primary">Restart & Update</button>
    `;
    
    document.getElementById('btn-update-later').addEventListener('click', () => {
      updatePanel.classList.add('hidden');
    });
    
    document.getElementById('btn-update-install').addEventListener('click', () => {
      window.api.installUpdate();
    });

    updatePanel.classList.remove('hidden');
  });
}

// Shield UI Logic
const btnShield = document.getElementById('btn-shield');
const shieldBadge = document.getElementById('shield-badge');
const shieldPanel = document.getElementById('shield-panel');
const shieldTotalCount = document.getElementById('shield-total-count');

if (window.api.onAdBlocked) {
  window.api.onAdBlocked((count) => {
    shieldBadge.style.display = 'block';
    shieldBadge.innerText = count > 99 ? '99+' : count;
    if (shieldTotalCount) shieldTotalCount.innerText = count.toLocaleString();
  });
}

if (btnShield) {
  btnShield.addEventListener('click', (e) => {
    e.stopPropagation();
    if (shieldPanel) shieldPanel.classList.toggle('hidden');
  });
}

document.addEventListener('click', (e) => {
  if (shieldPanel && !shieldPanel.classList.contains('hidden') && !shieldPanel.contains(e.target) && btnShield && !btnShield.contains(e.target)) {
    shieldPanel.classList.add('hidden');
  }
});
