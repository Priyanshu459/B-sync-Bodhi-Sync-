const { app, nativeImage } = require('electron');
const fs = require('fs');

app.whenReady().then(() => {
  try {
    const img = nativeImage.createFromPath('icon.png');
    const resized = img.resize({ width: 256, height: 256 });
    fs.writeFileSync('icon.png', resized.toPNG());
    console.log('Icon resized successfully to 256x256');
  } catch(e) {
    console.error(e);
  }
  app.quit();
});
