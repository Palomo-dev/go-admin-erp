/**
 * Presencia de la pantalla del cliente vista desde la caja (PLAN §5.1:
 * punto verde «Pantalla del cliente conectada» / gris «Sin pantalla»).
 *
 * La fuente es el emisor de la caja (emitter.ts): su transporte anota
 * `lastDisplaySeenAt` con cada `display_alive` o `need_snapshot` de la
 * pantalla y lo borra con `display_bye`. Aquí solo vive el criterio, puro y
 * sin React, para que el indicador y las pruebas apliquen el mismo umbral que
 * la pantalla usa para pasar a «Conectando…»: STALE_AFTER_MS (3 s) para la
 * ventana local y REMOTE_STALE_AFTER_MS (15 s) para la tableta remota, que
 * late cinco veces más despacio (ver DEFAULT_STALE_BY_ORIGIN).
 *
 * Con el interruptor maestro apagado el emisor no tiene transporte
 * (`isEmitting === false`), así que `lastDisplaySeenAt` es null y el
 * indicador queda en gris aunque haya una ventana de /pos-display abierta:
 * es coherente, porque esa ventana está en «Conectando…» y no refleja nada.
 *
 * Pero `isEmitting === false` NO siempre significa «apagado en Configuración»:
 * también lo es mientras la caja carga el interruptor (primeros cientos de
 * ms, más con red lenta), mientras el interruptor YA está encendido en caché
 * pero la página aún no ha arrancado el emisor (en /app/pos el arranque
 * espera a la consulta de moneda base, y el indicador monta antes), y cuando
 * el entorno no tiene BroadcastChannel. Por eso la instantánea lleva
 * `reason`, calculada a partir del entorno (`DisplayPresenceEnvironment`),
 * para que el menú del indicador no mande al cajero a Configuración a por un
 * interruptor que ya está encendido.
 */

import type { DisplayCapabilities } from './protocol';
import { REMOTE_STALE_AFTER_MS } from './supabaseBroadcastTransport';
import {
  combineDisplayCapabilities,
  DISPLAY_LINK_ORIGINS,
  STALE_AFTER_MS,
  type DisplayCapabilitiesByOrigin,
  type DisplayLinkOrigin,
  type DisplaySeenByOrigin,
} from './transport';

/**
 * UMBRAL POR ORIGEN (ronda 2 · 2). La ventana local late cada
 * HEARTBEAT_INTERVAL_MS (1 s) y se da por muerta a los 3 s; la pantalla
 * REMOTA late cada REMOTE_PRESENCE_INTERVAL_MS (5 s) para no gastar un
 * mensaje de Realtime por segundo, así que con el umbral local el indicador
 * del POS parpadearía «conectada (remota)» ↔ «sin pantalla» dos segundos de
 * cada cinco en el flujo NORMAL. Cada origen se juzga con su propio silencio
 * tolerable: tres latidos perdidos en los dos casos.
 */
export type DisplayStaleByOrigin = Readonly<Record<DisplayLinkOrigin, number>>;

/** Un número (el mismo umbral para todo) o uno por origen. */
export type DisplayStaleThreshold = number | DisplayStaleByOrigin;

export const DEFAULT_STALE_BY_ORIGIN: DisplayStaleByOrigin = Object.freeze({
  local: STALE_AFTER_MS,
  remote: REMOTE_STALE_AFTER_MS,
});

/** Umbral que toca a un origen. Un número vale para los dos. */
export function staleForOrigin(threshold: DisplayStaleThreshold, origin: DisplayLinkOrigin): number {
  return typeof threshold === 'number' ? threshold : threshold[origin];
}

/**
 * Por qué no hay transporte. `null` cuando sí lo hay.
 * - 'loading': aún no se sabe si emitirá: sin caché del interruptor (settings.ts), o con la caché
 *   ENCENDIDA pero el emisor todavía sin transporte (la página aún no llamó a `start`); el
 *   indicador no pinta etiqueta.
 * - 'unsupported': el entorno no tiene BroadcastChannel; nunca emitirá aunque el interruptor esté encendido.
 * - 'disabled': el interruptor maestro está apagado en Configuración › POS. Solo se afirma cuando la
 *   caché existe Y dice `enabled: false`.
 */
export type DisplayPresenceReason = 'loading' | 'unsupported' | 'disabled' | null;

