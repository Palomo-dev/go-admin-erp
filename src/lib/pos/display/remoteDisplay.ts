/**
 * Pantalla remota (tableta en otro dispositivo): emparejamiento, token,
 * bootstrap y latido. PLAN §3.3, §7 y §11; Fase 3, parte B. SIN React ni
 * Supabase: `fetch` y el storage se inyectan, así todo se prueba en Node
 * (src/__tests__/pos-display/f3b-*). El hook `useRemoteDisplay` (componentes)
 * solo envuelve esto en estado de React.
 *
 * FLUJO (PLAN §3.3 «Otro dispositivo»)
 * 1. `/pos-display?pair=<código>`: se canjea el código en
 *    `POST /api/pos/display/pair` → token largo (43 caracteres, se recibe UNA
 *    vez) que se guarda en localStorage (`REMOTE_DISPLAY_STORAGE_KEY`) y la
 *    query `pair` se retira de la URL (replaceState) para que una recarga no
 *    vuelva a canjear un código ya consumido.
 * 2. Con token guardado: `GET /api/pos/display/bootstrap` (Bearer) → marca,
 *    ajustes, terminal y credencial de Realtime (`realtime.channel` +
 *    JWT de 5 min). Con eso la pantalla abre `SupabaseBroadcastReceiver`.
 * 3. `POST /api/pos/display/heartbeat` cada `REMOTE_HEARTBEAT_INTERVAL_MS`
 *    (60 s, PLAN §7): registra `display_last_seen_at` y devuelve un JWT nuevo
 *    que se aplica al canal con `realtime.setAuth` (F3-A ronda 3 · 2).
 * 4. 401 en /bootstrap o en /heartbeat = token revocado o inválido: se BORRA
 *    el token, se sale del canal y se vuelve a la pantalla de
 *    emparejamiento. Cualquier otro fallo (503, red) se reintenta: el
 *    latido en el siguiente tick, el bootstrap con retroceso.
 *
 * SELECCIÓN DE TRANSPORTE (`resolveRemoteIntent`)
 * - `?pair=<exactamente 6 dígitos>` → canjear (remoto), con el
 *   emparejamiento guardado como RESPALDO: si el código ya se consumió, se
 *   arranca con el token que había (ronda 2 · 1), pero SOLO si ese código es
 *   el mismo con el que se obtuvo ese emparejamiento (ronda 3 · 2, acotado a
 *   la huella en la ronda 4 · B3): reapuntar la tableta a otra caja no puede
 *   acabar en silencio contra la caja anterior.
 * - token guardado → remoto (Supabase Broadcast).
 * - `?pair` presente con cualquier otra cosa → pantalla de emparejamiento
 *   con lo que se pueda leer como prefill; nunca se canjea un valor
 *   truncado (ronda 2 · 7).
 * - nada de lo anterior → LOCAL (BroadcastChannel / relay de escritorio),
 *   exactamente como antes de la parte B. La pantalla de emparejamiento
 *   sigue alcanzable desde «Conectando» cuando en este equipo no hay caja
 *   (sin `pos_terminal_id`), que es la situación de una tableta.
 *
 * SEGURIDAD
 * - El token largo solo viaja como `Authorization: Bearer` a las rutas
 *   `/api/pos/display/*` de ESTE origen; nunca en la URL ni en el body.
 * - En localStorage vive en claro (no hay alternativa en un navegador sin
 *   sesión); por eso `/revoke` existe y el JWT de canal vive 5 min.
 * - El CÓDIGO de emparejamiento sí viaja en la URL de la página cuando se
 *   entra por el QR (`/pos-display?pair=123456`): queda en el historial del
 *   navegador y en los registros de acceso del servidor/CDN. Riesgo
 *   ACEPTADO (un solo uso, cinco minutos, canal por terminal), documentado
 *   en F3-B §4; tecleándolo en la pantalla de emparejamiento no ocurre.
 * - Nada del bootstrap se persiste: se vuelve a pedir en cada carga.
 */

import { isValidLocale, type Locale } from '@/i18n/config';
import { isDisplayTokenShape, isPairingCodeShape, normalizePairingCodeInput } from './pairing';
import { displayChannelName } from './transport';

/** localStorage: `{ v: 1, token, terminalId, pairedAt }` de la pantalla remota emparejada. */
export const REMOTE_DISPLAY_STORAGE_KEY = 'pos_display_remote';
/** Parámetro de la URL con el código de emparejamiento (`/pos-display?pair=123456`). */
export const PAIR_QUERY_PARAM = 'pair';
/** Latido a `/heartbeat` (PLAN §7: cada 60 s). El JWT de canal vive 5 min: hay 4 latidos de margen. */
export const REMOTE_HEARTBEAT_INTERVAL_MS = 60_000;
/**
 * Frecuencia máxima del latido FORZADO (el que dispara volver la pestaña a
 * primer plano o recuperar la red): uno cada 5 s como mucho (ronda 3 · 6).
 * Sirve para recuperar un JWT vencido tras una suspensión, no para firmar uno
 * nuevo en el servidor con cada alternancia de pestaña; los latidos con éxito
 * no consumen ningún cubo de tasa, así que el freno va aquí.
 */
export const FORCED_BEAT_MIN_INTERVAL_MS = 5_000;
/**
 * Cuánto se respeta el «hay uno en vuelo» del latido antes de darlo por
 * colgado y dejar salir el siguiente (ronda 4 · B2). Por encima de
 * `DISPLAY_API_TIMEOUT_MS` a propósito: lo normal es que el plazo de la
 * petición resuelva el atasco antes, y este tope solo cubre lo que ese plazo
 * no ve —un `fetch` inyectado que lo ignore, un `onCredential` que se
 * quede—. Un latido abandonado no vuelve a aplicar su credencial.
 */
