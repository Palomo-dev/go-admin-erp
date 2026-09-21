/**
 * Permisos del WebContents (F5/F15-B: llamadas del CRM en Desktop).
 *
 * Electron, sin `setPermissionRequestHandler`, CONCEDE todo lo que pida
 * cualquier página: micrófono, cámara, geolocalización, MIDI, pointer lock…
 * Aquí se pasa a lista blanca: se concede solo lo que el ERP usa de verdad
 * (softphone → `media` audio; escáner de códigos y foto de entrega → `media`
 * vídeo; notificaciones; portapapeles saneado; pantalla completa; enlaces
 * `mailto:`/`tel:` del CRM) y SOLO al origen de la web (servidor Next
 * embebido o app.goadmin.io). Todo lo demás, y cualquier otro origen, se
 * deniega. Geolocalización queda denegada a propósito: en Electron exige una
 * clave de Google para resolverse y el ERP no la empaqueta.
 *
 * `decidePermission` es pura (sin `electron`): es lo que prueban los tests.
 * `installPermissionHandlers` la cablea en la `session` (index.ts). Solo
 * imports de tipo desde `electron`, para que jest la cargue sin binario.
 */
import type { Session, WebContents } from 'electron';

export type PermissionDecision = 'grant' | 'deny';

/** Permisos que el ERP usa y que se conceden al origen permitido. */
export const GRANTED_PERMISSIONS: ReadonlySet<string> = new Set([
  'media',
  'notifications',
  'clipboard-sanitized-write',
  'fullscreen',
  'openExternal',
]);

/** Tipos de `media` que se conceden (`display-capture` es otro permiso y se deniega). */
export const GRANTED_MEDIA_TYPES: ReadonlySet<string> = new Set(['audio', 'video']);

/** Esquemas externos que puede abrir la web: correo, llamada y mensajería del CRM. */
export const ALLOWED_EXTERNAL_SCHEMES: ReadonlySet<string> = new Set(['mailto:', 'tel:', 'sms:', 'whatsapp:']);

/**
 * Subconjunto de los `details` de ambos handlers de Electron. `mediaTypes`
 * llega en el request handler; `mediaType` en el check handler.
 */
export interface PermissionDetails {
  mediaTypes?: ReadonlyArray<string>;
  mediaType?: string;
  externalURL?: string;
  requestingUrl?: string;
  isMainFrame?: boolean;
}

export interface PermissionContext {
  /** El origen que pide (requestingUrl / requestingOrigin) es la web del ERP. */
  originAllowed: boolean;
}

/** Origen (`scheme://host:port`) de una URL http(s), o null si no lo es. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

/**
 * Orígenes de la web dentro del Desktop: el que carga la ventana
 * (`getLoadUrl()`), la web remota y, si el servidor Next embebido arrancó,
 * `localhost:<puerto>` y `127.0.0.1:<puerto>` (mismo criterio que
 * `isInternalUrl` en mainWindow.ts). Nunca `file:` ni `about:`.
 */
export function resolveAllowedOrigins(loadUrl: string, webAppUrl: string, localHosts: ReadonlyArray<string> = []): string[] {
  const out = new Set<string>();
  for (const candidate of [loadUrl, webAppUrl]) {
    const origin = originOf(candidate);
    if (origin) out.add(origin);
  }
  for (const host of localHosts) {
    const origin = originOf(`http://${host}`);
    if (origin) out.add(origin);
  }
  return [...out];
}

export function isOriginAllowed(origin: string | null | undefined, allowedOrigins: ReadonlyArray<string>): boolean {
  if (!origin) return false;
  const normalized = originOf(origin) ?? origin;
  return allowedOrigins.includes(normalized);
}

/**
 * Decisión pura: permiso × origen × detalles.
 * - Origen no permitido → deny, sea cual sea el permiso.
 * - `media` → solo tipos audio/vídeo (lista vacía o `unknown` = deny).
 * - `openExternal` → solo esquemas de la lista blanca (sin URL = deny).
 * - Resto de la lista blanca → grant. Cualquier otro permiso → deny.
 */
