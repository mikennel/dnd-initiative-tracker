import { app, BrowserWindow, clipboard, dialog, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { startServer, type RunningServer } from '@dnd/server/src/start.ts';

/**
 * Desktop shell (ADR 0006): runs the same Fastify server as `npm start` inside Electron's
 * main process and shows the SPA in a window. Nothing here knows about combat or DDB.
 */

let server: RunningServer | null = null;
let win: BrowserWindow | null = null;

const dataDir = process.env.DATA_DIR ?? join(app.getPath('userData'), 'data');
const staticDir = app.isPackaged ? join(process.resourcesPath, 'web') : join(app.getAppPath(), '../web/dist');
const extensionDir = app.isPackaged ? join(process.resourcesPath, 'extension') : join(app.getAppPath(), '../extension');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(boot, fail);
}

async function boot() {
  server = await startServer({ dataDir, staticDir, port: Number(process.env.PORT ?? 5175), portFallbacks: 10 });
  Menu.setApplicationMenu(buildMenu());
  openMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
  });
}

function fail(err: unknown) {
  dialog.showErrorBox('DnD Initiative Tracker could not start', String((err as Error)?.stack ?? err));
  app.quit();
}

const origin = () => `http://localhost:${server!.port}`;

function openMainWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'DnD Initiative Tracker',
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => (win = null));
  routeLinks(win);
  void win.loadURL(`${origin()}/`);
}

/**
 * The table view opens as a second app window (drag it to a TV). Everything else that leaves
 * the app, including "Connect with Chrome" on the Settings page, goes to the default browser.
 */
function routeLinks(w: BrowserWindow) {
  w.webContents.setWindowOpenHandler(({ url }) => {
    const u = new URL(url);
    if (u.origin === origin() && u.pathname.startsWith('/table')) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, width: 1200, height: 800 } };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== origin()) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function buildMenu(): Menu {
  const tableUrl = () => `${server!.ctx.lanUrls[0] ?? origin()}/table`;
  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'Open Table View in Browser', click: () => void shell.openExternal(`${origin()}/table`) },
      { label: 'Copy Table Link for Other Devices', click: () => clipboard.writeText(tableUrl()) },
      { type: 'separator' },
      { label: 'Open Data Folder', click: () => void shell.openPath(dataDir) },
      { label: 'Show Browser Extension Folder', click: () => void shell.openPath(extensionDir) },
      { type: 'separator' },
      process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
    ],
  };
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    file,
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];
  return Menu.buildFromTemplate(template);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let closing = false;
app.on('before-quit', (e) => {
  if (closing || !server) return;
  e.preventDefault();
  closing = true;
  void server.close().finally(() => app.quit());
});
