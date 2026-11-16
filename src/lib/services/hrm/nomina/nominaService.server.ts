/**
 * Nómina de RR. HH., fase 3 (ADR-003). Reemplaza a `payrollCalculationService.ts`,
 * que calculaba en el navegador y con el error de escala ×100.
 *
 * El motor es puro (`@/lib/hrm/nomina/motorNomina`). Aquí solo se orquesta:
 * insumos de la base (`fn_hr_nomina_insumos`) → motor → `fn_hr_nomina_guardar`,
 * que guarda la versión de forma transaccional e idempotente. Las RPC solo las
 * ejecuta la service role con el actor de `getServerOrgContext()`; el permiso,
 * la bandera `hr_payroll_enabled` y los estados los resuelve la base.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { ParametroNominaFaltante } from '@/lib/hrm/nomina/base';
import {
  ajusteDesdeInsumos,
  preliquidarDesdeInsumos,
  type InsumosAjuste,
  type InsumosNomina,
  type NovedadAjuste,
} from '@/lib/hrm/nomina/insumos';
import { generarArchivoBanco, type FilaPagoBanco } from '@/lib/hrm/nomina/archivoBanco';
import { HrmError, errorDeRpc, esFechaPlana, esUuid, type ContextoPeticion } from '../tipos';

export type ContextoNomina = Pick<ServerOrgContext, 'userId' | 'organizationId' | 'supabase'>;

const TIPOS = ['ordinaria', 'prima', 'cesantias'] as const;
const FRECUENCIAS = ['weekly', 'biweekly', 'monthly'] as const;

function cliente() {
  return getServiceClient();
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await cliente().rpc(fn, args);
  if (error) throw errorDeRpc(error);
  return data as T;
}

function exigirPeriodo(id: string) {
  if (!esUuid(id)) throw new HrmError(400, 'periodo_invalido');
}

export async function crearPeriodo(ctx: ContextoNomina, datos: Record<string, unknown>): Promise<{ id: string }> {
  const tipo = String(datos.tipo ?? 'ordinaria');
  const frecuencia = String(datos.frecuencia ?? 'monthly');
  if (!(TIPOS as readonly string[]).includes(tipo) || !(FRECUENCIAS as readonly string[]).includes(frecuencia)) {
    throw new HrmError(400, 'periodo_invalido');
  }
  if (!esFechaPlana(datos.desde) || !esFechaPlana(datos.hasta) || (datos.fecha_pago && !esFechaPlana(datos.fecha_pago))) {
    throw new HrmError(400, 'fecha_invalida');
  }
  return rpc('fn_hr_nomina_periodo_crear', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: {
      tipo,
      frecuencia,
      desde: datos.desde,
      hasta: datos.hasta,
      fecha_pago: datos.fecha_pago ?? null,
      nombre: typeof datos.nombre === 'string' ? datos.nombre.slice(0, 120) : null,
    },
  });
}

export interface ResultadoPreliquidacion {
  run_id: string;
  reutilizado: boolean;
  version?: number;
  totales: { empleados: number; devengado: number; deducciones: number; neto: number; costo_empleador: number };
  bloqueos: unknown[];
  excluidos: unknown[];
  solo_preliquidacion: boolean;
}

/**
 * Preliquida (o recalcula) un período abierto. La misma entrada no crea otra
 * versión: la base devuelve la existente (`reutilizado`).
 */
export async function preliquidar(ctx: ContextoNomina, periodoId: string, p: ContextoPeticion): Promise<ResultadoPreliquidacion> {
  exigirPeriodo(periodoId);
  const ins = await rpc<InsumosNomina>('fn_hr_nomina_insumos', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_period: periodoId,
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
  });
  let calculo;
  try {
    calculo = preliquidarDesdeInsumos(ins);
  } catch (err) {
    if (err instanceof ParametroNominaFaltante) throw new HrmError(422, 'parametro_no_configurado', err.message);
    throw err;
  }
  const g = await rpc<{ run_id: string; reutilizado: boolean; version?: number }>('fn_hr_nomina_guardar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_period: periodoId,
    p_resultado: calculo.payload,
  });
  return {
    ...g,
    totales: calculo.resultado.totales,
    bloqueos: calculo.resultado.bloqueos,
    excluidos: ins.excluidos,
    solo_preliquidacion: !ins.nomina_habilitada,
  };
}

