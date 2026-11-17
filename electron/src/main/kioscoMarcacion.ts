import { ipcMain, safeStorage, type IpcMainInvokeEvent } from 'electron';
import { loadConfig, saveConfig } from './store';
import { getLoadUrl, getMainWindow, isInternalUrl } from './windows/mainWindow';

/**
 * Modo lector de carnés de Marcación (plan de Marcación de GO Admin, fase M1).
 *
 * Un computador con GO Admin Escritorio y un lector USB de carnés (NFC de
 * 13,56 MHz o de código QR que «teclea») hace de punto de marcación: la web
 * `/marcacion/kiosco?modo=lector` escucha las lecturas del teclado y marca con la
 * clave propia del equipo, sin sesión de una persona.
 *
 * Aquí solo vive lo que la web no puede hacer bien sola:
 *  - guardar la clave del equipo cifrada con `safeStorage` (DPAPI en Windows,
 *    llavero en macOS) en lugar de `localStorage`;
 *  - abrir el modo lector en la ventana principal (menú «Aplicación» o la web).
 * Los canales solo responden a páginas de GO Admin (`isInternalUrl`).
 */

const CLAVE_RE = /^[0-9a-f]{64}$/;

function desdeGoAdmin(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? '';
  try {
    return isInternalUrl(url, getLoadUrl());
  } catch {
    return false;
  }
}

export function leerLlaveKiosco(): string | null {
  const cifrada = loadConfig().encryptedKioskKey;
  if (!cifrada || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const llave = safeStorage.decryptString(Buffer.from(cifrada, 'base64'));
    return CLAVE_RE.test(llave) ? llave : null;
  } catch {
    return null;
  }
}

export function guardarLlaveKiosco(llave: string): boolean {
  if (!CLAVE_RE.test(llave) || !safeStorage.isEncryptionAvailable()) return false;
  saveConfig({ encryptedKioskKey: safeStorage.encryptString(llave).toString('base64') });
  return true;
}

export function borrarLlaveKiosco(): boolean {
  saveConfig({ encryptedKioskKey: undefined });
  return true;
}

/** Lleva la ventana principal al modo lector de carnés. */
export function abrirModoLector(): void {
  const win = getMainWindow();
  if (!win) return;
  const base = getLoadUrl().replace(/\/+$/, '');
  void win.loadURL(`${base}/marcacion/kiosco?modo=lector`).catch(() => undefined);
  if (!win.isFullScreen()) win.setFullScreen(true);
}

export function registerKioscoIpc(): void {
  ipcMain.handle('kiosco:llave:leer', (e) => (desdeGoAdmin(e) ? leerLlaveKiosco() : null));
  ipcMain.handle('kiosco:llave:guardar', (e, llave: unknown) => (desdeGoAdmin(e) && typeof llave === 'string' ? guardarLlaveKiosco(llave) : false));
  ipcMain.handle('kiosco:llave:borrar', (e) => (desdeGoAdmin(e) ? borrarLlaveKiosco() : false));
  ipcMain.handle('kiosco:abrir', (e) => {
    if (!desdeGoAdmin(e)) return false;
    abrirModoLector();
    return true;
  });
}
