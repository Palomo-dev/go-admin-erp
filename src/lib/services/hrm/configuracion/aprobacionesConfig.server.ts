/**
 * Configuración › Recursos humanos › Aprobaciones (diseño 10.RH.2): reglas,
 * delegaciones y «Probar una regla». Todo pide hr.approvals.manage, que la base
 * vuelve a comprobar en cada RPC (`fn_hr_regla_guardar`, `fn_hr_reglas_reordenar`,
 * `fn_hr_aprobacion_probar`, `fn_hr_aprobaciones_recomendadas`).
 *
 * Los nombres de las personas de la organización se leen con la service role
 * (profiles no se lista por RLS), ya comprobado el permiso y siempre filtrando
 * por la organización de la sesión.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type {
  DatosAprobaciones,
  Delegacion,
  EmpleadoOpcion,
  PasoRegla,
  Persona,
  Regla,
  ResultadoPrueba,
  TipoAprobador,
} from '@/lib/hrm/configuracion/tipos';
import { HrmError, errorDeRpc, esFechaPlana, esUuid } from '../tipos';
import { cargos, exigir, puede, sedes, sinError, type CtxConfig } from './comun.server';
import { hoyOrg } from './parametrosConfig.server';

const PERMISO = 'hr.approvals.manage';
export const TIPOS_SOLICITUD = [
  'ausencia',
  'horas_extra',
  'novedad_asistencia',
  'cambio_turno',
  'cambio_salario',
  'prestamo',
  'novedad_nomina',
  'vacante',
  'oferta',
  'liquidacion',
  'cambio_cargo',
  'cambio_sede',
  'cambio_area',
  'cambio_jefe',
  'cambio_jornada',
  'cambio_contrato',
] as const;
const TIPOS = new Set<string>(TIPOS_SOLICITUD);
const APROBADORES = new Set<TipoAprobador>(['jefe_directo', 'jefe_area', 'rrhh', 'cargo', 'persona']);
const MOTIVOS = new Set(['vacaciones', 'licencia', 'incapacidad', 'capacitacion', 'viaje', 'otro']);
const CLAVES_CONDICION = new Set([
  'branch_ids',
  'department_ids',
  'position_ids',
  'monto_gt',
  'monto_lt',
  'dias_gt',
  'dias_lt',
  'horas_gt',
  'horas_lt',
  'aumento_pct_gt',
  'aumento_pct_lt',
]);

type Nombre = { first_name: string | null; last_name: string | null; email: string | null } | null;
const nombreDe = (p: Nombre) => (p ? [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || (p.email ?? '').split('@')[0] : '');
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

async function personasDeLaOrg(organizationId: number): Promise<Persona[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('organization_members')
    .select('user_id, profiles(first_name, last_name, email), job_positions(name)')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  if (error) throw errorDeRpc(error);
  return ((data ?? []) as unknown as { user_id: string; profiles: Nombre | Nombre[]; job_positions: { name: string } | { name: string }[] | null }[])
    .map((m) => ({ id: m.user_id, nombre: nombreDe(uno(m.profiles)), cargo: uno(m.job_positions)?.name ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function cargarAprobaciones(ctx: CtxConfig): Promise<DatosAprobaciones> {
  await exigir(ctx, PERMISO);
  const db = getServiceClient();
  const [reglasR, pasosR, delegR, empleadosR, areasR, personas, listaCargos, listaSedes, rrhhR, hoy] = await Promise.all([
    ctx.supabase.from('hr_approval_rules').select('id, request_type, name, priority, is_active, conditions, on_self, on_missing').eq('organization_id', ctx.organizationId),
    ctx.supabase.from('hr_approval_rule_steps').select('rule_id, step_order, approver_type, approver_position_id, approver_user_id, approver_role_id').eq('organization_id', ctx.organizationId),
    ctx.supabase.from('hr_approval_delegations').select('id, delegator_user_id, delegate_user_id, starts_on, ends_on, request_type, request_types, motivo, is_active').eq('organization_id', ctx.organizationId).order('starts_on', { ascending: false }),
    db
      .from('employments')
      .select('id, status, hr_people(first_name, last_name), job_positions(name), branches(name)')
      .eq('organization_id', ctx.organizationId)
      .in('status', ['active', 'probation']),
    ctx.supabase.from('departments').select('id, name').eq('organization_id', ctx.organizationId).eq('is_active', true).order('name'),
    personasDeLaOrg(ctx.organizationId),
    cargos(ctx),
    sedes(ctx),
    db.rpc('fn_hr_rrhh_aprobadores', { p_org: ctx.organizationId }),
    hoyOrg(ctx),
  ]);
  const pasos = (sinError(pasosR) ?? []) as { rule_id: string; step_order: number; approver_type: TipoAprobador; approver_position_id: string | null; approver_user_id: string | null; approver_role_id: number | null }[];
  const reglas: Regla[] = ((sinError(reglasR) ?? []) as { id: string; request_type: string; name: string; priority: number; is_active: boolean; conditions: Record<string, unknown>; on_self: 'siguiente_paso' | 'rrhh'; on_missing: 'rrhh' | 'siguiente_paso' }[])
    .map((r) => ({
      id: r.id,
      tipo: r.request_type,
      nombre: r.name,
      prioridad: r.priority,
      activa: r.is_active,
      condiciones: r.conditions ?? {},
      siEsQuienPide: r.on_self,
      siNoHay: r.on_missing,
      pasos: pasos
        .filter((p) => p.rule_id === r.id)
        .sort((a, b) => a.step_order - b.step_order)
        .map<PasoRegla>((p) => ({ tipo: p.approver_type, cargo: p.approver_position_id, persona: p.approver_user_id, rol: p.approver_role_id })),
    }))
    .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.prioridad - b.prioridad);
  const nombrePersona = new Map(personas.map((p) => [p.id, p.nombre]));
  const delegaciones: Delegacion[] = ((sinError(delegR) ?? []) as { id: string; delegator_user_id: string; delegate_user_id: string; starts_on: string; ends_on: string; request_type: string | null; request_types: string[] | null; motivo: string; is_active: boolean }[]).map((d) => ({
    id: d.id,
    deId: d.delegator_user_id,
    deNombre: nombrePersona.get(d.delegator_user_id) ?? '',
    aId: d.delegate_user_id,
    aNombre: nombrePersona.get(d.delegate_user_id) ?? '',
    desde: d.starts_on,
    hasta: d.ends_on,
    tipos: d.request_types && d.request_types.length > 0 ? d.request_types : d.request_type ? [d.request_type] : null,
    motivo: d.motivo,
    activa: d.is_active,
  }));
  if (empleadosR.error) throw errorDeRpc(empleadosR.error);
  const empleados: EmpleadoOpcion[] = ((empleadosR.data ?? []) as unknown as { id: string; hr_people: Nombre | Nombre[]; job_positions: { name: string } | { name: string }[] | null; branches: { name: string } | { name: string }[] | null }[])
    .map((e) => ({ id: e.id, nombre: nombreDe(uno(e.hr_people)), cargo: uno(e.job_positions)?.name ?? null, sede: uno(e.branches)?.name ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  if (rrhhR.error) throw errorDeRpc(rrhhR.error);
  return {
    hoy,
    reglas,
    delegaciones,
    personas,
    empleados,
    cargos: listaCargos,
    sedes: listaSedes,
    areas: ((sinError(areasR) ?? []) as { id: string; name: string }[]).map((a) => ({ id: a.id, nombre: a.name })),
    rrhh: Array.isArray(rrhhR.data) ? rrhhR.data.length : 0,
    puedeEditar: await puede(ctx, PERMISO),
  };
}

function limpiarCondiciones(c: unknown): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  if (!c || typeof c !== 'object' || Array.isArray(c)) return salida;
  for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
    if (!CLAVES_CONDICION.has(k)) throw new HrmError(422, 'condicion_invalida');
    if (k.endsWith('_ids')) {
      if (!Array.isArray(v) || v.length === 0) continue;
      salida[k] = k === 'branch_ids' ? v.map(Number).filter(Number.isInteger) : v.filter((x) => esUuid(x));
    } else {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new HrmError(422, 'condicion_invalida');
      salida[k] = n;
    }
  }
  return salida;
}

export async function guardarRegla(ctx: CtxConfig, r: Partial<Regla>): Promise<{ id: string }> {
  if (!r || !TIPOS.has(String(r.tipo))) throw new HrmError(422, 'tipo_invalido');
  const nombre = typeof r.nombre === 'string' ? r.nombre.trim() : '';
  if (nombre.length < 2 || nombre.length > 80) throw new HrmError(422, 'nombre_invalido');
  if (!Array.isArray(r.pasos) || r.pasos.length === 0 || r.pasos.length > 10) throw new HrmError(422, 'pasos_invalidos');
  const pasos = r.pasos.map((p) => {
    if (!APROBADORES.has(p.tipo)) throw new HrmError(422, 'aprobador_invalido');
    if (p.tipo === 'cargo' && !esUuid(p.cargo)) throw new HrmError(422, 'cargo_invalido');
    if (p.tipo === 'persona' && !esUuid(p.persona)) throw new HrmError(422, 'persona_invalida');
    return { tipo: p.tipo, cargo: p.tipo === 'cargo' ? p.cargo : null, persona: p.tipo === 'persona' ? p.persona : null };
  });
  const { data, error } = await ctx.supabase.rpc('fn_hr_regla_guardar', {
    p_org: ctx.organizationId,
    p_regla: {
      id: r.id && esUuid(r.id) ? r.id : null,
      tipo: r.tipo,
      nombre,
      condiciones: limpiarCondiciones(r.condiciones),
      activa: r.activa !== false,
      si_es_quien_pide: r.siEsQuienPide === 'rrhh' ? 'rrhh' : 'siguiente_paso',
      si_no_hay: r.siNoHay === 'siguiente_paso' ? 'siguiente_paso' : 'rrhh',
      pasos,
    },
  });
  if (error) throw errorDeRpc(error);
  return data as { id: string };
}

export async function activarRegla(ctx: CtxConfig, id: string, activa: boolean): Promise<void> {
  await exigir(ctx, PERMISO);
  if (!esUuid(id)) throw new HrmError(400, 'regla_invalida');
  const r = await ctx.supabase.from('hr_approval_rules').update({ is_active: activa, updated_at: new Date().toISOString() }).eq('id', id).eq('organization_id', ctx.organizationId).select('id');
  if (!(sinError(r) as unknown[] | null)?.length) throw new HrmError(404, 'no_existe');
}

export async function quitarRegla(ctx: CtxConfig, id: string): Promise<void> {
  await exigir(ctx, PERMISO);
  if (!esUuid(id)) throw new HrmError(400, 'regla_invalida');
  const r = await ctx.supabase.from('hr_approval_rules').delete().eq('id', id).eq('organization_id', ctx.organizationId).select('id');
  if (!(sinError(r) as unknown[] | null)?.length) throw new HrmError(404, 'no_existe');
}

export async function reordenarReglas(ctx: CtxConfig, tipo: string, ids: unknown): Promise<void> {
  if (!TIPOS.has(tipo) || !Array.isArray(ids) || !ids.every((x) => esUuid(x))) throw new HrmError(422, 'orden_invalido');
  const { error } = await ctx.supabase.rpc('fn_hr_reglas_reordenar', { p_org: ctx.organizationId, p_tipo: tipo, p_ids: ids });
  if (error) throw errorDeRpc(error);
}

export async function usarRecomendadas(ctx: CtxConfig): Promise<number> {
  const { data, error } = await ctx.supabase.rpc('fn_hr_aprobaciones_recomendadas', { p_org: ctx.organizationId });
  if (error) throw errorDeRpc(error);
  return Number(data ?? 0);
}

export async function probarRegla(ctx: CtxConfig, args: { tipo: string; vinculoId: string; fecha: string; dias?: number | null; monto?: number | null; horas?: number | null; aumentoPct?: number | null }): Promise<ResultadoPrueba> {
  if (!TIPOS.has(args.tipo)) throw new HrmError(422, 'tipo_invalido');
  if (!esUuid(args.vinculoId)) throw new HrmError(422, 'empleado_invalido');
  if (!esFechaPlana(args.fecha)) throw new HrmError(422, 'fecha_invalida');
  const contexto: Record<string, number> = {};
  if (args.dias != null) contexto.dias = Number(args.dias);
  if (args.monto != null) contexto.monto = Number(args.monto);
  if (args.horas != null) contexto.horas = Number(args.horas);
  if (args.aumentoPct != null) contexto.aumento_pct = Number(args.aumentoPct);
  const { data, error } = await ctx.supabase.rpc('fn_hr_aprobacion_probar', {
    p_org: ctx.organizationId,
    p_tipo: args.tipo,
    p_employment: args.vinculoId,
    p_contexto: contexto,
    p_fecha: args.fecha,
  });
  if (error) throw errorDeRpc(error);
  return data as ResultadoPrueba;
}

export async function crearDelegacion(ctx: CtxConfig, d: { deId: string; aId: string; desde: string; hasta: string; tipos: string[] | null; motivo: string }): Promise<{ id: string }> {
  await exigir(ctx, PERMISO);
  if (!esUuid(d.deId) || !esUuid(d.aId) || d.deId === d.aId) throw new HrmError(422, 'personas_invalidas');
  if (!esFechaPlana(d.desde) || !esFechaPlana(d.hasta) || d.hasta < d.desde) throw new HrmError(422, 'fechas_invalidas');
  if (!MOTIVOS.has(d.motivo)) throw new HrmError(422, 'motivo_invalido');
  const tipos = Array.isArray(d.tipos) && d.tipos.length > 0 ? d.tipos.filter((t) => TIPOS.has(t)) : null;
  const r = await ctx.supabase
    .from('hr_approval_delegations')
    .insert({
      organization_id: ctx.organizationId,
      delegator_user_id: d.deId,
      delegate_user_id: d.aId,
      starts_on: d.desde,
      ends_on: d.hasta,
      request_types: tipos,
      motivo: d.motivo,
    })
    .select('id');
  const filas = sinError(r) as { id: string }[] | null;
  if (!filas?.length) throw new HrmError(403, 'sin_permiso');
  return { id: filas[0].id };
}

export async function terminarDelegacion(ctx: CtxConfig, id: string): Promise<void> {
  await exigir(ctx, PERMISO);
  if (!esUuid(id)) throw new HrmError(400, 'delegacion_invalida');
  const r = await ctx.supabase.from('hr_approval_delegations').update({ is_active: false }).eq('id', id).eq('organization_id', ctx.organizationId).select('id');
  if (!(sinError(r) as unknown[] | null)?.length) throw new HrmError(404, 'no_existe');
}