export function leerPeriodo(ctx: ContextoNomina, periodoId: string, p: ContextoPeticion): Promise<Record<string, unknown>> {
  exigirPeriodo(periodoId);
  return rpc('fn_hr_nomina_periodo_leer', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_period: periodoId,
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
  });
}

export function enviarRevision(ctx: ContextoNomina, periodoId: string): Promise<Record<string, unknown>> {
  exigirPeriodo(periodoId);
  return rpc('fn_hr_nomina_enviar_revision', { p_actor: ctx.userId, p_org: ctx.organizationId, p_period: periodoId });
}

export function cerrar(ctx: ContextoNomina, periodoId: string): Promise<Record<string, unknown>> {
  exigirPeriodo(periodoId);
  return rpc('fn_hr_nomina_cerrar', { p_actor: ctx.userId, p_org: ctx.organizationId, p_period: periodoId });
}

export interface ResultadoPago {
  payment_id: string;
  total: number;
  colillas: number;
  comisiones_pagadas: number;
  comisiones_pendientes: string[];
}

/**
 * Registra el pago en Tesorería (un egreso por período) y marca las colillas
 * pagadas; los asientos los hacen los triggers. Después marca las comisiones
 * incluidas con `fn_comisiones_pagar_por_nomina` (con la sesión del usuario: la
 * función exige `auth.uid()`). Si una falla se informa y se puede reintentar:
 * solo pasa de `accrued` a `paid`.
 */
export async function pagar(ctx: ContextoNomina, periodoId: string, datos: Record<string, unknown>): Promise<ResultadoPago> {
  exigirPeriodo(periodoId);
  const cuenta = Number(datos.cuenta_bancaria_id);
  if (!Number.isInteger(cuenta) || cuenta <= 0) throw new HrmError(400, 'cuenta_bancaria_invalida');
  if (!esFechaPlana(datos.fecha)) throw new HrmError(400, 'fecha_invalida');
  const r = await rpc<{ payment_id: string; total: number; colillas: number; colilla_ids: string[] }>('fn_hr_nomina_pagar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_period: periodoId,
    p_bank_account: cuenta,
    p_fecha: datos.fecha,
    p_referencia: typeof datos.referencia === 'string' ? datos.referencia.slice(0, 120) : null,
  });
  let pagadas = 0;
  const pendientes: string[] = [];
  for (const id of r.colilla_ids ?? []) {
    const { data, error } = await ctx.supabase.rpc('fn_comisiones_pagar_por_nomina', { p_slip_id: id });
    if (error) pendientes.push(id);
    else pagadas += Number(data ?? 0);
  }
  return { payment_id: r.payment_id, total: Number(r.total), colillas: r.colillas, comisiones_pagadas: pagadas, comisiones_pendientes: pendientes };
}

export function contabilizar(ctx: ContextoNomina, periodoId: string): Promise<{ contabilizado: boolean; faltan?: unknown[] }> {
  exigirPeriodo(periodoId);
  return rpc('fn_hr_nomina_contabilizar', { p_actor: ctx.userId, p_org: ctx.organizationId, p_period: periodoId });
}

export function registrarNovedad(ctx: ContextoNomina, datos: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!esUuid(datos.periodo_id) || !esUuid(datos.vinculo_id)) throw new HrmError(400, 'datos_invalidos');
  const valor = datos.valor === undefined || datos.valor === null || datos.valor === '' ? null : Number(datos.valor);
  const cantidad = datos.cantidad === undefined || datos.cantidad === null || datos.cantidad === '' ? null : Number(datos.cantidad);
  if ((valor === null && cantidad === null) || (valor !== null && !(valor > 0)) || (cantidad !== null && !(cantidad > 0))) {
    throw new HrmError(400, 'valor_invalido');
  }
  return rpc('fn_hr_nomina_novedad_registrar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: {
      periodo_id: datos.periodo_id,
      vinculo_id: datos.vinculo_id,
      concepto: String(datos.concepto ?? '').slice(0, 40),
      valor,
      cantidad,
      descripcion: typeof datos.descripcion === 'string' ? datos.descripcion.slice(0, 500) : null,
    },
  });
}

