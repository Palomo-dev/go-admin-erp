/**
 * Lecturas de la interfaz de Nómina (fase 3, Figma 20.16–20.25). Solo leen: el
 * cálculo, el cierre y el pago siguen en `nominaService.server.ts` y en las RPC
 * `fn_hr_nomina_*` (ADR-003).
 *
 * - La organización y el actor salen de `getServerOrgContext()` (las rutas usan `withOrg`).
 * - Los permisos los resuelve la base (`fn_hr_puede`, rol + cargo): el cliente
 *   solo recibe el resultado para mostrar u ocultar acciones; cada RPC de
 *   escritura vuelve a exigirlos.
 * - Períodos, versiones, préstamos y la vista previa del plan se leen con la
 *   sesión del usuario (RLS `hr.payroll.view`). Lo que no tiene políticas
 *   (embargos, bloqueos, catálogo resuelto, aprobación del período) se lee con
 *   la service role SOLO después de comprobar el permiso, y los embargos
 *   (grupo `salario_pago`) dejan su fila en el registro de accesos.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esUuid, type ContextoPeticion } from '../tipos';
import { listarEmpleados } from '../personasService.server';

export type ContextoLecturaNomina = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

export interface PermisosNomina {
  ver: boolean;
  procesar: boolean;
  cerrar: boolean;
  pagar: boolean;
  /** Grupo de datos `salario_pago` (embargos y datos de nómina por vínculo). */
  salario: boolean;
}

const CODIGOS_PERMISO: Record<keyof PermisosNomina, string> = {
  ver: 'hr.payroll.view',
  procesar: 'hr.payroll.process',
  cerrar: 'hr.payroll.close',
  pagar: 'hr.payroll.pay',
  salario: 'hr.data.salario_pago.view',
};

type ErrorConsulta = { code?: string | null; message?: string | null } | null;

function sinError<T>(r: { data: T; error: ErrorConsulta }): T {
  if (r.error) throw errorDeRpc(r.error);
  return r.data;
}

export async function permisosNomina(ctx: ContextoLecturaNomina): Promise<PermisosNomina> {
  const claves = Object.keys(CODIGOS_PERMISO) as (keyof PermisosNomina)[];
  const res = await Promise.all(claves.map((k) => ctx.supabase.rpc('fn_hr_puede', { p_org: ctx.organizationId, p_code: CODIGOS_PERMISO[k] })));
  const out = {} as PermisosNomina;
  claves.forEach((k, i) => {
    out[k] = !res[i].error && res[i].data === true;
  });
  // Quien procesa, cierra o paga también ve la nómina (las RPC de lectura aceptan `process`).
  out.ver = out.ver || out.procesar || out.cerrar || out.pagar;
  return out;
}

async function exigirVer(ctx: ContextoLecturaNomina): Promise<PermisosNomina> {
  const p = await permisosNomina(ctx);
  if (!p.ver) throw new HrmError(403, 'sin_permiso');
  return p;
}

interface AlertaGuardada {
  codigo?: string;
  severidad?: string;
}

function contarAlertas(alertas: unknown): { bloqueos: number; avisos: number } {
  const lista = Array.isArray(alertas) ? (alertas as AlertaGuardada[]) : [];
  return {
    bloqueos: lista.filter((a) => a?.severidad === 'bloqueo').length,
    avisos: lista.filter((a) => a?.severidad === 'aviso').length,
  };
}

export interface FilaPeriodoNomina {
  id: string;
  nombre: string | null;
  tipo: 'ordinaria' | 'prima' | 'cesantias';
  frecuencia: string;
  desde: string;
  hasta: string;
  fecha_pago: string | null;
  estado: string;
  empleados: number | null;
  devengado: number | null;
  deducciones: number | null;
  neto: number | null;
  costo_empleador: number | null;
  version: number | null;
  calculado_en: string | null;
  bloqueos: number;
  avisos: number;
  ajustes: number;
}

interface FilaRun {
  id: string;
  payroll_period_id: string;
  run_number: number;
  run_type: string;
  status: string | null;
  superseded_by: string | null;
  is_final: boolean | null;
  executed_by: string | null;
  executed_at: string | null;
  alerts: unknown;
}

