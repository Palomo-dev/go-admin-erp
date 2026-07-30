import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { UPDATE_CHECK_INTERVAL_MS } from './constants';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'none' }
  | { status: 'error'; message: string };

let state: UpdateState = { status: 'idle' };
let timer: NodeJS.Timeout | null = null;

export function getUpdateState(): UpdateState {
  return state;
}

function setState(next: UpdateState, win: BrowserWindow | null): void {
  state = next;
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:state', next);
  }
}

export function initUpdater(win: BrowserWindow | null): void {
  if (!app.isPackaged) {
    console.log('[updater] Desactivado en desarrollo (app sin empaquetar)');
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }, win));

  autoUpdater.on('update-available', (info) => {
    setState({ status: 'available', version: info.version }, win);
    autoUpdater.downloadUpdate().catch((err) => {
      setState({ status: 'error', message: String(err?.message || err) }, win);
    });
  });

  autoUpdater.on('update-not-available', () => setState({ status: 'none' }, win));

  autoUpdater.on('download-progress', (progress) => {
    setState({ status: 'downloading', percent: Math.round(progress.percent) }, win);
  });

  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'downloaded', version: info.version }, win);
  });

  autoUpdater.on('error', (err) => {
    setState({ status: 'error', message: String(err?.message || err) }, win);
  });

  void checkForUpdates();

  timer = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return state;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    setState({ status: 'error', message: String(err?.message || err) }, null);
  }
  return state;
}

export function installUpdate(): void {
  if (state.status !== 'downloaded') return;
  setImmediate(() => autoUpdater.quitAndInstall());
}

export function stopUpdater(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
