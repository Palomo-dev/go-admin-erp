/**
 * Revocación de la pantalla remota vista DESDE LA CAJA (Fase 3, parte C,
 * ronda 5 · 2).
 *
 * EL PROBLEMA QUE CIERRA
 * ----------------------
 * «Revocar» es el control que el administrador pulsa justo cuando el
 * dispositivo se perdió, y hasta esta ronda solo surtía efecto si la tableta
 * COOPERABA: la ruta `/api/pos/display/revoke` borra `display_token_hash` y
 * `display_last_seen_at`, la tableta honesta recibe un 401 en su siguiente
 * latido y se apaga… pero una tableta robada u hostil que ignore el 401
 * conserva su JWT de Realtime hasta REALTIME_JWT_TTL_SECONDS (5 min) y sus
 * `display_alive` mantenían abierta la compuerta del tubo remoto. La caja le
 * seguía publicando carrito, totales, cliente y el payload del QR de pago,
 * con el indicador del POS diciendo «conectada (remota)».
 *
 * La caja no puede consultar si una terminal está emparejada (el hash vive
 * en `pos_terminal_secrets`, sin permisos para `authenticated`), pero SÍ
 * sabe que ella misma acaba de revocar. Eso es lo que se anota aquí: un
 * pestillo por terminal que cierra la pata remota EN EL ACTO y la deja
 * cerrada hasta que se abra un emparejamiento nuevo.
 *
 * ALCANCE DELIBERADO
 * - No se publica ningún mensaje al dispositivo revocado: a una tableta
 *   honesta ya la apaga su propio 401, y una hostil no iba a hacerle caso.
 *   Lo que importa —y es lo que se arregla— es que la CAJA deje de hablar. La
 *   pata revocada queda además SORDA: lo que llegue por ella no se entrega, así
 *   que la presencia remota caduca y el indicador del POS deja de decir
 *   «conectada (remota)» de un dispositivo al que ya no se le habla.
 * - El pestillo es del navegador, no de la base: se propaga entre ventanas
 *   del mismo origen con `localStorage` + evento `storage`, igual que el
 *   interruptor maestro (posDisplay.ts). Una caja en OTRA máquina no se
 *   entera hasta que su propia pata remota caduque; ahí la barrera sigue
 *   siendo el 401 de la tableta y el TTL del JWT. Queda anotado.
 * - Y SOBREVIVE A LA RECARGA (ronda 4 · qa/tester 1). Hasta esta ronda el
 *   pestillo vivía solo en un `Set` en memoria del módulo: las dos claves de
 *   `localStorage` se ESCRIBÍAN para avisar a las ventanas ya abiertas y
 *   nadie las leía nunca. Un F5 del POS —o abrir el POS en una pestaña nueva
 *   DESPUÉS de revocar desde Configuración— hacía nacer la pata remota sin
 *   pestillo, y el `display_alive` de una tableta revocada que ignorase su
 *   401 (JWT vivo hasta 5 min) la reabría: carrito, totales, cliente y el
 *   payload del QR de pago otra vez en el dispositivo que se acababa de
 *   revocar. Ahora hay una tercera clave, REMOTE_DISPLAY_REVOKED_STATE_KEY,
 *   con el estado DURADERO —un mapa `{ terminalId: instante }`, no una marca
 *   suelta— del que el módulo se hidrata en su primera consulta. Un mapa y
 *   no una marca porque con una sola entrada revocar A y emparejar B después
 *   borraba el pestillo de A.
 *   Las dos claves de aviso no cambian de formato: son el canal entre
 *   ventanas (evento `storage`) y las lee `applyRemoteDisplayRevocationEvent`.
 * - Se suelta al emitir un código de emparejamiento NUEVO para esa terminal
 *   —y solo cuando la ruta CONFIRMA que emitió uno nuevo, no por abrir el
 *   diálogo (ronda 4 · qa/tester 3)—: es la señal explícita de «voy a
 *   emparejar otra pantalla». Mientras tanto ni un `display_alive`
 *   perfectamente formado reabre la pata.
 *
 * Sin React, sin Supabase, sin DOM obligatorio: el almacenamiento se inyecta
 * y en Node (SSR, pruebas) todo funciona en memoria.
 */

