/**
 * Esquema, valores por defecto y parseo de `pos_customer_display` (PLAN §5.2
 * y §6.1). Módulo PURO, sin cliente Supabase: lo importan tanto la caja y la
 * tarjeta de configuración (a través de settings.ts, que re-exporta todo)
 * como las rutas de servidor de la pantalla remota (Fase 3,
 * `/api/pos/display/bootstrap`), que no pueden arrastrar el cliente de
 * navegador de `@/lib/supabase/config`. La caché, la carga y el guardado
 * siguen en settings.ts.
 */

import { z } from 'zod';
import type { DisplayPresentationSettings, DisplayTouchOverride } from './protocol';

export const POS_CUSTOMER_DISPLAY_KEY = 'pos_customer_display';

// ---------------------------------------------------------------------------
// Esquema (PLAN §6.1) y valores por defecto exactos de PLAN §5.2
// ---------------------------------------------------------------------------

/** Cuántos porcentajes sugeridos de propina: exactamente tres (PLAN §5.2). */
export const TIP_PRESETS_COUNT = 3;
/**
 * Un porcentaje sugerido es un ENTERO entre 1 y 100 (lo que dice la tarjeta:
 * «entre 1 y 100»); 0 es «Sin propina», que la pantalla ya ofrece. Los tres
 * deben ser DISTINTOS (tres botones iguales no ofrecen nada) y se guardan
 * ordenados de menor a mayor. Ronda 2 de F2-A: antes se aceptaban 0.01,
 * duplicados y desordenados.
 */
export const TIP_PRESET_MIN = 1;
export const TIP_PRESET_MAX = 100;
/** Tiempo hasta reposo en segundos: entre 10 s y una hora (PLAN §5.2: 90 s por defecto). */
export const IDLE_AFTER_SECONDS_MIN = 10;
export const IDLE_AFTER_SECONDS_MAX = 3600;
/** Cuántas imágenes propias admite el reposo (cada una una URL http(s)). */
export const IDLE_MEDIA_URLS_MAX = 20;

export const IDLE_MODES = ['brand', 'promotions', 'media'] as const;
export type IdleMode = (typeof IDLE_MODES)[number];
export const TOUCH_OVERRIDES = ['auto', 'touch', 'no-touch'] as const satisfies readonly DisplayTouchOverride[];

/**
 * Etiqueta de idioma BCP 47 «suficiente»: idioma de 2–3 letras y subetiquetas
 * alfanuméricas opcionales (es, es-CO, pt-BR, zh-Hant-TW). No se comprueba
 * contra una lista: la pantalla cae al idioma de la organización si next-intl
 * no lo conoce.
 */
const LOCALE_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

const DEFAULT_TIP_PRESETS: readonly number[] = Object.freeze([5, 10, 15]);

/** ¿Tres enteros distintos entre 1 y 100? Mismo criterio que la tarjeta (validateDraft), para no degradar en silencio lo que ella deja pasar. */
export function isValidTipPresets(presets: unknown): presets is number[] {
  return (
    Array.isArray(presets) &&
    presets.length === TIP_PRESETS_COUNT &&
    presets.every((p) => typeof p === 'number' && Number.isInteger(p) && p >= TIP_PRESET_MIN && p <= TIP_PRESET_MAX) &&
    new Set(presets).size === presets.length
  );
}

/** Tres enteros distintos en [1, 100], ordenados de menor a mayor; cualquier otra cosa → 5/10/15 entero (no se «arregla» a medias). */
const tipPresetsSchema = z
  .array(z.number().int().min(TIP_PRESET_MIN).max(TIP_PRESET_MAX))
  .length(TIP_PRESETS_COUNT)
  .refine((list) => new Set(list).size === list.length, 'presets repetidos')
  .transform((list) => [...list].sort((a, b) => a - b))
  .catch(() => [...DEFAULT_TIP_PRESETS]);

const tipsSchema = z
  .object({
    enabled: z.boolean().catch(false),
    presets: tipPresetsSchema,
    allowCustom: z.boolean().catch(true),
  })
  .catch(() => ({ enabled: false, presets: [...DEFAULT_TIP_PRESETS], allowCustom: true }));

const ratingSchema = z.object({ enabled: z.boolean().catch(false) }).catch(() => ({ enabled: false }));

/**
 * URL de imagen del reposo: http(s) absoluta y SIN espacios en blanco ni
 * controles dentro. ÚNICA definición: la tarjeta (AjustesPantallaSection) la
 * importa de aquí en vez de redefinirla. `z.string().url()` por sí sola se
 * apoya en `new URL()` (WHATWG), que tolera espacios y descarta saltos de
 * línea y tabuladores: aceptaba `https://x.com/a b` y
 * `https://a.com\nhttps://b.com` como UNA URL, la tarjeta las rechazaba y el
 * round-trip por el textarea (join('\n') + split) las partía en dos (ronda 3
 * de F2-A, QA bajo #4).
 */
export const MEDIA_URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * ÚNICO predicado de «URL de imagen de reposo válida» (ronda 4 de F2-A, QA
 * bajo): el patrón Y `new URL()` sin lanzar. Antes la tarjeta solo aplicaba
 * el patrón y el esquema además `.url()` (que es `new URL()`): `https://%` y
 * `http://[` pasaban la tarjeta, el guardado las descartaba en silencio y el
 * usuario veía «guardado» con la URL desaparecida. Lo usan `mediaUrlSchema`
 * (aquí) y `validateDraft` (AjustesPantallaSection): ni una más ni una menos.
 * Recorta blancos alrededor (el textarea ya lo hace; el esquema también).
 * Nunca lanza; una entrada que no es cadena → false.
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

