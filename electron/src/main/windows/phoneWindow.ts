import { BrowserWindow } from 'electron';
import { getLoadUrl, getMainWindow, getWebContents, isInternalUrl } from './mainWindow';
import { getWindowIcon } from '../icon';
import path from 'node:path';
import { PHONE_PATH } from '../../shared/phoneProtocol';

let phoneWindow: BrowserWindow | null = null;
export function getPhoneWindow() { return phoneWindow?.isDestroyed() ? null : phoneWindow; }
export function closePhoneWindow() { getPhoneWindow()?.close(); }
/** Espejo sin Device ni acceso a APIs de impresión, sesión o secretos del agente. */
export async function openPhoneWindow(): Promise<boolean> {
  const owner = getWebContents();
  if (!owner || owner.isDestroyed() || !isInternalUrl(owner.getURL(), getLoadUrl())) return false;
  const existing = getPhoneWindow();
  if (existing) { existing.show(); existing.focus(); return true; }
  const origin = new URL(owner.getURL()).origin;
  const win = new BrowserWindow({
    width: 380, height: 640, minWidth: 340, minHeight: 460, maxWidth: 520,
    title: 'GO Admin · Teléfono', icon: getWindowIcon(), show: false, frame: false,
    webPreferences: {
      preload: path.join(__dirname, '../../preload/phone.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      session: owner.session,
    },
  });
  phoneWindow = win;
  const expected = origin + PHONE_PATH;
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => { if (url !== expected) event.preventDefault(); });
  win.webContents.on('will-redirect', (event, url) => { if (url !== expected) event.preventDefault(); });
  const main = getMainWindow();
  const ownerClosed = () => { if (!win.isDestroyed()) win.close(); };
  win.on('closed', () => { main?.removeListener('closed', ownerClosed); if (phoneWindow === win) phoneWindow = null; });
  win.once('ready-to-show', () => win.show());
  main?.once('closed', ownerClosed);
  try { await win.loadURL(expected); return true; }
  catch { if (!win.isDestroyed()) win.close(); return false; }
}
