/**
 * Lecturas del selector «Agregar a la oportunidad» (Figma 1771:171737
 * Productos, 1771:172205 Servicios y 1783:310575 Hospedaje) y de la pestaña
 * «Líneas»: catálogo con el padre con variantes UNA sola vez, insignias, stock
 * por sucursal, configuración de servicios y disponibilidad del hospedaje.
 *
 * Ola 3B (guardarraíl 36): todo pasa por `GET /api/crm/catalogo-oportunidad`,
 * que consulta en el servidor con la sesión del usuario (RLS) y la
 * organización de la sesión (`catalogoOportunidad.server.ts`). El parámetro
 * `org` de estas funciones se conserva por compatibilidad con los llamadores,
 * pero no viaja: el servidor nunca toma la organización del navegador. Las
 * escrituras de la oportunidad van por `/api/crm/opportunities/**`.
 */
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import type {
  ClaseProxima,
  HabitacionDisponible,
  IntervaloOcupado,
  ItemCatalogo,
  OperacionCatalogo,
  PadreVariante,
  PestanaCatalogo,
  PlanMembresia,
  StockProductoApi,
  StockSucursal,
  TipoHospedaje,
  TotalHospedaje,
} from '@/lib/services/crm/catalogoOportunidad.server';

export type { ClaseProxima, HabitacionDisponible, ItemCatalogo, PestanaCatalogo, PlanMembresia, StockSucursal, TipoHospedaje };

const RUTA = '/api/crm/catalogo-oportunidad';
/** Igual que el servidor (`MAX_IDS_STOCK`). */
const MAX_IDS_STOCK = 1000;

async function leer<T>(op: OperacionCatalogo, params: Record<string, string | number | null | undefined> = {}, senal?: AbortSignal): Promise<T> {
  const sp = new URLSearchParams({ op });
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) sp.set(k, String(v));
  return (await pedirCrm<T>(`${RUTA}?${sp.toString()}`, { signal: senal })).data;
}

/** Cuántos productos y servicios vendibles hay (contadores de las pestañas). */
export async function contarCatalogo(org: number, senal?: AbortSignal): Promise<{ productos: number; servicios: number }> {
  return leer<{ productos: number; servicios: number }>('contar', {}, senal);
}

/**
 * Búsqueda del selector: productos raíz (sin padre) activos de la pestaña;
 * el padre con variantes aparece una vez con «N variantes · desde $».
 */
export async function buscarCatalogo(org: number, c: { texto: string; pestana: PestanaCatalogo; limite?: number }, senal?: AbortSignal): Promise<ItemCatalogo[]> {
  return (await leer<ItemCatalogo[] | null>('buscar', { pestana: c.pestana, texto: c.texto ?? '', limite: c.limite }, senal)) ?? [];
}

/** Stock por sucursal de cada producto (`stock_levels`, sucursales de la organización). */
export async function stockPorProducto(ids: readonly number[], senal?: AbortSignal): Promise<Map<number, StockSucursal[]>> {
  const salida = new Map<number, StockSucursal[]>();
  const unicos = [...new Set(ids)].filter((n) => Number.isSafeInteger(n) && n > 0).slice(0, MAX_IDS_STOCK);
  if (unicos.length === 0) return salida;
  const filas = (await leer<StockProductoApi[] | null>('stock', { ids: unicos.join(',') }, senal)) ?? [];
  for (const f of filas) salida.set(f.product_id, f.sucursales);
  return salida;
}

/** Producto padre de una variante (para «Cambiar variante» desde la línea). */
export async function padreDeVariante(productId: number): Promise<{ id: number; nombre: string; sku: string | null } | null> {
  return (await leer<PadreVariante | null>('padre', { product_id: productId })) ?? null;
}

// ─── Servicios ─────────────────────────────────────────────────────────────

export async function planDeMembresia(productId: number): Promise<PlanMembresia | null> {
  return (await leer<PlanMembresia | null>('membresia', { product_id: productId })) ?? null;
}

/** Clases programadas desde `desde` (cupos en vivo: capacidad − reservas activas). */
export async function clasesProximas(org: number, desde: string, senal?: AbortSignal): Promise<ClaseProxima[]> {
  return (await leer<ClaseProxima[] | null>('clases', { desde }, senal)) ?? [];
}

/** Instantes ocupados del profesional entre `desde` y `hasta` (eventos del calendario). */
export async function ocupadoProfesional(org: number, usuario: string, desde: string, hasta: string): Promise<{ inicio: string; fin: string }[]> {
  return (await leer<IntervaloOcupado[] | null>('ocupado', { usuario, desde, hasta })) ?? [];
}

// ─── Hospedaje ─────────────────────────────────────────────────────────────

/** Tipos de habitación por sucursal (los que tienen al menos una habitación). */
export async function tiposHospedaje(org: number, senal?: AbortSignal): Promise<TipoHospedaje[]> {
  return (await leer<TipoHospedaje[] | null>('tipos-hospedaje', {}, senal)) ?? [];
}

/** Planes de tarifa del tipo (`rates.restrictions.plan`). */
export async function planesTarifa(org: number, spaceTypeId: string): Promise<string[]> {
  return (await leer<string[] | null>('planes-tarifa', { space_type_id: spaceTypeId })) ?? [];
}

export async function disponibilidad(entrada: string, salida: string, spaceTypeId: string, branchId: number): Promise<HabitacionDisponible[]> {
  return (await leer<HabitacionDisponible[] | null>('disponibilidad', { entrada, salida, space_type_id: spaceTypeId, branch_id: branchId })) ?? [];
}

export async function totalHospedaje(org: number, spaceTypeId: string, entrada: string, salida: string, plan: string | null): Promise<{ total: number; noches: number; tarifa: number; origen: string } | null> {
  return (await leer<TotalHospedaje | null>('total-hospedaje', { space_type_id: spaceTypeId, entrada, salida, plan })) ?? null;
}
