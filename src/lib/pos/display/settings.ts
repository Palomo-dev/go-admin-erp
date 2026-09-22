/**
 * Ajustes de la pantalla del cliente (PLAN §5.2 y §6.1): fila de
 * `organization_settings` con clave `pos_customer_display`, una por
 * organización. Sin migración: es la convención que ya usa la página de
 * configuración del POS (`pos_categories_display`, `pos_blind_cash_count`…).
 *
 * Fase 2: el esquema completo de PLAN §6.1 se valida con zod
 * (`customerDisplaySettingsSchema`) tanto al leer como antes de guardar.
 * `parseCustomerDisplaySettings` es pura y tolerante CAMPO A CAMPO: un JSON
 * malformado, un preset fuera de rango o un `locale` que no es BCP 47
 * degradan ESE campo a su valor por defecto, nunca a una excepción ni a una
 * pantalla rota. `saveCustomerDisplaySettings` hace el upsert (mismo
 * `onConflict: 'organization_id,key'` que `operating_hours`) y fija la caché
 * con `primeCustomerDisplaySettings`; la ventana que guarda no relee la BD
 * (una relectura fallida cachearía «apagado» sobre un `true` recién
 * escrito). Las cajas de OTRAS ventanas releen con
 * `refreshCustomerDisplaySettings`, que ante error conserva el valor que ya
 * tenían en vez de apagarlas en plena venta.
 *
 * Lectura en memoria: la caja consulta `enabled` en `start`/`refresh` y
 * además en cada publicación (`flush`/`announce`, es decir, tras cada
 * tecla), así que la fila se lee UNA vez por organización y se cachea. Sin
 * caché o con la fila ausente el valor es el de `DEFAULT_CUSTOMER_DISPLAY_SETTINGS`
 * (apagado): una pantalla recién instalada nunca emite nada hasta que la
 * organización la activa.
 */

import { z } from 'zod';
import { supabase } from '@/lib/supabase/config';
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

// ---------------------------------------------------------------------------
// Caché en memoria por organización
// ---------------------------------------------------------------------------

/** Caché en memoria por organización. Se invalida con refreshCustomerDisplaySettings. */
const cache = new Map<number, CustomerDisplaySettings>();
/** Cargas en curso, para que N llamadas simultáneas hagan una sola consulta. */
const inflight = new Map<number, Promise<CustomerDisplaySettings>>();
/**
 * Organizaciones cuya carga inicial FALLÓ (red, RLS): la caché guarda el
 * valor por defecto para que el emisor no espere, pero no se «conoce» el
 * interruptor (`hasCustomerDisplaySettingsCache` = false): el indicador se
 * queda en «cargando» en vez de afirmar «desactivada» y ofrecer «Activar»
 * sin red. La siguiente carga vuelve a consultar; un éxito lo limpia.
 */
const loadFailed = new Set<number>();
/**
 * Época por organización: la avanza cada escritor (carga, relectura, prime)
 * al EMPEZAR. Un escritor asíncrono anota su época antes de consultar y solo
 * escribe la caché si ningún escritor más reciente la ha escrito ya
 * (`applied`). Así dos relecturas que responden fuera de orden dejan el valor
 * de la más reciente, y una carga lenta no pisa un `prime` posterior (el
 * guardado de la tarjeta). Una respuesta que llega en orden sí se aplica
 * aunque haya otra más nueva en vuelo: es el estado real de la BD en ese
 * instante y la siguiente la sustituirá.
 */
const epoch = new Map<number, number>();
/** Última época que llegó a escribir la caché, por organización. */
const applied = new Map<number, number>();

/** Avanza la época de la organización y devuelve la nueva. */
function bump(orgId: number): number {
  const next = (epoch.get(orgId) ?? 0) + 1;
  epoch.set(orgId, next);
  return next;
}

/** Escribe la caché solo si `mine` es más reciente que lo último aplicado. Devuelve si escribió. */
function commit(orgId: number, mine: number, settings: CustomerDisplaySettings): boolean {
  if (mine <= (applied.get(orgId) ?? 0)) return false; // respuesta superada
  applied.set(orgId, mine);
  cache.set(orgId, settings);
  loadFailed.delete(orgId);
  return true;
}

function isValidOrgId(orgId: unknown): orgId is number {
  return typeof orgId === 'number' && Number.isInteger(orgId) && orgId > 0;
}

