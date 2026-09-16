import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Gestión de objeciones (objections + opportunity_objections).
 * Tablas: objections, opportunity_objections
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface Objection {
  id: string;
  organization_id: number;
  title: string;
  category: string | null;
  detection_signals: string[] | null;
  recommended_response: string | null;
  discovery_questions: string[] | null;
  related_case_studies: string[] | null;
  vertical_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ObjectionInput {
  title: string;
  /** NOT NULL en la BD (verificado por MCP el 2026-09-15). */
  category: string;
  detection_signals?: string[] | null;
  recommended_response?: string | null;
  discovery_questions?: string[] | null;
  related_case_studies?: string[] | null;
  vertical_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface ObjectionUpdateInput {
  title?: string;
  category?: string | null;
  detection_signals?: string[] | null;
  recommended_response?: string | null;
  discovery_questions?: string[] | null;
  related_case_studies?: string[] | null;
  vertical_id?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface OpportunityObjection {
  id: string;
  organization_id: number;
  opportunity_id: string;
  objection_id: string;
  notes: string | null;
  detected_by: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
  // La tabla NO tiene `updated_at` (verificado por MCP el 2026-09-15).
  // Relación opcional
  objection?: Objection | null;
}

export interface OpportunityObjectionInput {
  notes?: string | null;
  detected_by?: string | null;
}

/** Tope de `opportunity_objections.notes` en caracteres: el mismo `maxLength` del picker. Se aplica AQUÍ, no solo en el input. */
export const NOTES_MAX = 280;

/** Error con código HTTP que las rutas devuelven tal cual (404 no encontrada, 400 datos inválidos). */
export class ObjectionRequestError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
    this.name = 'ObjectionRequestError';
  }
}

/** La oportunidad o la objeción no existen en la organización: el enlace no se crea. */
export class ObjectionNotFoundError extends ObjectionRequestError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'ObjectionNotFoundError';
  }
}

/** Datos inválidos (p. ej. nota más larga que `NOTES_MAX`): nada se lee ni se escribe. */
export class ObjectionValidationError extends ObjectionRequestError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ObjectionValidationError';
  }
}

export interface ObjectionFilters {
  category?: string;
  vertical_id?: string;
  includeInactive?: boolean;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Obtiene las objections de una organización con filtros opcionales.
 */
export async function getObjections(
  organizationId: number,
  supabase: SupabaseClient,
  filters?: ObjectionFilters
): Promise<Objection[]> {
  let query = supabase
    .from('objections')
    .select('*')
    .eq('organization_id', organizationId);

  if (!filters?.includeInactive) {
    query = query.eq('is_active', true);
  }

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  if (filters?.vertical_id) {
    query = query.eq('vertical_id', filters.vertical_id);
  }

  const { data, error } = await query.order('sort_order', { ascending: true });

  if (error) {
    console.warn('objectionService.getObjections - error:', error.message);
    return [];
  }

  return (data || []) as Objection[];
}

/**
 * Crea una nueva objection.
 */
export async function createObjection(
  organizationId: number,
  data: ObjectionInput,
  supabase: SupabaseClient
): Promise<Objection | null> {
  const { data: result, error } = await supabase
    .from('objections')
    .insert({
      organization_id: organizationId,
      title: data.title,
      category: data.category,
      // jsonb NOT NULL DEFAULT '[]' (verificado por MCP el 2026-09-15): null → 500.
      detection_signals: data.detection_signals ?? [],
      recommended_response: data.recommended_response ?? null,
      discovery_questions: data.discovery_questions ?? [],
      related_case_studies: data.related_case_studies ?? null,
      vertical_id: data.vertical_id ?? null,
      is_active: data.is_active ?? true,
      sort_order: data.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;

  return result as Objection;
}

/**
 * Actualiza una objection existente.
 */
export async function updateObjection(
  id: string,
  organizationId: number,
  data: ObjectionUpdateInput,
  supabase: SupabaseClient
): Promise<Objection | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.title !== undefined) updateData.title = data.title;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.detection_signals !== undefined) updateData.detection_signals = data.detection_signals;
  if (data.recommended_response !== undefined) updateData.recommended_response = data.recommended_response;
  if (data.discovery_questions !== undefined) updateData.discovery_questions = data.discovery_questions;
  if (data.related_case_studies !== undefined) updateData.related_case_studies = data.related_case_studies;
  if (data.vertical_id !== undefined) updateData.vertical_id = data.vertical_id;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;
  if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;

