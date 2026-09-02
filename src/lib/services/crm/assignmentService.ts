import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluateICPCriteria, type ICPCriterion, type ICPOperator } from './icpService';

/**
 * Servicio CRM - Motor de asignación automática de leads.
 * Tablas: sales_teams, sales_team_members, territories, opportunities, customers
 *
 * Estrategias:
 *  - round_robin: rota al siguiente miembro activo del team
 *  - territory:   evalúa territories.criteria contra el customer y asigna al responsable
 *  - load_balance: asigna al miembro con menos oportunidades abiertas
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AssignmentStrategy = 'round_robin' | 'territory' | 'load_balance';

export interface AssignmentParams {
  organizationId: number;
  customerId: string;
  opportunityId?: string;
  strategy: AssignmentStrategy;
  teamId?: string;
}

export interface AssignmentResult {
  userId: string;
  assignmentReason: string;
}

/**
 * Estructura esperada dentro de territories.criteria (jsonb).
 * - rules: array de criterios con el mismo formato que icp_criteria
 * - assigned_user_id: user responsable del territorio (opcional)
 */
export interface TerritoryCriteria {
  rules?: Array<{
    field_key: string;
    operator: ICPOperator;
    value: unknown;
    weight?: number;
    is_required?: boolean;
  }>;
  assigned_user_id?: string;
}

// ─── Errores ─────────────────────────────────────────────────────────────────

export class AssignmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssignmentError';
  }
}

// ─── Funciones internas ──────────────────────────────────────────────────────

/**
 * Obtiene los miembros activos de un team, ordenados por created_at ASC.
 */
async function getActiveTeamMembers(
  orgId: number,
  teamId: string,
  supabase: SupabaseClient
): Promise<{ user_id: string; sales_role_id: string | null }[]> {
  const { data, error } = await supabase
    .from('sales_team_members')
    .select('user_id, sales_role_id, created_at')
    .eq('organization_id', orgId)
    .eq('sales_team_id', teamId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('assignmentService.getActiveTeamMembers - error:', error.message);
    return [];
  }

  return (data || []) as { user_id: string; sales_role_id: string | null; created_at: string }[];
}

/**
 * Carga los datos del customer necesarios para evaluar criteria de territorio.
 * Mismos campos que usa icpService.evaluateICP.
 */
async function loadCustomerData(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('company_size, branches_count, current_software, lifecycle_stage, city, vertical_id')
    .eq('id', customerId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) {
    console.warn('assignmentService.loadCustomerData - customer not found:', customerId);
    return null;
  }

  return data as Record<string, unknown>;
}

/**
 * Carga los datos de la oportunidad (si se proporciona opportunityId).
 */
async function loadOpportunityData(
  orgId: number,
  opportunityId: string | undefined,
  supabase: SupabaseClient
): Promise<Record<string, unknown>> {
  if (!opportunityId) return {};

  const { data, error } = await supabase
    .from('opportunities')
    .select('amount, currency, deal_type')
    .eq('id', opportunityId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) {
    console.warn('assignmentService.loadOpportunityData - opportunity not found:', opportunityId);
    return {};
  }

  return data as Record<string, unknown>;
}

// ─── Estrategias ─────────────────────────────────────────────────────────────

/**
 * Round-robin: busca el último salesperson asignado dentro del team
 * y rota al siguiente miembro activo.
 */
async function assignRoundRobin(
  orgId: number,
  teamId: string,
  members: { user_id: string }[],
  supabase: SupabaseClient
): Promise<AssignmentResult> {
  const memberUserIds = members.map((m) => m.user_id);

  // Buscar la oportunidad más reciente asignada a algún miembro del team
  const { data: lastOpp, error } = await supabase
    .from('opportunities')
    .select('salesperson_id')
    .eq('organization_id', orgId)
    .in('salesperson_id', memberUserIds)
    .not('salesperson_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('assignmentService.assignRoundRobin - last assigned error:', error.message);
  }

  const lastUserId = (lastOpp as { salesperson_id: string | null } | null)?.salesperson_id;
  let nextIdx = 0;

  if (lastUserId) {
    const lastIdx = memberUserIds.indexOf(lastUserId);
    nextIdx = lastIdx >= 0 ? (lastIdx + 1) % members.length : 0;
  }

  const assignedUser = members[nextIdx].user_id;

  return {
    userId: assignedUser,
    assignmentReason: `round_robin: índice ${nextIdx} de ${members.length} miembros`,
  };
}

