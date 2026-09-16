import { app, ipcMain, IpcMainInvokeEvent } from 'electron';
import {
  getMainWindow,
  getToolbarWebContents,
  getNavState,
  goBack,
  goForward,
  goHome,
  reloadCurrent,
} from './windows/mainWindow';
import { popupAppMenu } from './menu';
import { getUpdateState } from './updater';
import { isOnline, checkNow } from './connectivity';
import { getThemeColors } from './theme';

/**
 * IPC exclusivo de la barra de aplicación (renderer/toolbar).
 *
 * Todos los canales `toolbar:*` comprueban que el remitente sea el webContents
 * de la barra: la web (WebContentsView) no tiene `ipcRenderer` porque su
 * preload solo expone `window.goAdminDesktop`, pero la validación evita que
 * cualquier otro renderer futuro (ventanas de impresión, devtools) pueda
 * manejar la navegación o abrir el menú.
 *
 * Los canales compartidos con la web (`update:install`, `update:state`,
 * `connectivity:get`) los registra ipc.ts; aquí no se duplican. El botón
 * «Reiniciar e instalar» de la barra invoca `update:install` directamente.
 */

type ToolbarNavAction = 'back' | 'forward' | 'reload' | 'home';

function isFromToolbar(event: IpcMainInvokeEvent): boolean {
  const toolbar = getToolbarWebContents();
  return !!toolbar && event.sender.id === toolbar.id;
}

function guard<T>(event: IpcMainInvokeEvent, fn: () => T): T | null {
  if (!isFromToolbar(event)) {
    console.warn(`[toolbarIpc] Llamada rechazada desde webContents #${event.sender.id}`);
    return null;
  }
  return fn();
}

export function registerToolbarIpc(): void {
  // Estado inicial completo, para que la barra pinte sin esperar eventos.
  ipcMain.handle('toolbar:init', (e) =>
    guard(e, () => ({
      nav: getNavState(),
      online: isOnline(),
      update: getUpdateState(),
      theme: getThemeColors(),
      version: app.getVersion(),
      platform: process.platform,
    })),
  );

  ipcMain.handle('toolbar:nav', (e, action: ToolbarNavAction) =>
    guard(e, () => {
      switch (action) {
        case 'back':
          goBack();
          break;
        case 'forward':
          goForward();
          break;
        case 'reload':
          reloadCurrent();
          break;
        case 'home':
          goHome();
          break;
        default:
          return false;
      }
      return true;
    }),
  );

  ipcMain.handle('toolbar:nav-state', (e) => guard(e, () => getNavState()));

  ipcMain.handle('toolbar:menu', (e, x?: number, y?: number) =>
    guard(e, () => {
      popupAppMenu(getMainWindow(), x, y);
      return true;
    }),
  );

  ipcMain.handle('toolbar:connectivity-check', (e) => guard(e, () => checkNow()));
}
