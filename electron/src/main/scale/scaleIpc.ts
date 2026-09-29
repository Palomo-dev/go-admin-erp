import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { getLoadUrl, isInternalUrl } from '../windows/mainWindow';
import { parseOpenConfig, parseWriteBytes, scaleManager, type ScaleState } from './scaleManager';

/**
 * IPC de la báscula (`window.goAdminDesktop.scale`, contrato en
 * docs/design/PRODUCTOS-POR-PESO-BASCULA.md §4 y src/lib/utils/desktop.ts).
 *
 * invoke: scale:list-ports · scale:open · scale:close · scale:status · scale:write
 * eventos (main → renderer, solo al webContents que abrió): scale:data · scale:state
 *
 * ORIGEN: como posDisplayIpc.ts, solo atiende a la web interna (el Next
 * embebido, app.goadmin.io o localhost en desarrollo), comprobado con
 * `isInternalUrl` sobre la URL del remitente en CADA llamada. Una página
 * externa que llegara a abrirse en una ventana con el preload no puede listar
 * puertos ni leer la báscula. La política de dispositivos
 * (`setDevicePermissionHandler(() => false)`, permissions.ts) no cambia: dentro
 * del Desktop no se usa Web Serial.
 */

function origenInterno(event: IpcMainInvokeEvent): boolean {
  try {
    const url = event.sender.getURL();
    if (!url) return false;
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return isInternalUrl(parsed.origin, getLoadUrl());
  } catch {
    return false;
  }
}

function rechazar(event: IpcMainInvokeEvent, canal: string): never {
  console.warn(`[scaleIpc] ${canal} rechazado desde webContents #${event.sender.id}: origen no interno`);
  throw new Error('origen no permitido');
}

export function registerScaleIpc(): void {
  ipcMain.handle('scale:list-ports', async (event) => {
    if (!origenInterno(event)) rechazar(event, 'scale:list-ports');
    return scaleManager.listPorts();
  });

  ipcMain.handle('scale:open', async (event, rawConfig: unknown): Promise<ScaleState> => {
    if (!origenInterno(event)) rechazar(event, 'scale:open');
    const config = parseOpenConfig(rawConfig);
    return scaleManager.open(config, event.sender);
  });

  ipcMain.handle('scale:close', async (event): Promise<ScaleState> => {
    if (!origenInterno(event)) rechazar(event, 'scale:close');
    return scaleManager.close();
  });

  ipcMain.handle('scale:status', (event): ScaleState => {
    if (!origenInterno(event)) rechazar(event, 'scale:status');
    return scaleManager.status();
  });

  ipcMain.handle('scale:write', async (event, rawBytes: unknown): Promise<void> => {
    if (!origenInterno(event)) rechazar(event, 'scale:write');
    await scaleManager.write(parseWriteBytes(rawBytes), event.sender);
  });
}

/** Al salir de la app: soltar el puerto para que otra aplicación pueda usarlo. */
export async function shutdownScale(): Promise<void> {
  try {
    await scaleManager.close();
  } catch (err) {
    console.warn('[scale] Error cerrando la báscula al salir:', err);
  }
}