/** La versión vigente de un período: la final, o la última de cálculo completa y no reemplazada (como `fn_nomina_run_vigente`). */
export function runVigente<T extends Pick<FilaRun, 'run_type' | 'status' | 'superseded_by' | 'is_final' | 'run_number'>>(runs: readonly T[]): T | null {
  const calc = runs.filter((r) => r.run_type === 'calculo' && r.status === 'completed' && !r.superseded_by);
  if (calc.length === 0) return null;
  return [...calc].sort((a, b) => Number(b.is_final === true) - Number(a.is_final === true) || b.run_number - a.run_number)[0];
}

export interface EstadoPlanNomina {
  estado: string;
  cuentas_a_crear: number;
  terceros_incompletos: number;
  preparada_at: string;
  aprobada_at: string | null;
}

export interface ResumenNomina {
  usuario_id: string;
  permisos: PermisosNomina;
  habilitada: boolean;
  plan: EstadoPlanNomina | null;
  periodos: FilaPeriodoNomina[];
}

interface FilaPlan {
  status: string;
  plan: Record<string, unknown> | null;
  cuentas_a_crear: unknown;
  preparada_at: string;
  aprobada_at: string | null;
}

function largo(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

async function leerBandera(ctx: ContextoLecturaNomina): Promise<{ habilitada: boolean; motivo: string | null; desde: string | null }> {
  const fila = sinError(
    await ctx.supabase
      .from('hr_payroll_settings')
      .select('hr_payroll_enabled, reason, enabled_at')
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()
  ) as { hr_payroll_enabled: boolean; reason: string | null; enabled_at: string | null } | null;
  return { habilitada: fila?.hr_payroll_enabled === true, motivo: fila?.reason ?? null, desde: fila?.enabled_at ?? null };
}

async function ultimoPlan(ctx: ContextoLecturaNomina): Promise<FilaPlan | null> {
  return sinError(
    await ctx.supabase
      .from('hr_payroll_enablement_reviews')
      .select('status, plan, cuentas_a_crear, preparada_at, aprobada_at')
      .eq('organization_id', ctx.organizationId)
      .neq('status', 'anulada')
      .order('preparada_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ) as FilaPlan | null;
}

/** Lista de períodos, estado de la bandera y permisos (20.16, 20.20, 20.25). */
export async function resumenNomina(ctx: ContextoLecturaNomina): Promise<ResumenNomina> {
  const permisos = await exigirVer(ctx);
  const [periodos, bandera, plan] = await Promise.all([
    ctx.supabase
      .from('payroll_periods')
      .select('id, name, kind, frequency, period_start, period_end, payment_date, status, total_employees, total_gross, total_deductions, total_net, total_employer_cost')
      .eq('organization_id', ctx.organizationId)
      .order('period_start', { ascending: false })
      .order('kind')
      .limit(500),
    leerBandera(ctx),
    ultimoPlan(ctx),
  ]);
  const filas = (sinError(periodos) ?? []) as Array<Record<string, unknown>>;
  const ids = filas.map((p) => String(p.id));
  const runs: FilaRun[] = ids.length
    ? ((sinError(
        await ctx.supabase
          .from('payroll_runs')
          .select('id, payroll_period_id, run_number, run_type, status, superseded_by, is_final, executed_by, executed_at, alerts')
          .in('payroll_period_id', ids)
      ) ?? []) as FilaRun[])
    : [];
  const porPeriodo = new Map<string, FilaRun[]>();
  for (const r of runs) porPeriodo.set(r.payroll_period_id, [...(porPeriodo.get(r.payroll_period_id) ?? []), r]);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  return {
    usuario_id: ctx.userId,
    permisos,
    habilitada: bandera.habilitada,
    plan: plan
      ? {
          estado: plan.status,
          cuentas_a_crear: largo(plan.cuentas_a_crear),
          terceros_incompletos: largo(plan.plan?.terceros_incompletos),
          preparada_at: plan.preparada_at,
          aprobada_at: plan.aprobada_at,
        }
      : null,
    periodos: filas.map((p) => {
      const lista = porPeriodo.get(String(p.id)) ?? [];
      const vig = runVigente(lista);
      const alertas = contarAlertas(vig?.alerts);
      return {
        id: String(p.id),
        nombre: (p.name as string | null) ?? null,
        tipo: (p.kind as FilaPeriodoNomina['tipo']) ?? 'ordinaria',
        frecuencia: String(p.frequency ?? 'monthly'),
        desde: String(p.period_start),
        hasta: String(p.period_end),
        fecha_pago: (p.payment_date as string | null) ?? null,
        estado: String(p.status ?? 'open'),
        empleados: num(p.total_employees),
        devengado: num(p.total_gross),
        deducciones: num(p.total_deductions),
        neto: num(p.total_net),
        costo_empleador: num(p.total_employer_cost),
        version: vig?.run_number ?? null,
        calculado_en: vig?.executed_at ?? null,
        bloqueos: alertas.bloqueos,
        avisos: alertas.avisos,
        ajustes: lista.filter((r) => r.run_type === 'ajuste').length,
      };
    }),
  };
}

export interface RevisionPeriodo {
  usuario_id: string;
  permisos: PermisosNomina;
  habilitada: boolean;
  bloqueos: Array<{ codigo: string; cantidad?: number; estado?: string; faltan?: string[]; detalle?: Record<string, unknown> }>;
  /** Quien corrió la versión vigente: no puede aprobar su propia nómina (lo valida el motor de aprobaciones). */
  preliquidado_por: string | null;
  enviado_por: string | null;
  es_preparador: boolean;
  aprobacion: { id: string; estado: string; paso: number | null; solicitada: string | null; decidida: string | null } | null;
  ajustes: Array<{ id: string; numero: number; estado: string | null; motivo: string | null; ejecutado: string | null }>;
}

/**
 * Lista de comprobación antes de cerrar (19.1–19.2): los bloqueos los decide la
 * base (`fn_hr_nomina_bloqueos`, solo service role, de solo lectura) y la
 * aprobación sale del motor de aprobaciones de la fase 0.
 */
export async function revisionPeriodo(ctx: ContextoLecturaNomina, periodoId: string): Promise<RevisionPeriodo> {
  if (!esUuid(periodoId)) throw new HrmError(400, 'periodo_invalido');
  const permisos = await exigirVer(ctx);
  const sc = getServiceClient();
  const periodo = sinError(
    await sc.from('payroll_periods').select('id, metadata').eq('id', periodoId).eq('organization_id', ctx.organizationId).maybeSingle()
  ) as { id: string; metadata: Record<string, unknown> | null } | null;
  if (!periodo) throw new HrmError(404, 'no_existe');
  const [bloq, runs, bandera] = await Promise.all([
    sc.rpc('fn_hr_nomina_bloqueos', { p_org: ctx.organizationId, p_period: periodoId }),
    sc
      .from('payroll_runs')
      .select('id, payroll_period_id, run_number, run_type, status, superseded_by, is_final, executed_by, executed_at, alerts, reason')
      .eq('payroll_period_id', periodoId),
    leerBandera(ctx),
  ]);
  const lista = (sinError(runs) ?? []) as Array<FilaRun & { reason: string | null }>;
  const vig = runVigente(lista);
  const meta = periodo.metadata ?? {};
  const aprobacionId = typeof meta.aprobacion_id === 'string' && esUuid(meta.aprobacion_id) ? meta.aprobacion_id : null;
  let aprobacion: RevisionPeriodo['aprobacion'] = null;
  if (aprobacionId) {
    const a = sinError(
      await sc
        .from('hr_approval_instances')
        .select('id, status, current_step, created_at, decided_at')
        .eq('id', aprobacionId)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle()
    ) as { id: string; status: string; current_step: number | null; created_at: string | null; decided_at: string | null } | null;
    if (a) aprobacion = { id: a.id, estado: a.status, paso: a.current_step, solicitada: a.created_at, decidida: a.decided_at };
  }
  const preliquidadoPor = vig?.executed_by ?? null;
  const enviadoPor = typeof meta.enviado_a_revision_por === 'string' ? meta.enviado_a_revision_por : null;
  return {
    usuario_id: ctx.userId,
    permisos,
    habilitada: bandera.habilitada,
    bloqueos: (Array.isArray(sinError(bloq)) ? sinError(bloq) : []) as RevisionPeriodo['bloqueos'],
    preliquidado_por: preliquidadoPor,
    enviado_por: enviadoPor,
    es_preparador: ctx.userId === preliquidadoPor || ctx.userId === enviadoPor,
    aprobacion,
    ajustes: lista
      .filter((r) => r.run_type === 'ajuste')
      .sort((a, b) => b.run_number - a.run_number)
      .map((r) => ({ id: r.id, numero: r.run_number, estado: r.status, motivo: r.reason ?? null, ejecutado: r.executed_at })),
  };
}

/** Solo se borra un período abierto que nunca se calculó (16.5). La RLS exige `hr.payroll.process`. */
export async function eliminarPeriodo(ctx: ContextoLecturaNomina, periodoId: string): Promise<{ eliminado: true }> {
  if (!esUuid(periodoId)) throw new HrmError(400, 'periodo_invalido');
  const p = await permisosNomina(ctx);
  if (!p.procesar) throw new HrmError(403, 'sin_permiso');
  const runs = sinError(await ctx.supabase.from('payroll_runs').select('id').eq('payroll_period_id', periodoId).limit(1)) as unknown[] | null;
  if ((runs ?? []).length > 0) throw new HrmError(409, 'periodo_con_calculo');
  const borrados = sinError(
    await ctx.supabase.from('payroll_periods').delete().eq('id', periodoId).eq('organization_id', ctx.organizationId).eq('status', 'open').select('id')
  ) as unknown[] | null;
  if ((borrados ?? []).length === 0) throw new HrmError(409, 'estado_invalido');
  return { eliminado: true };
}

export interface PersonaNomina {
  vinculo_id: string;
  persona_id: string;
  nombre: string | null;
  cargo: string | null;
  area: string | null;
  sede: string | null;
  ingreso: string | null;
  estado: string;
}

/** Nombre, cargo y área de cada vínculo (la lista de Empleados, con su propio control de acceso). */
export async function personasNomina(ctx: ContextoLecturaNomina, p: ContextoPeticion): Promise<PersonaNomina[]> {
  await exigirVer(ctx);
  const r = (await listarEmpleados(ctx, p)) as { empleados?: Array<Record<string, unknown>> };
  return (r.empleados ?? []).map((e) => ({
    vinculo_id: String(e.vinculo_id),
    persona_id: String(e.persona_id),
    nombre: (e.nombre as string | null) ?? null,
    cargo: (e.cargo as string | null) ?? null,
    area: (e.area as string | null) ?? null,
    sede: (e.sede as string | null) ?? null,
    ingreso: (e.ingreso as string | null) ?? null,
    estado: String(e.estado ?? ''),
  }));
}

export interface FilaEmbargo {
  id: string;
  vinculo_id: string;
  tipo: 'alimentos' | 'cooperativa' | 'ordinario';
  modo: 'fijo' | 'porcentaje';
  valor: number;
  total: number | null;
  aplicado: number;
  recibido: string;
  desde: string;
  hasta: string | null;
  oficio: string | null;
  beneficiario: string | null;
  beneficiario_doc: string | null;
  incluye_prestaciones: boolean;
  estado: 'activo' | 'suspendido' | 'terminado';
}

/**
 * Embargos de la organización (21.1, 21.3). `hr_garnishments` no tiene políticas:
 * se lee con la service role después de comprobar `hr.payroll.view` y el grupo
 * `salario_pago`, y cada vínculo leído queda en el registro de accesos.
 */
export async function listarEmbargos(ctx: ContextoLecturaNomina, p: ContextoPeticion): Promise<{ embargos: FilaEmbargo[] }> {
  const permisos = await exigirVer(ctx);
  if (!permisos.salario) throw new HrmError(403, 'sin_permiso');
  const sc = getServiceClient();
  const filas = (sinError(
    await sc
      .from('hr_garnishments')
      .select(
        'id, employment_id, kind, mode, value, total_amount, applied_total, received_on, starts_on, ends_on, court_reference, beneficiary, beneficiary_doc, base_incluye_prestaciones, status'
      )
      .eq('organization_id', ctx.organizationId)
      .order('received_on', { ascending: false })
      .limit(500)
  ) ?? []) as Array<Record<string, unknown>>;
  const vinculos = Array.from(new Set(filas.map((f) => String(f.employment_id))));
  if (vinculos.length) {
    const emp = (sinError(await sc.from('employments').select('id, person_id').in('id', vinculos).eq('organization_id', ctx.organizationId)) ?? []) as Array<{
      id: string;
      person_id: string;
    }>;
    await Promise.all(
      emp.map((e) =>
        sc.rpc('fn_hr_registrar_acceso_interno', {
          p_actor: ctx.userId,
          p_org: ctx.organizationId,
          p_person: e.person_id,
          p_employment: e.id,
          p_grupo: 'salario_pago',
          p_accion: 'ver',
          p_ip: p.ip,
          p_ua: p.userAgent,
          p_ruta: p.ruta ?? 'api:hrm/nomina/embargos',
          p_detalle: { vista: 'embargos' },
        })
      )
    );
  }
  return {
    embargos: filas.map((f) => ({
      id: String(f.id),
      vinculo_id: String(f.employment_id),
      tipo: f.kind as FilaEmbargo['tipo'],
      modo: f.mode as FilaEmbargo['modo'],
      valor: Number(f.value),
      total: f.total_amount === null || f.total_amount === undefined ? null : Number(f.total_amount),
      aplicado: Number(f.applied_total ?? 0),
      recibido: String(f.received_on),
      desde: String(f.starts_on),
      hasta: (f.ends_on as string | null) ?? null,
      oficio: (f.court_reference as string | null) ?? null,
      beneficiario: (f.beneficiary as string | null) ?? null,
      beneficiario_doc: (f.beneficiary_doc as string | null) ?? null,
      incluye_prestaciones: f.base_incluye_prestaciones === true,
      estado: f.status as FilaEmbargo['estado'],
    })),
  };
}

export interface CuentaBancariaNomina {
  id: number;
  nombre: string;
  banco: string | null;
  ultimos: string | null;
  moneda: string | null;
}

/** Cuentas bancarias activas para pagar (22.3). Exige `hr.payroll.pay`; las lee la sesión del usuario (RLS). */
export async function cuentasBancariasNomina(ctx: ContextoLecturaNomina): Promise<{ cuentas: CuentaBancariaNomina[] }> {
  const p = await permisosNomina(ctx);
  if (!p.pagar) throw new HrmError(403, 'sin_permiso');
  const filas = (sinError(
    await ctx.supabase
      .from('bank_accounts')
      .select('id, name, bank_name, account_number, currency, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .order('name')
  ) ?? []) as Array<{ id: number; name: string; bank_name: string | null; account_number: string | null; currency: string | null }>;
  return {
    cuentas: filas.map((c) => ({
      id: c.id,
      nombre: c.name,
      banco: c.bank_name,
      // Solo los cuatro últimos dígitos salen del servidor.
      ultimos: c.account_number ? c.account_number.replace(/\s+/g, '').slice(-4) : null,
      moneda: c.currency,
    })),
  };
}

export interface ConceptoNomina {
  codigo: string;
  nombre: string;
  tipo: string;
  salarial: boolean;
  prestacional: boolean;
  base_ss: boolean;
  cuenta_debito: string | null;
  cuenta_credito: string | null;
}

export interface ConfiguracionNomina {
  permisos: PermisosNomina;
  habilitada: boolean;
  habilitada_desde: string | null;
  motivo: string | null;
  plan: {
    estado: string;
    preparada_at: string;
    aprobada_at: string | null;
    aprobada_empresa_por: string | null;
    aprobada_contador_por: string | null;
    cuentas_a_crear: Array<{ cuenta: string; nombre: string | null; cuenta_mayor: string | null; estado: string | null }>;
    bloqueos: unknown[];
    terceros_incompletos: Array<{ tercero: string; falta: string; vinculo_id: string | null; nombre: string | null }>;
  } | null;
  conceptos: ConceptoNomina[];
}

/**
 * Configuración › Nómina (24.1) y «¿Por qué está apagada?» (24.3): estado de la
 * bandera, la vista previa del plan de cuentas que preparó la plataforma y los
 * terceros sin NIT (bloqueantes para encender), y el catálogo resuelto.
 * Nada aquí enciende la nómina: eso lo hace solo la service role (`fn_hr_nomina_habilitar`).
 */
export async function configuracionNomina(ctx: ContextoLecturaNomina, p: ContextoPeticion): Promise<ConfiguracionNomina> {
  const permisos = await exigirVer(ctx);
  const [bandera, plan, conceptos] = await Promise.all([
    leerBandera(ctx),
    ctx.supabase
      .from('hr_payroll_enablement_reviews')
      .select('status, plan, cuentas_a_crear, preparada_at, aprobada_at, aprobada_empresa_por, aprobada_contador_por')
      .eq('organization_id', ctx.organizationId)
      .neq('status', 'anulada')
      .order('preparada_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getServiceClient().rpc('fn_hr_nomina_conceptos', { p_org: ctx.organizationId }),
  ]);
  const fila = sinError(plan) as
    | (FilaPlan & { aprobada_empresa_por: string | null; aprobada_contador_por: string | null })
    | null;
  const terceros = (Array.isArray(fila?.plan?.terceros_incompletos) ? fila?.plan?.terceros_incompletos : []) as Array<Record<string, unknown>>;
  let nombres = new Map<string, string | null>();
  if (terceros.length) {
    const personas = await personasNomina(ctx, p).catch(() => [] as PersonaNomina[]);
    nombres = new Map(personas.map((x) => [x.vinculo_id, x.nombre]));
  }
  const cat = (sinError(conceptos) ?? {}) as Record<string, Record<string, unknown>>;
  return {
    permisos,
    habilitada: bandera.habilitada,
    habilitada_desde: bandera.desde,
    motivo: bandera.motivo,
    plan: fila
      ? {
          estado: fila.status,
          preparada_at: fila.preparada_at,
          aprobada_at: fila.aprobada_at,
          aprobada_empresa_por: fila.aprobada_empresa_por,
          aprobada_contador_por: fila.aprobada_contador_por,
          cuentas_a_crear: (Array.isArray(fila.cuentas_a_crear) ? fila.cuentas_a_crear : []).map((c: Record<string, unknown>) => ({
            cuenta: String(c.cuenta ?? ''),
            nombre: (c.nombre as string | null) ?? null,
            cuenta_mayor: (c.cuenta_mayor as string | null) ?? null,
            estado: (c.estado as string | null) ?? null,
          })),
          bloqueos: Array.isArray(fila.plan?.bloqueos) ? (fila.plan?.bloqueos as unknown[]) : [],
          terceros_incompletos: terceros.map((t) => {
            const v = typeof t.vinculo_id === 'string' ? t.vinculo_id : null;
            return { tercero: String(t.tercero ?? ''), falta: String(t.falta ?? ''), vinculo_id: v, nombre: v ? nombres.get(v) ?? null : null };
          }),
        }
      : null,
    conceptos: Object.values(cat)
      .map((c) => ({
        codigo: String(c.codigo),
        nombre: String(c.nombre ?? c.codigo),
        tipo: String(c.tipo ?? ''),
        salarial: c.salarial === true,
        prestacional: c.prestacional === true,
        base_ss: c.base_ss === true,
        cuenta_debito: (c.cuenta_debito as string | null) ?? null,
        cuenta_credito: (c.cuenta_credito as string | null) ?? null,
      }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.codigo.localeCompare(b.codigo)),
  };
}