export function anularNovedad(ctx: ContextoNomina, novedadId: string): Promise<Record<string, unknown>> {
  if (!esUuid(novedadId)) throw new HrmError(400, 'novedad_invalida');
  return rpc('fn_hr_nomina_novedad_anular', { p_actor: ctx.userId, p_org: ctx.organizationId, p_novedad: novedadId });
}

export function guardarAjustesEmpleado(ctx: ContextoNomina, vinculoId: string, datos: Record<string, unknown>, p: ContextoPeticion) {
  if (!esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (!esFechaPlana(datos.desde)) throw new HrmError(400, 'fecha_invalida');
  const pct = datos.porcentaje_fijo === undefined || datos.porcentaje_fijo === null || datos.porcentaje_fijo === '' ? null : Number(datos.porcentaje_fijo);
  if (pct !== null && !(pct >= 0 && pct < 1)) throw new HrmError(400, 'porcentaje_invalido');
  return rpc('fn_hr_nomina_ajustes_guardar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_employment: vinculoId,
    p_datos: {
      desde: datos.desde,
      integral: datos.integral === true,
      procedimiento: datos.procedimiento === 2 ? 2 : 1,
      porcentaje_fijo: pct,
      dependientes: datos.dependientes === true,
      medicina_prepagada: Math.max(0, Number(datos.medicina_prepagada) || 0),
      intereses_vivienda: Math.max(0, Number(datos.intereses_vivienda) || 0),
      aportes_voluntarios: Math.max(0, Number(datos.aportes_voluntarios) || 0),
      // Pensión en la licencia no remunerada (P13): no, empleador o compartida.
      pension_en_licencia: datos.pension_en_licencia === 'empleador' || datos.pension_en_licencia === 'compartida' ? datos.pension_en_licencia : 'no',
      // Jornada parcial con cotización por semanas (Decreto 2616): bloquea la colilla.
      cotiza_por_semanas: datos.cotiza_por_semanas === true,
      motivo: typeof datos.motivo === 'string' ? datos.motivo.slice(0, 300) : null,
    },
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
  });
}

export function guardarEmbargo(ctx: ContextoNomina, datos: Record<string, unknown>, p: ContextoPeticion) {
  if (!esUuid(datos.vinculo_id) || (datos.id !== undefined && datos.id !== null && !esUuid(datos.id))) throw new HrmError(400, 'datos_invalidos');
  if (!datos.id) {
    if (!['alimentos', 'cooperativa', 'ordinario'].includes(String(datos.tipo)) || !['fijo', 'porcentaje'].includes(String(datos.modo))) {
      throw new HrmError(400, 'embargo_invalido');
    }
    const v = Number(datos.valor);
    if (!(v > 0) || (datos.modo === 'porcentaje' && v > 1) || !esFechaPlana(datos.recibido)) throw new HrmError(400, 'embargo_invalido');
    // P20: solo un oficio de alimentos o de cooperativa puede incluir las prestaciones.
    if (datos.incluye_prestaciones !== undefined && typeof datos.incluye_prestaciones !== 'boolean') throw new HrmError(400, 'embargo_invalido');
    if (datos.incluye_prestaciones === true && datos.tipo === 'ordinario') throw new HrmError(400, 'embargo_invalido');
  }
  return rpc('fn_hr_nomina_embargo_guardar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: datos,
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
  });
}

/**
 * Ajuste controlado de un período cerrado: la colilla se recalcula con su entrada
 * y sus reglas originales más las novedades del ajuste, y se guarda la diferencia
 * con su motivo. Nunca se edita lo cerrado.
 */
