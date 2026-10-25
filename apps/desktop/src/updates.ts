import { app, dialog, shell } from 'electron';
import { autoUpdater, type UpdateInfo } from 'electron-updater';

/**
 * Self-update from GitHub Releases (ADR 0008). Windows downloads in the background and offers
 * a restart. macOS can't self-install unsigned apps (Squirrel.Mac requires a signature), so
 * there we only point at the download.
 */

export const RELEASES_URL = 'https://github.com/mikennel/dnd-initiative-tracker/releases/latest';
const CHECK_EVERY_MS = 4 * 3600_000;
const canInstall = process.platform !== 'darwin';
let offeredVersion: string | null = null;

export function initUpdates() {
  if (!app.isPackaged) return;
  // Local testing: point at a folder of build output served over HTTP (docs/dev-guide.md).
  if (process.env.DND_UPDATE_URL) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.DND_UPDATE_URL });
  autoUpdater.logger = null;
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: `Version ${info.version} is ready to install`,
      detail: 'Restart the tracker to update. Combats are saved, so nothing is lost. If you choose Later, it installs the next time you quit.',
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });
  if (!canInstall) autoUpdater.on('update-available', (info) => void offerDownload(info));

  void autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => void autoUpdater.checkForUpdates().catch(() => {}), CHECK_EVERY_MS);
}

/** Help → Check for Updates…: same check, but always tell the user the outcome. */
export async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    await dialog.showMessageBox({ message: 'Updates are only available in the installed app.' });
    return;
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.isUpdateAvailable) {
      await dialog.showMessageBox({ message: `You're up to date (version ${app.getVersion()}).` });
    } else if (canInstall) {
      await dialog.showMessageBox({ message: `Downloading version ${result.updateInfo.version}…`, detail: "You'll be asked to restart when it's ready." });
    }
  } catch (err) {
    await dialog.showMessageBox({ type: 'warning', message: 'Could not check for updates.', detail: String((err as Error)?.message ?? err) });
  }
}

async function offerDownload(info: UpdateInfo) {
  if (offeredVersion === info.version) return;
  offeredVersion = info.version;
  const { response } = await dialog.showMessageBox({
    type: 'info',
    buttons: ['Download', 'Later'],
    defaultId: 0,
    cancelId: 1,
    message: `Version ${info.version} is available`,
    detail: 'Download the new .dmg and drag the app into Applications to replace this one. Your combats are kept.',
  });
  if (response === 0) void shell.openExternal(RELEASES_URL);
}
