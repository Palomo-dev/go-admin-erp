/**
 * Marcación de RR. HH. (ADR-002 §2).
 *
 * Todo pasa por la base con el actor de la sesión:
 * - `fn_hr_marcar` valida el QR contra `time_clocks` (el token ya no llega al
 *   navegador del empleado), pone la hora del servidor y guarda la ubicación
 *   solo con consentimiento vigente;
 * - `fn_hr_marcacion_manual` es la única vía para una hora elegida, y exige
 *   `hr.attendance.manage`.
 * Después de marcar se reclasifica el día con el motor de horas.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { DatosMarcacion, TipoEvento } from '@/lib/hrm/jornada/marcacion';
import { recalcularDia, type ResultadoRecalculo } from './jornadaService.server';
import { HrmError, errorDeRpc, esUuid, type ContextoPeticion } from './tipos';

export type ContextoMarcacion = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

/** Versión del texto de autorización de ubicación que acepta el empleado. */
export const VERSION_TEXTO_UBICACION = 'ubicacion-al-marcar-2026-11';

export interface ResultadoMarcacion {
  evento_id: string;
  tipo: TipoEvento;
  hora: string;
  fecha_trabajo: string;
  employment_id: string;
  modo: 'presencial' | 'remoto';
  ubicacion_guardada: boolean;
  reloj: string | null;
  jornada?: ResultadoRecalculo | { estado: 'pendiente'; motivo: string };
}

function cliente() {
  return getServiceClient();
}

export async function marcar(ctx: ContextoMarcacion, datos: DatosMarcacion, peticion: ContextoPeticion): Promise<ResultadoMarcacion> {
  const { data, error } = await cliente().rpc('fn_hr_marcar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: datos,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
  });
  if (error) throw errorDeRpc(error);
  const r = data as ResultadoMarcacion;
  // La marcación ya quedó; si la clasificación no se puede hacer ahora (un parámetro
  // por confirmar, una carrera), el día queda sin clasificar y no pasa a nómina.
  try {
    r.jornada = await recalcularDia(ctx, r.employment_id, r.fecha_trabajo);
  } catch (err) {
    r.jornada = { estado: 'pendiente', motivo: err instanceof HrmError ? err.code : 'error_hrm' };
  }
  return r;
}

export async function estado(ctx: ContextoMarcacion): Promise<Record<string, unknown>> {
  const { data, error } = await cliente().rpc('fn_hr_marcacion_estado', { p_actor: ctx.userId, p_org: ctx.organizationId });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}

export async function consentimientoUbicacion(
  ctx: ContextoMarcacion,
  otorgar: unknown,
  peticion: ContextoPeticion
): Promise<{ autorizada: boolean; version: string }> {
  if (typeof otorgar !== 'boolean') throw new HrmError(400, 'consentimiento_invalido');
  const { data, error } = await cliente().rpc('fn_hr_consentimiento_ubicacion', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_otorgar: otorgar,
    p_version: VERSION_TEXTO_UBICACION,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
  });
  if (error) throw errorDeRpc(error);
  return data as { autorizada: boolean; version: string };
}

const TIPOS = new Set(['check_in', 'check_out', 'break_start', 'break_end']);

export async function marcacionManual(
  ctx: ContextoMarcacion,
  args: { vinculoId: unknown; tipo: unknown; hora: unknown; motivo: unknown }
): Promise<Record<string, unknown>> {
  if (!esUuid(args.vinculoId)) throw new HrmError(400, 'vinculo_invalido');
  if (typeof args.tipo !== 'string' || !TIPOS.has(args.tipo)) throw new HrmError(400, 'tipo_invalido');
  if (typeof args.hora !== 'string' || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(args.hora) || !Number.isFinite(Date.parse(args.hora))) {
    // La hora manual viaja con su zona: nunca una hora de pared ambigua.
    throw new HrmError(400, 'hora_invalida');
  }
  const { data, error } = await cliente().rpc('fn_hr_marcacion_manual', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_employment: args.vinculoId,
    p_tipo: args.tipo,
    p_hora: args.hora,
    p_motivo: typeof args.motivo === 'string' ? args.motivo.slice(0, 500) : null,
  });
  if (error) throw errorDeRpc(error);
  const r = data as { fecha_trabajo: string } & Record<string, unknown>;
  try {
    r.jornada = await recalcularDia(ctx, args.vinculoId, r.fecha_trabajo);
  } catch (err) {
    r.jornada = { estado: 'pendiente', motivo: err instanceof HrmError ? err.code : 'error_hrm' };
  }
  return r;
}

export async function rotarQr(ctx: ContextoMarcacion, relojId: string): Promise<{ reloj_id: string; token: string; vence: string | null }> {
  if (!esUuid(relojId)) throw new HrmError(400, 'reloj_invalido');
  const { data, error } = await cliente().rpc('fn_hr_reloj_qr_rotar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_reloj: relojId,
  });
  if (error) throw errorDeRpc(error);
  return data as { reloj_id: string; token: string; vence: string | null };
}
