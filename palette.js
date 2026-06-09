const paletteInput = document.getElementById('palette-input');
const paletteResults = document.getElementById('palette-results');
let paletteItems = [];
let selectedPaletteIndex = 0;
let currentData = { tabs: [], bookmarks: [], history: [] };

function renderPaletteResults(query) {
  paletteResults.innerHTML = '';
  paletteItems = [];
  selectedPaletteIndex = 0;
  
  query = query.toLowerCase().trim();

  if (query) {
    paletteItems.push({
      type: 'Search',
      title: `Search for "${query}"`,
      desc: 'Web Search',
      action: { type: 'navigate', url: query }
    });
  }

  currentData.tabs.forEach(tab => {
    if (!query || tab.title.toLowerCase().includes(query)) {
      paletteItems.push({
        type: 'Tab',
        title: tab.title,
        desc: 'Switch to Open Tab',
        action: { type: 'switch-tab', id: tab.id }
      });
    }
  });

  currentData.bookmarks.forEach(b => {
    if (!query || b.title.toLowerCase().includes(query) || b.url.toLowerCase().includes(query)) {
      paletteItems.push({
        type: 'Bookmark',
        title: b.title,
        desc: b.url,
        action: { type: 'navigate', url: b.url }
      });
    }
  });

  let historyAdded = 0;
  for (const h of currentData.history) {
    if (historyAdded >= 20) break;
    if (!query || h.title.toLowerCase().includes(query) || h.url.toLowerCase().includes(query)) {
      paletteItems.push({
        type: 'History',
        title: h.title,
        desc: h.url,
        action: { type: 'navigate', url: h.url }
      });
      historyAdded++;
    }
  }

  paletteItems.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = `palette-item ${index === 0 ? 'selected' : ''}`;
    const titleEl = document.createElement('div');
    titleEl.className = 'palette-item-title';
    titleEl.textContent = item.title;
    
    const descEl = document.createElement('div');
    descEl.className = 'palette-item-desc';
    descEl.textContent = item.desc;
    
    const typeEl = document.createElement('div');
    typeEl.className = 'palette-item-type';
    typeEl.textContent = item.type;
    
    el.appendChild(titleEl);
    el.appendChild(descEl);
    el.appendChild(typeEl);
    el.addEventListener('click', () => {
      window.api.sendAction(item.action);
    });
    paletteResults.appendChild(el);
  });
}

function updatePaletteSelection() {
  const items = paletteResults.querySelectorAll('.palette-item');
  items.forEach((item, index) => {
    if (index === selectedPaletteIndex) {
      item.classList.add('selected');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

window.api.onPaletteData((data) => {
  currentData = data;
  paletteInput.value = '';
  paletteInput.focus();
  renderPaletteResults('');
});

paletteInput.addEventListener('input', (e) => renderPaletteResults(e.target.value));

paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedPaletteIndex < paletteItems.length - 1) {
      selectedPaletteIndex++;
      updatePaletteSelection();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedPaletteIndex > 0) {
      selectedPaletteIndex--;
      updatePaletteSelection();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (paletteItems[selectedPaletteIndex]) {
      window.api.sendAction(paletteItems[selectedPaletteIndex].action);
    }
  } else if (e.key === 'Escape') {
    window.api.close();
  }
});

// Hide palette if it loses focus
window.addEventListener('blur', () => {
  window.api.close();
});
