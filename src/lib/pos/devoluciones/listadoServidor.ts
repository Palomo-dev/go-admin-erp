/**
 * Lectura de devoluciones del POS en el servidor (rediseño aprobado el
 * 2026-11-21, Figma `873:573998`).
 *
 * - `listarDevoluciones`: el listado paginado, filtrado y ordenado en la base
 *   (`pos_devoluciones_listado`). Los filtros pasan por la lista blanca de
 *   `filtrosDevoluciones`.
 * - `cifrasDevoluciones`: los 4 KPI sobre las devoluciones listadas
 *   (`pos_devoluciones_cifras`, mismos filtros). Sin periodo, el mes en curso
 *   de la organización, igual que el listado.
 * - `ventasParaDevolver`: el buscador de «Nueva devolución» (`pos_ventas_para_devolver`).
 * - `cajaParaDevolucion`: la caja abierta de la que saldría el efectivo
 *   (`fn_caja_abierta_para`, la MISMA regla de `procesar_devolucion`).
 *
 * Todo con el cliente de la sesión (`ctx.supabase`): la organización es la de
 * la sesión y las funciones comprueban pertenencia, permiso y sucursal. El
 * rango de días pasa a instantes con la zona de la organización (`rangoDeDias`
 * de Ventas), nunca con la del servidor.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { todayInTz } from '@/lib/utils/dateCore';
import { rangoDeDias } from '@/lib/pos/ventas/listadoServidor';
import { filtrosDevoluciones, limpiarBusqueda, parametrosFiltroDevoluciones, parametrosListadoDevoluciones } from './filtrosDevoluciones';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase' | 'userId'>;
type Crudo = Record<string, string | string[] | undefined>;

export interface FilaDevolucion {
  id: number;
  fecha: string;
  estado: string;
  metodo: string;
  caja_sesion_id: number | null;
  total: number;
  impuesto: number;
  unidades: number;
  unidades_vendidas: number;
  motivo: { id: number | null; codigo: string | null; nombre: string | null; texto: string | null };
  venta: { id: string; factura_id: string | null; factura_numero: string | null };
  nota_credito: { id: string; numero: string | null; estado: string | null } | null;
  cliente: { id: string; nombre: string | null; tipo_documento: string | null; documento: string | null } | null;
  sucursal: { id: number; nombre: string | null };
}

export interface PaginaDevoluciones {
  total: number;
  filas: FilaDevolucion[];
  pagina: number;
  tamano: number;
}

export interface CifrasDevoluciones {
  desde: string;
  hasta: string;
  devuelto: number;
  devoluciones: number;
  procesadas: number;
  unidades: number;
  parciales: number;
  por_metodo: Array<{ metodo: string; total: number; n: number }>;
  /** Ventas del periodo en las mismas sucursales (ni anuladas ni borradores). */
  ventas: number;
  motivo_principal: { id: number; nombre: string | null; codigo: string | null; n: number } | null;
}

export interface VentaParaDevolver {
  id: string;
  fecha: string;
  total: number;
  factura_id: string | null;
  numero: string | null;
  sucursal_id: number;
  cliente: { id: string; nombre: string | null; tipo_documento: string | null; documento: string | null } | null;
  productos: number;
  unidades: number;
  devueltas: number;
}

export class ErrorDevoluciones extends Error {
  constructor(readonly codigo: string, readonly status: number, mensaje: string) {
    super(mensaje);
  }
}

function errorRpc(error: { code?: string; message?: string }): ErrorDevoluciones {
  if (error.code === '42501') return new ErrorDevoluciones('sin_permiso', 403, 'Sin permiso para ver estas devoluciones');
  if (error.code === '22023') return new ErrorDevoluciones('filtros_invalidos', 400, error.message ?? 'Filtros inválidos');
  return new ErrorDevoluciones('lectura_fallida', 500, error.message ?? 'No se pudieron leer las devoluciones');
}

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Periodo por defecto: el mes en curso de la organización (el mismo de las cifras). */
async function periodo(ctx: Ctx, desde: string | null, hasta: string | null): Promise<{ desde: string; hasta: string }> {
  if (desde && hasta) return { desde, hasta };
  const hoy = todayInTz(await getOrganizationTimezone(ctx.organizationId, ctx.supabase));
  return { desde: desde ?? `${hoy.slice(0, 8)}01`, hasta: hasta ?? hoy };
}

