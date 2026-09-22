/**
 * Presencia de la pantalla del cliente vista desde la caja (PLAN §5.1:
 * punto verde «Pantalla del cliente conectada» / gris «Sin pantalla»).
 *
 * La fuente es el emisor de la caja (emitter.ts): su transporte anota
 * `lastDisplaySeenAt` con cada `display_alive` o `need_snapshot` de la
 * pantalla y lo borra con `display_bye`. Aquí solo vive el criterio, puro y
 * sin React, para que el indicador y las pruebas apliquen el mismo umbral que
 * la pantalla usa para pasar a «Conectando…» (STALE_AFTER_MS, 3 s).
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

import { STALE_AFTER_MS } from './transport';

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

/** Estado inicial y de error: sin transporte y sin saber por qué, así que el indicador no pinta etiqueta. */
export const DISCONNECTED_PRESENCE: Readonly<DisplayPresenceSnapshot> = Object.freeze({
  connected: false,
  emitting: false,
  reason: 'loading',
  lastSeenAt: null,
});

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
 * ¿Se ve igual? Solo compara lo que pinta el indicador (`connected`,
 * `emitting`, `reason`): `lastSeenAt` cambia con cada latido de la pantalla y
 * compararlo re-renderizaría la cabecera del POS una vez por segundo.
 */
export function isSamePresence(a: DisplayPresenceSnapshot, b: DisplayPresenceSnapshot): boolean {
  return a.connected === b.connected && a.emitting === b.emitting && a.reason === b.reason;
}