export const HEARTBEAT_INFLIGHT_MAX_MS = 15_000;
/** Reintento del bootstrap tras un fallo que no es 401: 5 s, 10 s, 20 s… tope 60 s. */
export const BOOTSTRAP_RETRY_BASE_MS = 5_000;
export const BOOTSTRAP_RETRY_MAX_MS = 60_000;

export const PAIR_ENDPOINT = '/api/pos/display/pair';
export const BOOTSTRAP_ENDPOINT = '/api/pos/display/bootstrap';
export const HEARTBEAT_ENDPOINT = '/api/pos/display/heartbeat';

/** Subconjunto de Storage que se usa; permite inyectar uno en pruebas. */
export interface RemoteTokenStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredRemoteDisplay {
  v: 1;
  token: string;
  terminalId: string;
  /** ISO 8601 del canje. Solo informativo. */
  pairedAt: string;
  /**
   * Huella del CÓDIGO con el que se obtuvo este emparejamiento (ronda 3 · 2).
   * Es lo único que permite distinguir «el quiosco reintenta SU propio código
   * gastado» de «alguien está reapuntando esta tableta a otra caja»: ver
   * `resolveRedeemFailure`. sha256 hexadecimal con `crypto.subtle`, o la
   * huella no criptográfica con prefijo `fnv1a32:` sin él (ronda 4 · QA-2).
   */
  codeHash?: string;
}

/** sha256 hexadecimal: 64 caracteres. Misma forma que `hashDisplayToken` en el servidor. */
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
/** Prefijo de la huella no criptográfica (sin `crypto.subtle`); nunca se confunde con un sha256. */
export const NON_CRYPTO_FINGERPRINT_PREFIX = 'fnv1a32:';
const NON_CRYPTO_FINGERPRINT_PATTERN = /^fnv1a32:[0-9a-f]{8}$/;

/** ¿Tiene forma de huella de código (sha256 o la no criptográfica)? */
function isCodeFingerprintShape(value: unknown): value is string {
  return typeof value === 'string' && (SHA256_HEX_PATTERN.test(value) || NON_CRYPTO_FINGERPRINT_PATTERN.test(value));
}

/**
 * FNV-1a de 32 bits, en hexadecimal y con prefijo propio. Es el respaldo de
 * `pairingCodeFingerprint` cuando el navegador no ofrece `crypto.subtle`.
 *
 * Por qué vale aquí: la huella NO protege un secreto. El código son seis
 * dígitos, así que su sha256 también se invierte probando el millón de
 * combinaciones; lo único que se le pide es responder «¿es este el mismo
 * código con el que me emparejé?» contra un valor guardado en el mismo
 * dispositivo. Para eso una huella de 32 bits sobra (dos códigos distintos
 * colisionan con probabilidad ~2 · 10⁻¹⁰), y el prefijo impide comparar por
 * error una huella de un esquema con la del otro.
 */
function nonCryptoCodeFingerprint(code: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < code.length; i += 1) {
    hash ^= code.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${NON_CRYPTO_FINGERPRINT_PREFIX}${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Huella del código de emparejamiento, para recordar CON QUÉ código se
 * obtuvo el emparejamiento sin guardarlo en claro.
 *
 * `crypto.subtle` solo existe en contexto seguro (https o localhost). Antes
 * (ronda 3) sin él se devolvía null y el respaldo tras un canje fallido no se
 * aplicaba nunca: una tableta de quiosco apuntada a la instancia por IP de la
 * LAN sobre http volvía a tener el defecto original —cada reinicio reintenta
 * su código consumido, recibe 404 y se queda pidiendo código delante del
 * cliente con un emparejamiento vivo—. Ahora se cae a una huella no
 * criptográfica con prefijo propio (ronda 4 · QA-2). Nunca lanza; solo
 * devuelve null si algo falla de forma inesperada.
 */
export async function pairingCodeFingerprint(code: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle || typeof TextEncoder === 'undefined') return nonCryptoCodeFingerprint(code);
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(code));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    // `subtle.digest` puede rechazar en un contexto no seguro aunque el objeto
    // exista: se sigue teniendo huella, del otro esquema.
    try {
      return nonCryptoCodeFingerprint(code);
    } catch {
      return null;
    }
  }
}

function defaultStorage(): RemoteTokenStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // storage bloqueado por el navegador
  }
}

/** Lee el emparejamiento guardado; null si no hay, si está corrupto o si el token no tiene la forma esperada. */
export function readStoredRemoteDisplay(storage: RemoteTokenStorage | null = defaultStorage()): StoredRemoteDisplay | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(REMOTE_DISPLAY_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.v !== 1 || !isDisplayTokenShape(record.token) || typeof record.terminalId !== 'string' || record.terminalId.length === 0) {
      return null;
    }
    const stored: StoredRemoteDisplay = {
      v: 1,
      token: record.token,
      terminalId: record.terminalId,
      pairedAt: typeof record.pairedAt === 'string' ? record.pairedAt : '',
    };
    // La huella del código solo se copia si tiene la forma esperada (sha256 o
    // la no criptográfica); una guardada a mano o corrupta se ignora (y
    // entonces no hay respaldo).
    if (isCodeFingerprintShape(record.codeHash)) stored.codeHash = record.codeHash;
    return stored;
  } catch {
    return null;
  }
}

