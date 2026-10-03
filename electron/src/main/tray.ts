import { Tray, Menu, BrowserWindow, app, nativeImage, shell } from 'electron';
import * as path from 'path';
import { APP_NAME } from './constants';
import { getStatus } from './agentRunner';
import { readLog } from './crashReporter';
import { getIconImage } from './icon';
import { randomUUID } from 'node:crypto';
import { getPhoneSnapshot, dispatchPhoneCommand } from './phoneIpc';
import { openPhoneWindow } from './windows/phoneWindow';

let tray: Tray | null = null;
let refreshTimer: NodeJS.Timeout | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  const icon = getIconImage() ?? nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  const refreshMenu = () => {
    const status = getStatus();
    const phone = getPhoneSnapshot();
    const menu = Menu.buildFromTemplate([
      { label: 'Teléfono', enabled: false },
      { label: phone?.incoming ? '● Llamada entrante' : phone?.callStatus === 'connected' ? '● En llamada' : phone?.deviceState === 'registered' ? '● Disponible' : '○ Desconectado', enabled: false },
      { label: 'Abrir marcador', accelerator: 'CommandOrControl+Shift+L', click: () => { void openPhoneWindow(getPhoneSnapshot()); } },
      { label: 'Estado', submenu: [{ label: phone?.deviceState === 'registered' ? 'Disponible' : 'Desconectado', type: 'radio', checked: true, enabled: false }] },
      ...(phone?.missed ? [{ label: 'Última llamada perdida', click: () => { void openPhoneWindow(getPhoneSnapshot()); } }] : []),
      { label: 'Silenciar timbre', type: 'checkbox', checked: Boolean(phone?.ringtoneMuted), enabled: phone?.deviceState === 'registered', click: () => {
        const current = getPhoneSnapshot(); if (!current || current.scope !== phone?.scope) return;
        void dispatchPhoneCommand({ id: randomUUID(), scope: current.scope, revision: current.revision, action: 'ringtone', value: !current.ringtoneMuted });
      } },
      { type: 'separator' },
      { label: 'Impresión', enabled: false },
      { label: status.running ? `● Conectado — ${status.organizationName || ''}` : '○ Desconectado', enabled: false },
      {
        label: `Trabajos impresos: ${status.jobsPrinted}`,
        enabled: false,
      },
      {
        label: `Errores: ${status.jobsFailed}`,
        enabled: false,
      },
      ...(status.branchNames.length > 0
        ? [{ label: `Sucursales: ${status.branchNames.join(', ')}`, enabled: false as const }]
        : []),
      { type: 'separator' },
      {
        label: 'Abrir GO Admin',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: 'Ver logs',
        click: () => {
          const log = readLog() || 'No hay logs registrados';
          const logPath = path.join(app.getPath('userData'), 'agent.log');
          shell.openPath(logPath).catch(() => {
            // Si no se puede abrir el archivo, mostrar en consola
            console.log('[tray] Logs:\n', log.slice(-2000));
          });
        },
      },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => app.quit(),
      },
    ]);
    tray!.setContextMenu(menu);
  };

  refreshMenu();
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshMenu, 15_000);
  tray.on('right-click', refreshMenu);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

export function destroyTray(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
