const addressBar = document.getElementById('address-bar');
const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const btnSplit = document.getElementById('btn-split');
const btnMinimize = document.getElementById('btn-minimize');
const btnMaximize = document.getElementById('btn-maximize');
const btnClose = document.getElementById('btn-close');

const btnNewTab = document.getElementById('btn-new-tab');
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

function renderTabs() {
  tabsContainer.innerHTML = '';
  tabs.forEach((tab, id) => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab ${id === activeTabId ? 'active' : ''}`;
    
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
    content.innerHTML = `<div class="lib-title">${item.title}</div><div class="lib-url">${item.url}</div>`;
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
