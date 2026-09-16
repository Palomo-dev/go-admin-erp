import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload de la BARRA de aplicación (renderer/toolbar).
 *
 * Es un preload distinto del de la web (preload/index.ts) a propósito: la
 * barra necesita navegar y abrir el menú, cosas que la web no debe poder
 * hacer. Y al revés: aquí no se expone nada del agente de impresión ni de la
 * configuración. Corre con `sandbox: true`, solo puede usar contextBridge e
 * ipcRenderer.
 */

type NavAction = 'back' | 'forward' | 'reload' | 'home';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('goAdminToolbar', {
  /** Estado inicial (navegación, conexión, actualización, tema, versión). */
  init: () => ipcRenderer.invoke('toolbar:init'),

  // Navegación
  navigate: (action: NavAction) => ipcRenderer.invoke('toolbar:nav', action),
  getNavState: () => ipcRenderer.invoke('toolbar:nav-state'),
  onNavState: (cb: (state: unknown) => void) => subscribe('toolbar:nav-state', cb),

  // Menú de aplicación (popup anclado al botón «⋯»)
  openMenu: (x?: number, y?: number) => ipcRenderer.invoke('toolbar:menu', x, y),

  // Conectividad real (main/connectivity.ts)
  checkConnectivity: () => ipcRenderer.invoke('toolbar:connectivity-check'),
  onConnectivity: (cb: (online: boolean) => void) => subscribe('connectivity:state', cb),

  // Actualizaciones (main/updater.ts)
  onUpdateState: (cb: (state: unknown) => void) => subscribe('update:state', cb),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Tema (main/theme.ts)
  onTheme: (cb: (theme: unknown) => void) => subscribe('theme:state', cb),
});