/** Lo que el entorno sabe y el emisor no: si el interruptor ya se cargó, qué dice, y si el transporte es posible. */
export interface DisplayPresenceEnvironment {
  /** ¿Hay caché del interruptor para la organización activa? (settings.ts `hasCustomerDisplaySettingsCache`). */
  readonly settingsLoaded: boolean;
  /**
   * Valor del interruptor en caché (settings.ts `isCustomerDisplayEnabled`). Solo cuenta si
   * `settingsLoaded` es true; sin caché es el valor por defecto (false) y no significa «apagado».
   */
  readonly enabled: boolean;
  /** ¿El entorno soporta BroadcastChannel? (transport.ts `isBroadcastChannelSupported`). */
  readonly transportSupported: boolean;
}

/** Sin entorno se asume lo que no exige etiqueta nueva: cargado, apagado y compatible → «apagado». */
export const DEFAULT_PRESENCE_ENVIRONMENT: Readonly<DisplayPresenceEnvironment> = Object.freeze({
  settingsLoaded: true,
  enabled: false,
  transportSupported: true,
});

/** Lo mínimo que el indicador necesita del emisor; DisplayEmitter lo cumple sin adaptador. */
export interface DisplayPresenceSource {
  /** Instante del último `display_alive` / `need_snapshot`; null sin transporte o sin pantalla. */
  readonly lastDisplaySeenAt: number | null;
  /** ¿Hay transporte abierto (interruptor encendido y entorno compatible)? */
  readonly isEmitting: boolean;
  /**
   * Última señal por origen (Fase 3, parte C). Opcional: sin él, toda
   * presencia cuenta como `local` (emisor de F0–F2 o transporte sin orígenes).
   */
  readonly lastDisplaySeenByOrigin?: DisplaySeenByOrigin | null;
}

/** Instantánea de presencia; lo que consume la UI. */
export interface DisplayPresenceSnapshot {
  /** true si la última señal de la pantalla tiene menos de STALE_AFTER_MS. */
  connected: boolean;
  /** false cuando el interruptor maestro está apagado, aún se carga, o el entorno no soporta BroadcastChannel. */
  emitting: boolean;
  /** Por qué `emitting` es false; null si emite. Distingue cargando / sin soporte / apagado. */
  reason: DisplayPresenceReason;
  /** Última señal de la pantalla; null si nunca hubo, tras `display_bye`, o sin transporte. */
  lastSeenAt: number | null;
}

/**
 * Instantánea con el ORIGEN de la pantalla viva (Fase 3, parte C): lo que
 * consume el indicador. `origins` va en un tipo aparte, no en
 * DisplayPresenceSnapshot, para que la instantánea de F0–F2 conserve su
 * forma exacta (contratos y pruebas anteriores comparan con `toEqual`).
 */
export interface DisplayPresenceView extends DisplayPresenceSnapshot {
  /**
   * Orígenes con señal viva (cada uno con SU umbral, DEFAULT_STALE_BY_ORIGIN), en el orden de
   * DISPLAY_LINK_ORIGINS: `[]` sin pantalla, `['local']`, `['remote']` o
   * `['local', 'remote']` (ventana local Y tableta a la vez). Con pantalla,
   * `connected` es `origins.length > 0`.
   */
  origins: readonly DisplayLinkOrigin[];
}

/** Estado inicial y de error: sin transporte y sin saber por qué, así que el indicador no pinta etiqueta. */
export const DISCONNECTED_PRESENCE: Readonly<DisplayPresenceSnapshot> = Object.freeze({
  connected: false,
  emitting: false,
  reason: 'loading',
  lastSeenAt: null,
});

/** DISCONNECTED_PRESENCE con `origins` vacío (estado inicial del indicador). */
export const DISCONNECTED_PRESENCE_VIEW: Readonly<DisplayPresenceView> = Object.freeze({
  ...DISCONNECTED_PRESENCE,
  origins: Object.freeze([]) as readonly DisplayLinkOrigin[],
});

/**
 * Orígenes cuya última señal sigue fresca. Sin mapa por origen se deriva de
 * `lastSeenAt` como local (compatibilidad con emisores anteriores).
 */
