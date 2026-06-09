const { contextBridge, webFrame } = require('electron');

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