export function decidePermission(permission: string, details: PermissionDetails | undefined, ctx: PermissionContext): PermissionDecision {
  if (!ctx.originAllowed) return 'deny';
  if (!GRANTED_PERMISSIONS.has(permission)) return 'deny';

  if (permission === 'media') {
    const types = details?.mediaTypes ?? (details?.mediaType ? [details.mediaType] : []);
    if (types.length === 0) return 'deny';
    return types.every((t) => GRANTED_MEDIA_TYPES.has(t)) ? 'grant' : 'deny';
  }

  if (permission === 'openExternal') {
    const raw = details?.externalURL;
    if (!raw) return 'deny';
    try {
      return ALLOWED_EXTERNAL_SCHEMES.has(new URL(raw).protocol) ? 'grant' : 'deny';
    } catch {
      return 'deny';
    }
  }

  return 'grant';
}

export interface InstallPermissionOptions {
  /** `process.platform` (inyectable en tests). */
  platform?: NodeJS.Platform;
  /**
   * macOS: pide el micrófono al sistema (TCC) antes de conceder `media` audio.
   * Por defecto no hace nada; index.ts pasa `systemPreferences.askForMediaAccess`.
   */
  askForMicrophone?: () => Promise<boolean>;
  log?: (message: string) => void;
}

type RequestHandler = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>;
type CheckHandler = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>;

/**
 * Cablea `decidePermission` en la sesión: request handler (prompt), check
 * handler (consultas sin prompt, p. ej. `enumerateDevices`) y device handler
 * (WebHID/WebSerial/WebUSB: la impresión va por el agente Node, no por el
 * navegador). `allowedOrigins` puede ser una función: el puerto del servidor
 * embebido se conoce después de arrancar.
 */
export function installPermissionHandlers(
  session: Session,
  allowedOrigins: ReadonlyArray<string> | (() => ReadonlyArray<string>),
  opts: InstallPermissionOptions = {},
): void {
  const origins = () => (typeof allowedOrigins === 'function' ? allowedOrigins() : allowedOrigins);
  const platform = opts.platform ?? process.platform;
  const log = opts.log ?? ((m: string) => console.warn(m));

  const requestHandler: RequestHandler = (webContents, permission, callback, details) => {
    const d = details as PermissionDetails;
    const origin = originOf(d.requestingUrl) ?? originOf(safeUrl(webContents));
    const decision = decidePermission(permission, d, { originAllowed: isOriginAllowed(origin, origins()) });
    if (decision === 'deny') {
      log(`[permissions] denegado ${permission} para ${origin ?? 'origen desconocido'}`);
      callback(false);
      return;
    }
    const wantsAudio = permission === 'media' && (d.mediaTypes ?? []).includes('audio');
    if (wantsAudio && platform === 'darwin' && opts.askForMicrophone) {
      // Primera llamada en macOS: el prompt del sistema aparece aquí y no a
      // mitad del getUserMedia del SDK. Si el usuario lo niega, se deniega y
      // la web muestra dónde activarlo (Seguridad y privacidad → Micrófono).
      opts.askForMicrophone().then(
        (granted) => {
          if (!granted) log('[permissions] macOS negó el micrófono (Seguridad y privacidad → Micrófono)');
          callback(granted);
        },
        () => callback(false),
      );
      return;
    }
    callback(true);
  };

  const checkHandler: CheckHandler = (_webContents, permission, requestingOrigin, details) => {
    const d = details as PermissionDetails;
    const origin = originOf(requestingOrigin) ?? originOf(d.requestingUrl);
    return decidePermission(permission, d, { originAllowed: isOriginAllowed(origin, origins()) }) === 'grant';
  };

  session.setPermissionRequestHandler(requestHandler);
  session.setPermissionCheckHandler(checkHandler);
  session.setDevicePermissionHandler(() => false);
}

function safeUrl(webContents: WebContents | null | undefined): string | null {
  try {
    return webContents?.getURL() ?? null;
  } catch {
    return null;
  }
}