export function resolvePresentOrigins(
  byOrigin: DisplaySeenByOrigin | null | undefined,
  lastSeenAt: number | null,
  now: number,
  staleAfterMs: DisplayStaleThreshold = DEFAULT_STALE_BY_ORIGIN,
): DisplayLinkOrigin[] {
  if (!byOrigin) return isDisplayPresent(lastSeenAt, now, staleForOrigin(staleAfterMs, 'local')) ? ['local'] : [];
  return DISPLAY_LINK_ORIGINS.filter((origin) => isDisplayPresent(byOrigin[origin] ?? null, now, staleForOrigin(staleAfterMs, origin)));
}

/**
 * Motivo de no emitir. Orden: sin soporte (definitivo) > cargando (sin caché,
 * O caché encendida con el emisor aún sin arrancar) > apagado (solo con la
 * caché en `enabled: false`: lo único que el cajero puede cambiar en
 * Configuración). «Apagado» nunca se afirma con el interruptor encendido.
 */
export function resolvePresenceReason(emitting: boolean, env: DisplayPresenceEnvironment = DEFAULT_PRESENCE_ENVIRONMENT): DisplayPresenceReason {
  if (emitting) return null;
  if (!env.transportSupported) return 'unsupported';
  if (!env.settingsLoaded || env.enabled) return 'loading';
  return 'disabled';
}

/** Resumen de `origins` para una etiqueta: `local`, `remote`, `both` (las dos vivas) o null (ninguna). */
export function describePresenceOrigins(origins: readonly DisplayLinkOrigin[] | undefined): 'local' | 'remote' | 'both' | null {
  const local = origins?.includes('local') === true;
  const remote = origins?.includes('remote') === true;
  if (local && remote) return 'both';
  if (remote) return 'remote';
  if (local) return 'local';
  return null;
}

/**
 * Capacidades que la caja debe creer contando SOLO los orígenes VIVOS
 * (F3-C ronda 5 · 1; tester ronda 2, alto).
 *
 * El transporte anota las capacidades por origen y las borra con el
 * `display_bye` de ese origen, pero NO por silencio: `combineDisplayCapabilities`
 * da por «viva» a cualquiera con señal anotada, y ese sello tampoco caduca.
 * Una tableta TÁCTIL que muere sin despedirse (corte de wifi, batería, pestaña
 * matada — el caso exacto para el que existe el watchdog) dejaba `touch: true`
 * pegado mientras el monitor NO táctil del mostrador siguiera latiendo, y el
 * cajero se quedaba en «esperando la propina…» ante una pantalla apagada.
 *
 * La caducidad no se mete en el transporte a propósito (evita meterle tiempo
 * dentro y un ciclo de imports con supabaseBroadcastTransport): quien ya sabe
 * qué orígenes siguen vivos es la PRESENCIA —`origins` de
 * `readDisplayPresenceView`, con el umbral de cada tubo
 * (DEFAULT_STALE_BY_ORIGIN)—, así que aquí se vuelve a combinar tratando como
 * muerto («seen: null») todo origen ausente de `origins`. El repintado sale
 * gratis: `useCustomerDisplayPresence` ya relee la presencia cada segundo.
 *
 * `combined` es el respaldo para un emisor que no publique el mapa por origen
 * (F0–F2): entonces solo se puede decir «hay pantalla viva o no».
 */
export function combineLiveDisplayCapabilities(
  byOrigin: DisplayCapabilitiesByOrigin | null | undefined,
  combined: DisplayCapabilities | null | undefined,
  origins: readonly DisplayLinkOrigin[] | undefined,
): DisplayCapabilities | null {
  const vivos = origins ?? [];
  if (vivos.length === 0) return null;
  if (!byOrigin) return combined ?? null;
  const seen: Record<DisplayLinkOrigin, number | null> = { local: null, remote: null };
  for (const origin of DISPLAY_LINK_ORIGINS) {
    if (vivos.includes(origin)) seen[origin] = 1; // el instante no importa: la presencia ya juzgó el silencio
  }
  return combineDisplayCapabilities(byOrigin, seen);
}

/** Criterio único de «conectada»: mismo umbral que «Conectando…» en la pantalla. */
export function isDisplayPresent(lastSeenAt: number | null, now: number, staleAfterMs = STALE_AFTER_MS): boolean {
  return lastSeenAt !== null && now - lastSeenAt < staleAfterMs;
}

