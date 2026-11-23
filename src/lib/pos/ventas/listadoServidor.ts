/**
 * Lectura de ventas en el servidor (paso 14 de docs/implementacion/CAJAS-VENTAS-PLAN.md).
 *
 * - `listarVentas`: el listado de /app/pos/ventas paginado, filtrado y ordenado
 *   en la base (`pos_ventas_listado_v2`, solo filas de `sales`, D1). Los filtros
 *   pasan por la lista blanca de `filtrosVentas`.
 * - `cifrasVentas`: los KPI del Figma aprobado el 2026-11-20 (`pos_ventas_cifras`)
 *   sobre LAS VENTAS LISTADAS, con los mismos filtros y por fecha de venta:
 *   ventas del periodo (VENTAS NETAS, la regla única `fn_ventas_netas_cifras`
 *   que también usa el Inicio: sin IVA ni INC, sin propinas y restando
 *   devoluciones y notas crédito del periodo), con variación frente al periodo
 *   anterior de igual duración en días completos (o, si el periodo incluye hoy,
 *   hasta esta misma hora), ticket promedio, transacciones e impuestos.
 *   «Transacciones» es siempre el «N ventas encontradas» de la cabecera. El
 *   criterio de caja (D2, `fn_inicio_ventas_rango`) queda para el Inicio: el
 *   Figma del listado pide lo vendido, no lo cobrado.
 * - `cajerosVentas`: quiénes han vendido (selector «Cajero» de los filtros).
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
import {
  diasDelPeriodo,
  filtrosVentas,
  finComparacionAEstaHora,
  incluyeHoy,
  mismoDiaSemanaAnterior,
  parametrosFiltro,
  parametrosListado,
  periodoAnterior,
  type FiltrosVentas,
} from './filtrosVentas';
import type { EstadoVenta, OrigenVenta } from './estadoVenta';
import type { CanalVenta } from './canalVenta';

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
  /** Canal (Figma 24 Ventas): POS, Tienda web, Menú QR, Marketplace o Manual. */
  canal: CanalVenta;
  numero: string | null;
  tipo_numero: 'factura' | 'pedido' | null;
  factura_id: string | null;
  cxc_id: string | null;
  web_order_id: string | null;
  cliente: {
    id: string;
    nombre: string | null;
    documento: string | null;
    /** «CC», «NIT»… (declarado; una empresa sin tipo, NIT). */
    tipo_documento?: string | null;
    telefono?: string | null;
  } | null;
  cajero: { id: string; nombre: string | null };
  sucursal: { id: number; nombre: string | null };
  /** Nombre de la mesa (ventas de origen «mesa»). */
  mesa?: string | null;
  metodos: string[];
  devuelto: number;
  notas_credito: number;
  /** Número de la última nota crédito de la venta. */
  nota_credito_numero?: string | null;
}

export interface PaginaVentas {
  total: number;
  filas: FilaVenta[];
  pagina: number;
  tamano: number;
}

/** Impuesto del periodo: código de la factura («IVA_19»), nombre del desglose («IVA 19%») o null (sin detalle). */
export interface ImpuestoVentas {
  codigo: string | null;
  tasa: number | null;
  monto: number;
}

export interface CifrasVentas {
  desde: string;
  hasta: string;
  actual: {
    /**
     * Ventas netas de las listadas (regla única `fn_ventas_netas_cifras`): Σ
     * (total − IVA/INC − propina) de las que no están anuladas ni en borrador,
     * menos devoluciones y notas crédito del periodo.
     */
    ventas: number;
    /** Partes de la cifra: Σ total, IVA/INC y propinas de las ventas; devoluciones (base). */
    bruto?: number;
    impuestos_ventas?: number;
    propinas?: number;
    devoluciones?: number;
    /** Saldo hoy de las ventas del periodo. */
    por_cobrar?: number;
    /** Todas las ventas listadas (= «N ventas encontradas»). */
    transacciones: number;
    /** Las que cuentan para el ticket: ni anuladas ni borradores. */
    efectivas: number;
    pagadas: number;
    pendientes: number;
    anuladas: number;
    devueltas: number;
    ticket_promedio: number;
    impuestos: number;
    impuestos_detalle: ImpuestoVentas[];
  };
  /** Mismos filtros en el periodo anterior de igual duración. */
  anterior: { ventas: number; transacciones: number } | null;
  /**
   * Contra qué compara «Ventas del periodo»: los días del periodo anterior y si
   * se cortó a esta misma hora (el periodo incluye hoy).
   */
  comparacion?: { desde: string; hasta: string; aEstaHora: boolean };
  /**
   * Ventas por canal en el periodo con todos los filtros MENOS el de canal
   * (chips «Todos · POS · Tienda web…» y StatCard «Por canal»).
   */
  por_canal?: { canal: CanalVenta; transacciones: number; ventas: number }[];
  /**
   * «Ventas de hoy» (Figma 24): hoy en la zona de la organización, con los
   * mismos filtros, frente al mismo día de la semana anterior.
   */
  hoy?: { ventas: number; transacciones: number; anterior: number | null; aEstaHora?: boolean };
}