export async function ajustar(ctx: ContextoNomina, periodoId: string, datos: Record<string, unknown>, p: ContextoPeticion) {
  exigirPeriodo(periodoId);
  if (!esUuid(datos.vinculo_id)) throw new HrmError(400, 'vinculo_invalido');
  const motivo = typeof datos.motivo === 'string' ? datos.motivo.trim().slice(0, 500) : '';
  if (!motivo) throw new HrmError(400, 'motivo_obligatorio');
  const novedades = Array.isArray(datos.novedades) ? (datos.novedades as NovedadAjuste[]) : [];
  if (novedades.length === 0 || novedades.length > 20) throw new HrmError(400, 'novedades_invalidas');
  const ins = await rpc<InsumosAjuste>('fn_hr_nomina_ajuste_insumos', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_period: periodoId,
    p_ip: p.ip,
    p_ua: p.userAgent,
    p_ruta: p.ruta,
  });
  let payload;
  try {
    payload = ajusteDesdeInsumos(
      ins,
      datos.vinculo_id,
      novedades.map((n) => ({ concepto: String(n.concepto ?? ''), valor: n.valor ?? null, cantidad: n.cantidad ?? null }))
    );
  } catch (err) {
    const m = err instanceof Error ? err.message.split(':')[0] : 'ajuste_invalido';
    throw new HrmError(422, m);
  }
  if (payload.colillas.every((c) => (c.items as unknown[]).length === 0)) throw new HrmError(422, 'ajuste_sin_diferencia');
  return rpc('fn_hr_nomina_ajuste_guardar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_period: periodoId,
    p_resultado: payload,
    p_motivo: motivo,
  });
}

export function cerrarAjuste(ctx: ContextoNomina, runId: string) {
  if (!esUuid(runId)) throw new HrmError(400, 'ajuste_invalido');
  return rpc('fn_hr_nomina_ajuste_cerrar', { p_actor: ctx.userId, p_org: ctx.organizationId, p_run: runId });
}

/** Archivo para el banco. Con una fila inválida no hay archivo: se devuelven los errores. */
export async function archivoBanco(ctx: ContextoNomina, periodoId: string, formato: string, p: ContextoPeticion) {
  exigirPeriodo(periodoId);
  const d = await rpc<{ periodo: { id: string; nombre: string | null; fecha_pago: string | null }; filas: FilaPagoBanco[] }>(
    'fn_hr_nomina_archivo_banco',
    { p_actor: ctx.userId, p_org: ctx.organizationId, p_period: periodoId, p_ip: p.ip, p_ua: p.userAgent, p_ruta: p.ruta }
  );
  try {
    return generarArchivoBanco(formato || 'csv_generico', (d.filas ?? []).map((f) => ({ ...f, valor: Number(f.valor) })), {
      periodo: periodoId.slice(0, 8),
      fecha_pago: d.periodo?.fecha_pago ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'formato_banco_no_soportado') throw new HrmError(400, 'formato_banco_no_soportado');
    throw err;
  }
}

/** Las colillas cerradas del propio empleado (la RLS solo deja ver esas). */
export async function misColillas(ctx: ContextoNomina) {
  const { data, error } = await ctx.supabase
    .from('payroll_slips')
    .select('id, status, gross_pay, total_deductions, net_pay, paid_at, payroll_run_id, payroll_items(item_type, code, name, amount, quantity)')
    .in('id', (await idsMisColillas(ctx)) as string[])
    .order('created_at', { ascending: false })
    .limit(48);
  if (error) throw errorDeRpc(error);
  return data ?? [];
}

async function idsMisColillas(ctx: ContextoNomina): Promise<string[]> {
  const { data, error } = await ctx.supabase.rpc('fn_hr_nomina_mis_colillas');
  if (error) throw errorDeRpc(error);
  return ((data ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : String((x as Record<string, unknown>).fn_hr_nomina_mis_colillas ?? '')));
}