/**
 * Lee el emisor y evalúa contra el reloj. Nunca lanza: un emisor que falle al
 * leerse cuenta como «sin pantalla». `env` (interruptor cargado, transporte
 * compatible) decide `reason`; sin él se asume cargado y compatible.
 */
export function readDisplayPresence(
  source: DisplayPresenceSource,
  now: number = Date.now(),
  staleAfterMs = STALE_AFTER_MS,
  env: DisplayPresenceEnvironment = DEFAULT_PRESENCE_ENVIRONMENT,
): DisplayPresenceSnapshot {
  try {
    const lastSeenAt = source.lastDisplaySeenAt;
    const emitting = source.isEmitting;
    return {
      connected: isDisplayPresent(lastSeenAt, now, staleAfterMs),
      emitting,
      reason: resolvePresenceReason(emitting, env),
      lastSeenAt,
    };
  } catch (err) {
    console.warn('[pos-display] no se pudo leer la presencia de la pantalla', err);
    return { ...DISCONNECTED_PRESENCE };
  }
}

/**
 * Como readDisplayPresence, más `origins` (Fase 3, parte C). `lastSeenAt`
 * es la señal más reciente de cualquier origen, así que `connected` y
 * `origins.length > 0` coinciden siempre. Nunca lanza.
 */
export function readDisplayPresenceView(
  source: DisplayPresenceSource,
  now: number = Date.now(),
  staleAfterMs: DisplayStaleThreshold = DEFAULT_STALE_BY_ORIGIN,
  env: DisplayPresenceEnvironment = DEFAULT_PRESENCE_ENVIRONMENT,
): DisplayPresenceView {
  // UN solo instante para la instantánea y sus orígenes (ronda 2 · 6): con dos
  // `Date.now()` había un milisegundo en el que salía `connected: true` con
  // `origins: []` y el indicador perdía el sufijo de origen.
  return withPresenceOrigins(readDisplayPresence(source, now, staleForOrigin(staleAfterMs, 'local'), env), source, now, staleAfterMs);
}

/**
 * Añade `origins` a una instantánea ya leída (mismo reloj y umbral). Sin
 * pantalla conectada, `[]` sin consultar nada. Nunca lanza.
 */
export function withPresenceOrigins(
  snapshot: DisplayPresenceSnapshot,
  source: DisplayPresenceSource,
  now: number = Date.now(),
  staleAfterMs: DisplayStaleThreshold = DEFAULT_STALE_BY_ORIGIN,
): DisplayPresenceView {
  let origins: DisplayLinkOrigin[] = [];
  let byOrigin: DisplaySeenByOrigin | null | undefined;
  try {
    byOrigin = source.lastDisplaySeenByOrigin;
    origins = resolvePresentOrigins(byOrigin, snapshot.lastSeenAt, now, staleAfterMs);
  } catch (err) {
    console.warn('[pos-display] no se pudo leer el origen de la pantalla', err);
    byOrigin = undefined;
    origins = [];
  }
  // Con mapa por origen manda el mapa: es quien conoce el umbral de cada tubo, y así
  // `connected` y `origins.length > 0` siguen coincidiendo aunque el remoto tolere 15 s
  // y el local 3 s. Sin mapa (emisor de F0–F2) manda la instantánea, que no cambia.
  const connected = byOrigin ? origins.length > 0 : snapshot.connected;
  return { ...snapshot, connected, origins };
}

/**
 * ¿Se ve igual? Solo compara lo que pinta el indicador (`connected`,
 * `emitting`, `reason`, `origins`): `lastSeenAt` cambia con cada latido de
 * la pantalla y compararlo re-renderizaría la cabecera del POS una vez por
 * segundo.
 */
export function isSamePresence(a: PresenceLook, b: PresenceLook): boolean {
  return a.connected === b.connected && a.emitting === b.emitting && a.reason === b.reason && sameOrigins(a.origins, b.origins);
}

/** Lo que compara isSamePresence. `origins` opcional: una instantánea anterior a F3-C (sin orígenes) se compara como antes. */
export type PresenceLook = Pick<DisplayPresenceSnapshot, 'connected' | 'emitting' | 'reason' | 'lastSeenAt'> & { origins?: readonly DisplayLinkOrigin[] };

function sameOrigins(a: readonly DisplayLinkOrigin[] | undefined, b: readonly DisplayLinkOrigin[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((origin, i) => origin === right[i]);
}