/** Guarda el emparejamiento. Devuelve false si el token no tiene forma válida o el storage falla. */
export function saveStoredRemoteDisplay(
  value: { token: string; terminalId: string; pairedAt?: string; codeHash?: string | null },
  storage: RemoteTokenStorage | null = defaultStorage(),
): boolean {
  if (!storage || !isDisplayTokenShape(value.token) || typeof value.terminalId !== 'string' || value.terminalId.length === 0) return false;
  const record: StoredRemoteDisplay = { v: 1, token: value.token, terminalId: value.terminalId, pairedAt: value.pairedAt ?? new Date().toISOString() };
  if (isCodeFingerprintShape(value.codeHash)) record.codeHash = value.codeHash;
  try {
    storage.setItem(REMOTE_DISPLAY_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** Borra el emparejamiento (revocación, token inválido, «Desemparejar»). Nunca lanza. */
export function clearStoredRemoteDisplay(storage: RemoteTokenStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(REMOTE_DISPLAY_STORAGE_KEY);
  } catch {
    // storage bloqueado: no hay nada que borrar
  }
}

// ---------------------------------------------------------------------------
// Intención: ¿qué hace la pantalla al cargar?
// ---------------------------------------------------------------------------

export type RemoteIntent =
  /**
   * Hay un código en la URL: canjearlo. `fallback` es el emparejamiento que
   * había guardado AL MONTAR (o null).
   *
   * Es INFORMATIVO (ronda 4 · B6): quien decide el respaldo tras un canje
   * fallido es `resolveRedeemFailure`, y el emparejamiento que compara se
   * RELEE del storage en ese momento, no se toma de aquí —entre el montaje y
   * la respuesta del canje pudo revocarse y borrarse—. Se conserva en el tipo
   * porque es lo que hace legible la decisión de arranque («había token y aun
   * así se canjea, porque la URL trae un código») y porque el valor lo afirman
   * las pruebas del arranque; nadie debe leerlo para actuar.
   */
  | { kind: 'pair'; code: string; fallback: StoredRemoteDisplay | null }
  /** Hay token guardado: arrancar en remoto. */
  | { kind: 'remote'; stored: StoredRemoteDisplay }
  /** `?pair` sin código válido: pedir el código. */
  | { kind: 'ask_code'; prefill: string }
  /** Nada remoto: comportamiento local de siempre. */
  | { kind: 'local' };

/**
 * Lee `?pair=` de una query (`window.location.search`) TAL CUAL viene, sin
 * sanear. null si el parámetro no está.
 *
 * Devuelve el valor crudo a propósito (ronda 2 · 7): saneándolo aquí,
 * `?pair=1234567` y `?pair=abc-123456` se convertían en `123456` y se
 * canjeaban en silencio, gastando cupo del límite de /pair (10 intentos por
 * IP cada 15 min) contra un código que NO es el que se pegó. Quien decide
 * qué hacer con un valor que no son exactamente seis dígitos es
 * `resolveRemoteIntent`: llevarlo a la pantalla de emparejamiento con lo
 * tecleado como prefill, para que la persona vea lo que va a mandar.
 */
export function readPairCodeFromSearch(search: string | null | undefined): string | null {
  if (typeof search !== 'string') return null;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (!params.has(PAIR_QUERY_PARAM)) return null;
    return params.get(PAIR_QUERY_PARAM) ?? '';
  } catch {
    return null;
  }
}

/**
 * Decide el arranque:
 * - `?pair=` con EXACTAMENTE seis dígitos → canjear, llevando como respaldo
 *   el emparejamiento guardado (ronda 2 · 1: el quiosco arranca siempre con
 *   la misma URL, así que en cada reinicio se reintenta un código ya
 *   consumido; el 404 no puede tirar un emparejamiento que sigue vivo).
 * - token guardado → remoto.
 * - `?pair` presente con cualquier otra cosa (vacío, corto, largo, con
 *   letras) → pantalla de emparejamiento con los dígitos que se hayan
 *   podido leer como prefill. Nunca se canjea un valor truncado.
 * - nada de lo anterior → local.
 */
export function resolveRemoteIntent(search: string | null | undefined, stored: StoredRemoteDisplay | null): RemoteIntent {
  const raw = readPairCodeFromSearch(search);
  if (raw !== null && isPairingCodeShape(raw)) return { kind: 'pair', code: raw, fallback: stored };
  if (stored) return { kind: 'remote', stored };
  if (raw !== null) return { kind: 'ask_code', prefill: normalizePairingCodeInput(raw) };
  return { kind: 'local' };
}

/**
 * Qué hacer cuando el canje de un código FALLA (ronda 2 · 1, acotado en la
 * ronda 3 · 2).
 *
 * Un código se consume al primer canje y vive cinco minutos, así que el
 * fallo más común no es «lo escribió mal» sino «esta pantalla ya se
 * emparejó con él». El escenario del PLAN §3.3 es una tableta en modo
 * quiosco cuya URL de arranque es `/pos-display?pair=<código>`: `replaceState`
 * limpia la barra de direcciones, pero la URL configurada en el quiosco
 * conserva el código, así que cada reinicio reintenta uno gastado. Si eso
 * dejara la pantalla pidiendo un código nuevo, habría que ir a la caja a
 * generar otro en cada arranque, delante del cliente, con un emparejamiento
 * que seguía perfectamente vivo.
 *
 * PERO el respaldo solo vale para ESE caso. En la ronda 2 se aplicaba a
 * cualquier fallo y con cualquier emparejamiento guardado, y entonces
 * «reapuntar la tableta de la caja 2 a la caja 1» —único camino que hay,
 * porque la tableta no tiene «desemparejar»— arrancaba CALLADA contra la
 * caja 2 en cuanto el canje fallara por red o por el cubo global: el carrito
 * de una caja delante de los clientes de otra. Por eso ahora se exige que el
 * código que falló sea EL MISMO con el que se obtuvo el emparejamiento
 * guardado (se compara la huella sha256, `pairingCodeFingerprint`), que es
 * literalmente el caso del quiosco. Con cualquier otro código se muestra el
 * error del canje.
 *
 * La huella es la ÚNICA condición (ronda 4 · B3). En la ronda 3 se excluyó
 * además el 429, y eso dejaba fuera justo al quiosco que más lo necesita: el
 * que rearranca en bucle con su código gastado agota el cubo de /pair y, a
 * partir de ahí, su propio emparejamiento vivo dejaba de arrancar. Con la
 * huella igual ya está descartado el caso que preocupaba —reapuntar la
 * tableta a otra caja—, porque ese código es OTRO y su huella no coincide;
 * el estado HTTP no aporta nada a esa distinción. Con la huella distinta se
 * sigue mostrando el error, sea 404, 429, 503 o un corte de red.
 *
 * El token guardado no lo invalida nada de esto: solo lo invalida un 401 de
 * `/bootstrap` o `/heartbeat`, que sí lo borra.
 *
 * @param attemptedCodeHash huella del código que se acaba de intentar
 *   (`pairingCodeFingerprint`: sha256, o la no criptográfica sin
 *   `crypto.subtle`), o null si no se pudo calcular: sin huella no hay
 *   respaldo. Las dos huellas del MISMO dispositivo se comparan entre sí; si
 *   el esquema cambia (la tableta pasa de http a https) la guardada deja de
 *   coincidir y se pide el código, que es el lado seguro.
 */
export function resolveRedeemFailure(
  failure: RemoteApiFailure,
  stored: StoredRemoteDisplay | null,
  attemptedCodeHash: string | null,
): { kind: 'fallback'; stored: StoredRemoteDisplay } | { kind: 'ask_code'; failure: RemoteApiFailure } {
  if (stored && attemptedCodeHash !== null && stored.codeHash === attemptedCodeHash) {
    return { kind: 'fallback', stored };
  }
  return { kind: 'ask_code', failure };
}

/**
 * Qué código se canjea cuando alguien pulsa «Conectar» en la pantalla de
 * emparejamiento (ronda 3 · 3). Devuelve el código saneado, o null si no hay
 * nada que canjear: lo tecleado no son seis dígitos, o ya hay un canje EN
 * VUELO.
 *
 * El «ocupado» tiene que decidirse aquí, fuera de React: el guard vivía
 * dentro del updater de `setPhase`, que React no garantiza ejecutar en el
 * despacho, así que la petición salía igual. Con dos códigos distintos
 * seguidos eso eran dos canjes —uno quemado— y dos cupos del límite por IP.
 */
export function resolvePairingSubmit(raw: unknown, redeemInFlight: boolean): string | null {
  if (redeemInFlight) return null;
  const code = normalizePairingCodeInput(raw);
  return isPairingCodeShape(code) ? code : null;
}

/**
 * Tras un canje fallido, ¿se deja el código tecleado en el campo? (ronda
 * 4 · B6).
 *
 * Solo cuando el fallo NO consumió el código: un corte de red o un 5xx
 * significan que la petición ni siquiera llegó a mirarlo, así que borrar los
 * seis dígitos obliga a teclearlos otra vez —o a pedir otro código a la
 * caja— por un problema que no tiene nada que ver con ellos. Basta con
 * pulsar «Conectar» de nuevo.
 *
 * Con 400, 404 o 429 se limpia: en los dos primeros el código es inválido,
 * está vencido o ya se canjeó, y dejarlo invita a reintentarlo; con el 429 el
 * siguiente intento hay que espaciarlo, y un campo lleno invita justo a lo
 * contrario. En los tres hay que volver a la caja o esperar.
 */
export function shouldKeepPairingCode(failure: RemoteApiFailure): boolean {
  if (failure.kind === 'network') return true;
  return failure.status >= 500;
}

/**
 * Cuántos fallos SEGUIDOS de `/bootstrap` (que no sean 401) hacen que la
 * pantalla ofrezca teclear un código en vez de seguir esperando.
 */
export const BOOTSTRAP_FAILURES_BEFORE_PAIRING = 3;

/**
 * ¿La vista de «Conectando con la caja…» ofrece ya «Emparejar con un código»?
 * (ronda 4 · B4).
 *
 * La fase `bootstrapping` reintenta con retroceso y no sale nunca por sí
 * sola: mientras el fallo no sea un 401 —que sí desempareja— la pantalla
 * espera indefinidamente. Eso está bien para una caída de red de un minuto,
 * pero deja sin salida el caso en que el token guardado ya no sirve para NADA
 * por una razón que el servidor no expresa con un 401 (la terminal se borró y
 * la ruta responde 404, el proyecto se movió, la tableta apunta a otro
 * despliegue): sin acceso al sistema operativo del quiosco no hay forma de
 * teclear un código nuevo. Tres fallos son unos 35 s con el retroceso de
 * `bootstrapRetryDelay` (5 s + 10 s + 20 s): tiempo de sobra para que un
 * corte pasajero se resuelva solo, y lo bastante corto para no plantar a
 * nadie delante del cliente. El reintento NO se detiene por ofrecer el
 * camino: si la red vuelve, la pantalla arranca sola.
 *
 * @param attempt intento en curso (0 = el primero).
 * @param failure fallo del intento en curso, o null si todavía está en vuelo.
 */
export function offersPairingFromBootstrap(attempt: number, failure: RemoteApiFailure | null): boolean {
  const consecutivos = Math.max(0, attempt) + (failure === null ? 0 : 1);
  return consecutivos >= BOOTSTRAP_FAILURES_BEFORE_PAIRING;
}

/** La URL sin `?pair=` (misma ruta y hash), para `history.replaceState` tras canjear. */
export function stripPairFromUrl(href: string): string {
  try {
    const url = new URL(href);
    url.searchParams.delete(PAIR_QUERY_PARAM);
    return url.toString();
  } catch {
    return href;
  }
}

// ---------------------------------------------------------------------------
// Rutas del servidor
// ---------------------------------------------------------------------------

/**
 * El `fetch` que usan las rutas de la pantalla, reducido a lo que se usa.
 *
 * `signal` (ronda 4 · B1) lo rellena `callDisplayApi` para poder ABORTAR una
 * petición que se cuelga; es opcional porque los dobles de las pruebas no
 * tienen por qué mirarlo —el tope de tiempo no depende de que lo respeten:
 * `callDisplayApi` corre la petición contra un plazo y devuelve el fallo de
 * red igual—. `headers` (ronda 4 · B5) es la cabecera de respuesta, de donde
 * sale `Retry-After`; también opcional: los dobles que no la traen dejan
 * `retryAfterSeconds` en null, que es lo que significa «no se sabe».
 */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; cache?: 'no-store'; signal?: AbortSignal },
) => Promise<{
  status: number;
  ok: boolean;
  headers?: { get(name: string): string | null } | null;
  json(): Promise<unknown>;
}>;

