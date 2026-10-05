import type { SupabaseClient } from '@supabase/supabase-js';
import { type ICPOperator } from './icpService';
import { matchingTerritories, type AssignmentTerritory } from './territoryAssignment';

/**
 * Servicio CRM - Motor de asignación automática de leads.
 * Tablas: sales_teams, sales_team_members, territories, opportunities, customers
 *
 * Estrategias:
 *  - round_robin: rota al siguiente miembro activo del team
 *  - territory:   evalúa territories.criteria contra el customer y asigna al responsable
 *  - load_balance: asigna al miembro con menos oportunidades abiertas + leads activos (ola 1)
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type AssignmentStrategy = 'round_robin' | 'territory' | 'load_balance';

export interface AssignmentParams {
  organizationId: number;
  customerId: string;
  opportunityId?: string;
  strategy: AssignmentStrategy;
  teamId?: string;
  /**
   * Datos de la oportunidad cuando AÚN no existe (alta de lead, F1): la
   * estrategia `territory` los usa en vez de leer `opportunities`.
   */
  opportunityData?: OpportunityFacts;
  /** Read-only simulation advances the same canonical rotation/load counters. */
  simulation?: AssignmentSimulationState;
  customerData?: Record<string, unknown>;
}

/** Campos de `opportunities` que evalúan los criterios de territorio. */
export interface OpportunityFacts {
  amount?: number | null;
  currency?: string | null;
  deal_type?: string | null;
}