/** localStorage: última revocación anunciada, como `<terminalId>:<Date.now()>`. */
export const REMOTE_DISPLAY_REVOKED_KEY = 'pos_customer_display_revoked';
/** localStorage: último emparejamiento reabierto, con el mismo formato. */
export const REMOTE_DISPLAY_PAIRING_KEY = 'pos_customer_display_pairing';
/**
 * localStorage: estado DURADERO del pestillo, JSON `{ "<terminalId>": <instante> }`.
 * Es lo que hace que «Revocar» sobreviva a un F5 y alcance a una pestaña que
 * se abre después. Las dos claves de arriba siguen siendo solo avisos.
 */
export const REMOTE_DISPLAY_REVOKED_STATE_KEY = 'pos_customer_display_revoked_state';

/**
 * Cuánto dura el pestillo. La credencial de Realtime que lleva la pantalla
 * remota vive 5 minutos (`REALTIME_JWT_TTL_SECONDS`), y `/revoke` ya borró el
 * hash: en cuanto caduca, esa pantalla no puede renovarla ni volver a entrar
 * en el canal. Pasado ese plazo (más un minuto de margen de reloj) el pestillo
 * se suelta SOLO: si no, revocar y volver a emparejar dejaba la caja muda para
 * siempre, porque el código que se emite al abrir el diálogo no es señal de
 * que haya una pantalla nueva y soltarlo ahí devolvía el carrito a la pantalla
 * revocada durante los minutos que su credencial seguía viva.
 */
export const REMOTE_DISPLAY_REVOCATION_LATCH_MS = 6 * 60 * 1000;

/** Milisegundos que le quedan al pestillo de esta terminal; 0 si no está echado o ya caducó. */
export function remoteDisplayRevocationRemainingMs(
  terminalId: string,
  storage: RevocationStorage | null = defaultStorage(),
  now: number = Date.now(),
): number {
  const desde = hidratar(storage).revocadas.get(terminalId);
  if (desde === undefined) return 0;
  return Math.max(0, desde + REMOTE_DISPLAY_REVOCATION_LATCH_MS - now);
}

export type RemoteDisplayRevocationListener = (terminalId: string, revoked: boolean) => void;

const listeners = new Set<RemoteDisplayRevocationListener>();

/**
 * Subconjunto de `Storage` que hace falta; permite inyectar uno en pruebas.
 * `getItem` es OPCIONAL a propósito: los dobles de las pruebas anteriores
 * solo traen `setItem` y deben seguir compilando. Sin `getItem` no hay
 * hidratación, solo aviso.
 */
export interface RevocationStorage {
  setItem(key: string, value: string): void;
  getItem?(key: string): string | null;
}

function defaultStorage(): RevocationStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // storage bloqueado por el navegador
  }
}

/**
 * Terminales revocadas en este NAVEGADOR (id → instante de la revocación) y
 * si ya se leyó el estado duradero.
 *
 * Vive colgado de `globalThis` y no en una variable del módulo porque el
 * pestillo es del navegador, no de una copia concreta del módulo: Next.js
 * puede evaluar el mismo módulo más de una vez (cliente y servidor, HMR) y
 * dos copias con dos `Set` distintos dejarían media caja con el pestillo
 * echado y la otra media publicando. En las pruebas es además lo que hace
 * observable que el pestillo sobreviva a un `jest.resetModules()`, que es el
 * equivalente en Node a recargar la página.
 */
interface RegistroDeRevocaciones {
  revocadas: Map<string, number>;
  hidratado: boolean;
}

const CLAVE_GLOBAL = '__goadminPosDisplayRevocaciones__';

function registro(): RegistroDeRevocaciones {
  const raiz = globalThis as unknown as Record<string, RegistroDeRevocaciones | undefined>;
  let actual = raiz[CLAVE_GLOBAL];
  if (!actual) {
    actual = { revocadas: new Map<string, number>(), hidratado: false };
    raiz[CLAVE_GLOBAL] = actual;
  }
  return actual;
}

/** Almacenamiento del que hidratar: el inyectado si sabe leer, y si no el del navegador. */
function almacenDeLectura(storage: RevocationStorage | null): RevocationStorage | null {
  if (storage && typeof storage.getItem === 'function') return storage;
  const porDefecto = defaultStorage();
  return porDefecto && typeof porDefecto.getItem === 'function' ? porDefecto : null;
}

