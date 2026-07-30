import { Tray, Menu, BrowserWindow, app, nativeImage, shell } from 'electron';
import * as path from 'path';
import { APP_NAME } from './constants';
import { getStatus } from './agentRunner';
import { readLog } from './crashReporter';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow): Tray {
  const iconPath = path.join(__dirname, '..', '..', '..', 'build', 'icon.ico');
  let icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);

  const refreshMenu = () => {
    const status = getStatus();
    const menu = Menu.buildFromTemplate([
      {
        label: status.running
          ? `● Conectado — ${status.organizationName || ''}`
          : '○ Desconectado',
        enabled: false,
      },
      { type: 'separator' },
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
        label: 'Abrir',
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
  setInterval(refreshMenu, 15_000);

  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
