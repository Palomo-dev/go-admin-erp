import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import { broadcastExcept } from './broadcast';
import { getLoadUrl, isInternalUrl } from './windows/mainWindow';
import {
  closePosDisplay,
  getPosDisplayStatus,
  listDisplays,
  openPosDisplay,
  setPosDisplayEnabled,
} from './windows/posDisplayWindow';
import { loadConfig } from './store';

/**
 * IPC de la pantalla del cliente del POS (`window.goAdminDesktop.posDisplay`).
 *
 * Dos partes:
 *
 * 1. RELÉ DE MENSAJES (`pos-display:message`). Canal simétrico con la
 *    semántica de BroadcastChannel: la caja o la pantalla hacen
 *    `ipcRenderer.send` (síncrono, sin respuesta) y el proceso principal lo
 *    reenvía tal cual a todos los renderers vivos menos al remitente. El
 *    sobre es `{ channel: string, data: unknown }`; aquí NO se filtra por
 *    `channel` (eso lo hace cada receptor), solo se valida la forma. Ningún
 *    byte sale a la red: funciona sin internet y entre orígenes distintos.
 *
 * 2. VENTANA (`pos-display:open|close|status|list-displays|set-enabled`).
 *    `invoke` con validación estricta de tipos: todo lo que llega de un
 *    renderer se trata como no confiable aunque sea la web propia.
 *
 * ORIGEN: la pantalla carga `${origin}/pos-display`, donde `origin` es
 * exactamente el de la web que llama (`event.sender.getURL()`), nunca una URL
 * cableada: así la pantalla comparte origen —cookies, localStorage,
 * IndexedDB— con la caja tanto contra el servidor Next embebido
 * (`localhost:<puerto>`) como contra app.goadmin.io o `localhost:3000` en
 * desarrollo. Un `origin` explícito en `opts` se acepta solo si es interno.
 */

interface RelayEnvelope {
  channel: string;
  data: unknown;
}

interface OpenOptions {
  origin?: string;
  displayId?: number | null;
}

function isRelayEnvelope(value: unknown): value is RelayEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as RelayEnvelope).channel === 'string' &&
    'data' in (value as Record<string, unknown>)
  );
}

/** `undefined` = no se indicó; `null` = explícitamente «automático». */
function parseDisplayId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throw new TypeError('displayId debe ser un entero');
}

function parseOpenOptions(value: unknown): OpenOptions {
  if (value === undefined || value === null) return {};
  // Tolerancia: un número suelto se interpreta como displayId (forma antigua
  // del tipo web `open(displayId?)`).
  if (typeof value === 'number') return { displayId: parseDisplayId(value) ?? null };
  if (typeof value !== 'object' || Array.isArray(value)) throw new TypeError('opts debe ser un objeto');
  const raw = value as Record<string, unknown>;
  const opts: OpenOptions = {};
  if (raw.origin !== undefined) {
    if (typeof raw.origin !== 'string') throw new TypeError('origin debe ser una cadena');
    opts.origin = raw.origin;
  }
  const displayId = parseDisplayId(raw.displayId);
  if (displayId !== undefined) opts.displayId = displayId;
  return opts;
}

/** Origen http(s) interno del remitente, o null si no se puede determinar. */
function senderOrigin(event: IpcMainInvokeEvent | IpcMainEvent): string | null {
  try {
    const url = event.sender.getURL();
    if (!url) return null;
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Resuelve y valida el origen a cargar: el explícito si es interno; si no, el del remitente. */
function resolveOrigin(event: IpcMainInvokeEvent, explicit: string | undefined): string | null {
  const loadUrl = getLoadUrl();
  if (explicit !== undefined) {
    let parsed: URL;
    try {
      parsed = new URL(explicit);
    } catch {
      return null;
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !isInternalUrl(parsed.origin, loadUrl)) {
      return null;
    }
    return parsed.origin;
  }
  const own = senderOrigin(event);
  if (!own || !isInternalUrl(own, loadUrl)) return null;
  return own;
}

export function registerPosDisplayIpc(): void {
  // ── Relé (send, no invoke) ──
  ipcMain.on('pos-display:message', (event, payload: unknown) => {
    if (!isRelayEnvelope(payload)) {
      console.warn(`[posDisplayIpc] Mensaje descartado desde webContents #${event.sender.id}: sobre inválido`);
      return;
    }
    broadcastExcept(event.sender, 'pos-display:message', payload);
  });

  // ── Ventana ──
  ipcMain.handle('pos-display:open', (event, rawOpts: unknown) => {
    let opts: OpenOptions;
    try {
      opts = parseOpenOptions(rawOpts);
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : 'opciones inválidas' };
    }
    const origin = resolveOrigin(event, opts.origin);
    if (!origin) {
      console.warn(
        `[posDisplayIpc] open rechazado desde webContents #${event.sender.id}: origen no interno (${opts.origin ?? senderOrigin(event) ?? 'desconocido'})`,
      );
      return { ok: false, reason: 'origen no permitido' };
    }
    // Sin displayId explícito se usa el guardado por setEnabled (config.json):
    // así «Abrir ahora» respeta el monitor elegido sin que la web tenga que
    // copiarlo a localStorage (petición de la sesión del POS, F1).
    const savedDisplayId = loadConfig().posDisplay?.displayId ?? null;
    return openPosDisplay({ origin, displayId: opts.displayId ?? savedDisplayId, session: event.sender.session });
  });

  /** Preferencia persistida `{ enabled, displayId }` (o null si nunca se configuró). */
  ipcMain.handle('pos-display:get-config', () => loadConfig().posDisplay ?? null);

  ipcMain.handle('pos-display:close', () => {
    closePosDisplay();
  });

  ipcMain.handle('pos-display:status', () => getPosDisplayStatus());

  ipcMain.handle('pos-display:list-displays', () => listDisplays());

  ipcMain.handle('pos-display:set-enabled', (_event, enabled: unknown, rawDisplayId: unknown) => {
    if (typeof enabled !== 'boolean') throw new TypeError('enabled debe ser booleano');
    // undefined conserva el monitor guardado; null vuelve a «automático».
    setPosDisplayEnabled(enabled, parseDisplayId(rawDisplayId));
  });
}
