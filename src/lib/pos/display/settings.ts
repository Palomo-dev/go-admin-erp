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

import { supabase } from '@/lib/supabase/config';
import {
  POS_CUSTOMER_DISPLAY_KEY,
  defaultCustomerDisplaySettings,
  parseCustomerDisplaySettings,
  type CustomerDisplaySettings,
} from './settingsSchema';

/**
 * Esquema, valores por defecto y parseo: viven en settingsSchema.ts (módulo
 * puro, también lo usan las rutas de servidor de la Fase 3) y se re-exportan
 * aquí para que ningún consumidor cambie su import.
 */
export * from './settingsSchema';

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
