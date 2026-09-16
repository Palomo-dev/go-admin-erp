import { app, BrowserWindow, Menu, MenuItemConstructorOptions, dialog, shell } from 'electron';
import * as path from 'path';
import { APP_NAME } from './constants';
import {
  getMainWindow,
  goBack,
  goForward,
  goHome,
  reloadCurrent,
  zoomIn,
  zoomOut,
  zoomReset,
  toggleDevTools,
} from './windows/mainWindow';
import { checkForUpdates, getUpdateState, installUpdate } from './updater';
import { checkNow, isOnline } from './connectivity';

/**
 * Menú de aplicación en español.
 *
 * Con `titleBarStyle: 'hidden'` la barra de menús no se dibuja, pero el menú
 * sigue siendo necesario por dos motivos:
 *  1. Los aceleradores (F5, Ctrl+R, Ctrl+±, Alt+←/→, Alt+Inicio, Ctrl+Q…) se
 *     registran a través del menú, así que funcionan igual con la barra oculta.
 *  2. El botón «⋯» de la barra propia abre exactamente este menú como popup,
 *     de modo que todo lo que no cabe en la barra (zoom, actualizaciones, logs,
 *     salir) sigue siendo accesible en español.
 *
 * Antes no se llamaba a `Menu.setApplicationMenu()` y al pulsar Alt aparecía
 * el menú por defecto de Electron en inglés (File/Edit/View…).
 */
export function buildAppMenu(): Menu {
  const isDev = !app.isPackaged;

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Aplicación',
      submenu: [
        { label: 'Inicio', accelerator: 'Alt+Home', click: () => goHome() },
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => reloadCurrent() },
        { label: 'Recargar (F5)', accelerator: 'F5', visible: false, click: () => reloadCurrent() },
        { type: 'separator' },
        {
          label: 'Comprobar conexión',
          click: async () => {
            const online = await checkNow();
            notify(online ? 'Conexión con el servidor confirmada.' : 'Sin conexión con el servidor.');
          },
        },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' },
      ],
    },
    {
      label: 'Navegación',
      submenu: [
        { label: 'Atrás', accelerator: 'Alt+Left', click: () => goBack() },
        { label: 'Adelante', accelerator: 'Alt+Right', click: () => goForward() },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Aumentar zoom', accelerator: 'CmdOrCtrl+=', click: () => zoomIn() },
        { label: 'Aumentar zoom (+)', accelerator: 'CmdOrCtrl+Plus', visible: false, click: () => zoomIn() },
        { label: 'Reducir zoom', accelerator: 'CmdOrCtrl+-', click: () => zoomOut() },
        { label: 'Zoom al 100 %', accelerator: 'CmdOrCtrl+0', click: () => zoomReset() },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
        ...(isDev
          ? [
              { type: 'separator' as const },
              { label: 'Herramientas de desarrollo', accelerator: 'F12', click: () => toggleDevTools() },
              {
                label: 'Herramientas de desarrollo (Ctrl+Shift+I)',
                accelerator: 'CmdOrCtrl+Shift+I',
                visible: false,
                click: () => toggleDevTools(),
              },
            ]
          : []),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Buscar actualizaciones',
          click: async () => {
            const state = await checkForUpdates();
            if (state.status === 'downloaded') {
              const { response } = await dialog.showMessageBox({
                type: 'info',
                title: APP_NAME,
                message: `La versión ${state.version} está lista para instalarse.`,
                buttons: ['Reiniciar e instalar', 'Más tarde'],
                defaultId: 0,
                cancelId: 1,
                noLink: true,
              });
              if (response === 0) installUpdate();
            } else if (state.status === 'available' || state.status === 'downloading') {
              notify(`Descargando la versión ${state.status === 'available' ? state.version : ''}…`.replace('  ', ' '));
            } else if (state.status === 'error') {
              notify(`No se pudo comprobar la actualización: ${state.message}`);
            } else if (!app.isPackaged) {
              notify('Las actualizaciones automáticas están desactivadas en desarrollo.');
            } else {
              notify('Ya tienes la última versión.');
            }
          },
        },
        {
          label: 'Ver registro de la aplicación',
          click: () => {
            const logPath = path.join(app.getPath('userData'), 'agent.log');
            shell.openPath(logPath).catch(() => notify(`No se pudo abrir ${logPath}`));
          },
        },
        { type: 'separator' },
        {
          label: `Acerca de ${APP_NAME}`,
          click: () => {
            const update = getUpdateState();
            const lines = [
              `Versión ${app.getVersion()}`,
              `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
              `Conexión: ${isOnline() ? 'en línea' : 'sin conexión'}`,
              update.status === 'downloaded' ? `Actualización ${update.version} lista para instalar` : null,
            ].filter(Boolean);
            void dialog.showMessageBox({
              type: 'info',
              title: `Acerca de ${APP_NAME}`,
              message: APP_NAME,
              detail: lines.join('\n'),
              buttons: ['Cerrar'],
              noLink: true,
            });
          },
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

let appMenu: Menu | null = null;

/** Instala el menú en español como menú de aplicación (aceleradores incluidos). */
export function installAppMenu(): Menu {
  appMenu = buildAppMenu();
  Menu.setApplicationMenu(appMenu);
  return appMenu;
}

/** Abre el menú como popup anclado a la barra (botón «⋯»). */
export function popupAppMenu(win: BrowserWindow | null, x?: number, y?: number): void {
  const menu = appMenu ?? installAppMenu();
  const target = win ?? getMainWindow();
  if (!target || target.isDestroyed()) return;
  menu.popup({ window: target, ...(typeof x === 'number' && typeof y === 'number' ? { x, y } : {}) });
}

function notify(message: string): void {
  const win = getMainWindow();
  const opts = { type: 'info' as const, title: APP_NAME, message, buttons: ['Cerrar'], noLink: true };
  if (win && !win.isDestroyed()) void dialog.showMessageBox(win, opts);
  else void dialog.showMessageBox(opts);
}