export type RemoteApiFailure =
  /**
   * El servidor respondió con un error: `status` y el `code` del body si lo
   * trae. `retryAfterSeconds` es la cabecera `Retry-After` de ESA respuesta
   * (o el `retryAfter` del body si alguna ruta lo pusiera), nunca un valor
   * inventado: si el servidor no dice cuánto esperar, es null (ronda 4 · B5).
   */
  | { ok: false; kind: 'http'; status: number; code: string | null; retryAfterSeconds: number | null }
  /** No hubo respuesta (red, CORS, abort) o el body no era JSON válido. */
  | { ok: false; kind: 'network'; message: string };

export type RemoteApiResult<T> = { ok: true; data: T } | RemoteApiFailure;

export interface PairResult {
  token: string;
  terminalId: string;
}

export interface RemoteBootstrap {
  terminal: { id: string; name: string; code: string; branchId: number };
  brand: {
    organizationId: number;
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    timezone: string;
  };
  /** `pos_customer_display` validado en el servidor. La pantalla no lo usa en la parte B: los ajustes que pinta llegan en `hello.settings` desde la caja. */
  settings: Record<string, unknown>;
  locale: string;
  currency: string;
  realtime: RemoteRealtimeCredential;
}

export interface RemoteRealtimeCredential {
  channel: string;
  token: string;
  expiresAt: string;
}

