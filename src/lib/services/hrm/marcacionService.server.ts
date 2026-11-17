/**
 * Marcación de RR. HH. (ADR-002 §2).
 *
 * Todo pasa por la base con el actor de la sesión:
 * - `fn_hr_marcar` valida el QR contra `time_clocks` (el token ya no llega al
 *   navegador del empleado), pone la hora del servidor y guarda la ubicación
 *   solo con consentimiento vigente;
 * - `fn_hr_marcacion_manual` es la única vía para una hora elegida, exige
 *   `hr.attendance.manage` y, desde Marcación M0 (R1), crea un ajuste pendiente
 *   de aprobación: ya no inserta la marca directo.
 * Después de marcar se reclasifica el día con el motor de horas.
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { DatosMarcacion, TipoEvento } from '@/lib/hrm/jornada/marcacion';
import { MOTIVOS_INTENTO } from '@/lib/hrm/marcacion/metodos';
import { recalcularDia, type ResultadoRecalculo } from './jornadaService.server';
import { HrmError, errorDeRpc, esFechaPlana, esUuid, type ContextoPeticion } from './tipos';

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
  distancia_m?: number | null;
  /** La marca vale pero el jefe la revisa: sin ubicación, desde un computador o sin señal. */
  revisar?: 'sin_ubicacion' | 'computador_sin_qr' | 'fuera_de_linea' | null;
  /** Método exacto (Marcación M0): celular_ubicacion, qr, nfc_etiqueta o remoto. */
  metodo?: string;
  jornada?: ResultadoRecalculo | { estado: 'pendiente'; motivo: string };
  tardanza_justificada?: boolean;
}

function cliente() {
  return getServiceClient();
}

/**
 * Un rechazo de `fn_hr_marcar` deshace su transacción: el intento se guarda aparte
 * (`hr_marcacion_intentos`, 90 días) para En vivo y el antifraude. Nunca tumba la respuesta.
 */
async function registrarIntento(ctx: ContextoMarcacion, datos: DatosMarcacion, err: HrmError): Promise<void> {
  if (!MOTIVOS_INTENTO.has(err.code)) return;
  const distancia = /estás a (\d+) m/.exec(err.message)?.[1];
  try {
    await cliente().rpc('fn_hr_marcacion_intento', {
      p_actor: ctx.userId,
      p_org: ctx.organizationId,
      p_datos: { metodo: datos.metodo, remoto: datos.remoto ?? false, reloj_id: datos.reloj_id ?? null, dispositivo: datos.dispositivo ?? null },
      p_motivo: err.code,
      p_detalle: distancia ? { distancia_m: distancia } : {},
    });
  } catch {
    /* el intento es informativo */
  }
}

export async function marcar(ctx: ContextoMarcacion, datos: DatosMarcacion, peticion: ContextoPeticion): Promise<ResultadoMarcacion> {
  const { data, error } = await cliente().rpc('fn_hr_marcar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: datos,
    p_ip: peticion.ip,
    p_ua: peticion.userAgent,
  });
  if (error) {
    const e = errorDeRpc(error);
    await registrarIntento(ctx, datos, e);
    throw e;
  }
  const r = data as ResultadoMarcacion;
  // La marcación ya quedó; si la clasificación no se puede hacer ahora (un parámetro
  // por confirmar, una carrera), el día queda sin clasificar y no pasa a nómina.
  try {
    r.jornada = await recalcularDia(ctx, r.employment_id, r.fecha_trabajo);
  } catch (err) {
    r.jornada = { estado: 'pendiente', motivo: err instanceof HrmError ? err.code : 'error_hrm' };
  }
  // Llegada tarde con motivo (Figma 20.9.7): el motivo justifica la novedad de
  // tardanza que acaba de nacer al clasificar; el jefe la revisa antes de la nómina.
  if (r.tipo === 'check_in' && datos.nota?.motivo) {
    r.tardanza_justificada = await justificarTardanza(ctx, r.employment_id, r.fecha_trabajo, datos.nota);
  }
  return r;
}

async function justificarTardanza(
  ctx: ContextoMarcacion,
  vinculo: string,
  fecha: string,
  nota: NonNullable<DatosMarcacion['nota']>
): Promise<boolean> {
  const texto = [nota.motivo, nota.comentario].filter(Boolean).join(' · ').slice(0, 1000);
  if (texto.length < 5) return false;
  const { data } = await cliente()
    .from('hr_attendance_novelties')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('employment_id', vinculo)
    .eq('work_date', fecha)
    .eq('kind', 'tardanza')
    .in('status', ['pendiente', 'esperando_contraparte'])
    .limit(1)
    .maybeSingle();
  if (!data) return false;
  const { error } = await cliente().rpc('fn_hr_novedad_registrar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: { accion: 'justificar', novedad_id: (data as { id: string }).id, justificacion: texto },
  });
  return !error;
}

/** «Mi asistencia» (Figma 20.9.12): los días del rango con turno, marcas y horas. */
export async function miAsistencia(ctx: ContextoMarcacion, args: { desde: unknown; hasta: unknown }): Promise<Record<string, unknown>> {
  if (!esFechaPlana(args.desde) || !esFechaPlana(args.hasta) || args.hasta < args.desde) throw new HrmError(400, 'rango_invalido');
  const { data, error } = await cliente().rpc('fn_hr_mi_asistencia', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: args.desde,
    p_hasta: args.hasta,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
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