/**
 * Territory: evalúa territories.criteria contra el customer usando el mismo
 * motor de criteria que icpService. Asigna al user responsable del territorio
 * (criteria.assigned_user_id) si es miembro activo del team; si no, fallback
 * a round_robin dentro del team.
 */
async function assignTerritory(
  orgId: number,
  teamId: string,
  customerId: string,
  opportunityId: string | undefined,
  members: { user_id: string }[],
  supabase: SupabaseClient
): Promise<AssignmentResult> {
  // 1. Cargar territories activas de la org
  const { data: territories, error } = await supabase
    .from('territories')
    .select('id, name, criteria')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error || !territories || territories.length === 0) {
    console.warn('assignmentService.assignTerritory - no territories found:', error?.message);
    // Fallback a round_robin
    const fallback = await assignRoundRobin(orgId, teamId, members, supabase);
    return {
      ...fallback,
      assignmentReason: `territory: sin territorios → ${fallback.assignmentReason}`,
    };
  }

  // 2. Cargar datos del customer y oportunidad
  const customerData = await loadCustomerData(orgId, customerId, supabase);
  if (!customerData) {
    throw new AssignmentError(`Customer no encontrado: ${customerId}`);
  }

  const opportunityData = await loadOpportunityData(orgId, opportunityId, supabase);

  // 3. Evaluar cada territorio y quedarse con el de mayor fit_score que matchee
  let bestTerritory: { id: string; name: string; assigned_user_id?: string; fitScore: number } | null = null;

  for (const t of territories as { id: string; name: string; criteria: TerritoryCriteria }[]) {
    const criteria = t.criteria || {};
    const rules = criteria.rules || [];

    if (rules.length === 0) continue;

    // Adaptar rules al formato ICPCriterion que espera evaluateICPCriteria
    const icpCriteria: ICPCriterion[] = rules.map((r, idx) => ({
      id: `territory-${t.id}-${idx}`,
      organization_id: orgId,
      icp_profile_id: t.id,
      field_key: r.field_key,
      operator: r.operator,
      value: r.value,
      weight: r.weight ?? 1,
      is_required: r.is_required ?? false,
      created_at: '',
      updated_at: '',
    }));

    const result = evaluateICPCriteria(icpCriteria, customerData, opportunityData);

    if (result.matched && (!bestTerritory || result.fit_score > bestTerritory.fitScore)) {
      bestTerritory = {
        id: t.id,
        name: t.name,
        assigned_user_id: criteria.assigned_user_id,
        fitScore: result.fit_score,
      };
    }
  }

  // 4. Si no hay territorio que matchee → fallback round_robin
  if (!bestTerritory) {
    const fallback = await assignRoundRobin(orgId, teamId, members, supabase);
    return {
      ...fallback,
      assignmentReason: `territory: sin match → ${fallback.assignmentReason}`,
    };
  }

  // 5. Si el territorio tiene assigned_user_id y es miembro activo del team → asignar
  const memberUserIds = new Set(members.map((m) => m.user_id));

  if (bestTerritory.assigned_user_id && memberUserIds.has(bestTerritory.assigned_user_id)) {
    return {
      userId: bestTerritory.assigned_user_id,
      assignmentReason: `territory: "${bestTerritory.name}" (fit ${bestTerritory.fitScore}%) → user asignado directamente`,
    };
  }

  // 6. Si no hay assigned_user_id o no es miembro del team → fallback round_robin
  const fallback = await assignRoundRobin(orgId, teamId, members, supabase);
  return {
    ...fallback,
    assignmentReason: `territory: "${bestTerritory.name}" matcheó (fit ${bestTerritory.fitScore}%) pero sin responsable válido → ${fallback.assignmentReason}`,
  };
}

