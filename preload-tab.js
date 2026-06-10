const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('bodhiApi', {
  getSearchUrl: (query) => ipcRenderer.invoke('get-search-url', query),
  getSettings: () => ipcRenderer.invoke('get-settings')
});

// Spoof navigator.brave to trick Brave Search into thinking this is the Brave Browser
// This hides the 'Enjoying private search? Download Brave' banner natively.
try {
  webFrame.executeJavaScript(`
    if (!navigator.brave) {
      navigator.brave = {
        isBrave: () => Promise.resolve(true)
      };
    }
  `);
} catch(e) {}