export interface AssignmentSimulationState {
  lastUserId?: string | null;
  loads?: Record<string, number>;
  fallbackCount: number;
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
    throw new AssignmentError(error.message);
  }

  const members = (data || []) as { user_id: string; sales_role_id: string | null; created_at: string }[];
  if (members.length === 0) return members;

  // Tenencia (tester F1, 2026-09-21): `sales_team_members.user_id` referencia
  // `profiles`, no `organization_members`, y la RLS `stm_insert` solo mira
  // `organization_id`. Una fila con un usuario ajeno a la organización no
  // recibe leads: el camino explícito ya lo rechaza con 400, este no puede
  // «corregirlo» en silencio.
  const { data: pertenencia, error: errorPertenencia } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('is_active', true) // un miembro desactivado de la organización no recibe leads
    .in('user_id', members.map((m) => m.user_id));
  if (errorPertenencia) {
    console.warn('assignmentService.getActiveTeamMembers - pertenencia:', errorPertenencia.message);
    throw new AssignmentError(errorPertenencia.message);
  }
  const propios = new Set(((pertenencia || []) as { user_id: string }[]).map((m) => m.user_id));
  return members.filter((m) => propios.has(m.user_id));
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
  supabase: SupabaseClient,
  simulation?: AssignmentSimulationState,
): Promise<AssignmentResult> {
  const memberUserIds = members.map((m) => m.user_id);

  if (simulation && 'lastUserId' in simulation) {
    const index = memberUserIds.indexOf(simulation.lastUserId ?? '');
    const next = (index + 1) % members.length;
    return { userId: members[next].user_id, assignmentReason: 'round_robin' };
  }

  // Buscar la oportunidad más reciente asignada a algún miembro del team
  const { data: lastOpp, error } = await supabase
    .from('opportunities')
    .select('salesperson_id, created_at')
    .eq('organization_id', orgId)
    .in('salesperson_id', memberUserIds)
    .not('salesperson_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AssignmentError(error.message);
  }

  // CRM ola 1 (D2): un lead ya no crea oportunidad; su responsable vive en
  // `customers.owner_id`. La rotación mira también el último lead asignado a un
  // miembro del team (por `updated_at`, que el alta del lead escribe al
  // asignarlo) y se queda con el más reciente de los dos.
  const { data: lastLead, error: leadError } = await supabase
    .from('customers')
    .select('owner_id, updated_at')
    .eq('organization_id', orgId)
    .in('owner_id', memberUserIds)
    .not('lead_source', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (leadError) {
    throw new AssignmentError(leadError.message);
  }

  const opp = lastOpp as { salesperson_id: string | null; created_at: string | null } | null;
  const lead = lastLead as { owner_id: string | null; updated_at: string | null } | null;
  const lastUserId =
    lead?.owner_id && (!opp?.salesperson_id || String(lead.updated_at ?? '') > String(opp.created_at ?? ''))
      ? lead.owner_id
      : opp?.salesperson_id;
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
  supabase: SupabaseClient,
  opportunityFacts?: OpportunityFacts,
  simulation?: AssignmentSimulationState,
  suppliedCustomer?: Record<string, unknown>,
): Promise<AssignmentResult> {
  const { data, error } = await supabase.from('territories')
    .select('id,name,criteria,sort_order').eq('organization_id', orgId)
    .eq('is_active', true).order('sort_order').order('id');
  if (error) throw new AssignmentError(error.message);
  const customer = suppliedCustomer ?? await loadCustomerData(orgId, customerId, supabase);
  if (!customer) throw new AssignmentError('Customer no encontrado');
  // The segment context includes consent/purchases/derived fields; legacy ICP keeps its facts.
  let context = customer;
  if ((data ?? []).some((territory) => territory.criteria?.filter) && !suppliedCustomer) {
    const result = await supabase.rpc('crm_segment_context_page', {
      p_org: orgId, p_customers: [customerId], p_limit: 1,
    });
    if (result.error) throw new AssignmentError(result.error.message);
    if (!Array.isArray(result.data) || !result.data[0]) throw new AssignmentError('Customer no encontrado');
    context = { ...customer, ...result.data[0] };
  }
  const facts = opportunityFacts ?? await loadOpportunityData(orgId, opportunityId, supabase);
  const territory = matchingTerritories((data ?? []) as AssignmentTerritory[], context, { ...facts }, orgId, new Date())[0];
  const responsible = territory?.criteria.assigned_user_id;
  if (typeof responsible === 'string' && members.some((member) => member.user_id === responsible)) {
    return { userId: responsible, assignmentReason: `territory: "${territory!.name}" → user asignado directamente` };
  }
  if (simulation) simulation.fallbackCount++;
  const fallback = await assignRoundRobin(orgId, teamId, members, supabase, simulation);
  return { ...fallback, assignmentReason: territory ? `territory: "${territory.name}" sin responsable válido → ${fallback.assignmentReason}` : `territory: ${(data ?? []).length ? 'sin match' : 'sin territorios'} → ${fallback.assignmentReason}` };
}

/**
 * Load-balance: asigna al miembro con menos oportunidades abiertas.
 */
async function assignLoadBalance(
  orgId: number,
  members: { user_id: string }[],
  supabase: SupabaseClient,
  simulation?: AssignmentSimulationState,
): Promise<AssignmentResult> {
  if (simulation?.loads) {
    const selected = [...members].sort((a, b) => simulation.loads![a.user_id] - simulation.loads![b.user_id])[0];
    return { userId: selected.user_id, assignmentReason: 'load_balance' };
  }
  const counts = await Promise.all(
    members.map(async (m) => {
      const { count, error } = await supabase
        .from('opportunities')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('salesperson_id', m.user_id)
        .eq('status', 'open');

      if (error) {
        throw new AssignmentError(error.message);
      }

      // CRM ola 1 (D2): los leads activos (clientes en etapa lead con origen y
      // sin descartar) también son carga del vendedor.
      const { count: leads, error: leadError } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('owner_id', m.user_id)
        .eq('lifecycle_stage', 'lead')
        .not('lead_source', 'is', null)
        .is('lead_discarded_at', null);

      if (leadError) {
        throw new AssignmentError(leadError.message);
      }

      return { userId: m.user_id, count: (count ?? 0) + (leads ?? 0) };
    })
  );

  if (simulation) simulation.loads = Object.fromEntries(counts.map((row) => [row.userId, row.count]));

  // Ordenar por menor carga, desempate por orden de membresía (estable)
  counts.sort((a, b) => a.count - b.count);

  const assigned = counts[0];

  return {
    userId: assigned.userId,
    assignmentReason: `load_balance: ${assigned.count} oportunidades abiertas y leads activos (menor carga del team)`,
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
  const { organizationId, customerId, opportunityId, strategy, teamId, opportunityData } = params;

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
      result = await assignRoundRobin(organizationId, teamIdResolved, members, supabase, params.simulation);
      break;

    case 'territory':
      result = await assignTerritory(
        organizationId,
        teamIdResolved,
        customerId,
        opportunityId,
        members,
        supabase,
        opportunityData, params.simulation, params.customerData,
      );
      break;

    case 'load_balance':
      result = await assignLoadBalance(organizationId, members, supabase, params.simulation);
      break;

    default:
      throw new AssignmentError(`Estrategia no soportada: ${strategy}`);
  }

  if (params.simulation) {
    params.simulation.lastUserId = result.userId;
    if (params.simulation.loads) params.simulation.loads[result.userId]++;
  }

  // ── Persistir asignación en la oportunidad (si se proporcionó opportunityId) ──
  if (opportunityId && !params.simulation) {
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
