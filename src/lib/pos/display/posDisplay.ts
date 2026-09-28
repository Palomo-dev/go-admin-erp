/**
 * Cableado del emisor para el navegador: UN emisor por ventana de caja,
 * transporte BroadcastChannel sobre la terminal local y el interruptor
 * maestro leído de la caché de settings.ts.
 *
 * Es el único módulo de `display/` que conoce la organización activa
 * (useOrganization) y Supabase (settings.ts): emitter.ts se mantiene puro
 * para probarse en Node. posService, la página del POS y CheckoutDialog
 * importan de aquí, nunca construyen un DisplayEmitter a mano.
 *
 * Cambio del interruptor entre ventanas (PLAN §5.2): la caché de settings.ts
 * es por ventana, así que guardar la tarjeta en una pestaña no la invalida
 * en la caja abierta en otra. Al guardar, `notifyCustomerDisplaySettingsChanged`
 * escribe una marca en localStorage; el evento `storage` cruza pestañas y
 * ventanas del mismo origen (Electron incluido) y cada caja arrancada
 * relee la fila y abre o cierra su transporte sin recargar. La ventana que
 * escribe no recibe su propio evento; como el servicio ya fijó la caché con
 * el valor recién guardado (`primeCustomerDisplaySettings`), la tarjeta llama
 * a `applyPosDisplaySettings()`, que aplica la caché sin volver a leer la BD.
 *
 * Fase 3, parte C (pantalla en otro dispositivo): el transporte sigue siendo
 * UNO (`BroadcastChannelTransport`, un solo seq y una sola instancia), pero
 * su canal es el compuesto de cajaChannel.ts: la pata local (relay de
 * escritorio o BroadcastChannel) siempre, y la pata remota (Supabase
 * Broadcast, canal privado `pos-display:<pos_terminals.id>`, parte B) solo
 * si esta caja está VINCULADA a esa terminal y la fila EXISTE, activa y de
 * esta organización, según el SERVIDOR (`PosTerminalsService.getTerminalById`,
 * una lectura con RLS por apertura del transporte). Si la lectura falla o no
 * devuelve fila no se abre el canal remoto (fail closed) y el indicador del
 * POS lo dice (`getRemoteDisplayLegStatus`). La pata remota publica únicamente mientras una pantalla
 * remota da señal (multiChannel.ts, compuerta de oyente): sin tableta, cero
 * mensajes por Realtime. Los dobles de prueba de Supabase no traen
 * `channel`: entonces no hay pata remota y todo es idéntico a F0–F2.
 */

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { DisplayEmitter } from './emitter';
import type { DisplayPresenceEnvironment } from './presence';
import {
  getCachedCustomerDisplaySettings,
  hasCustomerDisplaySettingsCache,
  isCustomerDisplayEnabled,
  loadCustomerDisplaySettings,
  refreshCustomerDisplaySettings,
  toDisplayPresentationSettings,
} from './settings';
import { getOrCreateLocalTerminalId } from './terminal';
import { sendDisplayRating } from './feedback';
import { BroadcastChannelTransport, createBroadcastDisplayChannel, isBroadcastChannelSupported, type DisplayTransport } from './transport';
import { isDisplayTransportAvailable, resolveDisplayChannelFactory } from './desktopChannel';
import { createCajaDisplayChannel } from './cajaChannel';
import type { SupabaseClientLike } from './supabaseBroadcastTransport';
import { supabase } from '@/lib/supabase/config';
import { PosTerminalsService } from '@/lib/services/posTerminalsService';
import { applyRemoteDisplayRevocationEvent } from './revocation';

export { isBroadcastChannelSupported };

/** localStorage: marca (Date.now()) que se escribe al guardar `pos_customer_display`; su evento `storage` avisa a las otras cajas. */
export const CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY = 'pos_customer_display_changed';

/** Moneda con la que emite la caja si la consulta de moneda base falla; coincide con el fallback de emitter.ts. */
export const DEFAULT_DISPLAY_CURRENCY = 'COP';