/** URL http(s) absoluta sin blancos; otras (javascript:, data:, relativas, con espacio o salto, mal formadas) se descartan una a una. */
const mediaUrlSchema = z.string().trim().refine(isValidMediaUrl, 'solo http(s) bien formada y sin espacios');

const idleSchema = z
  .object({
    mode: z.enum(IDLE_MODES).catch('brand'),
    mediaUrls: z
      .array(z.unknown())
      .transform((list) =>
        list
          .map((u) => mediaUrlSchema.safeParse(u))
          .filter((r): r is { success: true; data: string } => r.success)
          .map((r) => r.data)
          .slice(0, IDLE_MEDIA_URLS_MAX),
      )
      .catch(() => [] as string[]),
    idleAfterSeconds: z.number().int().min(IDLE_AFTER_SECONDS_MIN).max(IDLE_AFTER_SECONDS_MAX).catch(90),
  })
  .catch(() => ({ mode: 'brand' as IdleMode, mediaUrls: [] as string[], idleAfterSeconds: 90 }));

/** `locale`: null (idioma de la organización) o etiqueta BCP 47; cualquier otra cosa → null. */
const localeSchema = z.union([z.null(), z.string().trim().regex(LOCALE_PATTERN)]).catch(null);

/**
 * Esquema completo de `pos_customer_display` (PLAN §6.1). Cada campo lleva
 * su propio `.catch` con el valor por defecto de PLAN §5.2, así un campo
 * inválido no arrastra a los demás. La raíz también: un JSON que no es un
 * objeto degrada a `DEFAULT_CUSTOMER_DISPLAY_SETTINGS` entero.
 */
export const customerDisplaySettingsSchema = z.object({
  /** Interruptor maestro. Apagado = el POS no emite nada. */
  enabled: z.boolean().catch(false),
  tips: tipsSchema,
  rating: ratingSchema,
  /** Apagado muestra «IVA incluido»; encendido, desglosado como en el recibo. */
  showTaxBreakdown: z.boolean().catch(false),
  /** Privacidad primero: apagado por defecto. */
  showCustomerName: z.boolean().catch(false),
  idle: idleSchema,
  locale: localeSchema,
  touch: z.enum(TOUCH_OVERRIDES).catch('auto'),
});

export type CustomerDisplaySettings = z.infer<typeof customerDisplaySettingsSchema>;

/** Valores por defecto exactos de PLAN §5.2 / §6.1. Congelado en profundidad: clonar antes de mutar. */
export const DEFAULT_CUSTOMER_DISPLAY_SETTINGS: Readonly<CustomerDisplaySettings> = Object.freeze({
  enabled: false,
  tips: Object.freeze({ enabled: false, presets: Object.freeze([...DEFAULT_TIP_PRESETS]) as number[], allowCustom: true }),
  rating: Object.freeze({ enabled: false }),
  showTaxBreakdown: false,
  showCustomerName: false,
  idle: Object.freeze({ mode: 'brand' as IdleMode, mediaUrls: Object.freeze([] as string[]) as string[], idleAfterSeconds: 90 }),
  locale: null,
  touch: 'auto',
});

function cloneSettings(settings: Readonly<CustomerDisplaySettings>): CustomerDisplaySettings {
  return {
    enabled: settings.enabled,
    tips: { enabled: settings.tips.enabled, presets: [...settings.tips.presets], allowCustom: settings.tips.allowCustom },
    rating: { enabled: settings.rating.enabled },
    showTaxBreakdown: settings.showTaxBreakdown,
    showCustomerName: settings.showCustomerName,
    idle: { mode: settings.idle.mode, mediaUrls: [...settings.idle.mediaUrls], idleAfterSeconds: settings.idle.idleAfterSeconds },
    locale: settings.locale,
    touch: settings.touch,
  };
}

/** Copia mutable y profunda de los valores por defecto. */
export function defaultCustomerDisplaySettings(): CustomerDisplaySettings {
  return cloneSettings(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
}

/**
 * Valida el JSON guardado (o cualquier cosa) y devuelve ajustes completos.
 * Nunca lanza: campo inválido → su valor por defecto; raíz inválida →
 * todos los valores por defecto (PLAN §6.1).
 */
export function parseCustomerDisplaySettings(raw: unknown): CustomerDisplaySettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return defaultCustomerDisplaySettings();
  }
  const result = customerDisplaySettingsSchema.safeParse(raw);
  // Con `.catch` en cada campo no debería fallar nunca; por si acaso, defaults.
  return result.success ? result.data : defaultCustomerDisplaySettings();
}

/**
 * Lo que viaja a la pantalla en `hello.settings` (protocol.ts): todo menos
 * `enabled` (apagado = no hay hello) e `idle` (recursos de la pantalla, F4).
 */
export function toDisplayPresentationSettings(settings: Readonly<CustomerDisplaySettings>): DisplayPresentationSettings {
  return {
    tips: { enabled: settings.tips.enabled, presets: [...settings.tips.presets], allowCustom: settings.tips.allowCustom },
    rating: { enabled: settings.rating.enabled },
    showTaxBreakdown: settings.showTaxBreakdown,
    showCustomerName: settings.showCustomerName,
    locale: settings.locale,
    touch: settings.touch,
  };
}
