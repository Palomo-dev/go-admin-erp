/**
 * Identidad local de la terminal (caja física) para la pantalla del cliente.
 *
 * Fase 0: no existe la tabla `pos_terminals` (PLAN §6.2, llega en Fase 2).
 * Mientras tanto la caja se identifica con un UUID generado una sola vez y
 * guardado en localStorage bajo `pos_terminal_id`. La ventana de la pantalla
 * comparte origen con la caja, así que lee el mismo valor sin emparejar.
 *
 * Cuando F2 formalice la terminal, este id local pasa a ser el fallback para
 * cajas sin terminal registrada; la clave y la función se mantienen.
 */

export const TERMINAL_ID_STORAGE_KEY = 'pos_terminal_id';

/** Subconjunto de Storage que se usa; permite inyectar uno en pruebas. */
export interface TerminalIdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id efímero cuando no hay storage (SSR, modo privado con storage bloqueado). Estable durante la vida del módulo. */
let ephemeralTerminalId: string | null = null;

export function isTerminalId(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/** UUID v4. Usa crypto.randomUUID si existe; si no, getRandomValues; si no, Math.random (último recurso). */
export function generateTerminalId(): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function defaultStorage(): TerminalIdStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Acceder a localStorage puede lanzar (storage bloqueado por el navegador).
    return null;
  }
}

/**
 * Devuelve el id de la terminal local, creándolo la primera vez.
 * Sin storage disponible devuelve un id efímero estable para esta carga.
 */
export function getOrCreateLocalTerminalId(storage: TerminalIdStorage | null = defaultStorage()): string {
  if (storage) {
    try {
      const existing = storage.getItem(TERMINAL_ID_STORAGE_KEY);
      if (isTerminalId(existing)) return existing;
      const created = generateTerminalId();
      storage.setItem(TERMINAL_ID_STORAGE_KEY, created);
      return created;
    } catch {
      // Cuota llena o storage de solo lectura: se sigue con el id efímero.
    }
  }
  if (ephemeralTerminalId === null) ephemeralTerminalId = generateTerminalId();
  return ephemeralTerminalId;
}

/** Lee el id sin crearlo. Útil para la pantalla, que solo debe reflejar una caja ya identificada. */
export function readLocalTerminalId(storage: TerminalIdStorage | null = defaultStorage()): string | null {
  if (!storage) return null;
  try {
    const existing = storage.getItem(TERMINAL_ID_STORAGE_KEY);
    return isTerminalId(existing) ? existing : null;
  } catch {
    return null;
  }
}