/** Subconjunto de `Window` para el evento `storage`; permite inyectar uno en pruebas. */
export interface SettingsChangeSource {
  addEventListener(type: 'storage', listener: (event: { key: string | null; newValue?: string | null }) => void): void;
  removeEventListener(type: 'storage', listener: (event: { key: string | null; newValue?: string | null }) => void): void;
}

export interface SettingsChangeStorage {
  setItem(key: string, value: string): void;
}

let instance: DisplayEmitter | null = null;
/** Baja del listener `storage` registrado por startPosDisplay; null si no hay ninguno. */
let unsubscribeSettingsChanges: (() => void) | null = null;

/** Cliente Realtime de la sesión, si el módulo de Supabase lo expone (los dobles de prueba solo traen `from`). */
function resolveRealtimeClient(): SupabaseClientLike | null {
  const candidate = supabase as unknown as Partial<SupabaseClientLike> | null | undefined;
  return candidate && typeof candidate.channel === 'function' ? (candidate as SupabaseClientLike) : null;
}

/**
 * Por qué esta caja tiene (o no tiene) pata remota. Lo lee el indicador del
 * POS para no callarse cuando la pantalla remota simplemente no va a
 * funcionar (F3-C ronda 4 · C1).
 * - 'pendiente': todavía se está comprobando (o no hay transporte).
 * - 'colgada': la terminal se verificó contra el servidor y la pata quedó puesta.
 * - 'sin-vinculo': esta caja no está vinculada a una fila de `pos_terminals`
 *   de esta organización, o la fila está desactivada. No hay nada que emparejar.
 * - 'sin-verificar': la comprobación FALLÓ (sin sesión, sin red, RLS). Se
 *   falla cerrado: no se abre el canal remoto.
 * - 'no-aplica': este entorno no tiene cliente de Realtime (SSR, dobles de prueba).
 */
export type RemoteDisplayLegStatus = 'pendiente' | 'colgada' | 'sin-vinculo' | 'sin-verificar' | 'no-aplica';

let estadoPataRemota: RemoteDisplayLegStatus = 'pendiente';

/** Estado de la pata remota de ESTA ventana de caja (para el indicador del POS). */
export function getRemoteDisplayLegStatus(): RemoteDisplayLegStatus {
  return estadoPataRemota;
}

/**
 * ¿Esta caja puede emitir por el canal remoto de `terminalId`? Dos
 * condiciones, y las dos tienen que darse (F3-C ronda 4 · C1):
 *
 * 1. La caja está VINCULADA a esa terminal: el id que el transporte estampa
 *    en el sobre es el que esta caja tiene vinculado en localStorage. Un
 *    UUID local de la Fase 0 no es una terminal y no abre nada.
 * 2. Esa fila EXISTE, está activa y es de esta organización según el
 *    SERVIDOR: se lee `pos_terminals` por ese id exacto con el cliente de la
 *    sesión (RLS), no se deduce de localStorage. Si la lectura falla o no
 *    devuelve fila, no hay pata remota —fail closed— y el indicador lo dice.
 *
 * Antes esto era `isRegisteredActiveTerminal`, que llamaba a
 * `getLinkedTerminal()`: la guarda leía el id de localStorage y lo comparaba
 * con otro id de localStorage, así que la comprobación era circular y no
 * distinguía «no se pudo comprobar» de «no es una terminal». Se borró.
 *
 * LÍMITE RESIDUAL, DECLARADO (F3-C ronda 4 · C1 c). La suplantación ENTRE
 * ORGANIZACIONES y entre SUCURSALES la cierra la base: las políticas
 * `pos_display_caja_recibe` / `pos_display_caja_envia` sobre
 * `realtime.messages` exigen que la terminal del topic sea de la organización
 * del miembro y que ese miembro sea admin/manager/super o tenga la sucursal
 * de la terminal. Lo que queda abierto es que un miembro de ESA MISMA
 * SUCURSAL apunte su localStorage a otra caja de la sucursal y vea su
 * carrito: el id de la terminal sigue saliendo del cliente. Cerrarlo exige
 * atar la terminal a algo que el cliente no elija (un claim de terminal en la
 * sesión, o un canal por usuario y terminal), que es cambio de esquema y de
 * políticas: queda en pendientes, no se inventa aquí.
 */