  const { data: result, error } = await supabase
    .from('objections')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) throw error;

  return result as Objection;
}

/**
 * Elimina una objection.
 */
export async function deleteObjection(
  id: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('objections')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) throw error;
}

/**
 * Obtiene las objections vinculadas a una oportunidad, con join a la tabla objections.
 */
export async function getOpportunityObjections(
  opportunityId: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<OpportunityObjection[]> {
  const { data, error } = await supabase
    .from('opportunity_objections')
    .select(`
      *,
      objection:objections(*)
    `)
    .eq('opportunity_id', opportunityId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('objectionService.getOpportunityObjections - error:', error.message);
    return [];
  }

  return (data || []) as OpportunityObjection[];
}

/**
 * Vincula una objection a una oportunidad. Antes de insertar comprueba que la
 * oportunidad y la objeción existen EN la organización: RLS ya impide leer
 * las ajenas, pero sin esta comprobación se creaba un enlace basura hacia un
 * id de otra organización. Lanza `ObjectionNotFoundError` (404) o
 * `ObjectionValidationError` (400) si la nota supera `NOTES_MAX`.
 */
export async function addOpportunityObjection(
  organizationId: number,
  opportunityId: string,
  objectionId: string,
  data: OpportunityObjectionInput,
  supabase: SupabaseClient
): Promise<OpportunityObjection | null> {
  // El tope se comprueba antes de tocar la BD: por la API entraban 281 caracteres (ronda 2).
  const notes = typeof data.notes === 'string' ? data.notes.trim() : '';
  if (notes.length > NOTES_MAX) {
    throw new ObjectionValidationError(`La nota no puede superar ${NOTES_MAX} caracteres (tiene ${notes.length})`);
  }

  const [opportunity, objection] = await Promise.all([
    supabase.from('opportunities').select('id').eq('id', opportunityId).eq('organization_id', organizationId).maybeSingle(),
    supabase.from('objections').select('id').eq('id', objectionId).eq('organization_id', organizationId).maybeSingle(),
  ]);
  if (opportunity.error) throw opportunity.error;
  if (objection.error) throw objection.error;
  if (!opportunity.data) throw new ObjectionNotFoundError('Oportunidad no encontrada');
  if (!objection.data) throw new ObjectionNotFoundError('Objeción no encontrada');

  const { data: result, error } = await supabase
    .from('opportunity_objections')
    .insert({
      organization_id: organizationId,
      opportunity_id: opportunityId,
      objection_id: objectionId,
      notes: notes || null,
      // NOT NULL con CHECK ('manual','ia'): nunca null.
      detected_by: data.detected_by ?? 'manual',
      resolved: false,
    })
    .select()
    .single();

  if (error) throw error;

  // Actualizar el objection_id en la oportunidad (referencia directa)
  await supabase
    .from('opportunities')
    .update({ objection_id: objectionId, updated_at: new Date().toISOString() })
    .eq('id', opportunityId)
    .eq('organization_id', organizationId);

  return result as OpportunityObjection;
}

/**
 * Marca una opportunity_objection como resuelta.
 */
export async function resolveOpportunityObjection(
  id: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<OpportunityObjection | null> {
  const { data: result, error } = await supabase
    .from('opportunity_objections')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) throw error;

  return result as OpportunityObjection;
}
