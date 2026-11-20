/**
 * Propinas del POS — servidor. Lo usan los route handlers de
 * `/api/pos/propinas/**` con el cliente de la SESIÓN (`ctx.supabase`): la
 * organización sale de la sesión y cada función de la base vuelve a comprobar
 * pertenencia, sucursal y permiso (migración 20261120200000).
 *
 * - Lecturas: `fn_propinas_listado`, `fn_propinas_cifras`,
 *   `fn_propinas_liquidaciones_listado`, `fn_propinas_liquidacion_detalle`.
 * - Escrituras: `fn_propinas_liquidacion_crear` (egreso de caja con
 *   `pos_caja_registrar_movimiento`, en la misma transacción),
 *   `fn_propinas_liquidacion_anular` y `fn_propina_anular`, todas con motivo
 *   donde corresponde.
 * - Días en la zona (y el horario) de la organización: `rangoDeDias` de Ventas.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { rangoDeDias } from '@/lib/pos/ventas/listadoServidor';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { resumenesCompactos } from '@/lib/pos/cajas/resumenServidor';
import { PropinaError, errorPropina } from './errores';
import {
  MEDIOS_LIQUIDACION,
  REPARTOS_LIQUIDACION,
  TIPOS_PROPINA,
  VISTAS_PROPINAS,
  type CajaAbiertaPropinas,
  type CifrasPropinas,
  type DatosLiquidacion,
  type DetalleLiquidacion,
  type PaginaLiquidaciones,
  type PaginaPropinas,
  type PermisosPropinasServidor,
  type ResultadoLiquidacion,
  type TipoPropina,
  type VistaPropinas,
} from './tiposPropinas';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'roleId' | 'isSuperAdmin' | 'supabase'>;
type Crudo = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function uno(valor: string | string[] | undefined): string | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID.test(valor);
}

function entero(valor: string | null, defecto: number, min: number, max: number): number {
  const n = Number(valor);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : defecto;
}

/** Sucursal pedida (`?sucursal=`). La base comprueba que la persona tenga acceso. */
export function sucursalDe(crudo: Crudo): number | null {
  const n = Number(uno(crudo.sucursal));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export interface FiltrosPropinas {
  vista: VistaPropinas;
  busqueda: string | null;
  tipo: TipoPropina | null;
  persona: string | null;
  desde: string | null;
  hasta: string | null;
  orden: 'fecha' | 'monto';
  direccion: 'asc' | 'desc';
  pagina: number;
  tamano: number;
}

/** Query string → filtros validados contra lista blanca. */
export function filtrosPropinas(crudo: Crudo): FiltrosPropinas {
  const vista = uno(crudo.vista);
  const tipo = uno(crudo.tipo);
  const persona = uno(crudo.persona);
  const desde = uno(crudo.desde);
  const hasta = uno(crudo.hasta);
  const orden = uno(crudo.orden);
  return {
    vista: (VISTAS_PROPINAS as readonly string[]).includes(vista ?? '') ? (vista as VistaPropinas) : 'por_liquidar',
    busqueda: uno(crudo.q)?.slice(0, 80) ?? null,
    tipo: (TIPOS_PROPINA as readonly string[]).includes(tipo ?? '') ? (tipo as TipoPropina) : null,
    persona: esUuid(persona) ? persona : null,
    desde: desde && FECHA.test(desde) ? desde : null,
    hasta: hasta && FECHA.test(hasta) ? hasta : null,
    orden: orden === 'monto' ? 'monto' : 'fecha',
    direccion: uno(crudo.dir) === 'asc' ? 'asc' : 'desc',
    pagina: entero(uno(crudo.pagina), 1, 1, 100000),
    tamano: entero(uno(crudo.tamano), 20, 1, 500),
  };
}

export async function resolverPermisosPropinas(ctx: Ctx): Promise<PermisosPropinasServidor> {
  const [ver, registrar, anular, liquidar] = await Promise.all([
    hasOrgAdminOrPermission(ctx, 'pos.view'),
    hasOrgAdminOrPermission(ctx, 'pos.create'),
    hasOrgAdminOrPermission(ctx, 'pos.void'),
    hasOrgAdminOrPermission(ctx, 'pos.propinas.liquidar'),
  ]);
  return { ver: ver || liquidar, registrar, anular, liquidar, anularLiquidacion: liquidar && anular };
}

export async function listarPropinas(ctx: Ctx, crudo: Crudo): Promise<PaginaPropinas> {
  const f = filtrosPropinas(crudo);
  const rango = await rangoDeDias(ctx, f.desde, f.hasta);
  const { data, error } = await ctx.supabase.rpc('fn_propinas_listado', {
    p_organization_id: ctx.organizationId,
    p_branch_id: sucursalDe(crudo),
    p_vista: f.vista,
    p_desde: rango.desde,
    p_hasta: rango.hasta,
    p_busqueda: f.busqueda,
    p_tipo: f.tipo,
    p_persona: f.persona,
    p_orden: f.orden,
    p_direccion: f.direccion,
    p_limite: f.tamano,
    p_desplazamiento: (f.pagina - 1) * f.tamano,
  });
  if (error) throw errorPropina(error);
  const r = (data ?? {}) as Partial<PaginaPropinas>;
  return { total: Number(r.total ?? 0), filas: r.filas ?? [] };
}

/** Primer día del mes de una fecha plana. */
function inicioMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}