async function terminalVinculadaYVerificada(terminalId: string): Promise<boolean> {
  const vinculada = PosTerminalsService.getLocalTerminalId();
  if (vinculada === null || vinculada !== terminalId) {
    estadoPataRemota = 'sin-vinculo';
    return false;
  }
  let row: Awaited<ReturnType<typeof PosTerminalsService.getTerminalById>>;
  try {
    row = await PosTerminalsService.getTerminalById(terminalId);
  } catch (err) {
    // Fail closed y con motivo: «no se pudo comprobar» no es «no existe».
    console.warn('[pos-display] no se pudo comprobar la terminal en el servidor; sin pantalla remota', err);
    estadoPataRemota = 'sin-verificar';
    return false;
  }
  if (row === null || row.is_active !== true || row.id !== terminalId) {
    estadoPataRemota = 'sin-vinculo';
    return false;
  }
  estadoPataRemota = 'colgada';
  return true;
}

function createBrowserTransport(): DisplayTransport | null {
  if (typeof window === 'undefined' || !isDisplayTransportAvailable()) return null;
  // En Go Admin Desktop el canal local va por el relay del proceso principal
  // (enlaza sin red y aunque las ventanas carguen orígenes distintos); en el
  // navegador, BroadcastChannel. Fase 3, parte C: además, si esta caja está
  // vinculada a una terminal registrada, el MISMO sobre sale también por el
  // canal privado de Supabase Broadcast de esa terminal (cajaChannel.ts):
  // un solo transporte, un solo seq, dos tubos. La lógica del transporte es
  // la misma en todos los casos.
  const realtime = resolveRealtimeClient();
  estadoPataRemota = realtime ? 'pendiente' : 'no-aplica';
  // La compuerta del tubo remoto necesita el `instanceId` del transporte para
  // aplicar el MISMO filtro que `receive` (ronda 4 · 4), pero el canal se abre
  // DENTRO del constructor, cuando todavía no hay referencia: se resuelve en
  // diferido con esta celda, que queda rellena en cuanto el constructor vuelve
  // —mucho antes de que llegue el primer mensaje de una pantalla—.
  const instancia: { id: string | null } = { id: null };
  const transport = new BroadcastChannelTransport({
    terminalId: getOrCreateLocalTerminalId(),
    channelFactory: (terminalId) =>
      createCajaDisplayChannel(terminalId, {
        local: resolveDisplayChannelFactory() ?? createBroadcastDisplayChannel,
        realtime,
        isRegisteredTerminal: terminalVinculadaYVerificada,
        instanceId: () => instancia.id,
        onRemoteStatus: (status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[pos-display] canal remoto de la pantalla:', status, err?.message ?? '');
          }
        },
      }),
  });
  instancia.id = transport.instanceId;
  return transport;
}

function defaultChangeSource(): SettingsChangeSource | null {
  return typeof window === 'undefined' ? null : window;
}

function defaultChangeStorage(): SettingsChangeStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // storage bloqueado por el navegador
  }
}

/**
 * Lo que el indicador necesita saber además del emisor para explicar por qué
 * NO emite (presence.ts `reason`): si el interruptor de la organización
 * activa ya se cargó (caché de settings.ts), qué valor tiene (para que una
 * caché ENCENDIDA con el emisor aún sin arrancar cuente como «cargando» y no
 * como «apagada») y si este entorno tiene BroadcastChannel. Sin organización
 * todavía cuenta como «cargando».
 */
export function getPosDisplayEnvironment(): DisplayPresenceEnvironment {
  let settingsLoaded = false;
  let enabled = false;
  try {
    const orgId = getOrganizationId();
    settingsLoaded = hasCustomerDisplaySettingsCache(orgId);
    enabled = isCustomerDisplayEnabled(orgId);
  } catch {
    settingsLoaded = false; // la organización activa no se pudo leer (storage bloqueado): no se sabe
    enabled = false;
  }
  return {
    settingsLoaded,
    enabled,
    transportSupported: typeof window !== 'undefined' && isDisplayTransportAvailable(),
  };
}

