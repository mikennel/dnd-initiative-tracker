import { app, BrowserWindow, clipboard, dialog, Menu, nativeImage, shell, Tray, type MenuItemConstructorOptions } from 'electron';
import { join } from 'node:path';
import { startServer, type RunningServer } from '@dnd/server/src/start.ts';
import { checkForUpdatesManually, initUpdates, RELEASES_URL } from './updates.ts';

/**
 * Desktop shell (ADR 0006): runs the same Fastify server as `npm start` inside Electron's
 * main process and shows the SPA in a window. Nothing here knows about combat or DDB.
 */

let server: RunningServer | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
/** The Hooded DM icon (build/icon.png, packaged inside the app) for the window, dock and tray. */
const iconPath = join(app.getAppPath(), 'build', 'icon.png');
/**
 * `npm run dev:desktop`: the window loads the Vite dev server (hot reload) and the API comes
 * from `npm run dev`'s server, so the app doesn't start its own.
 */
const devUrl = process.env.DND_DEV_URL;
let appOrigin = '';

// Dev runs get their own profile, so they neither block an installed copy (single-instance
// lock) nor share its cache.
if (devUrl) app.setPath('userData', join(app.getPath('appData'), 'DnD Initiative Tracker (dev)'));

const dataDir = process.env.DATA_DIR ?? join(app.getPath('userData'), 'data');
const staticDir = app.isPackaged ? join(process.resourcesPath, 'web') : join(app.getAppPath(), '../web/dist');
const extensionDir = app.isPackaged ? join(process.resourcesPath, 'extension') : join(app.getAppPath(), '../extension');

if (process.platform === 'win32') app.setAppUserModelId('com.mikennel.dnd-initiative-tracker');

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
  if (devUrl) {
    appOrigin = new URL(devUrl).origin;
  } else {
    server = await startServer({ dataDir, staticDir, port: Number(process.env.PORT ?? 5175), portFallbacks: 10 });
    appOrigin = `http://localhost:${server.port}`;
  }
  Menu.setApplicationMenu(buildMenu());
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(iconPath);
  createTray();
  openMainWindow();
  initUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow();
  });
}

function fail(err: unknown) {
  dialog.showErrorBox('DnD Initiative Tracker could not start', String((err as Error)?.stack ?? err));
  app.quit();
}

const origin = () => appOrigin;

function openMainWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 500,
    title: 'DnD Initiative Tracker',
    icon: iconPath,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => (win = null));
  routeLinks(win);
  // In dev, Vite may still be starting: retry until it answers.
  if (devUrl) win.webContents.on('did-fail-load', (_e, code) => code !== -3 && setTimeout(() => void win?.loadURL(`${origin()}/`), 1000));
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

function showMainWindow() {
  if (!win) return openMainWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Tray icon: shows the tracker is running (it serves the table view) and offers quick links. */
function createTray() {
  const size = process.platform === 'darwin' ? 18 : 32;
  tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: size, height: size, quality: 'best' }));
  tray.setToolTip('DnD Initiative Tracker');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Tracker', click: showMainWindow },
      { label: 'Open Table View in Browser', click: () => void shell.openExternal(`${origin()}/table`) },
      { label: 'Copy Table Link for Other Devices', click: () => clipboard.writeText(`${server?.ctx.lanUrls[0] ?? origin()}/table`) },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ]),
  );
  if (process.platform !== 'darwin') tray.on('click', showMainWindow);
}

function buildMenu(): Menu {
  const tableUrl = () => `${server?.ctx.lanUrls[0] ?? origin()}/table`;
  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      { label: 'Open Table View in Browser', click: () => void shell.openExternal(`${origin()}/table`) },
      { label: 'Copy Table Link for Other Devices', click: () => clipboard.writeText(tableUrl()) },
      { type: 'separator' },
      { label: 'Open Data Folder', click: () => void shell.openPath(devUrl ? join(app.getAppPath(), '../server/data') : dataDir) },
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
    {
      role: 'help',
      submenu: [
        { label: 'Check for Updates…', click: () => void checkForUpdatesManually() },
        { label: 'Release Notes', click: () => void shell.openExternal(RELEASES_URL) },
        { type: 'separator' },
        { label: `Version ${app.getVersion()}`, enabled: false },
      ],
    },
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
