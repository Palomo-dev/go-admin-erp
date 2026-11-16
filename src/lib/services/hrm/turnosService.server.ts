/**
 * Turnos de RR. HH.: validar y publicar la planeación, y generar borradores
 * desde una rotación (ADR-002 §2).
 *
 * Los cruces del mismo empleado los rechaza la base al guardar (23P01). Antes de
 * publicar, `fn_hr_turnos_validar` devuelve bloqueos (cruces, turnos sobre una
 * ausencia) y alertas (jornada semanal, extra planeada por encima de 2 h/día o
 * 12 h/semana, semana sin descanso y día de descanso trabajado).
 */
import { getServiceClient } from '@/lib/supabase/server-service';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esFechaPlana, esUuid } from './tipos';

export type ContextoTurnos = Pick<ServerOrgContext, 'userId' | 'organizationId'>;

export interface Hallazgo {
  codigo: string;
  employment_id: string;
  fechas?: string[];
  semana?: string;
  asignaciones?: string[];
  [k: string]: unknown;
}

export interface Validacion {
  bloqueos: Hallazgo[];
  alertas: Hallazgo[];
  publicado?: boolean;
  publicados?: number;
  novedades?: number;
  requiere_confirmacion?: boolean;
  requiere_motivo?: boolean;
}

function cliente() {
  return getServiceClient();
}

function vinculosValidos(v: unknown): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v) || v.length === 0 || v.length > 500 || !v.every(esUuid)) throw new HrmError(400, 'vinculos_invalidos');
  return v as string[];
}

function rango(desde: unknown, hasta: unknown): { desde: string; hasta: string } {
  if (!esFechaPlana(desde) || !esFechaPlana(hasta) || hasta < desde) throw new HrmError(400, 'rango_invalido');
  return { desde, hasta };
}

export async function validar(ctx: ContextoTurnos, args: { desde: unknown; hasta: unknown; vinculos?: unknown }): Promise<Validacion> {
  const r = rango(args.desde, args.hasta);
  const { data, error } = await cliente().rpc('fn_hr_turnos_validar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: r.desde,
    p_hasta: r.hasta,
    p_employments: vinculosValidos(args.vinculos),
  });
  if (error) throw errorDeRpc(error);
  return data as Validacion;
}

export async function publicar(
  ctx: ContextoTurnos,
  args: { desde: unknown; hasta: unknown; vinculos?: unknown; aceptarAlertas?: unknown; motivo?: unknown }
): Promise<Validacion> {
  const r = rango(args.desde, args.hasta);
  // Decisión 4: superar un tope deja publicar, con motivo; el motivo viaja a la novedad.
  const motivo = typeof args.motivo === 'string' ? args.motivo.trim().slice(0, 1000) : '';
  const { data, error } = await cliente().rpc('fn_hr_turnos_publicar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: r.desde,
    p_hasta: r.hasta,
    p_employments: vinculosValidos(args.vinculos),
    p_aceptar_alertas: args.aceptarAlertas === true,
    p_motivo: motivo || null,
  });
  if (error) throw errorDeRpc(error);
  return data as Validacion;
}

export async function aplicarRotacion(
  ctx: ContextoTurnos,
  rotacionId: string,
  args: { desde: unknown; hasta: unknown; vinculos: unknown; desfase?: unknown }
): Promise<{ creados: number; omitidos: Array<{ employment_id: string; fecha: string; motivo: string }> }> {
  if (!esUuid(rotacionId)) throw new HrmError(400, 'rotacion_invalida');
  const r = rango(args.desde, args.hasta);
  const vinculos = vinculosValidos(args.vinculos);
  if (!vinculos) throw new HrmError(400, 'vinculos_invalidos');
  const desfase = typeof args.desfase === 'number' && Number.isInteger(args.desfase) ? args.desfase : 0;
  const { data, error } = await cliente().rpc('fn_hr_rotacion_aplicar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_rotacion: rotacionId,
    p_employments: vinculos,
    p_desde: r.desde,
    p_hasta: r.hasta,
    p_desfase: desfase,
  });
  if (error) throw errorDeRpc(error);
  return data as { creados: number; omitidos: Array<{ employment_id: string; fecha: string; motivo: string }> };
}

// ─── Pantalla de Turnos (Figma 20.8) ─────────────────────────────────────────

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Programación de un rango: el gestor ve borradores; el jefe, lo publicado de su equipo. */
export async function semana(ctx: ContextoTurnos, args: { desde: unknown; hasta: unknown; sede?: unknown }): Promise<Record<string, unknown>> {
  const r = rango(args.desde, args.hasta);
  const sede = typeof args.sede === 'number' && Number.isInteger(args.sede) && args.sede > 0 ? args.sede : null;
  const { data, error } = await cliente().rpc('fn_hr_turnos_semana', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: r.desde,
    p_hasta: r.hasta,
    p_sede: sede,
  });
  if (error) throw errorDeRpc(error);
  return (data ?? {}) as Record<string, unknown>;
}

