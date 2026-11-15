/**
 * Motor de aprobaciones de RR. HH. ADR-001 §8.
 *
 * Las decisiones van SOLO por `fn_hr_aprobacion_decidir` (transaccional, con
 * FOR UPDATE): comprueba que el actor sea aprobador del paso actual o su
 * delegado vigente, que no apruebe lo propio, registra la decisión y aplica la
 * consecuencia. Nunca se actualizan instancias ni pasos con updates sueltos.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { HrmError, errorDeRpc, esUuid } from './tipos';

export type ContextoAprobaciones = Pick<ServerOrgContext, 'supabase' | 'organizationId'>;

export type Decision = 'aprobar' | 'rechazar';

export interface ResultadoDecision {
  id: string;
  status: 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';
  current_step?: number;
  en_nombre_de?: string | null;
}

export interface AprobacionPendiente {
  instance_id: string;
  request_type: string;
  subject_table: string;
  subject_id: string;
  employment_id: string | null;
  requested_by: string | null;
  step_order: number;
  en_nombre_de: string | null;
  context: Record<string, unknown>;
  created_at: string;
}

export async function decidir(
  ctx: ContextoAprobaciones,
  instanciaId: string,
  decision: Decision,
  comentario?: string | null
): Promise<ResultadoDecision> {
  if (!esUuid(instanciaId)) throw new HrmError(400, 'solicitud_invalida');
  if (decision !== 'aprobar' && decision !== 'rechazar') throw new HrmError(422, 'decision_invalida');
  const { data, error } = await ctx.supabase.rpc('fn_hr_aprobacion_decidir', {
    p_instancia: instanciaId,
    p_decision: decision,
    p_comentario: typeof comentario === 'string' ? comentario.slice(0, 2000) : null,
  });
  if (error) throw errorDeRpc(error);
  return data as ResultadoDecision;
}

export async function cancelar(ctx: ContextoAprobaciones, instanciaId: string, motivo?: string | null): Promise<ResultadoDecision> {
  if (!esUuid(instanciaId)) throw new HrmError(400, 'solicitud_invalida');
  const { data, error } = await ctx.supabase.rpc('fn_hr_aprobacion_cancelar', {
    p_instancia: instanciaId,
    p_motivo: typeof motivo === 'string' ? motivo.slice(0, 2000) : null,
  });
  if (error) throw errorDeRpc(error);
  return data as ResultadoDecision;
}

/** Lo que el usuario de la sesión tiene que decidir, incluido lo que le llega por delegación. */
export async function pendientes(ctx: ContextoAprobaciones): Promise<AprobacionPendiente[]> {
  const { data, error } = await ctx.supabase.rpc('fn_hr_mis_aprobaciones_pendientes', { p_org: ctx.organizationId });
  if (error) throw errorDeRpc(error);
  return (data ?? []) as AprobacionPendiente[];
}
