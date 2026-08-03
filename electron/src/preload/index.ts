import { contextBridge, ipcRenderer } from 'electron';

console.log('[preload] Cargando preload script...');

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
  printRaw: (printerId: string, payload: unknown) =>
    ipcRenderer.invoke('printing:print-raw', printerId, payload),
  reprintJob: (jobId: string) => ipcRenderer.invoke('printing:reprint', jobId),
  openCashDrawer: (printerName?: string) => ipcRenderer.invoke('printing:open-cash-drawer', printerName),

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