/**
 * Load-balance: asigna al miembro con menos oportunidades abiertas.
 */
async function assignLoadBalance(
  orgId: number,
  members: { user_id: string }[],
  supabase: SupabaseClient
): Promise<AssignmentResult> {
  const counts = await Promise.all(
    members.map(async (m) => {
      const { count, error } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('salesperson_id', m.user_id)
        .eq('status', 'open');

      if (error) {
        console.warn('assignmentService.assignLoadBalance - count error for', m.user_id, error.message);
      }

      return { userId: m.user_id, count: count ?? 0 };
    })
  );

  // Ordenar por menor carga, desempate por orden de membresía (estable)
  counts.sort((a, b) => a.count - b.count);

  const assigned = counts[0];

  return {
    userId: assigned.userId,
    assignmentReason: `load_balance: ${assigned.count} oportunidades abiertas (menor carga del team)`,
  };
}

// ─── Función principal ───────────────────────────────────────────────────────

/**
 * Asigna un lead automáticamente según la estrategia indicada.
 *
 * @param params.organizationId   ID numérico de la organización
 * @param params.customerId       UUID del customer
 * @param params.opportunityId    UUID de la opportunity (opcional, se actualiza si se pasa)
 * @param params.strategy         Estrategia de asignación
 * @param params.teamId           UUID del sales_team (requerido para round_robin y territory)
 * @param supabase                Cliente Supabase inyectado
 * @returns { userId, assignmentReason }
 * @throws AssignmentError si no hay team, miembros, o customer no encontrado
 */
export async function assignLead(
  params: AssignmentParams,
  supabase: SupabaseClient
): Promise<AssignmentResult> {
  const { organizationId, customerId, opportunityId, strategy, teamId } = params;

  // ── Validar teamId para estrategias que lo requieren ──
  if (!teamId && strategy !== 'load_balance') {
    throw new AssignmentError(`Estrategia "${strategy}" requiere teamId`);
  }

  // ── Si load_balance sin teamId, buscar miembros activos de toda la org ──
  let teamIdResolved = teamId;

  if (!teamIdResolved) {
    // Para load_balance sin team específico, usar cualquier team activo de la org
    const { data: team, error: teamError } = await supabase
      .from('sales_teams')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (teamError || !team) {
      throw new AssignmentError('No hay teams activos en la organización');
    }

    teamIdResolved = (team as { id: string }).id;
  }

  // ── Obtener miembros activos del team ──
  const members = await getActiveTeamMembers(organizationId, teamIdResolved, supabase);

  if (members.length === 0) {
    throw new AssignmentError(`No hay miembros activos en el team ${teamIdResolved}`);
  }

  // ── Ejecutar estrategia ──
  let result: AssignmentResult;

  switch (strategy) {
    case 'round_robin':
      result = await assignRoundRobin(organizationId, teamIdResolved, members, supabase);
      break;

    case 'territory':
      result = await assignTerritory(
        organizationId,
        teamIdResolved,
        customerId,
        opportunityId,
        members,
        supabase
      );
      break;

    case 'load_balance':
      result = await assignLoadBalance(organizationId, members, supabase);
      break;

    default:
      throw new AssignmentError(`Estrategia no soportada: ${strategy}`);
  }

  // ── Persistir asignación en la oportunidad (si se proporcionó opportunityId) ──
  if (opportunityId) {
    const { error: updateError } = await supabase
      .from('opportunities')
      .update({
        salesperson_id: result.userId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', opportunityId)
      .eq('organization_id', organizationId);

    if (updateError) {
      console.warn('assignmentService.assignLead - error persistiendo asignación:', updateError.message);
    }
  }

  return result;
}
