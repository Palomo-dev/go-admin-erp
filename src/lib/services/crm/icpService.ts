import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Motor de evaluación ICP (Ideal Customer Profile).
 * Tablas: icp_profiles, icp_criteria
 * Columnas adicionales: customers.company_size, customers.branches_count,
 *   customers.current_software, customers.lifecycle_stage,
 *   opportunities.icp_band, opportunities.icp_fit_score
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ICPOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'starts_with';

export type ICPFieldKey =
  | 'customers.company_size'
  | 'customers.branches_count'
  | 'customers.current_software'
  | 'customers.lifecycle_stage'
  | 'customers.city'
  | 'customers.vertical_id'
  | 'opportunities.amount'
  | 'opportunities.currency'
  | 'opportunities.deal_type';

/** Catálogo de field_keys permitidos para validación. */
export const ALLOWED_FIELD_KEYS: ICPFieldKey[] = [
  'customers.company_size',
  'customers.branches_count',
  'customers.current_software',
  'customers.lifecycle_stage',
  'customers.city',
  'customers.vertical_id',
  'opportunities.amount',
  'opportunities.currency',
  'opportunities.deal_type',
];

/** Operadores válidos. */
export const ALLOWED_OPERATORS: ICPOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'not_in',
  'contains',
  'starts_with',
];

