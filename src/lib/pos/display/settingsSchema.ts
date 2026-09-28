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
import {
  DEFAULT_IDLE_AFTER_SECONDS,
  IDLE_AFTER_SECONDS_MAX,
  IDLE_AFTER_SECONDS_MIN,
  IDLE_MEDIA_URLS_MAX,
  IDLE_MODES,
  MEDIA_URL_PATTERN,
  isValidMediaUrl,
  type IdleMode,
} from './idleRules';

/**
 * Los límites y el predicado de URL del reposo viven en `idleRules.ts`
 * (módulo puro, sin zod) porque los comparte la PANTALLA
 * (components/pos-display/idle.ts), que no debe arrastrar el validador.
 * Se re-exportan desde aquí para no romper a quien ya los importaba de este
 * módulo: la definición sigue siendo una sola (CLAUDE.md §7).
 */
export {
  DEFAULT_IDLE_AFTER_SECONDS,
  IDLE_AFTER_SECONDS_MAX,
  IDLE_AFTER_SECONDS_MIN,
  IDLE_MEDIA_URLS_MAX,
  IDLE_MODES,
  MEDIA_URL_PATTERN,
  isValidMediaUrl,
};
export type { IdleMode };

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
    idleAfterSeconds: z.number().int().min(IDLE_AFTER_SECONDS_MIN).max(IDLE_AFTER_SECONDS_MAX).catch(DEFAULT_IDLE_AFTER_SECONDS),
  })
  .catch(() => ({ mode: 'brand' as IdleMode, mediaUrls: [] as string[], idleAfterSeconds: DEFAULT_IDLE_AFTER_SECONDS }));

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
  idle: Object.freeze({ mode: 'brand' as IdleMode, mediaUrls: Object.freeze([] as string[]) as string[], idleAfterSeconds: DEFAULT_IDLE_AFTER_SECONDS }),
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
 * `enabled` (apagado = no hay hello). Desde la Fase 4 también `idle`: la
 * pantalla LOCAL no tiene otra fuente de ajustes que el saludo (la remota lo
 * recibe además en su bootstrap), y sin él el modo reposo no se puede
 * aplicar en la caja del mostrador.
 */
export function toDisplayPresentationSettings(settings: Readonly<CustomerDisplaySettings>): DisplayPresentationSettings {
  return {
    tips: { enabled: settings.tips.enabled, presets: [...settings.tips.presets], allowCustom: settings.tips.allowCustom },
    rating: { enabled: settings.rating.enabled },
    showTaxBreakdown: settings.showTaxBreakdown,
    showCustomerName: settings.showCustomerName,
    locale: settings.locale,
    touch: settings.touch,
    idle: { mode: settings.idle.mode, mediaUrls: [...settings.idle.mediaUrls], idleAfterSeconds: settings.idle.idleAfterSeconds },
  };
}
