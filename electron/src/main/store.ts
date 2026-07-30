import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

export interface DesktopConfig {
  email?: string;
  agentName?: string;
  organizationId?: number;
  organizationName?: string;
  branchIds?: number[];
  branchNames?: string[];
  encryptedRefreshToken?: string;
}

const CONFIG_PATH = (): string => path.join(app.getPath('userData'), 'config.json');

export function loadConfig(): DesktopConfig {
  try {
    if (fs.existsSync(CONFIG_PATH())) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf-8'));
    }
  } catch (err) {
    console.warn('[store] No se pudo leer config.json:', err);
  }
  return {};
}

export function saveConfig(partial: Partial<DesktopConfig>): DesktopConfig {
  const current = loadConfig();
  const updated = { ...current, ...partial };
  fs.mkdirSync(path.dirname(CONFIG_PATH()), { recursive: true });
  fs.writeFileSync(CONFIG_PATH(), JSON.stringify(updated, null, 2));
  return updated;
}

export function clearConfig(): void {
  try {
    fs.rmSync(CONFIG_PATH(), { force: true });
  } catch (err) {
    console.warn('[store] No se pudo eliminar config.json:', err);
  }
}

export function saveRefreshToken(refreshToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[store] safeStorage no disponible: no se persistirá la sesión');
    return;
  }
  const encrypted = safeStorage.encryptString(refreshToken).toString('base64');
  saveConfig({ encryptedRefreshToken: encrypted });
}

export function loadRefreshToken(): string | null {
  const { encryptedRefreshToken } = loadConfig();
  if (!encryptedRefreshToken) return null;

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[store] safeStorage no disponible: no se puede recuperar la sesión');
    return null;
  }

  try {
    return safeStorage.decryptString(Buffer.from(encryptedRefreshToken, 'base64'));
  } catch (err) {
    console.warn('[store] Refresh token ilegible, se descarta:', err);
    clearRefreshToken();
    return null;
  }
}

export function clearRefreshToken(): void {
  const cfg = loadConfig();
  delete cfg.encryptedRefreshToken;
  try {
    fs.writeFileSync(CONFIG_PATH(), JSON.stringify(cfg, null, 2));
  } catch (err) {
    console.warn('[store] No se pudo limpiar el refresh token:', err);
  }
}
