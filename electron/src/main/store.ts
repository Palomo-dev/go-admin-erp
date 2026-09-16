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
  const file = CONFIG_PATH();
  let raw: string;
  try {
    if (!fs.existsSync(file)) return {};
    raw = fs.readFileSync(file, 'utf-8');
  } catch (err) {
    console.warn('[store] No se pudo leer config.json:', err);
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as DesktopConfig) : {};
  } catch (err) {
    // Archivo corrupto. El caso visto en la práctica (2026-09-16) es un
    // config.json del tamaño correcto pero lleno de bytes NUL: NTFS reserva
    // el tamaño antes de volcar los datos y un apagado/crash en medio de
    // writeFileSync deja el archivo así. Se aparta con un sufijo (por si hay
    // que recuperar algo) y se sigue con una configuración vacía, para que
    // cada lectura no vuelva a fallar con el mismo stack trace.
    const quarantined = `${file}.corrupto-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    console.warn(`[store] config.json ilegible (${err instanceof Error ? err.message : String(err)}); se aparta a ${path.basename(quarantined)}`);
    try {
      fs.renameSync(file, quarantined);
    } catch (renameErr) {
      console.warn('[store] No se pudo apartar config.json:', renameErr);
    }
    return {};
  }
}

/**
 * Escritura atómica: se escribe a un temporal y se renombra encima. Un
 * apagado o crash en mitad de un writeFileSync directo dejaba config.json
 * con el tamaño correcto y todo NUL (ver loadConfig), y con él se perdían la
 * vinculación del agente y el refresh token cifrado.
 */
function writeConfigAtomic(config: DesktopConfig): void {
  const file = CONFIG_PATH();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(config, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

export function saveConfig(partial: Partial<DesktopConfig>): DesktopConfig {
  const current = loadConfig();
  const updated = { ...current, ...partial };
  writeConfigAtomic(updated);
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
    writeConfigAtomic(cfg);
  } catch (err) {
    console.warn('[store] No se pudo limpiar el refresh token:', err);
  }
}
