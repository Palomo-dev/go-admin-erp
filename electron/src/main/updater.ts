import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { UPDATE_CHECK_INTERVAL_MS } from './constants';
import { broadcast } from './broadcast';
import { appendLog } from './crashReporter';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'none' }
  | { status: 'error'; message: string };

let state: UpdateState = { status: 'idle' };
let timer: NodeJS.Timeout | null = null;

export function getUpdateState(): UpdateState {
  return state;
}

function setState(next: UpdateState): void {
  // Al log solo los cambios de fase (no cada punto de porcentaje de descarga).
  if (next.status !== state.status) appendLog(`[updater] ${describirEstado(next)}`);
  state = next;
  // Se difunde a la barra (que muestra «Reiniciar e instalar» al llegar a
  // 'downloaded') y a la web (window.goAdminDesktop.onUpdateState).
  broadcast('update:state', next);
}

export function initUpdater(): void {
  if (!app.isPackaged) {
    console.log('[updater] Desactivado en desarrollo (app sin empaquetar)');
    return;
  }

  autoUpdater.autoDownload = false;
  // Con una versión descargada, el instalador corre en silencio al SALIR de
  // la app y cierra cualquier «Go Admin ERP.exe» abierto mientras instala.
  // Por eso el log del propio electron-updater («Auto install update on
  // quit», «Install on explicit quitAndInstall») va a agent.log: si alguien
  // abre la app en ese rato y se cierra sola, ahí queda la causa.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (m?: unknown) => appendLog(`[updater] ${String(m)}`),
    warn: (m?: unknown) => appendLog(`[updater] AVISO ${String(m)}`),
    error: (m?: unknown) => appendLog(`[updater] ERROR ${String(m)}`),
    debug: () => undefined,
  };

  autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }));

  autoUpdater.on('update-available', (info) => {
    setState({ status: 'available', version: info.version });
    autoUpdater.downloadUpdate().catch((err) => {
      setState({ status: 'error', message: String(err?.message || err) });
    });
  });

  autoUpdater.on('update-not-available', () => setState({ status: 'none' }));

  autoUpdater.on('download-progress', (progress) => {
    setState({ status: 'downloading', percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    setState({ status: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    setState({ status: 'error', message: String(err?.message || err) });
  });

  void checkForUpdates();

  timer = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) return state;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
  }
  return state;
}

export function installUpdate(): void {
  if (state.status !== 'downloaded') return;
  appendLog(`[updater] El usuario pidió reiniciar e instalar ${state.version}`);
  setImmediate(() => autoUpdater.quitAndInstall());
}

function describirEstado(s: UpdateState): string {
  switch (s.status) {
    case 'available':
      return `Versión ${s.version} disponible; descargando`;
    case 'downloading':
      return 'Descargando actualización';
    case 'downloaded':
      return `Versión ${s.version} descargada: se instalará al salir de la app`;
    case 'error':
      return `Error: ${s.message}`;
    case 'none':
      return 'Sin actualizaciones';
    default:
      return `Estado ${s.status}`;
  }
}

export function stopUpdater(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
