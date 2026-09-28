/**
 * Modo reposo de la pantalla del cliente (Fase 4, PLAN §5.2 y §4.2). Lógica
 * PURA: sin React, sin DOM, sin red; se prueba en Node.
 *
 * Reglas:
 * - El reposo NO entra de golpe. Mientras la caja tiene algo que contar
 *   (pedido, cobro, gracias) la pantalla pinta eso. Cuando se queda en el
 *   estado neutro empieza a contar `idleAfterSeconds`; hasta que pasen, se ve
 *   la marca con el reloj (lo de siempre). A partir de ahí entra el contenido
 *   del reposo elegido en los ajustes.
 * - `promotions` sin promociones y `media` sin imágenes caen a `brand`
 *   (PLAN §5.2): un reposo en negro sería peor que el reloj.
 * - La rotación es de ritmo fijo (`IDLE_SLIDE_MS`) y se deriva del RELOJ, no
 *   de un contador acumulado: una pestaña que estuvo en segundo plano y no
 *   recibió sus `setInterval` retoma en la lámina que toca y no en la
 *   siguiente a la última pintada.
 * - Sin sonido y con un fundido de `IDLE_FADE_MS` (≤ 300 ms, PLAN §4.1).
 */

import type { DisplayIdleMode, DisplayIdleSettings } from '@/lib/pos/display/protocol';
import {
  DEFAULT_IDLE_AFTER_SECONDS,
  IDLE_AFTER_SECONDS_MAX,
  IDLE_AFTER_SECONDS_MIN,
  IDLE_MEDIA_URLS_MAX,
  clampIdleAfterSeconds,
  isIdleMode,
  isValidMediaUrl,
} from '@/lib/pos/display/idleRules';

/**
 * Los límites del ajuste y el predicado de URL NO se redefinen aquí: vienen
 * de `idleRules.ts`, que es también de donde los saca `settingsSchema.ts`
 * (CLAUDE.md §7). Había dos copias equivalentes; en cuanto una cambiara, las
 * imágenes se habrían caído en silencio en un lado. `idleRules.ts` no
 * arrastra zod, así que la pantalla sigue sin pagar el validador.
 */
export {
  DEFAULT_IDLE_AFTER_SECONDS,
  IDLE_AFTER_SECONDS_MAX,
  IDLE_AFTER_SECONDS_MIN,
  IDLE_MEDIA_URLS_MAX,
  isValidMediaUrl,
};

/** Cuánto dura cada lámina del reposo (PLAN: 8 s por promoción). */
export const IDLE_SLIDE_MS = 8_000;
/** Fundido entre láminas. Ninguna animación de la pantalla pasa de 300 ms. */
export const IDLE_FADE_MS = 300;

/**
 * Ajustes de reposo saneados. `hello.settings.idle` es una PISTA: puede no
 * venir (emisor de las fases 0-3), venir a medias o venir con basura. Cada
 * campo degrada por separado a su valor por defecto, nunca a una excepción.
 */
export function sanitizeIdleSettings(value: unknown): DisplayIdleSettings {
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const mode = isIdleMode(raw.mode) ? raw.mode : 'brand';
  const mediaUrls = Array.isArray(raw.mediaUrls)
    ? raw.mediaUrls.filter(isValidMediaUrl).map((url) => url.trim()).slice(0, IDLE_MEDIA_URLS_MAX)
    : [];
  return { mode, mediaUrls, idleAfterSeconds: clampIdleAfterSeconds(raw.idleAfterSeconds) };
}

export interface IdleContentInput {
  mode: DisplayIdleMode;
  /** Cuántas promociones activas tiene la pantalla ahora mismo. */
  promotions: number;
  /** Cuántas imágenes propias válidas hay en los ajustes. */
  media: number;
  /** ¿Ya pasó `idleAfterSeconds` sin actividad? Mientras sea false se ve la marca. */
  settled: boolean;
}

/** Qué pinta el reposo: la marca de siempre, la cartelera de promociones o las imágenes propias. */
export type IdleContent = 'brand' | 'promotions' | 'media';

/**
 * Contenido del reposo. Antes de que se cumpla el tiempo sin actividad
 * (`settled: false`) siempre es `brand`. Después, el modo elegido… salvo que
 * no haya nada que rotar: sin promociones o sin imágenes se cae a `brand`
 * (PLAN §5.2).
 */
export function resolveIdleContent(input: IdleContentInput): IdleContent {
  if (!input.settled) return 'brand';
  if (input.mode === 'promotions') return input.promotions > 0 ? 'promotions' : 'brand';
  if (input.mode === 'media') return input.media > 0 ? 'media' : 'brand';
  return 'brand';
}

/**
 * Lámina que toca a los `elapsedMs` de haber entrado en reposo, con `count`
 * láminas y `slideMs` cada una. Siempre dentro de [0, count): un `count` de 0
 * o un tiempo absurdo devuelven 0 en vez de un índice que rompería el render.
 */
export function idleSlideIndex(elapsedMs: number, count: number, slideMs: number = IDLE_SLIDE_MS): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  const total = Math.floor(count);
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || !Number.isFinite(slideMs) || slideMs <= 0) return 0;
  return Math.floor(elapsedMs / slideMs) % total;
}

/**
 * ¿Ya se cumplió el tiempo sin actividad? `idleSince` es el instante en que
 * la pantalla se quedó en el estado neutro (null = no lo está).
 */
export function isIdleSettled(idleSince: number | null, now: number, idleAfterSeconds: number): boolean {
  if (idleSince === null) return false;
  const seconds = Number.isFinite(idleAfterSeconds) ? Math.max(0, idleAfterSeconds) : DEFAULT_IDLE_AFTER_SECONDS;
  return now - idleSince >= seconds * 1000;
}
