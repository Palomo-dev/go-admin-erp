import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { createMainWindow, getMainWindow, createSplashWindow, closeSplash } from './windows/mainWindow';
import { createTray, destroyTray } from './tray';
import { initUpdater, stopUpdater } from './updater';
import { registerIpcHandlers } from './ipc';
import { tryAutoStart, stopAgent, markOffline } from './agentRunner';
import { wasOpenedHidden } from './autostart';
import { WEB_APP_URL } from './constants';
import { initCrashReporter } from './crashReporter';
import { initOfflineCache } from './offlineCache';

let quitting = false;

// Setear icono de la app antes de que se cree cualquier ventana
app.on('ready', () => {
  app.setAppUserModelId('io.goadmin.desktop');
  // Registrar protocolo goadmin:// para deep links
  if (!app.isDefaultProtocolClient('goadmin')) {
    app.setAsDefaultProtocolClient('goadmin');
  }
});

// Manejar deep links goadmin://accion/parametro
app.on('open-url', (_event, url) => {
  const win = getMainWindow();
  if (win) {
    win.show();
    win.focus();
    win.webContents.send('deep-link', url);
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (win) {
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    initCrashReporter();
    initOfflineCache();
    registerIpcHandlers();

    // Splash screen mientras carga
    if (!wasOpenedHidden()) {
      createSplashWindow();
    }

    const mainWindow = createMainWindow();
    createTray(mainWindow);

    initUpdater(mainWindow);

    const started = await tryAutoStart();
    if (started) {
      mainWindow.webContents.send('agent:autostarted');
    }

    // Cerrar splash y mostrar ventana principal
    closeSplash();
    if (!wasOpenedHidden()) {
      mainWindow.show();
    }
  });

  app.on('before-quit', async (e) => {
    if (!quitting) {
      e.preventDefault();
      quitting = true;
      stopUpdater();
      await markOffline();
      stopAgent();
      destroyTray();
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    // La app vive en la bandeja del sistema
  });
}