/**
 * Lee el estado duradero UNA vez por registro y lo funde con lo que ya hay.
 * Solo AÑADE: nunca borra un pestillo echado en esta carga, porque el estado
 * guardado puede ser más viejo que lo que acaba de pasar en esta ventana.
 */
function hidratar(storage: RevocationStorage | null): RegistroDeRevocaciones {
  const reg = registro();
  if (reg.hidratado) return reg;
  reg.hidratado = true;
  const almacen = almacenDeLectura(storage);
  if (!almacen?.getItem) return reg;
  try {
    const bruto = almacen.getItem(REMOTE_DISPLAY_REVOKED_STATE_KEY);
    if (!bruto) return reg;
    const datos: unknown = JSON.parse(bruto);
    if (typeof datos !== 'object' || datos === null || Array.isArray(datos)) return reg;
    for (const [terminalId, instante] of Object.entries(datos as Record<string, unknown>)) {
      if (terminalId.length === 0 || reg.revocadas.has(terminalId)) continue;
      reg.revocadas.set(terminalId, typeof instante === 'number' && Number.isFinite(instante) ? instante : 0);
    }
  } catch (err) {
    console.warn('[pos-display] no se pudo leer el pestillo de revocación guardado', err);
  }
  return reg;
}

/** Guarda el mapa completo: así revocar A y emparejar B después no pierde el pestillo de A. */
function persistir(storage: RevocationStorage | null): void {
  if (!storage) return;
  const reg = registro();
  const mapa: Record<string, number> = {};
  for (const [terminalId, instante] of reg.revocadas) mapa[terminalId] = instante;
  try {
    storage.setItem(REMOTE_DISPLAY_REVOKED_STATE_KEY, JSON.stringify(mapa));
  } catch (err) {
    console.warn('[pos-display] no se pudo guardar el pestillo de revocación', err);
  }
}

function avisar(terminalId: string, revoked: boolean): void {
  for (const listener of [...listeners]) {
    try {
      listener(terminalId, revoked);
    } catch (err) {
      console.warn('[pos-display] un oyente de la revocación falló', err);
    }
  }
}

/** Marca escrita en localStorage: el id y un instante, para que dos revocaciones seguidas disparen el evento. */
function marca(terminalId: string): string {
  return `${terminalId}:${Date.now()}`;
}

/** Terminal de una marca de localStorage; null si viene vacía o mal formada. */
export function parseRevocationMark(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const terminalId = value.slice(0, value.lastIndexOf(':') === -1 ? value.length : value.lastIndexOf(':'));
  return terminalId.length > 0 ? terminalId : null;
}

/** Temporizadores de caducidad vivos, uno por terminal (la ventana que revoca). */
const caducidades = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Suelta el pestillo solo cuando la credencial de la pantalla revocada ya no
 * puede estar viva. El temporizador es un atajo para la ventana que revoca: el
 * resto de ventanas (y esta misma tras recargar) lo descubren al consultar.
 */
function programarCaducidad(terminalId: string, storage: RevocationStorage | null): void {
  const anterior = caducidades.get(terminalId);
  if (anterior) clearTimeout(anterior);
  const restante = remoteDisplayRevocationRemainingMs(terminalId, storage);
  if (restante <= 0) return;
  const timer = setTimeout(() => {
    caducidades.delete(terminalId);
    clearRemoteDisplayRevoked(terminalId, storage);
  }, restante);
  // En Node (pruebas) un temporizador vivo mantiene el proceso en pie.
  (timer as unknown as { unref?: () => void }).unref?.();
  caducidades.set(terminalId, timer);
}

/**
 * ¿La pantalla remota de esta terminal está revocada (y sin emparejamiento
 * nuevo) en este navegador? La primera consulta hidrata el pestillo desde el
 * estado duradero: por eso una caja recién cargada —o una pestaña abierta
 * después de revocar— ya nace sabiéndolo.
 */
export function isRemoteDisplayRevoked(terminalId: string, storage: RevocationStorage | null = defaultStorage()): boolean {
  const reg = hidratar(storage);
  const desde = reg.revocadas.get(terminalId);
  if (desde === undefined) return false;
  // Caducado: se suelta aquí mismo (y se avisa) para que una caja que solo
  // consulta —sin temporizador, porque se cargó después de revocar— también
  // vuelva a publicar.
  if (Date.now() - desde >= REMOTE_DISPLAY_REVOCATION_LATCH_MS) {
    clearRemoteDisplayRevoked(terminalId, storage);
    return false;
  }
  return true;
}

