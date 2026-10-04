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
    throw error;
  }

  return (data || []) as Objection[];
}

/**
 * Crea una nueva objection.
 */
export async function createObjection(organizationId:number,data:ObjectionInput,supabase:SupabaseClient):Promise<Objection|null>{
 const {data:row,error}=await supabase.rpc('crm_objection_catalog_write',{p_org:organizationId,p_id:null,p_expected:null,p_data:data,p_archive:false});if(error)throw error;return row as Objection;
}
export async function updateObjection(id:string,organizationId:number,data:ObjectionUpdateInput,supabase:SupabaseClient,expectedUpdatedAt?:string):Promise<Objection|null>{
 const clean=Object.fromEntries(Object.entries(data).filter(([,value])=>value!==undefined));
 const {data:row,error}=await supabase.rpc('crm_objection_catalog_write',{p_org:organizationId,p_id:id,p_expected:expectedUpdatedAt??null,p_data:clean,p_archive:false});if(error)throw error;return row as Objection;
}
/** Archived to preserve opportunity and mined-response history. */
export async function deleteObjection(id:string,organizationId:number,supabase:SupabaseClient):Promise<void>{
 const {error}=await supabase.rpc('crm_objection_catalog_write',{p_org:organizationId,p_id:id,p_expected:null,p_data:{},p_archive:true});if(error)throw error;
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
    throw error;
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
export async function addOpportunityObjection(organizationId:number,opportunityId:string,objectionId:string,data:OpportunityObjectionInput,supabase:SupabaseClient):Promise<OpportunityObjection|null>{
 if(data.notes!=null&&typeof data.notes!=='string')throw new ObjectionValidationError('Nota inválida.');
 const notes=data.notes?.trim()||null;
 if(notes&&notes.length>NOTES_MAX)throw new ObjectionValidationError(`Máximo ${NOTES_MAX} caracteres.`);
 const {data:row,error}=await supabase.rpc('crm_objection_register',{p_org:organizationId,p_opportunity:opportunityId,p_objection:objectionId,p_resolve:null,p_notes:notes});
 if(error)throw error;return row as OpportunityObjection;
}
export async function resolveOpportunityObjection(id:string,organizationId:number,supabase:SupabaseClient,opportunityId:string):Promise<OpportunityObjection|null>{
 const {data:row,error}=await supabase.rpc('crm_objection_register',{p_org:organizationId,p_opportunity:opportunityId,p_objection:null,p_resolve:id,p_notes:null});if(error)throw error;return row as OpportunityObjection;
}