/**
 * Go Admin Desktop: este módulo NO escribe nada en el proceso principal a
 * partir de lo que LEE del interruptor de la organización (ni `setEnabled`
 * ni `close()` del puente). `config.json` solo cambia por una acción del
 * usuario en esta máquina (tarjeta o «Activar y abrir»): ver desktopDisplay.ts,
 * cabecera, punto 4. Así una carga fallida del interruptor (arranque sin red,
 * RLS) deja el emisor y la ventana del escritorio exactamente como estaban.
 */

/** Emisor de esta ventana de caja. Se crea perezosamente; en servidor (SSR) también existe pero nunca abre transporte. */
export function getPosDisplayEmitter(): DisplayEmitter {
  if (!instance) {
    instance = new DisplayEmitter({
      createTransport: createBrowserTransport,
      isEnabled: () => isCustomerDisplayEnabled(getOrganizationId()),
      // Fase 2: los ajustes de presentación viajan en hello.settings desde la misma caché.
      getSettings: () => toDisplayPresentationSettings(getCachedCustomerDisplaySettings(getOrganizationId())),
    });
    // Fase 4: la calificación del cliente la registra la caja, no la pantalla
    // (ver feedback.ts). Se suscribe UNA vez por ventana, al crear el emisor,
    // y no al montar un componente: la pantalla puede calificar durante los
    // 8 s de «Gracias», cuando el modal de cobro ya puede estar cerrado.
    instance.onUp((msg) => {
      if (msg.t !== 'rating') return;
      // Calificación que llega TARDE (ronda 2, QA bajo): la pantalla remota
      // manda el `thanksId` del «Gracias» que estaba pintando. Si la caja ya
      // está agradeciendo otra venta —o ya salió de «Gracias»— la nota no es
      // de esta venta y se descarta, en vez de colgarla de la que toque en
      // ese instante. Una pantalla vieja no manda `thanksId` y se acepta.
      const thanksId = typeof msg.thanksId === 'string' && msg.thanksId.length > 0 ? msg.thanksId : null;
      if (thanksId !== null && thanksId !== (instance?.ratingThanksId ?? null)) {
        console.warn('[pos-display] calificación de un «Gracias» que ya no es el actual; se descarta');
        return;
      }
      const saleId = instance?.ratingSaleId ?? null;
      // El `saleId` del mensaje se ignora a propósito: lo pone la caja.
      void sendDisplayRating({ terminalId: getOrCreateLocalTerminalId(), saleId, rating: msg.rating });
    });
  }
  return instance;
}

/**
 * Moneda para el emisor a partir de la consulta de moneda base de la caja.
 * Si la consulta rechaza, 'COP' (el emisor ya cae ahí): la pantalla del
 * cliente nunca depende de que esa consulta responda.
 */
export async function resolveDisplayCurrency(getBaseCurrency: () => Promise<{ code?: string | null } | null | undefined>): Promise<string> {
  try {
    const currency = await getBaseCurrency();
    const code = currency?.code;
    return typeof code === 'string' && code.length > 0 ? code : DEFAULT_DISPLAY_CURRENCY;
  } catch (err) {
    console.warn('[pos-display] no se pudo leer la moneda base; se emite en', DEFAULT_DISPLAY_CURRENCY, err);
    return DEFAULT_DISPLAY_CURRENCY;
  }
}

/**
 * Escucha el evento `storage` de la marca de cambio y relee el interruptor
 * de la organización dada. Devuelve la función de baja. Con `source` null
 * (SSR) no registra nada y la baja no hace nada. `onChange` sustituye la
 * acción por defecto (releer y aplicar); lo usa `startPosDisplay` para
 * retener el aviso mientras la carga inicial está en vuelo.
 */