export interface ICPCriterion {
  id: string;
  organization_id: number;
  icp_profile_id: string;
  field_key: string;
  operator: ICPOperator;
  value: unknown;
  weight: number;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

export interface ICPProfile {
  id: string;
  organization_id: number;
  name: string;
  band: string;
  description: string | null;
  priority: number;
  color: string;
  sla_first_contact_hours: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  criteria?: ICPCriterion[];
}

export interface ICPProfileInput {
  name: string;
  band: string;
  description?: string | null;
  priority?: number;
  color?: string;
  sla_first_contact_hours?: number;
  is_active?: boolean;
  criteria?: ICPCriterionInput[];
}

export interface ICPProfileUpdateInput {
  name?: string;
  band?: string;
  description?: string | null;
  priority?: number;
  color?: string;
  sla_first_contact_hours?: number;
  is_active?: boolean;
}

export interface ICPCriterionInput {
  field_key: ICPFieldKey;
  operator: ICPOperator;
  value: unknown;
  weight?: number;
  is_required?: boolean;
}

export interface ICPEvaluationResult {
  profile_id: string;
  profile_name: string;
  band: string;
  fit_score: number;
  matched: boolean;
  failed_required: string[];
  details: {
    field_key: string;
    operator: ICPOperator;
    expected: unknown;
    actual: unknown;
    passed: boolean;
    weight: number;
    is_required: boolean;
  }[];
}

export interface ICPAssignmentResult {
  customer_id: string;
  assigned_band: string | null;
  best_profile_id: string | null;
  fit_score: number;
  evaluations: ICPEvaluationResult[];
}

// ─── Datos de cliente/oportunidad para evaluación ────────────────────────────

interface CustomerData {
  company_size?: string | null;
  branches_count?: number | null;
  current_software?: string | null;
  lifecycle_stage?: string | null;
  city?: string | null;
  vertical_id?: string | null;
}

interface OpportunityData {
  amount?: number | null;
  currency?: string | null;
  deal_type?: string | null;
}

// ─── Utilidades de validación ────────────────────────────────────────────────

function isValidFieldKey(key: string): key is ICPFieldKey {
  return ALLOWED_FIELD_KEYS.includes(key as ICPFieldKey);
}

function isValidOperator(op: string): op is ICPOperator {
  return ALLOWED_OPERATORS.includes(op as ICPOperator);
}

/**
 * Extrae el valor real de un campo desde los datos del cliente u oportunidad.
 * El field_key tiene formato "tabla.columna".
 */
function getFieldValue(
  fieldKey: string,
  customerData: CustomerData,
  opportunityData: OpportunityData
): unknown {
  const [table, column] = fieldKey.split('.');

  if (table === 'customers') {
    switch (column) {
      case 'company_size':
        return customerData.company_size ?? null;
      case 'branches_count':
        return customerData.branches_count ?? null;
      case 'current_software':
        return customerData.current_software ?? null;
      case 'lifecycle_stage':
        return customerData.lifecycle_stage ?? null;
      case 'city':
        return customerData.city ?? null;
      case 'vertical_id':
        return customerData.vertical_id ?? null;
      default:
        return null;
    }
  }

  if (table === 'opportunities') {
    switch (column) {
      case 'amount':
        return opportunityData.amount ?? null;
      case 'currency':
        return opportunityData.currency ?? null;
      case 'deal_type':
        return opportunityData.deal_type ?? null;
      default:
        return null;
    }
  }

  return null;
}

/**
 * Compara un valor real contra un valor esperado usando el operador indicado.
 * Soporta strings, números y arrays.
 */
function compareValues(
  actual: unknown,
  operator: ICPOperator,
  expected: unknown
): boolean {
  // Si el valor real es null/undefined, solo eq con null podría pasar
  if (actual === null || actual === undefined) {
    return false;
  }

  const actualNum = typeof actual === 'string' ? parseFloat(actual) : (actual as number);
  const expectedNum = typeof expected === 'string' ? parseFloat(expected) : (expected as number);

  switch (operator) {
    case 'eq':
      // Comparación string o número
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase() === expected.toLowerCase();
      }
      return actual === expected;

    case 'neq':
      if (typeof actual === 'string' && typeof expected === 'string') {
        return actual.toLowerCase() !== expected.toLowerCase();
      }
      return actual !== expected;

    case 'gt':
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum > expectedNum;

    case 'gte':
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum >= expectedNum;

    case 'lt':
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum < expectedNum;

    case 'lte':
      return !isNaN(actualNum) && !isNaN(expectedNum) && actualNum <= expectedNum;

    case 'in': {
      const expectedArr = Array.isArray(expected) ? expected : [expected];
      const actualStr = String(actual).toLowerCase();
      return expectedArr.some((e) => String(e).toLowerCase() === actualStr);
    }

    case 'not_in': {
      const expectedArr = Array.isArray(expected) ? expected : [expected];
      const actualStr = String(actual).toLowerCase();
      return !expectedArr.some((e) => String(e).toLowerCase() === actualStr);
    }

    case 'contains': {
      if (typeof actual !== 'string') return false;
      const expectedStr = String(expected);
      return actual.toLowerCase().includes(expectedStr.toLowerCase());
    }

    case 'starts_with': {
      if (typeof actual !== 'string') return false;
      const expectedStr = String(expected);
      return actual.toLowerCase().startsWith(expectedStr.toLowerCase());
    }

    default:
      return false;
  }
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Obtiene todos los ICP profiles activos de una organización con sus criteria.
 */
export async function getICPProfiles(
  organizationId: number,
  supabase: SupabaseClient
): Promise<ICPProfile[]> {
  const { data: profiles, error } = await supabase
    .from('icp_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (error) {
    console.warn('icpService.getICPProfiles - error:', error.message);
    return [];
  }

  if (!profiles || profiles.length === 0) return [];

  const profileIds = profiles.map((p) => (p as ICPProfile).id);

  const { data: criteria, error: critError } = await supabase
    .from('icp_criteria')
    .select('*')
    .in('icp_profile_id', profileIds)
    .order('created_at', { ascending: true });

  if (critError) {
    console.warn('icpService.getICPProfiles - criteria error:', critError.message);
  }

  const criteriaMap = new Map<string, ICPCriterion[]>();
  for (const c of criteria || []) {
    const crit = c as ICPCriterion;
    const list = criteriaMap.get(crit.icp_profile_id) || [];
    list.push(crit);
    criteriaMap.set(crit.icp_profile_id, list);
  }

  return (profiles as ICPProfile[]).map((profile) => ({
    ...profile,
    criteria: criteriaMap.get(profile.id) || [],
  }));
}

/**
 * Crea un ICP profile con sus criteria asociados.
 */
export async function createICPProfile(
  organizationId: number,
  data: ICPProfileInput,
  supabase: SupabaseClient
): Promise<ICPProfile | null> {
  const { data: profile, error } = await supabase
    .from('icp_profiles')
    .insert({
      organization_id: organizationId,
      name: data.name,
      band: data.band,
      description: data.description ?? null,
      priority: data.priority ?? 100,
      color: data.color ?? '#6366f1',
      sla_first_contact_hours: data.sla_first_contact_hours ?? 24,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) throw error;

  const createdProfile = profile as ICPProfile;

  // Insertar criteria si vienen en la creación
  if (data.criteria && data.criteria.length > 0) {
    const criteriaRows = data.criteria
      .filter((c) => isValidFieldKey(c.field_key) && isValidOperator(c.operator))
      .map((c) => ({
        organization_id: organizationId,
        icp_profile_id: createdProfile.id,
        field_key: c.field_key,
        operator: c.operator,
        value: c.value,
        weight: c.weight ?? 1,
        is_required: c.is_required ?? false,
      }));

    if (criteriaRows.length > 0) {
      const { error: critError } = await supabase
        .from('icp_criteria')
        .insert(criteriaRows);

      if (critError) {
        console.warn('icpService.createICPProfile - criteria error:', critError.message);
      }
    }
  }

  // Recargar con criteria
  const profiles = await getICPProfiles(organizationId, supabase);
  return profiles.find((p) => p.id === createdProfile.id) || createdProfile;
}

/**
 * Actualiza un ICP profile existente.
 */
export async function updateICPProfile(
  id: string,
  organizationId: number,
  data: ICPProfileUpdateInput,
  supabase: SupabaseClient
): Promise<ICPProfile | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.band !== undefined) updateData.band = data.band;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.sla_first_contact_hours !== undefined) updateData.sla_first_contact_hours = data.sla_first_contact_hours;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: result, error } = await supabase
    .from('icp_profiles')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) throw error;

  return result as ICPProfile;
}

