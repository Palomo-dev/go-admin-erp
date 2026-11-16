/**
 * Configuración › Recursos humanos › Parámetros legales (diseño 10.RH.1).
 * Los valores de ley los mantiene GO Admin: aquí solo se leen. Lo que define
 * la empresa se guarda con `fn_hr_parametros_empresa_guardar` (RPC
 * transaccional) y la clase ARL en `hr_arl_assignments` (RLS por permiso).
 */
import type { CambioEmpresa, DatosParametros, FilaParametro, FilaParametroEmpresa, ReglaArl } from '@/lib/hrm/configuracion/tipos';
import { monedaDelPais } from '@/lib/services/monedaOrganizacion';
import { HrmError, errorDeRpc, esFechaPlana, esUuid } from '../tipos';
import { cargos, exigir, puede, sedes, sinError, type CtxConfig } from './comun.server';

const PERMISO = 'hr.parameters.manage';
const CODIGOS_EMPRESA = new Set([
  'jornada_max_semanal',
  'recargo_dominical_festivo',
  'exoneracion_114_1_aplica',
  'pila_operador',
  'periodicidad_pago',
  'retencion_procedimiento',
  // Opción de la empresa (respuesta P5 del Contador, 2026-11-16): pagar al 100 % los días de
  // incapacidad común a su cargo. Nunca menos de lo legal (2/3).
  'incapacidad_empleador_fraccion',
]);
const RANGOS: Record<string, [number, number]> = { incapacidad_empleador_fraccion: [0.6667, 1] };

/** Hoy en la zona de la organización (la resuelve la base, `fn_today_for`). */
export async function hoyOrg(ctx: CtxConfig): Promise<string> {
  const { data, error } = await ctx.supabase.rpc('fn_today_for', { p_organization_id: ctx.organizationId, p_branch_id: null });
  if (error) throw errorDeRpc(error);
  return String(data);
}

export async function cargarParametros(ctx: CtxConfig): Promise<DatosParametros> {
  await exigir(ctx, PERMISO);
  const pais = sinError(await ctx.supabase.rpc('fn_hr_pais', { p_org: ctx.organizationId })) as string | null;
  const [ley, uvt, empresa, arl, listaSedes, listaCargos, hoy] = await Promise.all([
    ctx.supabase
      .from('hr_legal_parameters')
      .select('code, value, value_json, effective_from, effective_to, status, verificacion, legal_source, source_url, notes')
      .eq('country_code', pais ?? 'COL')
      .order('effective_from'),
    ctx.supabase.from('fiscal_uvt').select('year, value, norma').eq('country_code', pais ?? 'COL'),
    ctx.supabase
      .from('hr_org_parameters')
      .select('id, code, value, value_json, effective_from, effective_to, reason')
      .eq('organization_id', ctx.organizationId)
      .order('effective_from'),
    ctx.supabase.from('hr_arl_assignments').select('id, branch_id, position_id, risk_class').eq('organization_id', ctx.organizationId),
    sedes(ctx),
    cargos(ctx),
    hoyOrg(ctx),
  ]);
  const filasLey = (sinError(ley) ?? []) as FilaParametro[];
  const filasUvt = ((sinError(uvt) ?? []) as { year: number; value: number; norma: string | null }[]).map<FilaParametro>((u) => ({
    code: 'uvt',
    value: Number(u.value),
    value_json: null,
    effective_from: `${u.year}-01-01`,
    effective_to: `${u.year}-12-31`,
    status: 'vigente',
    verificacion: 'S',
    legal_source: u.norma ?? '',
    source_url: null,
    notes: null,
  }));
  return {
    hoy,
    // Los importes de ley van en la moneda del país de los parámetros, no en una fija.
    moneda: monedaDelPais(pais ?? 'COL'),
    ley: [...filasLey.map((f) => ({ ...f, value: f.value === null ? null : Number(f.value) })), ...filasUvt],
    empresa: ((sinError(empresa) ?? []) as FilaParametroEmpresa[]).map((f) => ({ ...f, value: f.value === null ? null : Number(f.value) })),
    arl: ((sinError(arl) ?? []) as { id: string; branch_id: number | null; position_id: string | null; risk_class: number }[]).map<ReglaArl>((a) => ({
      id: a.id,
      sedeId: a.branch_id,
      cargoId: a.position_id,
      clase: a.risk_class,
    })),
    sedes: listaSedes,
    cargos: listaCargos,
    puedeEditar: await puede(ctx, PERMISO),
  };
}

export async function guardarEmpresa(ctx: CtxConfig, cambios: unknown): Promise<number> {
  if (!Array.isArray(cambios) || cambios.length === 0 || cambios.length > 20) throw new HrmError(400, 'cambios_invalidos');
  const limpios: CambioEmpresa[] = cambios.map((c) => {
    const x = c as Partial<CambioEmpresa>;
    if (!x || typeof x.code !== 'string' || !CODIGOS_EMPRESA.has(x.code)) throw new HrmError(422, 'parametro_invalido');
    if (x.desde != null && !esFechaPlana(x.desde)) throw new HrmError(422, 'fecha_invalida');
    const valor = x.valor == null ? null : Number(x.valor);
    if (valor !== null && !Number.isFinite(valor)) throw new HrmError(422, 'valor_invalido');
    const rango = RANGOS[x.code];
    if (rango && valor !== null && (valor < rango[0] || valor > rango[1])) throw new HrmError(422, 'valor_fuera_de_rango');
    return { code: x.code, valor, valor_json: x.valor_json, desde: x.desde ?? null, activo: x.activo !== false };
  });
  const { data, error } = await ctx.supabase.rpc('fn_hr_parametros_empresa_guardar', { p_org: ctx.organizationId, p_cambios: limpios });
  if (error) throw errorDeRpc(error);
  return Number(data ?? 0);
}

export async function guardarReglaArl(ctx: CtxConfig, regla: { id?: string | null; sedeId: number | null; cargoId: string | null; clase: number }): Promise<void> {
  const clase = Number(regla.clase);
  if (!Number.isInteger(clase) || clase < 1 || clase > 5) throw new HrmError(422, 'clase_invalida');
  if (regla.cargoId != null && !esUuid(regla.cargoId)) throw new HrmError(422, 'cargo_invalido');
  if (regla.sedeId != null && !Number.isInteger(regla.sedeId)) throw new HrmError(422, 'sede_invalida');
  const fila = { organization_id: ctx.organizationId, branch_id: regla.sedeId, position_id: regla.cargoId, risk_class: clase };
  const r = regla.id
    ? await ctx.supabase.from('hr_arl_assignments').update(fila).eq('id', regla.id).eq('organization_id', ctx.organizationId).select('id')
    : await ctx.supabase.from('hr_arl_assignments').insert(fila).select('id');
  const filas = sinError(r) as { id: string }[] | null;
  if (!filas || filas.length === 0) throw new HrmError(403, 'sin_permiso');
}

export async function quitarReglaArl(ctx: CtxConfig, id: string): Promise<void> {
  if (!esUuid(id)) throw new HrmError(400, 'regla_invalida');
  const r = await ctx.supabase.from('hr_arl_assignments').delete().eq('id', id).eq('organization_id', ctx.organizationId).select('id');
  const filas = sinError(r) as { id: string }[] | null;
  if (!filas || filas.length === 0) throw new HrmError(403, 'sin_permiso');
}