export async function cifrasPropinas(ctx: Ctx, crudo: Crudo): Promise<CifrasPropinas> {
  const f = filtrosPropinas(crudo);
  const zona = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
  const hoy = todayInTz(zona);
  const [rango, mes] = await Promise.all([rangoDeDias(ctx, f.desde, f.hasta), rangoDeDias(ctx, inicioMes(hoy), hoy)]);
  const { data, error } = await ctx.supabase.rpc('fn_propinas_cifras', {
    p_organization_id: ctx.organizationId,
    p_branch_id: sucursalDe(crudo),
    p_desde: rango.desde,
    p_hasta: rango.hasta,
    p_mes_desde: mes.desde,
    p_mes_hasta: mes.hasta,
  });
  if (error) throw errorPropina(error);
  return data as CifrasPropinas;
}

export async function listarLiquidaciones(ctx: Ctx, crudo: Crudo): Promise<PaginaLiquidaciones> {
  const pagina = entero(uno(crudo.pagina), 1, 1, 100000);
  const tamano = entero(uno(crudo.tamano), 20, 1, 100);
  const estado = uno(crudo.estado);
  const medio = uno(crudo.medio);
  const desde = uno(crudo.desde);
  const hasta = uno(crudo.hasta);
  const rango = await rangoDeDias(ctx, desde && FECHA.test(desde) ? desde : null, hasta && FECHA.test(hasta) ? hasta : null);
  const { data, error } = await ctx.supabase.rpc('fn_propinas_liquidaciones_listado', {
    p_organization_id: ctx.organizationId,
    p_branch_id: sucursalDe(crudo),
    p_busqueda: uno(crudo.q)?.slice(0, 80) ?? null,
    p_estado: estado === 'pagada' || estado === 'anulada' ? estado : null,
    p_medio: (MEDIOS_LIQUIDACION as readonly string[]).includes(medio ?? '') ? medio : null,
    p_desde: rango.desde,
    p_hasta: rango.hasta,
    p_limite: tamano,
    p_desplazamiento: (pagina - 1) * tamano,
  });
  if (error) throw errorPropina(error);
  const r = (data ?? {}) as Partial<PaginaLiquidaciones>;
  return { total: Number(r.total ?? 0), filas: r.filas ?? [] };
}

export async function detalleLiquidacion(ctx: Ctx, id: string): Promise<DetalleLiquidacion> {
  if (!esUuid(id)) throw new PropinaError('LIQUIDACION_INEXISTENTE');
  const { data, error } = await ctx.supabase.rpc('fn_propinas_liquidacion_detalle', { p_settlement_id: id });
  if (error) throw errorPropina(error);
  return data as DetalleLiquidacion;
}

/** Valida la forma del cuerpo (los importes y las reglas los decide la base). */
export function validarDatosLiquidacion(cuerpo: unknown): DatosLiquidacion {
  const c = (cuerpo ?? {}) as Partial<DatosLiquidacion>;
  const propinas = Array.isArray(c.propinas) ? c.propinas.filter(esUuid) : [];
  const sucursal = Number(c.sucursal_id);
  if (!esUuid(c.solicitud)) throw new PropinaError('SOLICITUD_REQUERIDA');
  if (!Number.isInteger(sucursal) || sucursal <= 0) throw new PropinaError('SIN_SUCURSAL');
  if (propinas.length === 0 || propinas.length !== (c.propinas ?? []).length || propinas.length > 500) throw new PropinaError('SIN_PROPINAS');
  if (!(REPARTOS_LIQUIDACION as readonly string[]).includes(c.reparto ?? '')) throw new PropinaError('REPARTO_INVALIDO');
  if (!(MEDIOS_LIQUIDACION as readonly string[]).includes(c.medio ?? '')) throw new PropinaError('MEDIO_INVALIDO');
  const texto = (v: unknown) => (typeof v === 'string' ? v.slice(0, 500) : null);
  const lista = <T>(v: unknown, ok: (x: Record<string, unknown>) => T | null): T[] | undefined =>
    Array.isArray(v) ? v.map((x) => ok((x ?? {}) as Record<string, unknown>)).filter((x): x is T => x !== null) : undefined;
  return {
    solicitud: c.solicitud,
    sucursal_id: sucursal,
    propinas,
    reparto: c.reparto!,
    participaciones: lista(c.participaciones, (x) =>
      esUuid(x.persona) && Number.isFinite(Number(x.pct)) ? { persona: x.persona, pct: Number(x.pct) } : null,
    ),
    ajustes: lista(c.ajustes, (x) => (esUuid(x.persona) && Number.isFinite(Number(x.monto)) ? { persona: x.persona, monto: Number(x.monto) } : null)),
    motivo_ajuste: texto(c.motivo_ajuste),
    medio: c.medio!,
    referencias: lista(c.referencias, (x) =>
      esUuid(x.persona) && typeof x.referencia === 'string' ? { persona: x.persona, referencia: x.referencia.slice(0, 120) } : null,
    ),
    motivo: texto(c.motivo),
    desde: typeof c.desde === 'string' && FECHA.test(c.desde) ? c.desde : null,
    hasta: typeof c.hasta === 'string' && FECHA.test(c.hasta) ? c.hasta : null,
  };
}