export function subscribeCustomerDisplaySettingsChanges(
  organizationId: number,
  source: SettingsChangeSource | null = defaultChangeSource(),
  onChange: () => void = () => void refreshPosDisplay(organizationId),
): () => void {
  if (!source) return () => undefined;
  const listener = (event: { key: string | null; newValue?: string | null }) => {
    // Revocaciones de la pantalla remota hechas en OTRA ventana del mismo
    // origen (ronda 5 · 2): comparten ESTE listener a propósito. Registrar uno
    // aparte duplicaría el `storage` de la caja, y el contrato de esta función
    // —un solo listener por ventana, que `stopPosDisplay` retira— es el que
    // fijan las pruebas de F0–F2.
    applyRemoteDisplayRevocationEvent(event);
    if (event.key !== CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY) return;
    onChange();
  };
  try {
    source.addEventListener('storage', listener);
  } catch (err) {
    console.warn('[pos-display] no se pudo escuchar los cambios del interruptor maestro:', err);
    return () => undefined;
  }
  return () => {
    try {
      source.removeEventListener('storage', listener);
    } catch {
      // Ya no importa: la ventana se está desmontando.
    }
  };
}

/**
 * Avisa a las demás ventanas del mismo origen de que `pos_customer_display`
 * cambió. Lo llama quien guarda la tarjeta (configuracionService) tras el
 * upsert exitoso. La ventana que escribe no recibe su propio evento `storage`.
 */
export function notifyCustomerDisplaySettingsChanged(storage: SettingsChangeStorage | null = defaultChangeStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY, String(Date.now()));
  } catch (err) {
    console.warn('[pos-display] no se pudo avisar del cambio del interruptor maestro:', err);
  }
}

export interface StartPosDisplayOptions {
  organizationId: number;
  currency: string;
  cashier?: { name: string } | null;
  sessionOpen?: boolean;
  /**
   * La página lo pasa desde su efecto (`() => cancelled`): si devuelve true
   * cuando termina la carga del interruptor, no se arranca el emisor. Cubre
   * la salida de /app/pos mientras la consulta está en vuelo, además de la
   * guarda interna por `stopPosDisplay()`.
   */
  isCancelled?: () => boolean;
}

/**
 * Generación del arranque en curso. `stopPosDisplay()` y cada nuevo
 * `startPosDisplay()` la avanzan: un arranque cuya carga del interruptor
 * termina después de un stop (el usuario salió de /app/pos con la consulta
 * en vuelo) lo detecta y NO abre el transporte ni el latido; si lo hiciera,
 * la pantalla se quedaría con el último estado indefinidamente en vez de
 * pasar a «Conectando».
 */
let startGeneration = 0;

/**
 * Cerrar la PESTAÑA o la ventana de la caja no ejecuta el cleanup de React de
 * /app/pos, así que sin esto la pantalla no recibía `bye` y dependía del
 * watchdog (hasta 3,5 s). Con `pagehide` se despide en el acto, igual que
 * hace la pantalla en useDisplayReceiver. Un solo listener por ventana.
 */
let pagehideRegistered = false;
function ensurePagehideStop(): void {
  // Solo en un documento real: los tests usan `window` falsos que disparan
  // todos sus listeners con eventos de `storage`, y aquí no hay página que cerrar.
  if (pagehideRegistered || typeof window === 'undefined' || typeof document === 'undefined') return;
  if (typeof window.addEventListener !== 'function') return;
  pagehideRegistered = true;
  window.addEventListener('pagehide', (event: Event) => {
    if (event?.type !== 'pagehide') return;
    try {
      stopPosDisplay();
    } catch {
      // la ventana se está cerrando: nada que hacer
    }
  });
}

/**
 * Arranque desde la página del POS: carga el interruptor (una consulta,
 * cacheada), arranca el emisor y queda a la escucha de cambios del
 * interruptor hechos en otras ventanas. Devuelve el emisor para encadenar
 * `setSession` / `setActiveCart`. Idempotente: un segundo arranque sustituye
 * la escucha anterior. Si `stopPosDisplay()` corre (o `isCancelled()` pasa a
 * true) mientras se carga el interruptor, el arranque se abandona sin abrir
 * transporte.
 */
