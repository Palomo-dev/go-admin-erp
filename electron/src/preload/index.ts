import { contextBridge, ipcRenderer } from 'electron';

console.log('[preload] Cargando preload script...');

/**
 * Opciones de `posDisplay.open`. La web puede llamar `open(displayId?)` (forma
 * del tipo `DesktopPosDisplayBridge` del ERP) u `open({ origin?, displayId? })`;
 * el proceso principal acepta ambas. Sin `origin`, usa el de la web que llama.
 * Tipos locales a propósito: el preload no importa nada del ERP.
 */
type PosDisplayOpenOptions = { origin?: string; displayId?: number | null } | number;

/**
 * Suscripción a un canal IPC que devuelve SU baja (quita solo ese listener).
 * A diferencia de `onConnectivity`/`onUpdateState`, que hacen
 * `removeAllListeners`, aquí puede haber varios suscriptores a la vez (varios
 * canales de terminal sobre el mismo relé) y cada uno se da de baja solo.
 */
function subscribe(channel: string, handler: (payload: unknown) => void): () => void {
  if (typeof handler !== 'function') throw new TypeError('handler debe ser una función');
  const listener = (_e: Electron.IpcRendererEvent, payload: unknown) => {
    try {
      handler(payload);
    } catch (err) {
      console.error(`[preload] handler de ${channel} lanzó:`, err);
    }
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

try {
  contextBridge.exposeInMainWorld('goAdminDesktop', {
  // Agente
  startAgent: (
    refreshToken: string,
    orgId: number,
    orgName: string,
    branchIds: number[],
    branchNames: string[],
  ) => ipcRenderer.invoke('agent:start', refreshToken, orgId, orgName, branchIds, branchNames),
  // Sesión propia del agente (código de vinculación del ERP). Si la web ve
  // este método, lo usa en vez de startAgent(refreshToken).
  startAgentWithToken: (
    tokenHash: string,
    orgId: number,
    orgName: string,
    branchIds: number[],
    branchNames: string[],
  ) => ipcRenderer.invoke('agent:start-token', tokenHash, orgId, orgName, branchIds, branchNames),
  stopAgent: () => ipcRenderer.invoke('agent:stop'),
  status: () => ipcRenderer.invoke('agent:status'),
  logout: () => ipcRenderer.invoke('agent:logout'),
  setAgentName: (name: string) => ipcRenderer.invoke('agent:setAgentName', name),

  // Auto-arranque con Windows
  getAutoStart: () => ipcRenderer.invoke('autostart:get'),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke('autostart:set', enabled),

  // Impresoras
  listPrinters: () => ipcRenderer.invoke('printing:list'),
  discoverNetwork: () => ipcRenderer.invoke('printing:discover'),
  listUsbDevices: () => ipcRenderer.invoke('printing:usb'),
  listBluetoothDevices: () => ipcRenderer.invoke('printing:bluetooth'),
  printRaw: (printerId: string, payload: unknown) =>
    ipcRenderer.invoke('printing:print-raw', printerId, payload),
  reprintJob: (jobId: string) => ipcRenderer.invoke('printing:reprint', jobId),
  openCashDrawer: (printerName?: string) => ipcRenderer.invoke('printing:open-cash-drawer', printerName),

  // Conectividad real (comprobación contra Supabase, no navigator.onLine)
  isOnline: () => ipcRenderer.invoke('connectivity:get'),
  checkConnectivity: () => ipcRenderer.invoke('connectivity:check'),
  onConnectivity: (callback: (online: boolean) => void) => {
    ipcRenderer.removeAllListeners('connectivity:state');
    ipcRenderer.on('connectivity:state', (_e, online: boolean) => callback(online));
  },

  // Ventana
  reload: () => ipcRenderer.invoke('app:reload'),

  // Pantalla del cliente del POS (ventana secundaria + relé de mensajes por
  // IPC: funciona sin internet y entre orígenes; ver main/posDisplayIpc.ts).
  posDisplay: {
    /** Publica `{ channel, data }` a todos los demás renderers (no vuelve al emisor). Síncrono. */
    send: (payload: unknown) => {
      ipcRenderer.send('pos-display:message', payload);
    },
    /** Recibe lo que publican los demás renderers. Devuelve la baja. */
    onMessage: (handler: (payload: unknown) => void) => subscribe('pos-display:message', handler),
    open: (opts?: PosDisplayOpenOptions) => ipcRenderer.invoke('pos-display:open', opts),
    close: () => ipcRenderer.invoke('pos-display:close'),
    status: () => ipcRenderer.invoke('pos-display:status'),
    listDisplays: () => ipcRenderer.invoke('pos-display:list-displays'),
    setEnabled: (enabled: boolean, displayId?: number | null) =>
      ipcRenderer.invoke('pos-display:set-enabled', enabled, displayId),
    /** `{ open, displayId }` cada vez que la pantalla abre o cierra. Devuelve la baja. */
    onStatus: (handler: (status: unknown) => void) => subscribe('pos-display:status', handler),
  },

  // Versión y actualizaciones
  version: () => ipcRenderer.invoke('app:version'),
  updateState: () => ipcRenderer.invoke('update:state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Eventos desde el main process
  onAutoStarted: (callback: () => void) => {
    ipcRenderer.removeAllListeners('agent:autostarted');
    ipcRenderer.on('agent:autostarted', callback);
  },
  onUpdateState: (callback: (state: unknown) => void) => {
    ipcRenderer.removeAllListeners('update:state');
    ipcRenderer.on('update:state', (_e, state) => callback(state));
  },
  onDeepLink: (callback: (url: string) => void) => {
    ipcRenderer.removeAllListeners('deep-link');
    ipcRenderer.on('deep-link', (_e, url) => callback(url));
  },
});
  console.log('[preload] Bridge expuesto correctamente');
} catch (err) {
  console.error('[preload] Error exponiendo bridge:', err);
}
