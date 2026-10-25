// Renders build/icon.svg to build/icon.png (1024², transparent margin) with Electron's own
// Chromium, so no image tooling is needed. electron-builder turns icon.png into .ico/.icns.
// Run: npm run icon -w @dnd/desktop
const { app, BrowserWindow } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const dir = join(__dirname, '..', 'build');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 300));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  writeFileSync(join(dir, 'icon.png'), image.resize({ width: 1024, height: 1024 }).toPNG());
  console.log('wrote build/icon.png');
  app.quit();
});
