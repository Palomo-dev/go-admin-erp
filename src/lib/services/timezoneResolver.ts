// ============================================================
// Resolutor de zona horaria para la capa de servicios (Fase B, tanda 0).
//
// Contrato decidido en `docs/adr/ADR-003-como-entra-la-zona-en-los-servicios.md`:
// los servicios reciben **identidad** (`organizationId`, y `branchId` cuando el
// dato tiene sucursal), nunca la zona ya resuelta. La zona se resuelve aquí, en
// un solo sitio, con la MISMA cascada que `fn_timezone_for` en Postgres.
//
//   resolveTimezone(organizationId, branchId?)  ->  Promise<string>
//   invalidateResolvedTimezone(organizationId?) ->  void
//
// Prohibido, por el ADR: añadir un parámetro `timezone?: string` opcional a un
// servicio. Un opcional que nadie rellena no arregla nada y no falla de forma
// visible (es la forma exacta del bug de impresión de la ronda 4).
//
// QUÉ NO HACE ESTE MÓDULO: no reimplementa la cascada. La cascada vive en
// `resolveTimezoneCascade` / `resolveTimezoneForBranch`
// (`@/lib/utils/branchTimezoneCascade`), que es el gemelo probado de
// `fn_timezone_for`. Aquí solo se juntan las dos lecturas cacheadas
// (`getOrganizationTimezone`, `getBranchTimezones`) y se les aplica esa cascada.
// Dos implementaciones de la cascada divergen en semanas: por eso esto delega.
//
// NUNCA LANZA, igual que `fn_timezone_for`. Se llama desde servicios que están
// a punto de guardar dinero (abonos, vencimientos, asientos): una lectura de
// `organizations` que falle por RLS no puede tumbar el guardado. Ante cualquier
// error se devuelve `DEFAULT_TIMEZONE` y se avisa por consola.
//
// CACHÉ E INVALIDACIÓN: memoriza `org:branch -> zona`. Se invalida de tres
// formas, y las tres hacen falta:
//   1. `invalidateResolvedTimezone(orgId?)` — llamada explícita; limpia también
//      los dos cachés de debajo, porque invalidar solo esta capa dejaría la
//      zona vieja viva un nivel más abajo y el bug seguiría en pie.
//   2. El evento `TIMEZONES_UPDATED_EVENT` del navegador, que emite
//      `notifyTimezonesUpdated()` tras cada guardado de zona.
//   3. `timezoneSettingsService`, que llama a (1) en el servidor, donde no hay
//      `window` y por tanto no hay evento.
// ============================================================

import { DEFAULT_TIMEZONE } from '@/lib/utils/dateCore';
import { resolveTimezoneForBranch } from '@/lib/utils/branchTimezoneCascade';
import type { TimezoneSource } from '@/lib/utils/branchTimezoneCascade';
import {
  getOrganizationTimezone,
  invalidateTimezoneCache,
} from '@/lib/services/organizationTimezoneService';
import {
  getBranchTimezones,
  invalidateBranchTimezoneCache,
  TIMEZONES_UPDATED_EVENT,
} from '@/lib/services/branchTimezoneService';

export { DEFAULT_TIMEZONE };

/** `org:branch` -> zona ya resuelta. `branch` vacío = sin sucursal. */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function claveDeCache(organizationId: number, branchId: number | null): string {
  return `${organizationId}:${branchId ?? ''}`;
}