/**
 * La caja acaba de revocar la pantalla remota de esta terminal: se cierra la
 * pata remota aquí y se avisa a las demás ventanas del mismo origen. La
 * ventana que escribe no recibe su propio evento `storage`, por eso se avisa
 * también en memoria.
 */
export function markRemoteDisplayRevoked(terminalId: string, storage: RevocationStorage | null = defaultStorage()): void {
  if (!terminalId) return;
  const reg = hidratar(storage);
  const cambia = !reg.revocadas.has(terminalId);
  reg.revocadas.set(terminalId, Date.now());
  if (cambia) avisar(terminalId, true);
  programarCaducidad(terminalId, storage);
  try {
    storage?.setItem(REMOTE_DISPLAY_REVOKED_KEY, marca(terminalId));
  } catch (err) {
    console.warn('[pos-display] no se pudo avisar de la revocación de la pantalla remota', err);
  }
  // El estado duradero se guarda SIEMPRE, cambie o no el pestillo: puede
  // faltar en el almacenamiento aunque ya estuviera echado en memoria. Va
  // detrás del aviso —en la misma vuelta síncrona, así que nadie ve un estado
  // a medias— para no alterar el orden de escritura que las ventanas ya
  // abiertas tienen como contrato.
  persistir(storage);
}

/**
 * Se abrió un emparejamiento nuevo para esta terminal (código recién
 * emitido): la pata remota vuelve a poder abrirse cuando una pantalla hable.
 */
export function clearRemoteDisplayRevoked(terminalId: string, storage: RevocationStorage | null = defaultStorage()): void {
  if (!terminalId) return;
  const timer = caducidades.get(terminalId);
  if (timer) {
    clearTimeout(timer);
    caducidades.delete(terminalId);
  }
  const reg = hidratar(storage);
  const cambia = reg.revocadas.delete(terminalId);
  if (cambia) avisar(terminalId, false);
  try {
    storage?.setItem(REMOTE_DISPLAY_PAIRING_KEY, marca(terminalId));
  } catch (err) {
    console.warn('[pos-display] no se pudo avisar del emparejamiento nuevo', err);
  }
  // Se borra SU entrada del mapa guardado, no la clave entera: el pestillo de
  // otra terminal revocada en este mismo navegador sigue echado.
  if (cambia) persistir(storage);
}

/** Solo para pruebas: olvida todo lo anotado en este navegador (incluida la hidratación). */
export function resetRemoteDisplayRevocations(): void {
  for (const timer of caducidades.values()) clearTimeout(timer);
  caducidades.clear();
  const reg = registro();
  reg.revocadas.clear();
  reg.hidratado = false;
}

/** Avisos de cambio del pestillo (la pata remota de cajaChannel.ts se suscribe). Devuelve la baja. */
export function onRemoteDisplayRevocationChange(listener: RemoteDisplayRevocationListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Aplica una marca escrita por OTRA ventana del mismo origen (la tarjeta de
 * Configuración revoca y la caja abierta en otra ventana tiene que cerrar su
 * pata remota sin recargar). Lo llama el ÚNICO listener de `storage` de la
 * caja (posDisplay.ts): registrar uno aparte duplicaría el listener que las
 * pruebas de F0–F2 cuentan. Ignora en silencio cualquier otra clave.
 *
 * No reescribe la marca: `storage` solo llega a las demás ventanas, y
 * reescribirla haría que dos cajas se reenviaran el aviso sin fin.
 */
export function applyRemoteDisplayRevocationEvent(event: { key: string | null; newValue?: string | null }): void {
  if (event.key !== REMOTE_DISPLAY_REVOKED_KEY && event.key !== REMOTE_DISPLAY_PAIRING_KEY) return;
  const terminalId = parseRevocationMark(event.newValue ?? null);
  if (!terminalId) return;
  if (event.key === REMOTE_DISPLAY_REVOKED_KEY) markRemoteDisplayRevoked(terminalId, null);
  else clearRemoteDisplayRevoked(terminalId, null);
}
