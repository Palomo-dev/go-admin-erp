import { app, ipcMain } from 'electron';
import http from 'http';
import { startAgent, stopAgent, getStatus, logout } from './agentRunner';
import { setAutoStart, isAutoStartEnabled } from './autostart';
import { saveConfig, loadConfig } from './store';
import { DISCOVERY_PORT } from './constants';
import { getUpdateState, checkForUpdates, installUpdate } from './updater';
import { readLog, clearLog } from './crashReporter';

export function registerIpcHandlers(): void {
  // ── Agente ──
  ipcMain.handle(
    'agent:start',
    async (
      _e,
      refreshToken: string,
      orgId: number,
      orgName: string,
      branchIds: number[],
      branchNames: string[],
    ) => {
      await startAgent(refreshToken, orgId, orgName, branchIds, branchNames);
      return getStatus();
    },
  );

  ipcMain.handle('agent:stop', () => {
    stopAgent();
    return getStatus();
  });

  ipcMain.handle('agent:status', () => getStatus());

  ipcMain.handle('agent:logout', () => {
    logout();
    return true;
  });

  ipcMain.handle('agent:setAgentName', (_e, name: string) => {
    saveConfig({ agentName: name });
    return true;
  });

  // ── Auto-arranque ──
  ipcMain.handle('autostart:get', () => isAutoStartEnabled());
  ipcMain.handle('autostart:set', (_e, enabled: boolean) => {
    try {
      setAutoStart(enabled);
      // Devolver el valor solicitado directamente.
      // isAutoStartEnabled() puede no reflejar el cambio inmediatamente en Windows.
      return enabled;
    } catch (err) {
      console.error('[ipc] Error al cambiar auto-start:', err);
      return isAutoStartEnabled();
    }
  });

  // ── Impresoras (via discovery server local del agente) ──
  ipcMain.handle('printing:list', () => fetchLocalJson(`http://127.0.0.1:${DISCOVERY_PORT}/printers`));
  ipcMain.handle('printing:discover', () => fetchLocalJson(`http://127.0.0.1:${DISCOVERY_PORT}/discover`));
  ipcMain.handle('printing:usb', () => fetchLocalJson(`http://127.0.0.1:${DISCOVERY_PORT}/usb`));

  ipcMain.handle('printing:print-raw', async (_e, printerId: string, payload: unknown) => {
    try {
      const response = await fetch(`http://127.0.0.1:${DISCOVERY_PORT}/print`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ printerId, payload }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  ipcMain.handle('printing:reprint', async (_e, jobId: string) => {
    try {
      const response = await fetch(`http://127.0.0.1:${DISCOVERY_PORT}/reprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  });

  // ── Actualizaciones ──
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('update:state', () => getUpdateState());
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:install', () => {
    installUpdate();
    return true;
  });

  // ── Logs del crash reporter ──
  ipcMain.handle('logs:read', () => readLog());
  ipcMain.handle('logs:clear', () => {
    clearLog();
    return true;
  });
}

function fetchLocalJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Respuesta inválida del servidor de descubrimiento'));
          }
        });
      })
      .on('error', reject);
  });
}
