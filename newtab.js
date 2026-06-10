document.addEventListener('DOMContentLoaded', () => {
  
  // --- Ethereal Glow Mouse Effect ---
  const glowCards = document.querySelectorAll('.glow-card');
  
  document.addEventListener('mousemove', (e) => {
    for (const card of glowCards) {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    }
  });

  // --- Clock & Date ---
  const clockElement = document.getElementById('clock');
  const dateElement = document.getElementById('current-date');
  const greetingElement = document.getElementById('greeting-text');
  
  function updateTime() {
    const now = new Date();
    
    let hours = now.getHours();
    let minutes = now.getMinutes();
    
    let greeting = 'Good evening.';
    if (hours >= 5 && hours < 12) greeting = 'Good morning.';
    else if (hours >= 12 && hours < 17) greeting = 'Good afternoon.';
    
    if(greetingElement.textContent !== greeting) {
        greetingElement.textContent = greeting;
    }
    
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    
    clockElement.textContent = `${hours}:${minutes}`;
    
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    const dateString = now.toLocaleDateString('en-US', options).toUpperCase();
    if(dateElement.textContent !== dateString) {
        dateElement.textContent = dateString;
    }
  }

  setInterval(updateTime, 1000);
  updateTime();

  // --- Search ---
  const searchInput = document.getElementById('search-input');
  const suggestionsList = document.getElementById('search-suggestions');
  let debounceTimeout = null;
  let currentSuggestions = [];
  let selectedIndex = -1;

  async function performSearch(query) {
    if (!query) return;
    if (window.bodhiApi && window.bodhiApi.getSearchUrl) {
      const targetUrl = await window.bodhiApi.getSearchUrl(query);
      window.location.href = targetUrl;
    } else {
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
  }

  function renderSuggestions() {
    if (currentSuggestions.length === 0) {
      if (suggestionsList) suggestionsList.classList.add('hidden');
      return;
    }
    if (suggestionsList) {
      suggestionsList.classList.remove('hidden');
      suggestionsList.innerHTML = currentSuggestions.slice(0, 5).map((s, i) => `
        <div class="suggestion-item ${i === selectedIndex ? 'selected' : ''}" data-index="${i}">
          <i class="ph ph-magnifying-glass"></i>
          <span>${s}</span>
        </div>
      `).join('');

      document.querySelectorAll('.suggestion-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.getAttribute('data-index'));
          performSearch(currentSuggestions[idx]);
        });
        item.addEventListener('mouseenter', () => {
          selectedIndex = parseInt(item.getAttribute('data-index'));
          renderSuggestions();
        });
      });
    }
  }

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (!query) {
      currentSuggestions = [];
      renderSuggestions();
      return;
    }
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        currentSuggestions = data[1] || [];
        selectedIndex = -1;
        renderSuggestions();
      } catch (e) {
        currentSuggestions = [];
        renderSuggestions();
      }
    }, 150);
  });

  searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (selectedIndex < Math.min(currentSuggestions.length, 5) - 1) {
        selectedIndex++;
        renderSuggestions();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedIndex > -1) {
        selectedIndex--;
        renderSuggestions();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex > -1 && currentSuggestions[selectedIndex]) {
        performSearch(currentSuggestions[selectedIndex]);
      } else {
        performSearch(searchInput.value.trim());
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-card') && suggestionsList) {
      suggestionsList.classList.add('hidden');
    }
  });

  // Add a subtle focus effect to the glow card containing the search
  const searchCard = document.querySelector('.search-card');
  searchInput.addEventListener('focus', () => {
    searchCard.style.borderColor = '#555';
    if (currentSuggestions.length > 0 && suggestionsList) {
      suggestionsList.classList.remove('hidden');
    }
  });
  searchInput.addEventListener('blur', () => {
    searchCard.style.borderColor = '';
  });

  // Make the Cmd+K badge clickable to focus the search input
  const kbdButton = document.querySelector('.kbd');
  if (kbdButton) {
    kbdButton.style.cursor = 'pointer';
    kbdButton.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent focus loss before focusing the input
      e.stopPropagation();
      window.focus(); // Force the BrowserView to grab OS focus
      setTimeout(() => {
        searchInput.focus();
      }, 10);
    });
  }

  // Bind the actual Ctrl+K / Cmd+K keyboard shortcut to focus the search
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); // Prevent default browser behavior
      searchInput.focus();
    }
  });

  // --- Data Population ---
  
  // Tasks
  let tasks = JSON.parse(localStorage.getItem('bodhi_tasks') || 'null');
  if (!tasks) {
    tasks = [
      { id: 1, text: 'Review V2 Design System Pull Request', done: true },
      { id: 2, text: 'Finalize quarterly engineering metrics', done: false },
    ];
  }
  const taskList = document.getElementById('task-container');
  const taskInput = document.getElementById('new-task-input');

  function renderTasks() {
    taskList.innerHTML = tasks.map(task => `
      <div class="task-item" data-id="${task.id}" style="${task.done ? 'opacity: 0.4;' : ''}">
        <div class="task-checkbox ${task.done ? 'checked' : ''}"></div>
        <span class="task-text" style="${task.done ? 'text-decoration: line-through;' : ''}">${task.text}</span>
      </div>
    `).join('');
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.task-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = parseInt(item.getAttribute('data-id'));
        const task = tasks.find(t => t.id === id);
        if (task) {
          task.done = !task.done;
          saveTasks();
        }
      });
    });
  }

  function saveTasks() {
    localStorage.setItem('bodhi_tasks', JSON.stringify(tasks));
    renderTasks();
  }

  renderTasks();

  if (taskInput) {
    taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && taskInput.value.trim()) {
        tasks.push({ id: Date.now(), text: taskInput.value.trim(), done: false });
        taskInput.value = '';
        saveTasks();
      }
    });
  }

  // Shortcuts
  const linksContainer = document.getElementById('links-container');
  async function loadShortcuts() {
    let favorites = [];
    try {
      if (window.bodhiApi && window.bodhiApi.getSettings) {
        const settings = await window.bodhiApi.getSettings();
        if (settings && settings.favorites) favorites = settings.favorites;
      }
    } catch(e) {}
    
    if (favorites.length === 0) {
      // Fallback defaults
      favorites = [
        { title: 'GitHub', url: 'https://github.com' },
        { title: 'Linear', url: 'https://linear.app' },
        { title: 'Vercel', url: 'https://vercel.com' },
        { title: 'Figma', url: 'https://figma.com' }
      ];
    }
    
    linksContainer.innerHTML = favorites.slice(0, 5).map(link => `
      <a href="${link.url}" class="link-item">
        <i class="ph ph-link link-icon"></i>
        <span>${link.title}</span>
      </a>
    `).join('');
  }
  loadShortcuts();

  // AI Copilot
  const aiPrompts = [
    'Summarize my pull requests from last week.',
    'Draft a release note for version 2.4.0.',
    'Analyze the recent spikes in error logs.'
  ];
  const aiContainer = document.getElementById('ai-container');
  aiContainer.innerHTML = aiPrompts.map(p => `
    <div class="ai-prompt">${p}</div>
  `).join('');

  document.querySelectorAll('.ai-prompt').forEach(promptEl => {
    promptEl.addEventListener('click', () => {
      if (searchInput) {
        searchInput.value = promptEl.textContent;
        searchInput.focus();
      }
    });
  });

  // Market
  const marketList = document.getElementById('market-container');
  async function loadMarket() {
    try {
      marketList.innerHTML = '<div style="color: #888; font-size: 0.8rem">Loading live data...</div>';
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
      const data = await res.json();
      
      const formatCurrency = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: val < 100 ? 2 : 0 }).format(val);
      
      const markets = [
        { symbol: 'BTC', price: formatCurrency(data.bitcoin.usd), up: data.bitcoin.usd_24h_change >= 0 },
        { symbol: 'ETH', price: formatCurrency(data.ethereum.usd), up: data.ethereum.usd_24h_change >= 0 },
        { symbol: 'SOL', price: formatCurrency(data.solana.usd), up: data.solana.usd_24h_change >= 0 }
      ];
      
      marketList.innerHTML = markets.map(m => `
        <div class="market-item" style="color: ${m.up ? '#fff' : '#888'}">
          <span class="market-symbol">${m.symbol}</span>
          <span class="market-price">${m.price}</span>
        </div>
      `).join('');
    } catch(e) {
      marketList.innerHTML = '<div style="color: #ff6b6b; font-size: 0.8rem">Failed to load market data</div>';
    }
  }
  loadMarket();
});