/**
 * Lectura síncrona desde la caché. Sin caché devuelve los valores por
 * defecto (apagado): el emisor no espera a la BD para decidir si emite.
 */
export function getCachedCustomerDisplaySettings(orgId: number): CustomerDisplaySettings {
  return cache.get(orgId) ?? defaultCustomerDisplaySettings();
}

/** ¿Está activada la pantalla del cliente para esta organización? Solo lee la caché. */
export function isCustomerDisplayEnabled(orgId: number): boolean {
  return getCachedCustomerDisplaySettings(orgId).enabled;
}

/**
 * ¿Ya se conoce el interruptor de esta organización (hay caché)? Mientras
 * sea false, `isCustomerDisplayEnabled` devuelve el valor por defecto
 * (apagado) sin que eso signifique que la organización lo apagó: el
 * indicador de la caja lo usa para no pintar «desactivada» durante la carga.
 */
export function hasCustomerDisplaySettingsCache(orgId: number): boolean {
  return cache.has(orgId) && !loadFailed.has(orgId);
}

/** Mensaje legible de un error de Supabase (objeto con `message`) o de una excepción cualquiera. */
function describeError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// Base de datos (organization_settings)
// ---------------------------------------------------------------------------

/**
 * Fila cruda de `pos_customer_display` de la organización. LANZA ante error
 * de red o RLS. Sin fila: `{}`. Quien guarda la usa para el merge y debe
 * abortar si no pudo leer (si continuara con {} pisaría claves que la UI no
 * edita).
 */
export async function fetchCustomerDisplayRow(orgId: number): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('organization_settings')
    .select('settings')
    .eq('organization_id', orgId)
    .eq('key', POS_CUSTOMER_DISPLAY_KEY)
    .maybeSingle();
  if (error) throw error;
  const settings: unknown = data?.settings;
  return typeof settings === 'object' && settings !== null && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
}

/**
 * Consulta la fila y la valida. LANZA ante error de red o RLS: quien la
 * llama decide qué cachear (la carga inicial, el valor por defecto; la
 * relectura, el valor anterior). Sin fila: valores por defecto.
 */
export async function fetchCustomerDisplaySettings(orgId: number): Promise<CustomerDisplaySettings> {
  return parseCustomerDisplaySettings(await fetchCustomerDisplayRow(orgId));
}

/**
 * Carga la fila (una consulta por organización) y la deja en caché. Con
 * error de red o RLS se cachea el valor por defecto para no reintentar en
 * cada tecla; `refreshCustomerDisplaySettings` vuelve a consultar.
 *
 * Si mientras la consulta viaja alguien fija la caché (`prime` tras guardar
 * la tarjeta en Configuración con la carga del POS aún en vuelo), la
 * respuesta vieja NO la pisa: devuelve lo que haya en caché.
 */
export async function loadCustomerDisplaySettings(orgId: number): Promise<CustomerDisplaySettings> {
  if (!isValidOrgId(orgId)) return defaultCustomerDisplaySettings();
  const cached = cache.get(orgId);
  if (cached && !loadFailed.has(orgId)) return cached; // tras un fallo se vuelve a consultar
  const pending = inflight.get(orgId);
  if (pending) return pending;

  const mine = bump(orgId);
  let failed = false;
  const load = (async () => {
    try {
      return await fetchCustomerDisplaySettings(orgId);
    } catch (err) {
      console.warn('[pos-display] no se pudo leer pos_customer_display:', describeError(err));
      failed = true;
      return defaultCustomerDisplaySettings();
    }
  })();

  inflight.set(orgId, load);
  try {
    const settings = await load;
    if (commit(orgId, mine, settings) && failed) loadFailed.add(orgId);
    return cache.get(orgId) ?? settings;
  } finally {
    // Solo se retira la promesa propia: un `prime` intermedio ya la habrá borrado.
    if (inflight.get(orgId) === load) inflight.delete(orgId);
  }
}

/**
 * Vuelve a consultar la fila y SOLO reemplaza la caché si la consulta tuvo
 * éxito. Con error (red, RLS transitoria) conserva el valor que ya había y
 * lo devuelve: una caja que estaba emitiendo no se apaga en plena venta por
 * un fallo pasajero en el instante en que otra ventana guarda. Sin valor
 * previo, cachea el valor por defecto como la carga inicial.
 *
 * Lo llama el listener de `storage` de posDisplay.ts cuando OTRA ventana
 * guardó la tarjeta; la ventana que guarda usa `primeCustomerDisplaySettings`.
 *
 * Dos guardados seguidos (encender, apagar) producen dos relecturas; si la
 * primera responde la última, su valor está superado y se descarta: manda
 * la relectura más reciente, no la última respuesta en llegar.
 */
