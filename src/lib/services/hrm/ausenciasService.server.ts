/**
 * Ausencias de RR. HH.: vacaciones, incapacidades y licencias, y las novedades de
 * asistencia que registra una persona (ADR-002 §4, §5 y §6).
 *
 * - Las vacaciones se causan a 15 días hábiles por año en base 360 y se descuentan
 *   en días hábiles sin festivos de ley ni días propios (`fn_hr_dias_habiles`).
 * - Salud es sensible: el diagnóstico vive en `hr_leave_health_details`, que solo
 *   lee `fn_hr_ausencia_detalle_salud` dejando su fila en el registro de accesos.
 *   El jefe ve «ausente por incapacidad» por `fn_hr_ausencias_equipo`.
 * Todo con la service role y el actor de la sesión: el permiso lo decide la base.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { registrarIntento } from './configuracion/registroAccesosConfig.server';
import { HrmError, errorDeRpc, esFechaPlana, esUuid, type ContextoPeticion } from './tipos';

export type ContextoAusencias = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

function cliente() {
  return getServiceClient();
}

const CODIGO_RE = /^[A-Z][A-Z0-9_]{1,20}$/;
const CIE10_RE = /^[A-Za-z][0-9]{2}(\.?[0-9A-Za-z]{1,4})?$/;

function texto(v: unknown, max: number): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** Normaliza la solicitud. La organización nunca viaja: sale de la sesión. */
export function datosDeAusencia(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new HrmError(400, 'datos_invalidos');
  const b = body as Record<string, unknown>;
  if (!esFechaPlana(b.desde) || !esFechaPlana(b.hasta) || b.hasta < b.desde) throw new HrmError(400, 'fechas_invalidas');
  const datos: Record<string, unknown> = { desde: b.desde, hasta: b.hasta };
  if (b.vinculo_id !== undefined) {
    if (!esUuid(b.vinculo_id)) throw new HrmError(400, 'vinculo_invalido');
    datos.employment_id = b.vinculo_id;
  }
  if (esUuid(b.tipo_id)) datos.tipo_id = b.tipo_id;
  else if (typeof b.tipo === 'string' && CODIGO_RE.test(b.tipo)) datos.tipo = b.tipo;
  else throw new HrmError(400, 'tipo_invalido');
  if (b.medio_dia_inicio === true) datos.medio_dia_inicio = true;
  if (b.medio_dia_fin === true) datos.medio_dia_fin = true;
  if (b.medio_dia_jornada === 'morning' || b.medio_dia_jornada === 'afternoon') datos.medio_dia_jornada = b.medio_dia_jornada;
  const motivo = texto(b.motivo, 1000);
  if (motivo) datos.motivo = motivo;
  if (b.documento_id !== undefined && b.documento_id !== null) {
    if (!esUuid(b.documento_id)) throw new HrmError(400, 'documento_invalido');
    datos.documento_id = b.documento_id;
  }
  if (b.prorroga_de !== undefined && b.prorroga_de !== null) {
    if (!esUuid(b.prorroga_de)) throw new HrmError(400, 'prorroga_invalida');
    datos.prorroga_de = b.prorroga_de;
  }
  if (b.salud && typeof b.salud === 'object') {
    const s = b.salud as Record<string, unknown>;
    const codigo = texto(s.diagnostico_codigo, 10);
    if (codigo && !CIE10_RE.test(codigo)) throw new HrmError(400, 'diagnostico_invalido');
    datos.salud = {
      diagnostico_codigo: codigo,
      diagnostico: texto(s.diagnostico, 500),
      entidad: texto(s.entidad, 200),
      notas: texto(s.notas, 1000),
    };
  }
  return datos;
}

