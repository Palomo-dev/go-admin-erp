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

/** Cuánto dura cada lámina del reposo (PLAN: 8 s por promoción). */
export const IDLE_SLIDE_MS = 8_000;
/** Fundido entre láminas. Ninguna animación de la pantalla pasa de 300 ms. */
export const IDLE_FADE_MS = 300;
/** Valor por defecto de `idleAfterSeconds` (PLAN §5.2). */
export const DEFAULT_IDLE_AFTER_SECONDS = 90;
/** Límites del ajuste, los mismos que valida `settingsSchema.ts`. */
export const IDLE_AFTER_SECONDS_MIN = 10;
export const IDLE_AFTER_SECONDS_MAX = 3600;
/** Cuántas imágenes propias se admiten, como en los ajustes. */
export const IDLE_MEDIA_URLS_MAX = 20;

const IDLE_MODES: ReadonlySet<string> = new Set<DisplayIdleMode>(['brand', 'promotions', 'media']);

/** http(s) absoluta y sin blancos: el mismo criterio que la tarjeta de configuración. */
function isMediaUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ajustes de reposo saneados. `hello.settings.idle` es una PISTA: puede no
 * venir (emisor de las fases 0-3), venir a medias o venir con basura. Cada
 * campo degrada por separado a su valor por defecto, nunca a una excepción.
 */
export function sanitizeIdleSettings(value: unknown): DisplayIdleSettings {
  const raw = typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const mode = typeof raw.mode === 'string' && IDLE_MODES.has(raw.mode) ? (raw.mode as DisplayIdleMode) : 'brand';
  const mediaUrls = Array.isArray(raw.mediaUrls)
    ? raw.mediaUrls.filter(isMediaUrl).map((url) => url.trim()).slice(0, IDLE_MEDIA_URLS_MAX)
    : [];
  const seconds = typeof raw.idleAfterSeconds === 'number' && Number.isInteger(raw.idleAfterSeconds) ? raw.idleAfterSeconds : Number.NaN;
  const idleAfterSeconds = Number.isFinite(seconds)
    ? Math.min(IDLE_AFTER_SECONDS_MAX, Math.max(IDLE_AFTER_SECONDS_MIN, seconds))
    : DEFAULT_IDLE_AFTER_SECONDS;
  return { mode, mediaUrls, idleAfterSeconds };
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