export async function listarDevoluciones(ctx: Ctx, crudo: Crudo, sucursalId: number | null): Promise<PaginaDevoluciones> {
  const f = filtrosDevoluciones(crudo);
  const dias = await periodo(ctx, f.desde, f.hasta);
  const rango = await rangoDeDias(ctx, dias.desde, dias.hasta);
  const { data, error } = await ctx.supabase.rpc(
    'pos_devoluciones_listado',
    parametrosListadoDevoluciones(f, { organizacionId: ctx.organizationId, sucursalId, desde: rango.desde, hasta: rango.hasta }),
  );
  if (error) throw errorRpc(error);
  const r = (data ?? {}) as { total?: number; filas?: FilaDevolucion[] };
  const filas = (r.filas ?? []).map((x) => ({
    ...x,
    total: n(x.total),
    impuesto: n(x.impuesto),
    unidades: n(x.unidades),
    unidades_vendidas: n(x.unidades_vendidas),
  }));
  return { total: Number(r.total ?? 0), filas, pagina: f.pagina, tamano: f.tamano };
}

export async function cifrasDevoluciones(ctx: Ctx, crudo: Crudo, sucursalId: number | null): Promise<CifrasDevoluciones> {
  const f = filtrosDevoluciones(crudo);
  const dias = await periodo(ctx, f.desde, f.hasta);
  const rango = await rangoDeDias(ctx, dias.desde, dias.hasta);
  const { data, error } = await ctx.supabase.rpc(
    'pos_devoluciones_cifras',
    parametrosFiltroDevoluciones(f, { organizacionId: ctx.organizationId, sucursalId, desde: rango.desde, hasta: rango.hasta }),
  );
  if (error) throw errorRpc(error);
  const c = (data ?? {}) as Partial<CifrasDevoluciones>;
  return {
    desde: dias.desde,
    hasta: dias.hasta,
    devuelto: n(c.devuelto),
    devoluciones: n(c.devoluciones),
    procesadas: n(c.procesadas),
    unidades: n(c.unidades),
    parciales: n(c.parciales),
    por_metodo: (c.por_metodo ?? []).map((m) => ({ metodo: String(m.metodo), total: n(m.total), n: n(m.n) })),
    ventas: n(c.ventas),
    motivo_principal: c.motivo_principal ? { ...c.motivo_principal, n: n(c.motivo_principal.n) } : null,
  };
}

export async function ventasParaDevolver(ctx: Ctx, busqueda: string | null, sucursalId: number | null): Promise<VentaParaDevolver[]> {
  const { data, error } = await ctx.supabase.rpc('pos_ventas_para_devolver', {
    p_organization_id: ctx.organizationId,
    p_branch_id: sucursalId,
    p_busqueda: limpiarBusqueda(busqueda),
    p_limite: 20,
  });
  if (error) throw errorRpc(error);
  return ((data ?? []) as VentaParaDevolver[]).map((v) => ({
    ...v,
    total: n(v.total),
    productos: n(v.productos),
    unidades: n(v.unidades),
    devueltas: n(v.devueltas),
  }));
}

/** Sesión de caja abierta de la que saldría el efectivo de una venta de esa sucursal, o null. */
export async function cajaParaDevolucion(ctx: Ctx, sucursalId: number): Promise<{ sesion_id: number | null }> {
  const { data, error } = await ctx.supabase.rpc('fn_caja_abierta_para', {
    p_org: ctx.organizationId,
    p_branch: sucursalId,
    p_user: ctx.userId,
  });
  if (error) throw errorRpc(error);
  const id = Number(data);
  return { sesion_id: Number.isInteger(id) && id > 0 ? id : null };
}