export async function solicitar(ctx: ContextoAusencias, body: unknown): Promise<Record<string, unknown>> {
  const { data, error } = await cliente().rpc('fn_hr_ausencia_solicitar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: datosDeAusencia(body),
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function cancelar(ctx: ContextoAusencias, id: string, motivo: unknown): Promise<{ id: string; estado: string }> {
  if (!esUuid(id)) throw new HrmError(400, 'ausencia_invalida');
  const { data, error } = await cliente().rpc('fn_hr_ausencia_cancelar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_id: id,
    p_motivo: typeof motivo === 'string' ? motivo.slice(0, 500) : null,
  });
  if (error) throw errorDeRpc(error);
  return data as { id: string; estado: string };
}

export async function saldoVacaciones(ctx: ContextoAusencias, vinculoId: string, fecha?: string | null): Promise<Record<string, unknown>> {
  if (!esUuid(vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (fecha && !esFechaPlana(fecha)) throw new HrmError(400, 'fecha_invalida');
  const { data, error } = await cliente().rpc('fn_hr_vacaciones_saldo', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_employment: vinculoId,
    p_fecha: fecha || null,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}

/** Calendario de ausencias que puede ver el actor; las de salud salen como «incapacidad». */
export async function ausenciasDelEquipo(ctx: ContextoAusencias, desde: string, hasta: string): Promise<unknown[]> {
  if (!esFechaPlana(desde) || !esFechaPlana(hasta) || hasta < desde) throw new HrmError(400, 'rango_invalido');
  const { data, error } = await cliente().rpc('fn_hr_ausencias_equipo', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: desde,
    p_hasta: hasta,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? []) as unknown[];
}

/** Diagnóstico de una incapacidad: queda en el registro de accesos; el intento sin permiso, también. */
export async function detalleSalud(ctx: ContextoAusencias, id: string, peticion: ContextoPeticion): Promise<Record<string, unknown>> {
  if (!esUuid(id)) throw new HrmError(400, 'ausencia_invalida');
  const { data, error } = await cliente().rpc('fn_hr_ausencia_detalle_salud', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_id: id,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
    p_ruta: peticion.ruta,
  });
  if (error) {
    const err = errorDeRpc(error);
    if (err.code === 'sin_permiso') {
      await registrarIntento(ctx, { grupo: 'salud', detalle: { accion: 'ver', campos: ['diagnostico'], ausencia: id } }, peticion);
    }
    throw err;
  }
  return (data ?? {}) as Record<string, unknown>;
}

const ACCIONES_NOVEDAD = new Set(['justificar', 'ausencia', 'cambio_turno', 'aceptar_cambio', 'rechazar_cambio']);

/** Novedades que registra una persona: justificar, ausencia del gestor y cambios de turno. */
export function datosDeNovedad(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new HrmError(400, 'datos_invalidos');
  const b = body as Record<string, unknown>;
  if (typeof b.accion !== 'string' || !ACCIONES_NOVEDAD.has(b.accion)) throw new HrmError(400, 'accion_invalida');
  const datos: Record<string, unknown> = { accion: b.accion };
  for (const k of ['novedad_id', 'asignacion_id', 'con_asignacion_id', 'con_vinculo_id', 'vinculo_id'] as const) {
    if (b[k] !== undefined && b[k] !== null) {
      if (!esUuid(b[k])) throw new HrmError(400, `${k}_invalido`);
      datos[k === 'con_vinculo_id' ? 'con_employment_id' : k === 'vinculo_id' ? 'employment_id' : k] = b[k];
    }
  }
  if (b.fecha !== undefined) {
    if (!esFechaPlana(b.fecha)) throw new HrmError(400, 'fecha_invalida');
    datos.fecha = b.fecha;
  }
  if (b.minutos !== undefined) {
    if (typeof b.minutos !== 'number' || !Number.isInteger(b.minutos) || b.minutos < 0 || b.minutos > 2880) throw new HrmError(400, 'minutos_invalidos');
    datos.minutos = b.minutos;
  }
  const justificacion = texto(b.justificacion, 1000);
  if (justificacion) datos.justificacion = justificacion;
  const motivo = texto(b.motivo, 1000);
  if (motivo) datos.motivo = motivo;
  return datos;
}

export async function registrarNovedad(ctx: ContextoAusencias, body: unknown): Promise<Record<string, unknown>> {
  const { data, error } = await cliente().rpc('fn_hr_novedad_registrar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: datosDeNovedad(body),
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}
