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
  requiere_confirmacion?: boolean;
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
  args: { desde: unknown; hasta: unknown; vinculos?: unknown; aceptarAlertas?: unknown }
): Promise<Validacion> {
  const r = rango(args.desde, args.hasta);
  const { data, error } = await cliente().rpc('fn_hr_turnos_publicar', {
    p_actor: ctx.userId,
    p_org: ctx.organizationId,
    p_desde: r.desde,
    p_hasta: r.hasta,
    p_employments: vinculosValidos(args.vinculos),
    p_aceptar_alertas: args.aceptarAlertas === true,
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