export async function startPosDisplay(options: StartPosDisplayOptions): Promise<DisplayEmitter> {
  const emitter = getPosDisplayEmitter();
  const generation = ++startGeneration;
  ensurePagehideStop();

  // La identidad de esta caja (pos_terminal_id) se crea SIEMPRE al abrir el POS,
  // esté o no encendido el interruptor maestro. Antes solo se creaba al abrir el
  // transporte (interruptor encendido), y una pantalla abierta con el interruptor
  // apagado no encontraba caja y decía «abra el punto de venta» aunque estuviera
  // abierto. Con identidad, la pantalla puede decir la verdad: «conectando… active
  // la pantalla del cliente en Configuración › POS».
  try {
    if (typeof window !== 'undefined') getOrCreateLocalTerminalId();
  } catch {
    // storage bloqueado: el transporte lo volverá a intentar al arrancar
  }

  // El listener se registra ANTES de la carga: si otra ventana guarda el
  // interruptor mientras la consulta está en vuelo (que responde con el valor
  // viejo), el aviso no se pierde. Durante la carga solo se anota; al terminar
  // se relee UNA vez, después de que la carga haya fijado su valor, para que
  // el orden de llegada de las dos respuestas no importe.
  let loading = true;
  let changedDuringLoad = false;
  unsubscribeSettingsChanges?.();
  unsubscribeSettingsChanges = subscribeCustomerDisplaySettingsChanges(options.organizationId, undefined, () => {
    if (generation !== startGeneration) return;
    if (loading) {
      changedDuringLoad = true;
      return;
    }
    void refreshPosDisplay(options.organizationId);
  });

  try {
    await loadCustomerDisplaySettings(options.organizationId);
  } catch (err) {
    console.warn('[pos-display] no se pudo cargar el interruptor maestro:', err);
  }
  loading = false;
  if (generation !== startGeneration) return emitter; // stop() o un nuevo start ya retiraron este listener
  if (options.isCancelled?.() === true) {
    unsubscribeSettingsChanges?.();
    unsubscribeSettingsChanges = null;
    return emitter;
  }
  emitter.start({
    organizationId: options.organizationId,
    currency: options.currency,
    cashier: options.cashier,
    sessionOpen: options.sessionOpen,
  });
  if (changedDuringLoad) await refreshPosDisplay(options.organizationId);
  return emitter;
}

/** Salida del POS: deja de escuchar cambios del interruptor, invalida un arranque en vuelo y despide a la pantalla (`bye`). */
export function stopPosDisplay(): void {
  startGeneration += 1;
  unsubscribeSettingsChanges?.();
  unsubscribeSettingsChanges = null;
  getPosDisplayEmitter().stop();
}

/**
 * Aplica los ajustes que YA están en la caché de settings.ts, sin leer la
 * BD: encendido → el emisor abre el transporte y saluda; apagado → lo cierra;
 * encendido y ya abierto → vuelve a saludar con los ajustes nuevos (Fase 2:
 * propina, calificación… sin recargar la pantalla, PLAN §5.2).
 * La tarjeta de configuración lo llama tras guardar: el servicio fijó la
 * caché con el valor recién escrito (`primeCustomerDisplaySettings`), así
 * que releer sería una consulta de más y, si fallara, apagaría una caja que
 * acaba de encenderse. Sin caja arrancada en esta ventana no hace nada.
 */
export function applyPosDisplaySettings(): void {
  getPosDisplayEmitter().refresh();
}

/**
 * Relee `pos_customer_display` de la BD y aplica el interruptor: lo llama el
 * listener de `storage` cuando lo guardó OTRA ventana. Si la relectura falla,
 * settings.ts conserva el valor anterior y el emisor sigue como estaba. No
 * escribe la marca de cambio: si lo hiciera, dos cajas se reenviarían el
 * aviso sin fin.
 */
export async function refreshPosDisplay(organizationId: number = getOrganizationId()): Promise<void> {
  try {
    await refreshCustomerDisplaySettings(organizationId);
  } catch (err) {
    console.warn('[pos-display] no se pudo releer el interruptor maestro:', err);
  }
  applyPosDisplaySettings();
}
