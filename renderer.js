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
  addressBar.value = url;
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
    if (tab.url && !tab.url.startsWith('chrome://')) {
      const urlObj = new URL(tab.url);
      iconEl.src = `https://s2.googleusercontent.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } else {
      iconEl.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>';
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
const downloadsPanel = document.getElementById('downloads-panel');
const downloadsList = document.getElementById('downloads-list');
let downloads = new Map();

btnDownloads.addEventListener('click', () => {
  downloadsPanel.classList.toggle('hidden');
});

function renderDownloads() {
  downloadsList.innerHTML = '';
  downloads.forEach((dl, id) => {
    const el = document.createElement('div');
    el.className = 'download-item';
    
    const pct = dl.totalBytes ? Math.round((dl.receivedBytes / dl.totalBytes) * 100) : 0;
    
    let statusText = dl.state === 'progressing' ? `${pct}%` : dl.state;
    if (dl.state === 'completed') statusText = 'Done';
    
    el.innerHTML = `
      <div class="dl-filename">${dl.filename}</div>
      <div class="dl-progress-bar">
        <div class="dl-progress-fill" style="width: ${dl.state === 'completed' ? 100 : pct}%; background: ${dl.state === 'interrupted' ? '#ff4d4d' : '#00ff64'}"></div>
      </div>
      <div class="dl-status">
        <span>${(dl.receivedBytes / 1024 / 1024).toFixed(1)} MB / ${(dl.totalBytes / 1024 / 1024).toFixed(1)} MB</span>
        <span style="color: ${dl.state === 'completed' ? '#00ff64' : 'inherit'}">${statusText}</span>
      </div>
    `;
    downloadsList.appendChild(el);
  });
}

window.api.onDownloadStarted((info) => {
  downloadsPanel.classList.remove('hidden');
  downloads.set(info.filename, { ...info, receivedBytes: 0 });
  renderDownloads();
});

window.api.onDownloadProgress((info) => {
  if (downloads.has(info.filename)) {
    const dl = downloads.get(info.filename);
    dl.receivedBytes = info.receivedBytes;
    dl.totalBytes = info.totalBytes;
    dl.state = 'progressing';
    renderDownloads();
  }
});

window.api.onDownloadDone((info) => {
  if (downloads.has(info.filename)) {
    const dl = downloads.get(info.filename);
    dl.state = info.state;
    renderDownloads();
  }
});

window.api.onDownloadInterrupted((filename) => {
  if (downloads.has(filename)) {
    downloads.get(filename).state = 'interrupted';
    renderDownloads();
  }
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
  openVault();
});

btnCloseVault.addEventListener('click', () => {
  vaultOverlay.classList.add('hidden');
  vaultLogin.classList.remove('hidden');
  vaultContent.classList.add('hidden');
  vaultMasterPwd.value = '';
  currentMasterPassword = '';
  decryptedVault = [];
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
    el.innerHTML = `
      <div>
        <strong>${item.site}</strong><br>
        <small>${item.username}</small>
      </div>
      <div class="pwd-actions">
        <button onclick="navigator.clipboard.writeText('${item.password}')" title="Copy Password"><i class="ph ph-copy"></i></button>
        <button class="del-pwd" data-index="${index}" title="Delete"><i class="ph ph-trash"></i></button>
      </div>
    `;
    vaultList.appendChild(el);
  });
  
  document.querySelectorAll('.del-pwd').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const index = e.currentTarget.getAttribute('data-index');
      decryptedVault.splice(index, 1);
      await window.api.vaultSave(decryptedVault, currentMasterPassword);
      renderVault();
    });
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