export interface CajeroVentas {
  id: string;
  nombre: string | null;
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
    'pos_ventas_listado_v2',
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

/**
 * KPI de las ventas listadas (mismos filtros que `listarVentas`). Sin rango:
 * el mes en curso de la organización, como el listado.
 */
export async function cifrasVentas(ctx: Ctx, crudo: Record<string, string | string[] | undefined>, sucursalId: number | null): Promise<CifrasVentas> {
  const f = filtrosVentas(crudo);
  const hoy = todayInTz(await getOrganizationTimezone(ctx.organizationId, ctx.supabase));
  const desde = f.desde ?? `${hoy.slice(0, 8)}01`;
  const hasta = f.hasta ?? hoy;
  const previo = periodoAnterior(desde, hasta);
  const ahora = new Date();
  // Periodo con hoy: el anterior se compara hasta esta misma hora (y la etiqueta lo dice).
  const aEstaHora = incluyeHoy(desde, hasta, hoy);
  const [rango, rangoPrevio] = await Promise.all([rangoDeDias(ctx, desde, hasta), rangoDeDias(ctx, previo.desde, previo.hasta)]);
  const hastaPrevio =
    aEstaHora && rangoPrevio.desde && rangoPrevio.hasta
      ? finComparacionAEstaHora(rangoPrevio.desde, rangoPrevio.hasta, diasDelPeriodo(desde, hasta), ahora)
      : rangoPrevio.hasta;
  const { data, error } = await ctx.supabase.rpc('pos_ventas_cifras', {
    ...parametrosFiltro(f, { organizacionId: ctx.organizationId, sucursalId, desde: rango.desde, hasta: rango.hasta }),
    p_desde_anterior: rangoPrevio.desde,
    p_hasta_anterior: hastaPrevio,
  });
  if (error) throw errorRpc(error);
  const cifras = data as CifrasVentas;
  cifras.comparacion = { desde: previo.desde, hasta: previo.hasta, aEstaHora };
  cifras.hoy = await cifrasDeHoy(ctx, f, hoy, sucursalId, ahora).catch(() => undefined);
  return cifras;
}

/**
 * «Ventas de hoy» frente al mismo día de la semana pasada HASTA ESTA MISMA HORA
 * (la regla del Inicio), con los filtros del listado.
 */
async function cifrasDeHoy(ctx: Ctx, f: FiltrosVentas, hoy: string, sucursalId: number | null, ahora: Date): Promise<CifrasVentas['hoy']> {
  const semanaPasada = mismoDiaSemanaAnterior(hoy);
  const [rango, rangoPrevio] = await Promise.all([rangoDeDias(ctx, hoy, hoy), rangoDeDias(ctx, semanaPasada, semanaPasada)]);
  const hastaPrevio =
    rangoPrevio.desde && rangoPrevio.hasta ? finComparacionAEstaHora(rangoPrevio.desde, rangoPrevio.hasta, 7, ahora) : rangoPrevio.hasta;
  const { data, error } = await ctx.supabase.rpc('pos_ventas_cifras', {
    ...parametrosFiltro(f, { organizacionId: ctx.organizationId, sucursalId, desde: rango.desde, hasta: rango.hasta }),
    p_desde_anterior: rangoPrevio.desde,
    p_hasta_anterior: hastaPrevio,
  });
  if (error) throw errorRpc(error);
  const c = data as CifrasVentas;
  return { ventas: c.actual.ventas, transacciones: c.actual.efectivas, anterior: c.anterior?.ventas ?? null, aEstaHora: true };
}

/** Quiénes han vendido en las sucursales visibles (o en la elegida). */
export async function cajerosVentas(ctx: Ctx, sucursalId: number | null): Promise<CajeroVentas[]> {
  const { data, error } = await ctx.supabase.rpc('pos_ventas_cajeros', { p_organization_id: ctx.organizationId, p_branch_id: sucursalId });
  if (error) throw errorRpc(error);
  return ((data ?? []) as CajeroVentas[]).filter((c) => !!c.id);
}
