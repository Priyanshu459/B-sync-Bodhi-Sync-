const downloadsList = document.getElementById('downloads-list');
let downloads = new Map();

function renderDownloads() {
  if (downloads.size === 0) {
    downloadsList.innerHTML = `
      <div class="empty-state">
        <i class="ph ph-download-simple"></i><br>
        No recent downloads
      </div>`;
    return;
  }

  downloadsList.innerHTML = '';
  // Convert map to array and reverse to show newest first
  Array.from(downloads.values()).reverse().forEach((dl) => {
    const el = document.createElement('div');
    el.className = 'download-item';
    
    const pct = dl.totalBytes ? Math.round((dl.receivedBytes / dl.totalBytes) * 100) : 0;
    
    let statusText = dl.state === 'progressing' ? `${pct}%` : dl.state;
    if (dl.state === 'completed') statusText = 'Done';
    
    const filenameEl = document.createElement('div');
    filenameEl.className = 'dl-filename';
    filenameEl.title = dl.filename;
    filenameEl.textContent = dl.filename;

    const progressBarEl = document.createElement('div');
    progressBarEl.className = 'dl-progress-bar';
    const progressFillEl = document.createElement('div');
    progressFillEl.className = 'dl-progress-fill';
    progressFillEl.style.width = `${dl.state === 'completed' ? 100 : pct}%`;
    progressFillEl.style.background = dl.state === 'interrupted' ? '#ff4d4d' : '#00ff64';
    progressBarEl.appendChild(progressFillEl);

    const statusEl = document.createElement('div');
    statusEl.className = 'dl-status';
    const sizeSpan = document.createElement('span');
    sizeSpan.textContent = `${(dl.receivedBytes / 1024 / 1024).toFixed(1)} MB / ${(dl.totalBytes / 1024 / 1024).toFixed(1)} MB`;
    const statusSpan = document.createElement('span');
    statusSpan.style.color = dl.state === 'completed' ? '#00ff64' : 'inherit';
    statusSpan.textContent = statusText;
    statusEl.appendChild(sizeSpan);
    statusEl.appendChild(statusSpan);

    el.appendChild(filenameEl);
    el.appendChild(progressBarEl);
    el.appendChild(statusEl);
    downloadsList.appendChild(el);
  });
}

window.api.onDownloadStarted((info) => {
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
