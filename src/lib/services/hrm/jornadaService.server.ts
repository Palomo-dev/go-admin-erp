/**
 * Jornada de RR. HH.: clasificación de horas, «lista para nómina» y el consumo
 * de la fase 3 (ADR-002 §3 y §4).
 *
 * El motor es puro (`@/lib/hrm/jornada/motorHoras`). Aquí solo se orquesta:
 * insumos de la base (`fn_hr_jornada_insumos`) → motor → `fn_hr_jornada_guardar`,
 * que compara la versión de los insumos y reemplaza las líneas del día. Las RPC
 * solo las ejecuta la service role con el actor de `getServerOrgContext()`; el
 * permiso lo resuelve la base (el propio empleado o `hr.attendance.manage`).
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { addPlainDays } from '@/lib/utils/dateCore';
import { ParametroFaltanteError, clasificarDia, diaDeLaSemana } from '@/lib/hrm/jornada/motorHoras';
import { entradaDesdeInsumos, resultadoParaGuardar, type InsumosJornada } from '@/lib/hrm/jornada/insumos';
import { HrmError, errorDeRpc, esFechaPlana, esUuid } from './tipos';

export type ContextoJornada = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

export interface ResultadoRecalculo {
  fecha: string;
  estado: 'clasificado' | 'sin_datos' | 'cerrado';
  timesheet_id?: string;
  minutos_extra?: number;
  alertas?: unknown[];
  novedades?: unknown[];
}

const MAX_DIAS = 31;

function cliente() {
  return getServiceClient();
}

function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split('-').map(Number);
  const [a2, m2, d2] = hasta.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Domingo de la semana (lunes a domingo) de un día calendario. */
export function domingoDeLaSemana(fecha: string): string {
  const dow = diaDeLaSemana(fecha);
  return addPlainDays(fecha, dow === 0 ? 0 : 7 - dow);
}

async function insumos(ctx: ContextoJornada, vinculoId: string, fecha: string): Promise<InsumosJornada> {
  const { data, error } = await cliente().rpc('fn_hr_jornada_insumos', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_employment: vinculoId,
    p_fecha: fecha,
  });
  if (error) throw errorDeRpc(error);
  return data as InsumosJornada;
}

/** Clasifica un día. Si llegan marcaciones durante el cálculo, vuelve a intentarlo una vez. */
export async function recalcularDia(ctx: ContextoJornada, vinculoId: string, fecha: string): Promise<ResultadoRecalculo> {
  if (!esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (!esFechaPlana(fecha)) throw new HrmError(400, 'fecha_invalida');
  for (let intento = 0; intento < 2; intento++) {
    const ins = await insumos(ctx, vinculoId, fecha);
    if (ins.estado === 'approved' || ins.estado === 'locked') return { fecha, estado: 'cerrado' };
    const entrada = entradaDesdeInsumos(ins);
    if (!entrada || !ins.fuente) return { fecha, estado: 'sin_datos' };
    let resultado;
    try {
      resultado = clasificarDia(entrada);
    } catch (err) {
      if (err instanceof ParametroFaltanteError) throw new HrmError(422, 'parametro_no_configurado', err.message);
      throw err;
    }
    const { data, error } = await cliente().rpc('fn_hr_jornada_guardar', {
      p_actor: ctx.userId,
      p_org: ctx.organizationId,
      p_employment: vinculoId,
      p_fecha: fecha,
      p_version: ins.version,
      p_resultado: resultadoParaGuardar(resultado, ins.fuente),
    });
    if (error) {
      if (error.code === '40001' && intento === 0) continue;
      throw errorDeRpc(error);
    }
    const g = (data ?? {}) as { timesheet_id?: string; minutos_extra?: number; novedades?: unknown[] };
    return {
      fecha,
      estado: 'clasificado',
      timesheet_id: g.timesheet_id,
      minutos_extra: g.minutos_extra,
      alertas: resultado.alertas,
      novedades: g.novedades,
    };
  }
  throw new HrmError(409, 'jornada_cambio_durante_calculo');
}

/**
 * Clasifica un rango en orden y sigue hasta el domingo de la última semana: el
 * tope semanal depende de los días anteriores, así que un cambio el lunes mueve
 * el resto de la semana.
 */
export async function recalcular(
  ctx: ContextoJornada,
  vinculoId: string,
  desde: string,
  hasta?: string | null
): Promise<ResultadoRecalculo[]> {
  if (!esFechaPlana(desde) || (hasta && !esFechaPlana(hasta))) throw new HrmError(400, 'fecha_invalida');
  const fin = domingoDeLaSemana(hasta || desde);
  if (diasEntre(desde, fin) < 0 || diasEntre(desde, fin) > MAX_DIAS) throw new HrmError(422, 'rango_invalido');
  const out: ResultadoRecalculo[] = [];
  for (let d = desde; d <= fin; d = addPlainDays(d, 1)) {
    out.push(await recalcularDia(ctx, vinculoId, d));
  }
  return out;
}

export interface ResultadoListaNomina {
  listas: number;
  pendientes: Array<{ timesheet_id: string; employment_id: string; fecha: string; motivo: string }>;
}

export async function marcarListaParaNomina(
  ctx: ContextoJornada,
  desde: string,
  hasta: string,
  vinculos?: string[] | null
): Promise<ResultadoListaNomina> {
  if (!esFechaPlana(desde) || !esFechaPlana(hasta)) throw new HrmError(400, 'fecha_invalida');
  if (vinculos && (!Array.isArray(vinculos) || vinculos.length > 500 || !vinculos.every(esUuid))) {
    throw new HrmError(400, 'vinculos_invalidos');
  }
  const { data, error } = await cliente().rpc('fn_hr_jornada_lista_nomina', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
    p_employments: vinculos && vinculos.length ? vinculos : null,
  });
  if (error) throw errorDeRpc(error);
  return data as ResultadoListaNomina;
}

export async function reabrir(ctx: ContextoJornada, timesheetId: string, motivo: unknown): Promise<{ timesheet_id: string; estado: string }> {
  if (!esUuid(timesheetId)) throw new HrmError(400, 'dia_invalido');
  const { data, error } = await cliente().rpc('fn_hr_jornada_reabrir', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_timesheet: timesheetId,
    p_motivo: typeof motivo === 'string' ? motivo.slice(0, 500) : null,
  });
  if (error) throw errorDeRpc(error);
  return data as { timesheet_id: string; estado: string };
}

/** Lo que consume la nómina (fase 3): horas por categoría, recargo y divisor; descuentos y ausencias. */
export async function paraNomina(ctx: ContextoJornada, desde: string, hasta: string): Promise<Record<string, unknown>> {
  if (!esFechaPlana(desde) || !esFechaPlana(hasta)) throw new HrmError(400, 'fecha_invalida');
  const { data, error } = await cliente().rpc('fn_hr_jornada_para_nomina', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}