/**
 * Elimina un ICP profile. Los criteria se borran por cascade (FK ON DELETE CASCADE).
 */
export async function deleteICPProfile(
  id: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('icp_profiles')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) throw error;
}

/**
 * Evalúa un set de criteria contra datos reales del cliente y oportunidad.
 * Retorna el fit_score (0-100), si pasó los required, y los detalles.
 */
export function evaluateICPCriteria(
  criteria: ICPCriterion[],
  customerData: CustomerData,
  opportunityData: OpportunityData
): { fit_score: number; matched: boolean; failed_required: string[]; details: ICPEvaluationResult['details'] } {
  const details: ICPEvaluationResult['details'] = [];
  let totalWeight = 0;
  let matchedWeight = 0;
  const failedRequired: string[] = [];

  for (const criterion of criteria) {
    // Validar field_key y operator
    if (!isValidFieldKey(criterion.field_key) || !isValidOperator(criterion.operator)) {
      continue;
    }

    const actualValue = getFieldValue(criterion.field_key, customerData, opportunityData);
    const passed = compareValues(actualValue, criterion.operator, criterion.value);

    details.push({
      field_key: criterion.field_key,
      operator: criterion.operator,
      expected: criterion.value,
      actual: actualValue,
      passed,
      weight: criterion.weight,
      is_required: criterion.is_required,
    });

    totalWeight += criterion.weight;
    if (passed) {
      matchedWeight += criterion.weight;
    }

    if (criterion.is_required && !passed) {
      failedRequired.push(criterion.field_key);
    }
  }

  const fitScore = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  const matched = failedRequired.length === 0 && fitScore > 0;

  return {
    fit_score: fitScore,
    matched,
    failed_required: failedRequired,
    details,
  };
}

/**
 * Evalúa un cliente contra todos los ICP profiles de la organización.
 * Retorna todas las evaluaciones ordenadas por fit_score descendente.
 */
