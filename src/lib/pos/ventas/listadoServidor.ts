/**
 * Lectura de ventas en el servidor (paso 14 de docs/implementacion/CAJAS-VENTAS-PLAN.md).
 *
 * - `listarVentas`: el listado de /app/pos/ventas paginado, filtrado y ordenado
 *   en la base (`pos_ventas_listado`, solo filas de `sales`, D1). Los filtros
 *   pasan por la lista blanca de `filtrosVentas`.
 * - `cifrasVentas`: los KPI con criterio de caja (`fn_inicio_ventas_rango`, D2),
 *   la MISMA función que usará el Inicio.
 * - El rango de días se convierte a instantes con la zona y las horas de
 *   operación de la organización (`getDateRange`), nunca con la del servidor.
 *
 * Todo con el cliente de la sesión (`ctx.supabase`): la organización es la de
 * la sesión y las funciones comprueban pertenencia y sucursal.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getOperatingHours } from '@/lib/services/organizationOperatingHoursService';
import { getDateRange } from '@/lib/utils/dateRanges';
import { todayInTz } from '@/lib/utils/dateCore';
import { filtrosVentas, parametrosListado, type FiltrosVentas } from './filtrosVentas';
import type { EstadoVenta, OrigenVenta } from './estadoVenta';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase' | 'userId'>;

export interface FilaVenta {
  id: string;
  fecha: string;
  creada: string;
  total: number;
  saldo: number;
  status: string;
  payment_status: string | null;
  estado: EstadoVenta;
  origen: OrigenVenta;
  numero: string | null;
  tipo_numero: 'factura' | 'pedido' | null;
  factura_id: string | null;
  cxc_id: string | null;
  web_order_id: string | null;
  cliente: { id: string; nombre: string | null; documento: string | null } | null;
  cajero: { id: string; nombre: string | null };
  sucursal: { id: number; nombre: string | null };
  metodos: string[];
  devuelto: number;
  notas_credito: number;
}

export interface PaginaVentas {
  total: number;
  filas: FilaVenta[];
  pagina: number;
  tamano: number;
}

export interface CifrasPeriodo {
  cobrado: number;
  reintegros: number;
  neto: number;
  num_cobros: number;
  ventas_cobradas: number;
}

export interface CifrasVentas {
  desde: string;
  hasta: string;
  desde_anterior: string;
  actual: CifrasPeriodo & {
    ticket_promedio: number;
    impuestos: number;
    facturado: number;
    por_canal: Record<string, number>;
    por_sucursal: Record<string, number>;
  };
  anterior: CifrasPeriodo;
}

/** `?sucursal=` validado (la base vuelve a comprobar el acceso). */
export function sucursalDeQuery(url: URL): number | null {
  const v = Number(url.searchParams.get('sucursal'));
  return Number.isInteger(v) && v > 0 ? v : null;
}

/** Query string → objeto (claves repetidas como lista) para `filtrosVentas`. */
export function queryAObjeto(url: URL): Record<string, string | string[]> {
  const salida: Record<string, string | string[]> = {};
  for (const clave of new Set(url.searchParams.keys())) {
    const valores = url.searchParams.getAll(clave);
    salida[clave] = valores.length > 1 ? valores : valores[0];
  }
  return salida;
}

export class ErrorVentas extends Error {
  constructor(readonly codigo: string, readonly status: number, mensaje: string) {
    super(mensaje);
  }
}

/** Días calendario de la organización → instantes (hasta incluido). */
export async function rangoDeDias(ctx: Ctx, desde: string | null, hasta: string | null): Promise<{ desde: string | null; hasta: string | null }> {
  if (!desde && !hasta) return { desde: null, hasta: null };
  const [zona, horas] = await Promise.all([
    getOrganizationTimezone(ctx.organizationId, ctx.supabase),
    getOperatingHours(ctx.organizationId, ctx.supabase),
  ]);
  const r = getDateRange(desde ?? (hasta as string), hasta ?? (desde as string), zona, horas);
  return { desde: desde ? r.start : null, hasta: hasta ? r.end : null };
}

function errorRpc(error: { code?: string; message?: string }): ErrorVentas {
  if (error.code === '42501') return new ErrorVentas('sin_permiso', 403, 'Sin permiso para ver estas ventas');
  if (error.code === '22023') return new ErrorVentas('filtros_invalidos', 400, error.message ?? 'Filtros inválidos');
  return new ErrorVentas('lectura_fallida', 500, error.message ?? 'No se pudieron leer las ventas');
}

/** Listado paginado en el servidor. `crudo` = query string ya convertida a objeto. */
export async function listarVentas(ctx: Ctx, crudo: Record<string, string | string[] | undefined>, sucursalId: number | null): Promise<PaginaVentas & { filtros: FiltrosVentas }> {
  const f = filtrosVentas(crudo);
  const rango = await rangoDeDias(ctx, f.desde, f.hasta);
  const { data, error } = await ctx.supabase.rpc(
    'pos_ventas_listado',
    parametrosListado(f, { organizacionId: ctx.organizationId, sucursalId, desde: rango.desde, hasta: rango.hasta }),
  );
  if (error) throw errorRpc(error);
  const r = (data ?? {}) as { total?: number; filas?: FilaVenta[] };
  return { total: Number(r.total ?? 0), filas: r.filas ?? [], pagina: f.pagina, tamano: f.tamano, filtros: f };
}

export const MAX_FILAS_EXPORTACION = 5000;

/** Todas las filas que cumplen los filtros (para «Exportar»), en páginas de 100. Tope: 5.000. */
export async function exportarVentas(ctx: Ctx, crudo: Record<string, string | string[] | undefined>, sucursalId: number | null): Promise<{ filas: FilaVenta[]; truncado: boolean }> {
  const filas: FilaVenta[] = [];
  let total = 0;
  for (let pagina = 1; filas.length < MAX_FILAS_EXPORTACION; pagina++) {
    const r = await listarVentas(ctx, { ...crudo, pagina: String(pagina), tamano: '100' }, sucursalId);
    total = r.total;
    filas.push(...r.filas);
    if (r.filas.length < 100 || filas.length >= total) break;
  }
  return { filas: filas.slice(0, MAX_FILAS_EXPORTACION), truncado: total > MAX_FILAS_EXPORTACION };
}

/** KPI del periodo con criterio de caja. Sin rango: el mes en curso de la organización. */
export async function cifrasVentas(ctx: Ctx, desde: string | null, hasta: string | null, sucursalId: number | null): Promise<CifrasVentas> {
  const hoy = todayInTz(await getOrganizationTimezone(ctx.organizationId, ctx.supabase));
  const d = desde ?? `${hoy.slice(0, 8)}01`;
  const h = hasta ?? hoy;
  const rango = await rangoDeDias(ctx, d, h);
  // `fn_inicio_ventas_rango` usa [desde, hasta): el fin del día + 1 ms.
  const hastaExclusivo = new Date(new Date(rango.hasta as string).getTime() + 1).toISOString();
  const { data, error } = await ctx.supabase.rpc('fn_inicio_ventas_rango', {
    p_organization_id: ctx.organizationId,
    p_desde: rango.desde,
    p_hasta: hastaExclusivo,
    p_branch_id: sucursalId,
  });
  if (error) throw errorRpc(error);
  return data as CifrasVentas;
}