export async function crearLiquidacion(ctx: Ctx, datos: DatosLiquidacion): Promise<ResultadoLiquidacion> {
  const { sucursal_id, ...resto } = datos;
  const { data, error } = await ctx.supabase.rpc('fn_propinas_liquidacion_crear', {
    p_organization_id: ctx.organizationId,
    p_branch_id: sucursal_id,
    p_datos: resto,
  });
  if (error) throw errorPropina(error);
  return data as ResultadoLiquidacion;
}

function motivoValido(motivo: unknown): string {
  const m = typeof motivo === 'string' ? motivo.trim().slice(0, 500) : '';
  if (m.length < 3) throw new PropinaError('MOTIVO_REQUERIDO');
  return m;
}

export async function anularLiquidacion(ctx: Ctx, id: string, motivo: unknown): Promise<{ id: string; codigo: string; ya_anulada: boolean }> {
  if (!esUuid(id)) throw new PropinaError('LIQUIDACION_INEXISTENTE');
  const { data, error } = await ctx.supabase.rpc('fn_propinas_liquidacion_anular', { p_settlement_id: id, p_motivo: motivoValido(motivo) });
  if (error) throw errorPropina(error);
  return data as { id: string; codigo: string; ya_anulada: boolean };
}

export async function anularPropina(ctx: Ctx, id: string, motivo: unknown): Promise<{ asientosRevertidos: number; yaAnulada: boolean }> {
  if (!esUuid(id)) throw new PropinaError('PROPINA_INEXISTENTE');
  const { data, error } = await ctx.supabase.rpc('fn_propina_anular', { p_tip_id: id, p_motivo: motivoValido(motivo) });
  if (error) throw errorPropina(error);
  const r = (data ?? {}) as { asientos_revertidos?: number; ya_anulada?: boolean };
  return { asientosRevertidos: Number(r.asientos_revertidos) || 0, yaAnulada: r.ya_anulada === true };
}

/**
 * Caja abierta de la sucursal para quien liquida (`fn_caja_abierta_para`,
 * la misma regla del cobro) y su efectivo esperado con la máscara del cierre
 * ciego (`resumenesCompactos` de Cajas).
 */
export async function cajaAbiertaPropinas(ctx: Ctx, sucursal: number | null): Promise<CajaAbiertaPropinas | null> {
  if (!sucursal) return null;
  const { data: id, error } = await ctx.supabase.rpc('fn_caja_abierta_para', {
    p_org: ctx.organizationId,
    p_branch: sucursal,
    p_user: ctx.userId,
  });
  if (error) throw errorPropina(error);
  if (typeof id !== 'number') return null;
  const [sesionRes, resumenes] = await Promise.all([
    ctx.supabase.from('cash_sessions').select('id, opened_at, opened_by').eq('organization_id', ctx.organizationId).eq('id', id).maybeSingle(),
    resumenesCompactos(ctx, [id]).catch(() => ({}) as Record<number, { expected_amount: number | null }>),
  ]);
  const sesion = sesionRes.data as { id: number; opened_at: string; opened_by: string } | null;
  if (!sesion) return null;
  const { data: persona } = await ctx.supabase.rpc('fn_propinas_persona', { p_organization_id: ctx.organizationId, p_user: sesion.opened_by });
  return {
    id: sesion.id,
    abierta_en: sesion.opened_at,
    abierta_por: (persona as { nombre?: string | null } | null)?.nombre ?? null,
    esperado: resumenes[id]?.expected_amount ?? null,
  };
}