export async function refreshCustomerDisplaySettings(orgId: number): Promise<CustomerDisplaySettings> {
  if (!isValidOrgId(orgId)) return defaultCustomerDisplaySettings();
  const prev = cache.get(orgId);
  const mine = bump(orgId);
  try {
    const settings = await fetchCustomerDisplaySettings(orgId);
    if (!commit(orgId, mine, settings)) return cache.get(orgId) ?? settings; // respuesta superada
    return settings;
  } catch (err) {
    console.warn('[pos-display] no se pudo releer pos_customer_display; se conserva el valor anterior:', describeError(err));
    // No se toca lo que haya en caché: pudo fijarlo un `prime` mientras la consulta viajaba.
    const current = cache.get(orgId);
    if (current) return current;
    const fallback = prev ?? defaultCustomerDisplaySettings();
    commit(orgId, mine, fallback);
    return cache.get(orgId) ?? fallback;
  }
}

/**
 * Fija la caché sin consultar. Para justo después de un upsert exitoso
 * (evita una lectura) y para pruebas. Acepta un parcial: lo que falte toma
 * el valor por defecto (pasa por `parseCustomerDisplaySettings`). Avanza la
 * época: cualquier carga o relectura que estuviera en vuelo queda superada y
 * no pisa este valor, y una carga posterior no recibirá la promesa vieja.
 */
export function primeCustomerDisplaySettings(orgId: number, settings: Partial<CustomerDisplaySettings>): void {
  if (!isValidOrgId(orgId)) return;
  const mine = bump(orgId);
  applied.set(orgId, mine);
  cache.set(orgId, parseCustomerDisplaySettings(settings));
  loadFailed.delete(orgId); // el valor recién guardado sí se conoce
  inflight.delete(orgId);
}

/**
 * Guarda los ajustes en `organization_settings` (`pos_customer_display`),
 * mismo upsert/onConflict que `operating_hours`; sin ruta de API (PLAN §5.2).
 *
 * - `patch` es parcial a nivel de campo: las claves `undefined` se ignoran
 *   (conservan el valor de la fila). Los bloques (`tips`, `idle`…) se
 *   sustituyen enteros: la tarjeta siempre manda el bloque completo.
 * - La lectura previa va SIN catch: si falla, se lanza antes del upsert y la
 *   fila no se toca (la tarjeta revierte y avisa). Las claves desconocidas
 *   de la fila se conservan (un cliente más nuevo pudo escribirlas).
 * - Se valida con zod ANTES del upsert: lo que se escribe es siempre un JSON
 *   que `parseCustomerDisplaySettings` devuelve tal cual.
 * - Tras el upsert fija la caché de esta ventana con lo recién escrito
 *   (`primeCustomerDisplaySettings`). NO avisa a las otras ventanas: eso lo
 *   hace quien llama (`notifyCustomerDisplaySettingsChanged` en posDisplay.ts,
 *   que importa este módulo y no puede ser importado desde aquí).
 *
 * Devuelve los ajustes guardados, ya validados.
 */
export async function saveCustomerDisplaySettings(
  orgId: number,
  patch: Partial<CustomerDisplaySettings>,
): Promise<CustomerDisplaySettings> {
  if (!isValidOrgId(orgId)) throw new Error('organización inválida');
  const raw = await fetchCustomerDisplayRow(orgId);
  const defined = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  const saved = parseCustomerDisplaySettings({ ...parseCustomerDisplaySettings(raw), ...defined });

  const { error } = await supabase.from('organization_settings').upsert(
    {
      organization_id: orgId,
      key: POS_CUSTOMER_DISPLAY_KEY,
      settings: { ...raw, ...saved },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,key' },
  );
  if (error) throw error;

  primeCustomerDisplaySettings(orgId, saved);
  return saved;
}

/** Vacía toda la caché (cambio de organización, cierre de sesión, pruebas). */
export function clearCustomerDisplaySettingsCache(): void {
  cache.clear();
  inflight.clear();
  epoch.clear();
  applied.clear();
  loadFailed.clear();
}
