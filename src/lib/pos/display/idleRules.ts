/**
 * Reglas y límites del MODO REPOSO de la pantalla del cliente (Fase 4,
 * PLAN §5.2). Módulo PURO y sin dependencias: ni zod, ni React, ni Supabase.
 *
 * Existe por CLAUDE.md §7. «URL de imagen de reposo válida», «cuántas
 * imágenes caben», «cuánto puede tardar el reposo en entrar» y «qué modos
 * hay» se decidían por DUPLICADO: `settingsSchema.ts` (que valida lo que se
 * guarda y lo que sale hacia la pantalla) y `components/pos-display/idle.ts`
 * (que sanea lo que la pantalla recibe) tenían cada uno su copia. Mientras
 * coincidían no se notaba; en cuanto una cambiara —admitir un bucket propio,
 * subir el máximo— las imágenes se caerían en silencio en un lado y no en el
 * otro, que es el peor fallo posible: el dueño guarda diez carteles, la
 * tarjeta se los admite y la pantalla no pinta ninguno.
 *
 * Aquí está la única definición; los dos importan de aquí. Sin zod a
 * propósito: `idle.ts` viaja en el bundle de /pos-display, que se abre en
 * tabletas viejas, y no debe arrastrar el validador entero por usar un
 * predicado de cuatro líneas.
 */

import type { DisplayIdleMode } from './protocol';

/** Tiempo hasta reposo en segundos: entre 10 s y una hora (PLAN §5.2: 90 s por defecto). */
export const IDLE_AFTER_SECONDS_MIN = 10;
export const IDLE_AFTER_SECONDS_MAX = 3600;
/** Valor por defecto de `idleAfterSeconds` (PLAN §5.2). */
export const DEFAULT_IDLE_AFTER_SECONDS = 90;
/** Cuántas imágenes propias admite el reposo (cada una una URL http(s)). */
export const IDLE_MEDIA_URLS_MAX = 20;

/** Los tres modos de PLAN §5.2, en el orden en que los ofrece la tarjeta. */
export const IDLE_MODES = ['brand', 'promotions', 'media'] as const satisfies readonly DisplayIdleMode[];
export type IdleMode = (typeof IDLE_MODES)[number];

/** Comprobación de pertenencia sin recorrer el array en cada URL. */
const IDLE_MODE_SET: ReadonlySet<string> = new Set<string>(IDLE_MODES);

/** ¿Es uno de los modos conocidos? Cualquier otra cosa (incluido undefined) es false. */
export function isIdleMode(value: unknown): value is IdleMode {
  return typeof value === 'string' && IDLE_MODE_SET.has(value);
}

/**
 * URL de imagen del reposo: http(s) absoluta y SIN espacios en blanco ni
 * controles dentro. `z.string().url()` por sí sola se apoya en `new URL()`
 * (WHATWG), que tolera espacios y descarta saltos de línea y tabuladores:
 * aceptaba `https://x.com/a b` y `https://a.com\nhttps://b.com` como UNA URL,
 * la tarjeta las rechazaba y el round-trip por el textarea (join('\n') +
 * split) las partía en dos (ronda 3 de F2-A, QA bajo #4).
 */
export const MEDIA_URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * ÚNICO predicado de «URL de imagen de reposo válida» (ronda 4 de F2-A, QA
 * bajo): el patrón Y `new URL()` sin lanzar. Antes la tarjeta solo aplicaba
 * el patrón y el esquema además `.url()` (que es `new URL()`): `https://%` y
 * `http://[` pasaban la tarjeta, el guardado las descartaba en silencio y el
 * usuario veía «guardado» con la URL desaparecida. Lo usan `mediaUrlSchema`
 * (settingsSchema.ts), `validateDraft` (AjustesPantallaSection) y el saneado
 * de la pantalla (components/pos-display/idle.ts): ni una más ni una menos.
 * Recorta blancos alrededor. Nunca lanza; lo que no es cadena → false.
 */
export function isValidMediaUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const value = raw.trim();
  if (!MEDIA_URL_PATTERN.test(value)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * `idleAfterSeconds` dentro de los límites. Un entero fuera de rango se
 * recorta al extremo más cercano; lo que no es entero cae al valor por
 * defecto (un `NaN` recortado sería `NaN`).
 */
export function clampIdleAfterSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_IDLE_AFTER_SECONDS;
  return Math.min(IDLE_AFTER_SECONDS_MAX, Math.max(IDLE_AFTER_SECONDS_MIN, value));
}
