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
 */

import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { DisplayEmitter } from './emitter';
import type { DisplayPresenceEnvironment } from './presence';
import {
  hasCustomerDisplaySettingsCache,
  isCustomerDisplayEnabled,
  loadCustomerDisplaySettings,
  refreshCustomerDisplaySettings,
} from './settings';
import { getOrCreateLocalTerminalId } from './terminal';
import { BroadcastChannelTransport, isBroadcastChannelSupported, type DisplayTransport } from './transport';

export { isBroadcastChannelSupported };

/** localStorage: marca (Date.now()) que se escribe al guardar `pos_customer_display`; su evento `storage` avisa a las otras cajas. */
export const CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY = 'pos_customer_display_changed';

/** Moneda con la que emite la caja si la consulta de moneda base falla; coincide con el fallback de emitter.ts. */
export const DEFAULT_DISPLAY_CURRENCY = 'COP';

/** Subconjunto de `Window` para el evento `storage`; permite inyectar uno en pruebas. */
export interface SettingsChangeSource {
  addEventListener(type: 'storage', listener: (event: { key: string | null }) => void): void;
  removeEventListener(type: 'storage', listener: (event: { key: string | null }) => void): void;
}

export interface SettingsChangeStorage {
  setItem(key: string, value: string): void;
}

let instance: DisplayEmitter | null = null;
/** Baja del listener `storage` registrado por startPosDisplay; null si no hay ninguno. */
let unsubscribeSettingsChanges: (() => void) | null = null;

function createBrowserTransport(): DisplayTransport | null {
  if (typeof window === 'undefined' || !isBroadcastChannelSupported()) return null;
  return new BroadcastChannelTransport({ terminalId: getOrCreateLocalTerminalId() });
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
 * activa ya se cargó (caché de settings.ts) y si este entorno tiene
 * BroadcastChannel. Sin organización todavía cuenta como «cargando».
 */
export function getPosDisplayEnvironment(): DisplayPresenceEnvironment {
  let settingsLoaded = false;
  try {
    const orgId = getOrganizationId();
    settingsLoaded = hasCustomerDisplaySettingsCache(orgId);
  } catch {
    settingsLoaded = false; // la organización activa no se pudo leer (storage bloqueado): no se sabe
  }
  return {
    settingsLoaded,
    transportSupported: typeof window !== 'undefined' && isBroadcastChannelSupported(),
  };
}

/** Emisor de esta ventana de caja. Se crea perezosamente; en servidor (SSR) también existe pero nunca abre transporte. */
export function getPosDisplayEmitter(): DisplayEmitter {
  if (!instance) {
    instance = new DisplayEmitter({
      createTransport: createBrowserTransport,
      isEnabled: () => isCustomerDisplayEnabled(getOrganizationId()),
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
  const listener = (event: { key: string | null }) => {
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
 * Aplica el interruptor que YA está en la caché de settings.ts, sin leer la
 * BD: encendido → el emisor abre el transporte y saluda; apagado → lo cierra.
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