export interface HeartbeatResult {
  terminalId: string;
  at: string;
  realtime: RemoteRealtimeCredential;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRealtimeCredential(value: unknown): value is RemoteRealtimeCredential {
  return isRecord(value) && typeof value.channel === 'string' && value.channel.length > 0 && typeof value.token === 'string' && value.token.length > 0 && typeof value.expiresAt === 'string';
}

/**
 * ¿El canal de esta credencial es el de `terminalId`? Guardarraíl de la ronda
 * 2 · 6, extraído aquí en la ronda 4 · 4 para que `/bootstrap` y `/heartbeat`
 * lo compartan: la pantalla se une al canal que le dice el servidor pero
 * filtra los sobres por su `terminalId`, así que una credencial cuyo canal no
 * case deja la tableta unida a un canal ajeno descartándolo todo —muda y sin
 * diagnóstico—. Se normaliza a minúsculas en los dos lados: el servidor firma
 * el claim y nombra el canal con el id en minúsculas
 * (`issueDisplayRealtimeCredential`), y Postgres devuelve los uuid así, pero
 * no se deja que la coincidencia dependa de esa costumbre.
 */
function credentialMatchesTerminal(credential: RemoteRealtimeCredential, terminalId: string, contexto: string): boolean {
  const expected = displayChannelName(terminalId.toLowerCase());
  if (credential.channel === expected) return true;
  console.warn(`[pos-display/remoto] el canal de ${contexto} no corresponde a la terminal; se descarta`, { channel: credential.channel, esperado: expected });
  return false;
}

/**
 * ¿Es un bootstrap con lo que la pantalla necesita? Solo se comprueba lo que
 * se USA; el resto se pasa tal cual.
 *
 * Además de la FORMA se exige COHERENCIA entre `realtime.channel` y
 * `terminal.id` (ronda 2 · 6): la pantalla se une al canal que le dice el
 * servidor pero filtra los sobres por `terminal.id`, así que si los dos no
 * casaran —una regresión en el servidor— quedaría unida a un canal ajeno
 * descartándolo todo: «Conectando» eterno y ningún diagnóstico. Es más
 * barato rechazar el bootstrap y decirlo.
 */
export function isRemoteBootstrap(value: unknown): value is RemoteBootstrap {
  if (!isRecord(value)) return false;
  const { terminal, brand, realtime } = value;
  const shapeOk =
    isRecord(terminal) &&
    typeof terminal.id === 'string' &&
    terminal.id.length > 0 &&
    isRecord(brand) &&
    typeof brand.organizationId === 'number' &&
    typeof brand.timezone === 'string' &&
    isRecord(value.settings) &&
    typeof value.currency === 'string' &&
    isRealtimeCredential(realtime);
  if (!shapeOk) return false;
  return credentialMatchesTerminal(realtime as RemoteRealtimeCredential, (terminal as { id: string }).id, 'el bootstrap');
}

/**
 * Idioma que debe pintar la pantalla remota, o null si no hay que cambiar
 * nada (ronda 4 · QA-4).
 *
 * `bootstrap.locale` sale del ajuste `pos_customer_display` de la
 * organización, resuelto en el servidor. Hasta la ronda 3 se validaba, se
 * transportaba y NO se usaba: el idioma efectivo de una tableta recién
 * sacada de la caja era el del navegador, no el del comercio. Se aplica con
 * `changeLanguage` (i18n/provider), que carga los mensajes y avisa al
 * proveedor sin recargar la página.
 *
 * Devuelve null si el locale no es uno de los de la app o si ya es el que
 * está puesto: así el efecto que lo llama no puede entrar en bucle.
 * Solo aplica al modo REMOTO; en local el idioma sigue siendo el del equipo,
 * que es el mismo de la caja.
 */
export function resolveRemoteLocale(bootstrapLocale: unknown, currentLocale: unknown): Locale | null {
  if (typeof bootstrapLocale !== 'string') return null;
  const base = bootstrapLocale.split('-')[0].toLowerCase();
  if (!isValidLocale(base)) return null;
  if (typeof currentLocale === 'string' && currentLocale.split('-')[0].toLowerCase() === base) return null;
  return base;
}

/**
 * Plazo de CADA petición a `/api/pos/display/*` (ronda 4 · B1).
 *
 * Sin él, una petición que nunca responde —wifi de hotel que acepta la
 * conexión y no contesta, proxy cautivo, la tableta suspendida a medio
 * vuelo— dejaba el `await` colgado para siempre: el bootstrap no llegaba a
 * su reintento con retroceso y el latido no volvía a salir, porque el guard
 * de «uno en vuelo» seguía viendo el primero. Diez segundos son de sobra
 * para tres lecturas y una firma; pasados, se aborta y se trata como un
 * fallo de red normal, que es lo que ya sabe reintentar todo el camino.
 */
export const DISPLAY_API_TIMEOUT_MS = 10_000;

/** Mensaje del fallo de red cuando vence `DISPLAY_API_TIMEOUT_MS`. */
export const DISPLAY_API_TIMEOUT_MESSAGE = 'tiempo de espera agotado';

/**
 * `Retry-After` en segundos (ronda 4 · B5). La especificación admite también
 * una fecha HTTP; se aceptan las dos y se devuelve null con cualquier otra
 * cosa. Nunca se inventa una ventana: null significa «el servidor no lo
 * dijo», no «espere lo de siempre».
 */
function parseRetryAfterHeader(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    return Number.isFinite(seconds) ? seconds : null;
  }
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/** Lee una cabecera de respuesta sin dar por hecho que el doble trae `headers`. */
function readResponseHeader(response: Awaited<ReturnType<FetchLike>>, name: string): string | null {
  const headers = response.headers;
  if (!headers || typeof headers.get !== 'function') return null;
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

/** Un plazo compartido por la petición y por la lectura del body. Se cancela siempre. */
function startDeadline(ms: number): { expired: Promise<'timeout'>; abort: AbortSignal | undefined; cancel: () => void } {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const expired = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      timer = null;
      controller?.abort();
      resolve('timeout');
    }, ms);
    unrefTimer(timer);
  });
  return {
    expired,
    abort: controller?.signal,
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

async function callDisplayApi<T>(
  fetchFn: FetchLike,
  input: string,
  init: { method: 'GET' | 'POST'; token?: string; body?: unknown },
  pick: (data: unknown) => T | null,
): Promise<RemoteApiResult<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const deadline = startDeadline(DISPLAY_API_TIMEOUT_MS);
  try {
    // La petición corre contra el plazo. Se le pasa `signal` para que un
    // `fetch` de verdad la aborte, pero el desenlace no depende de eso: si el
    // doble inyectado lo ignora, gana el plazo igual (Promise.race) y el
    // `await` no se queda colgado.
    const settled = await Promise.race([
      fetchFn(input, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: 'no-store',
        signal: deadline.abort,
      }).then(
        (response) => ({ kind: 'response' as const, response }),
        (err: unknown) => ({ kind: 'error' as const, err }),
      ),
      deadline.expired,
    ]);
    if (settled === 'timeout') return { ok: false, kind: 'network', message: DISPLAY_API_TIMEOUT_MESSAGE };
    if (settled.kind === 'error') {
      const err = settled.err;
      return { ok: false, kind: 'network', message: err instanceof Error ? err.message : String(err) };
    }
    const response = settled.response;

    // El body también va contra el MISMO plazo: una respuesta con cabeceras
    // y sin cuerpo (streaming que no cierra) colgaba igual que la petición.
    const bodySettled = await Promise.race([
      response.json().then(
        (value: unknown) => ({ kind: 'body' as const, value }),
        () => ({ kind: 'invalid' as const }),
      ),
      deadline.expired,
    ]);
    if (bodySettled === 'timeout' && response.ok) return { ok: false, kind: 'network', message: DISPLAY_API_TIMEOUT_MESSAGE };
    const body: unknown = bodySettled !== 'timeout' && bodySettled.kind === 'body' ? bodySettled.value : null;
    if (bodySettled !== 'timeout' && bodySettled.kind === 'invalid' && response.ok) {
      return { ok: false, kind: 'network', message: 'respuesta sin JSON' };
    }
    if (!response.ok) {
      const code = isRecord(body) && typeof body.code === 'string' ? body.code : null;
      const fromBody = isRecord(body) && typeof body.retryAfter === 'number' ? body.retryAfter : null;
      const retry = fromBody ?? parseRetryAfterHeader(readResponseHeader(response, 'Retry-After'));
      return { ok: false, kind: 'http', status: response.status, code, retryAfterSeconds: retry };
    }
    const data = pick(isRecord(body) ? body.data : undefined);
    if (data === null) return { ok: false, kind: 'network', message: 'respuesta con forma inesperada' };
    return { ok: true, data };
  } finally {
    deadline.cancel();
  }
}

