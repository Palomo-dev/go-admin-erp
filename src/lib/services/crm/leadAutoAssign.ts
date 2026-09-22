import type { SupabaseClient } from '@supabase/supabase-js';
import { assignLead, AssignmentError, type AssignmentStrategy, type OpportunityFacts } from './assignmentService';
import { getLeadAssignmentConfig } from './leadAssignmentConfig';

/**
 * F1 — asignación automática de un lead recién creado.
 *
 * Envuelve `assignmentService.assignLead` (la ÚNICA implementación de las
 * estrategias, regla dura 7) con la configuración de la organización y una
 * garantía: **nunca lanza**. Un fallo de asignación produce `unassigned` con
 * motivo y un registro en el servidor, pero jamás impide el alta del lead.
 *
 * El resultado se devuelve al llamador para que lo escriba en el INSERT del
 * lead: así el lead nace ya asignado en una sola escritura, sin un UPDATE
 * posterior que pueda quedar a medias.
 */

export type LeadAssignmentOutcome =
  | { status: 'assigned'; user_id: string; strategy: AssignmentStrategy; team_id: string; reason: string }
  /** `salesperson_id` explícito en el cuerpo: se respeta, no se consulta ningún equipo. */
  | { status: 'explicit'; user_id: string }
  /** Asignación automática apagada por configuración de la organización. */
  | { status: 'skipped'; reason: string }
  | { status: 'unassigned'; reason: string };

/** Lo que produce la asignación automática (el `explicit` lo pone `leadCreateService`). */
export type AutoAssignOutcome = Exclude<LeadAssignmentOutcome, { status: 'explicit' }>;

export interface AutoAssignParams {
  organizationId: number;
  customerId: string;
  /** Solo si la oportunidad ya existe: `assignLead` la actualiza. */
  opportunityId?: string;
  /** Datos de la oportunidad que aún no existe (para la estrategia `territory`). */
  opportunityData?: OpportunityFacts;
}

/**
 * Resuelve el equipo sobre el que asignar: el configurado (validado contra la
 * organización de la sesión, nunca se confía en el id) o el primer equipo
 * activo de la organización. `null` si no hay ninguno.
 */
async function resolveTeamId(
  organizationId: number,
  configuredTeamId: string | null,
  supabase: SupabaseClient,
): Promise<{ teamId: string | null; reason?: string }> {
  if (configuredTeamId) {
    const { data, error } = await supabase
      .from('sales_teams')
      .select('id')
      .eq('id', configuredTeamId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return { teamId: null, reason: 'El equipo configurado no existe, está inactivo o no pertenece a la organización' };
    }
    return { teamId: (data as { id: string }).id };
  }

  const { data, error } = await supabase
    .from('sales_teams')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { teamId: null, reason: 'La organización no tiene equipos comerciales activos' };
  return { teamId: (data as { id: string }).id };
}

/**
 * Asigna automáticamente según la configuración de la organización.
 * Nunca lanza: cualquier error se convierte en `unassigned` con motivo.
 */
export async function autoAssignLead(
  params: AutoAssignParams,
  supabase: SupabaseClient,
): Promise<AutoAssignOutcome> {
  const { organizationId, customerId, opportunityId, opportunityData } = params;
  try {
    const config = await getLeadAssignmentConfig(organizationId, supabase);
    if (!config.enabled) {
      return { status: 'skipped', reason: 'La asignación automática está desactivada en la organización' };
    }

    const team = await resolveTeamId(organizationId, config.team_id, supabase);
    if (!team.teamId) return { status: 'unassigned', reason: team.reason ?? 'Sin equipo' };

    const result = await assignLead(
      { organizationId, customerId, opportunityId, strategy: config.strategy, teamId: team.teamId, opportunityData },
      supabase,
    );
    return {
      status: 'assigned',
      user_id: result.userId,
      strategy: config.strategy,
      team_id: team.teamId,
      reason: result.assignmentReason,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof AssignmentError) {
      return { status: 'unassigned', reason: message };
    }
    console.error('[leadAutoAssign] fallo inesperado asignando el lead (org %s): %s', organizationId, message);
    return { status: 'unassigned', reason: `No se pudo asignar automáticamente: ${message}` };
  }
}