/** Un id que no sirve para consultar. `0`, `NaN`, negativos y no-enteros. */
function idUtilizable(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

/** Normaliza el `branchId` recibido: solo un id utilizable cuenta. */
function normalizarSucursal(branchId: number | null | undefined): number | null {
  return idUtilizable(branchId) ? branchId : null;
}

async function resolver(organizationId: number, branchId: number | null): Promise<string> {
  // La zona de la organización ya viene validada y cacheada por su servicio;
  // cuando no hay dato devuelve DEFAULT_TIMEZONE, no null.
  const zonaOrganizacion = await getOrganizationTimezone(organizationId);

  // El mapa de sucursales solo se pide si hay sucursal que resolver: sin
  // `branchId` la cascada no puede dar otra cosa que la zona de la organización
  // y la consulta sería puro gasto.
  const mapaSucursales = branchId === null ? {} : await getBranchTimezones(organizationId);

  return resolveTimezoneForBranch(branchId, mapaSucursales, zonaOrganizacion).timezone;
}

/**
 * Zona horaria IANA efectiva para un dato de esta organización y (si lo tiene)
 * de esta sucursal. Cascada sucursal → organización → `America/Bogota`, la
 * misma que `fn_timezone_for(p_organization_id, p_branch_id)`.
 *
 * `branchId` es el de LA FILA de datos (`accounts_receivable.branch_id`,
 * `invoice_sales.branch_id`, …), nunca el de la sucursal seleccionada en la
 * barra superior: el vencimiento de una factura de la sucursal de Madrid se
 * calcula en Madrid aunque quien mire tenga elegida la de Bogotá.
 *
 * Nunca lanza. Ante cualquier fallo devuelve `DEFAULT_TIMEZONE`.
 *
 * @param organizationId Organización dueña del dato.
 * @param branchId Sucursal dueña del dato, si la tiene.
 */
export async function resolveTimezone(
  organizationId: number,
  branchId?: number | null,
): Promise<string> {
  if (!idUtilizable(organizationId)) return DEFAULT_TIMEZONE;

  const sucursal = normalizarSucursal(branchId);
  const clave = claveDeCache(organizationId, sucursal);

  const cacheado = cache.get(clave);
  if (cacheado) return cacheado;

  const enVuelo = inflight.get(clave);
  if (enVuelo) return enVuelo;

  const promesa = (async (): Promise<string> => {
    try {
      const zona = await resolver(organizationId, sucursal);
      cache.set(clave, zona);
      return zona;
    } catch (err) {
      // Igual que fn_timezone_for: a prueba de fallos. No se cachea el
      // default, para que un fallo puntual de red no congele la zona.
      console.warn('[timezone] resolveTimezone cayó al default:', err);
      return DEFAULT_TIMEZONE;
    } finally {
      inflight.delete(clave);
    }
  })();

  inflight.set(clave, promesa);
  return promesa;
}

/**
 * Descripción de dónde salió la zona. Solo para diagnóstico y para la
 * observabilidad; los servicios usan `resolveTimezone`.
 */
export interface ResolucionZona {
  timezone: string;
  source: TimezoneSource;
}

/**
 * Como `resolveTimezone`, pero además dice qué nivel de la cascada la aportó.
 * Sin caché propia: se apoya en la de las lecturas de debajo.
 */
export async function resolveTimezoneWithSource(
  organizationId: number,
  branchId?: number | null,
): Promise<ResolucionZona> {
  if (!idUtilizable(organizationId)) {
    return { timezone: DEFAULT_TIMEZONE, source: 'fallback' };
  }
  const sucursal = normalizarSucursal(branchId);
  try {
    const zonaOrganizacion = await getOrganizationTimezone(organizationId);
    const mapa = sucursal === null ? {} : await getBranchTimezones(organizationId);
    const r = resolveTimezoneForBranch(sucursal, mapa, zonaOrganizacion);
    return { timezone: r.timezone, source: r.source };
  } catch {
    return { timezone: DEFAULT_TIMEZONE, source: 'fallback' };
  }
}

/**
 * Invalida la zona resuelta. Obligatorio tras guardar la zona de una
 * organización o de una sucursal: sin esto, un servicio sigue escribiendo
 * vencimientos con la zona anterior hasta que se recargue la pestaña.
 *
 * Limpia TAMBIÉN los cachés de `getOrganizationTimezone` y de
 * `getBranchTimezones`. Invalidar solo esta capa sería peor que no invalidar:
 * la siguiente llamada volvería a leer el valor viejo de debajo y lo
 * recachearía aquí como si fuera fresco.
 *
 * @param organizationId Organización afectada; sin argumento, todo.
 */
export function invalidateResolvedTimezone(organizationId?: number): void {
  if (idUtilizable(organizationId)) {
    const prefijo = `${organizationId}:`;
    for (const clave of Array.from(cache.keys())) {
      if (clave.startsWith(prefijo)) cache.delete(clave);
    }
    for (const clave of Array.from(inflight.keys())) {
      if (clave.startsWith(prefijo)) inflight.delete(clave);
    }
    invalidateTimezoneCache(organizationId);
    invalidateBranchTimezoneCache(organizationId);
    return;
  }

  cache.clear();
  inflight.clear();
  invalidateTimezoneCache();
  invalidateBranchTimezoneCache();
}

// Guardado desde otra pantalla (o desde el propio ajuste de zona): el evento
// llega a todos los módulos cargados. Sin este enganche la caché de arriba
// sobreviviría al cambio de zona y los servicios seguirían con la vieja.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener(TIMEZONES_UPDATED_EVENT, () => {
      cache.clear();
      inflight.clear();
    });
  } catch {
    /* entorno sin addEventListener: la invalidación explícita sigue valiendo */
  }
}