/** Canjea el código por el token largo. 404 = inválido/vencido/canjeado; 429 = demasiados intentos. */
export function pairWithCode(code: string, fetchFn: FetchLike, endpoint: string = PAIR_ENDPOINT): Promise<RemoteApiResult<PairResult>> {
  return callDisplayApi(fetchFn, endpoint, { method: 'POST', body: { code } }, (data) => {
    if (!isRecord(data) || !isDisplayTokenShape(data.token) || typeof data.terminalId !== 'string' || data.terminalId.length === 0) return null;
    return { token: data.token, terminalId: data.terminalId };
  });
}

export interface FetchRemoteBootstrapOptions {
  endpoint?: string;
  /**
   * Terminal del emparejamiento guardado. Igual que en el latido (ronda 4 · 4):
   * un bootstrap coherente consigo mismo pero de OTRA terminal —regresión del
   * servidor, o un token reasignado— se descarta como fallo reintentable en
   * vez de unir la pantalla al canal de una caja ajena. Opcional para no
   * obligar a las pruebas de forma a conocer la terminal.
   */
  expectedTerminalId?: string;
}

/** Marca, ajustes, terminal y credencial de Realtime. 401 = token revocado o inválido; 503 = Realtime no configurado. */
export function fetchRemoteBootstrap(
  token: string,
  fetchFn: FetchLike,
  endpointOrOptions: string | FetchRemoteBootstrapOptions = BOOTSTRAP_ENDPOINT,
): Promise<RemoteApiResult<RemoteBootstrap>> {
  const options: FetchRemoteBootstrapOptions =
    typeof endpointOrOptions === 'string' ? { endpoint: endpointOrOptions } : endpointOrOptions;
  const endpoint = options.endpoint ?? BOOTSTRAP_ENDPOINT;
  return callDisplayApi(fetchFn, endpoint, { method: 'GET', token }, (data) => {
    if (!isRemoteBootstrap(data)) return null;
    const esperada = options.expectedTerminalId;
    if (typeof esperada === 'string' && esperada.length > 0 && data.terminal.id.toLowerCase() !== esperada.toLowerCase()) {
      console.warn('[pos-display/remoto] el arranque devolvió otra terminal; se descarta', { terminalId: data.terminal.id, esperada });
      return null;
    }
    return data;
  });
}