/** Crea o cambia el turno de una persona en un día; siempre queda en borrador. */
export async function guardarTurno(ctx: ContextoTurnos, datos: unknown): Promise<{ id: string }> {
  if (!datos || typeof datos !== 'object') throw new HrmError(400, 'datos_invalidos');
  const d = datos as Record<string, unknown>;
  if (!esUuid(d.employment_id) || !esFechaPlana(d.fecha)) throw new HrmError(400, 'datos_invalidos');
  const libre = d.dia_descanso === true;
  const plantilla = d.plantilla_id === undefined || d.plantilla_id === null || d.plantilla_id === '' ? null : d.plantilla_id;
  if (plantilla !== null && !esUuid(plantilla)) throw new HrmError(400, 'plantilla_invalida');
  const inicio = typeof d.hora_inicio === 'string' && HORA_RE.test(d.hora_inicio) ? d.hora_inicio : null;
  const fin = typeof d.hora_fin === 'string' && HORA_RE.test(d.hora_fin) ? d.hora_fin : null;
  if (!libre && !plantilla && (!inicio || !fin)) throw new HrmError(422, 'turno_sin_horario');
  const descanso = typeof d.descanso_min === 'number' && Number.isInteger(d.descanso_min) ? d.descanso_min : null;
  const { data, error } = await cliente().rpc('fn_hr_turno_guardar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_datos: {
      employment_id: d.employment_id,
      fecha: d.fecha,
      plantilla_id: libre ? null : plantilla,
      hora_inicio: libre ? null : inicio,
      hora_fin: libre ? null : fin,
      descanso_min: libre ? null : descanso,
      dia_descanso: libre,
    },
  });
  if (error) throw errorDeRpc(error);
  return data as { id: string };
}

export async function quitarTurno(ctx: ContextoTurnos, id: string): Promise<{ id: string; resultado: 'borrado' | 'cancelado' }> {
  if (!esUuid(id)) throw new HrmError(400, 'turno_invalido');
  const { data, error } = await cliente().rpc('fn_hr_turno_quitar', { p_actor: ctx.userId, p_org: ctx.organizationId, p_id: id });
  if (error) throw errorDeRpc(error);
  return data as { id: string; resultado: 'borrado' | 'cancelado' };
}

/** Copia los turnos de un rango a otro como borrador, sin pisar lo que ya existe. */
export async function copiarSemana(
  ctx: ContextoTurnos,
  args: { origen: unknown; destino: unknown; dias?: unknown; sede?: unknown }
): Promise<{ creados: number; omitidos: Array<{ employment_id: string; fecha: string; motivo: string }> }> {
  if (!esFechaPlana(args.origen) || !esFechaPlana(args.destino) || args.origen === args.destino) throw new HrmError(400, 'rango_invalido');
  const dias = typeof args.dias === 'number' && Number.isInteger(args.dias) && args.dias >= 1 && args.dias <= 42 ? args.dias : 7;
  const sede = typeof args.sede === 'number' && Number.isInteger(args.sede) && args.sede > 0 ? args.sede : null;
  const { data, error } = await cliente().rpc('fn_hr_turnos_copiar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_origen: args.origen,
    p_destino: args.destino,
    p_dias: dias,
    p_sede: sede,
  });
  if (error) throw errorDeRpc(error);
  return data as { creados: number; omitidos: Array<{ employment_id: string; fecha: string; motivo: string }> };
}

/** Cambia los horarios de dos personas el mismo día (cada una conserva su fila). */
export async function intercambiar(ctx: ContextoTurnos, a: unknown, b: unknown): Promise<{ a: string; b: string }> {
  if (!esUuid(a) || !esUuid(b) || a === b) throw new HrmError(400, 'turno_invalido');
  const { data, error } = await cliente().rpc('fn_hr_turnos_intercambiar', { p_actor: ctx.userId, p_org: ctx.organizationId, p_a: a, p_b: b });
  if (error) throw errorDeRpc(error);
  return data as { a: string; b: string };
}

/** Deshace la última publicación propia del rango (hasta 10 minutos después). */
export async function deshacerPublicacion(ctx: ContextoTurnos, args: { desde: unknown; hasta: unknown }): Promise<{ deshechos: number }> {
  const r = rango(args.desde, args.hasta);
  const { data, error } = await cliente().rpc('fn_hr_turnos_deshacer', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: r.desde,
    p_hasta: r.hasta,
  });
  if (error) throw errorDeRpc(error);
  return data as { deshechos: number };
}