export async function evaluateICP(
  organizationId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<ICPEvaluationResult[]> {
  // 1. Obtener ICP profiles con criteria
  const profiles = await getICPProfiles(organizationId, supabase);
  if (profiles.length === 0) return [];

  // 2. Obtener datos del customer
  const { data: customer, error: custError } = await supabase
    .from('customers')
    .select('company_size, branches_count, current_software, lifecycle_stage, city, vertical_id')
    .eq('id', customerId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (custError || !customer) {
    console.warn('icpService.evaluateICP - customer not found:', customerId);
    return [];
  }

  const customerData = customer as CustomerData;

  // 3. Obtener la oportunidad más reciente del customer (si existe)
  const { data: opp } = await supabase
    .from('opportunities')
    .select('amount, currency, deal_type')
    .eq('customer_id', customerId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const opportunityData: OpportunityData = (opp as OpportunityData) || {};

  // 4. Evaluar contra cada profile
  const evaluations: ICPEvaluationResult[] = [];

  for (const profile of profiles) {
    const criteria = profile.criteria || [];
    const result = evaluateICPCriteria(criteria, customerData, opportunityData);

    evaluations.push({
      profile_id: profile.id,
      profile_name: profile.name,
      band: profile.band,
      fit_score: result.fit_score,
      matched: result.matched,
      failed_required: result.failed_required,
      details: result.details,
    });
  }

  // Ordenar por fit_score descendente
  evaluations.sort((a, b) => b.fit_score - a.fit_score);

  return evaluations;
}

// ─── ICP Criteria CRUD ───────────────────────────────────────────────────────

export interface ICPCriterionUpdateInput {
  field_key?: ICPFieldKey;
  operator?: ICPOperator;
  value?: unknown;
  weight?: number;
  is_required?: boolean;
}

/**
 * Obtiene los criteria de un ICP profile.
 */
export async function getICPCriteria(
  profileId: string,
  supabase: SupabaseClient
): Promise<ICPCriterion[]> {
  const { data, error } = await supabase
    .from('icp_criteria')
    .select('*')
    .eq('icp_profile_id', profileId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('icpService.getICPCriteria - error:', error.message);
    return [];
  }

  return (data || []) as ICPCriterion[];
}

/**
 * Crea un criterion individual para un ICP profile.
 */
export async function createICPCriterion(
  organizationId: number,
  profileId: string,
  data: ICPCriterionInput,
  supabase: SupabaseClient
): Promise<ICPCriterion | null> {
  if (!isValidFieldKey(data.field_key) || !isValidOperator(data.operator)) {
    throw new Error('field_key u operator inválido');
  }

  const { data: result, error } = await supabase
    .from('icp_criteria')
    .insert({
      organization_id: organizationId,
      icp_profile_id: profileId,
      field_key: data.field_key,
      operator: data.operator,
      value: data.value,
      weight: data.weight ?? 1,
      is_required: data.is_required ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return result as ICPCriterion;
}

/**
 * Actualiza un criterion individual.
 */
export async function updateICPCriterion(
  id: string,
  organizationId: number,
  data: ICPCriterionUpdateInput,
  supabase: SupabaseClient
): Promise<ICPCriterion | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.field_key !== undefined) {
    if (!isValidFieldKey(data.field_key)) throw new Error('field_key inválido');
    updateData.field_key = data.field_key;
  }
  if (data.operator !== undefined) {
    if (!isValidOperator(data.operator)) throw new Error('operator inválido');
    updateData.operator = data.operator;
  }
  if (data.value !== undefined) updateData.value = data.value;
  if (data.weight !== undefined) updateData.weight = data.weight;
  if (data.is_required !== undefined) updateData.is_required = data.is_required;

  const { data: result, error } = await supabase
    .from('icp_criteria')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) throw error;
  return result as ICPCriterion;
}

/**
 * Elimina un criterion individual.
 */
export async function deleteICPCriterion(
  id: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('icp_criteria')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) throw error;
}

/**
 * Asigna el ICP band al customer y actualiza opportunities.icp_band e icp_fit_score.
 * Selecciona el profile con mayor fit_score que haya pasado los required.
 */
export async function assignICPBand(
  organizationId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<ICPAssignmentResult> {
  const evaluations = await evaluateICP(organizationId, customerId, supabase);

  // Buscar el mejor match (mayor fit_score que pasó required)
  const bestMatch = evaluations.find((e) => e.matched) || evaluations[0] || null;

  let assignedBand: string | null = null;
  let bestProfileId: string | null = null;
  let fitScore = 0;

  if (bestMatch && bestMatch.matched) {
    assignedBand = bestMatch.band;
    bestProfileId = bestMatch.profile_id;
    fitScore = bestMatch.fit_score;

    // Actualizar opportunities del customer
    await supabase
      .from('opportunities')
      .update({
        icp_band: assignedBand,
        icp_fit_score: fitScore,
        updated_at: new Date().toISOString(),
      })
      .eq('customer_id', customerId)
      .eq('organization_id', organizationId)
      .in('status', ['open', 'won']);
  }

  return {
    customer_id: customerId,
    assigned_band: assignedBand,
    best_profile_id: bestProfileId,
    fit_score: fitScore,
    evaluations,
  };
}