export interface SendRemoteHeartbeatOptions {
  endpoint?: string;
  /**
   * Terminal con la que la pantalla está emparejada. Si se pasa, el latido
   * EXIGE que la credencial sea suya (ronda 4 · 4): el consumidor aplica el
   * JWT con `setToken` sin más comprobación, así que una credencial de otra
   * terminal —una regresión del servidor— re-autenticaría el canal ya unido
   * con un `pos_terminal_id` ajeno y la tableta quedaría muda. El camino de
   * producción (`startRemoteHeartbeat` desde `useRemoteDisplay`) siempre lo
   * pasa; queda opcional para no obligar a las pruebas de la forma del
   * latido a conocer la terminal.
   */
  expectedTerminalId?: string;
}

/**
 * Latido: registra presencia y devuelve el JWT de canal renovado. 401 =
 * revocada. Un desajuste de terminal o de canal NO es 401: devuelve el fallo
 * reintentable (`kind: 'network'`) con un `console.warn` explícito, igual que
 * hace `isRemoteBootstrap`, para que el siguiente tick vuelva a intentarlo en
 * vez de desemparejar la pantalla.
 */
export function sendRemoteHeartbeat(token: string, fetchFn: FetchLike, options: SendRemoteHeartbeatOptions = {}): Promise<RemoteApiResult<HeartbeatResult>> {
  return callDisplayApi(fetchFn, options.endpoint ?? HEARTBEAT_ENDPOINT, { method: 'POST', token }, (data) => {
    if (!isRecord(data) || typeof data.terminalId !== 'string' || data.terminalId.length === 0 || !isRealtimeCredential(data.realtime)) return null;
    const terminalId = data.terminalId;
    const esperada = options.expectedTerminalId;
    if (typeof esperada === 'string' && esperada.length > 0 && terminalId.toLowerCase() !== esperada.toLowerCase()) {
      console.warn('[pos-display/remoto] el latido devolvió otra terminal; se descarta la credencial', { terminalId, esperada });
      return null;
    }
    if (!credentialMatchesTerminal(data.realtime, terminalId, 'el latido')) return null;
    return { terminalId, at: typeof data.at === 'string' ? data.at : '', realtime: data.realtime };
  });
}

/** ¿Este fallo significa «la pantalla ya no está emparejada»? Solo el 401: un 503 o un corte de red no desempareja. */
export function isUnauthorizedFailure(failure: RemoteApiFailure): boolean {
  return failure.kind === 'http' && failure.status === 401;
}

/**
 * ¿Se puede forzar un latido ahora? (ronda 3 · 6). `lastBeatAt` es el
 * instante del último latido —forzado o periódico— que salió bien; null si
 * todavía no hubo ninguno, y entonces sí se fuerza.
 */
export function shouldForceBeat(lastBeatAt: number | null, now: number): boolean {
  if (lastBeatAt === null) return true;
  return now - lastBeatAt >= FORCED_BEAT_MIN_INTERVAL_MS;
}

/** Espera antes de reintentar el bootstrap tras `attempt` fallos consecutivos (0 → 5 s, 1 → 10 s, … tope 60 s). */
export function bootstrapRetryDelay(attempt: number): number {
  const safe = Math.max(0, Math.min(attempt, 10));
  return Math.min(BOOTSTRAP_RETRY_BASE_MS * 2 ** safe, BOOTSTRAP_RETRY_MAX_MS);
}

// ---------------------------------------------------------------------------
// Latido periódico
// ---------------------------------------------------------------------------

export interface RemoteHeartbeatOptions {
  token: string;
  fetchFn: FetchLike;
  /** Cada latido que responde 200: aplicar la credencial nueva al canal (`realtime.setAuth`). */
  onCredential: (credential: RemoteRealtimeCredential) => void;
  /** 401: el token ya no vale. El llamador borra el token y sale del canal. Se llama UNA vez; el latido se detiene solo. */
  onRevoked: () => void;
  /** Fallo distinto de 401 (503, red): informativo; se reintenta en el siguiente tick. */
  onFailure?: (failure: RemoteApiFailure) => void;
  intervalMs?: number;
  endpoint?: string;
  /**
   * Terminal emparejada. El latido descarta (como fallo reintentable) toda
   * credencial que no sea suya; ver `SendRemoteHeartbeatOptions`.
   */
  expectedTerminalId?: string;
  /**
   * true para latir en cuanto arranca. Por defecto FALSE: el primer latido
   * espera un intervalo entero porque el bootstrap acaba de entregar un JWT
   * fresco (el comentario anterior decía lo contrario que el código; ronda
   * 3 · 5).
   */
  immediate?: boolean;
}

export interface RemoteHeartbeat {
  /** Fuerza un latido ahora (p. ej. al volver la pestaña a primer plano). Nunca solapa dos en vuelo. */
  beat(): Promise<void>;
  stop(): void;
  readonly stopped: boolean;
}

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>): void {
  const maybeUnref = timer as unknown as { unref?: () => void };
  if (typeof maybeUnref.unref === 'function') maybeUnref.unref();
}

/**
 * Latido a `/heartbeat` cada `intervalMs` (60 s). Un 401 detiene el latido y
 * avisa una sola vez (`onRevoked`); cualquier otro fallo se registra y se
 * vuelve a intentar en el siguiente tick. Dos latidos nunca se solapan.
 */
export function startRemoteHeartbeat(options: RemoteHeartbeatOptions): RemoteHeartbeat {
  const intervalMs = options.intervalMs ?? REMOTE_HEARTBEAT_INTERVAL_MS;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  /** Instante en que salió el latido que hay en vuelo (ver `HEARTBEAT_INFLIGHT_MAX_MS`). */
  let inFlightStartedAt = 0;
  /** Salida del último latido cuya credencial se aplicó: uno abandonado no puede pisarla con una más vieja. */
  let appliedStartedAt = 0;

  const beat = async (): Promise<void> => {
    if (stopped) return;
    const startedAt = Date.now();
    // «Uno en vuelo» deja de valer pasado el tope (ronda 4 · B2): si no, un
    // latido colgado dejaba el latido MUERTO para siempre —cada tick veía el
    // primero y volvía— y con él se congelaba la renovación del JWT de canal,
    // que vive 5 min. Al abandonarlo sale uno nuevo; el viejo, si algún día
    // responde, ya no aplica su credencial (`appliedStartedAt`).
    if (inFlight && startedAt - inFlightStartedAt < HEARTBEAT_INFLIGHT_MAX_MS) return inFlight;
    if (inFlight) console.warn('[pos-display/remoto] el latido anterior sigue en vuelo; se abandona y sale uno nuevo');
    const promise = (async () => {
      const result = await sendRemoteHeartbeat(options.token, options.fetchFn, { endpoint: options.endpoint, expectedTerminalId: options.expectedTerminalId });
      if (stopped) return;
      if (result.ok) {
        if (startedAt < appliedStartedAt) {
          // Latido abandonado que responde tarde: otro posterior ya aplicó
          // una credencial más nueva y esta la haría retroceder.
          console.warn('[pos-display/remoto] llega la respuesta de un latido abandonado; se descarta su credencial');
          return;
        }
        appliedStartedAt = startedAt;
        try {
          options.onCredential(result.data.realtime);
        } catch (err) {
          console.error('[pos-display/remoto] onCredential falló:', err);
        }
        return;
      }
      if (isUnauthorizedFailure(result)) {
        if (startedAt < appliedStartedAt) {
          // Mismo criterio de antigüedad que para la credencial: un latido
          // ABANDONADO que responde 401 tarde no puede desemparejar una
          // pantalla que un latido POSTERIOR ya autenticó con el MISMO token.
          // Desemparejar aquí borraba el token del storage y plantaba la
          // pantalla de emparejamiento delante del cliente con todo sano.
          console.warn('[pos-display/remoto] 401 de un latido abandonado; ya hay uno posterior autenticado: se descarta');
          return;
        }
        stop();
        try {
          options.onRevoked();
        } catch (err) {
          console.error('[pos-display/remoto] onRevoked falló:', err);
        }
        return;
      }
      console.warn('[pos-display/remoto] latido falló; se reintenta en el siguiente tick', result);
      try {
        options.onFailure?.(result);
      } catch (err) {
        console.error('[pos-display/remoto] onFailure falló:', err);
      }
    })();
    inFlight = promise;
    inFlightStartedAt = startedAt;
    void promise.finally(() => {
      // Solo lo limpia el latido que sigue siendo el vigente: el abandonado
      // no puede borrar el hueco del que salió después de él.
      if (inFlight === promise) inFlight = null;
    });
    return promise;
  };

  const timer = setInterval(() => {
    void beat();
  }, intervalMs);
  unrefTimer(timer);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  };

  if (options.immediate === true) void beat();

  return {
    beat,
    stop,
    get stopped() {
      return stopped;
    },
  };
}
