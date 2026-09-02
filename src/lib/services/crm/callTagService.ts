import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - FASE 4: Gestión de tags de llamadas.
 * Tablas: call_tags, call_tag_relations
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface CallTag {
  id: string;
  organization_id: number;
  name: string;
  color: string;
  category: string | null;
  is_auto: boolean;
  rules: Record<string, unknown> | null;
  created_at: string;
}

export interface CallTagRelation {
  id: string;
  organization_id: number;
  call_id: string;
  tag_id: string;
  source: 'manual' | 'ia';
  confidence: number | null;
  created_at: string;
  tag?: CallTag;
}

export interface CallTagInput {
  name: string;
  color?: string;
  category?: string;
  is_auto?: boolean;
  rules?: Record<string, unknown>;
}

export interface CallTagUpdateInput {
  name?: string;
  color?: string;
  category?: string;
  is_auto?: boolean;
  rules?: Record<string, unknown>;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Lista todos los tags de llamadas de una organización.
 */
export async function getCallTags(
  orgId: number,
  supabase: SupabaseClient
): Promise<CallTag[]> {
  const { data, error } = await supabase
    .from('call_tags')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[callTagService] getCallTags error:', error.message);
    return [];
  }

  return (data as CallTag[]) || [];
}

/**
 * Crea un nuevo tag de llamada.
 */
export async function createCallTag(
  orgId: number,
  data: CallTagInput,
  supabase: SupabaseClient
): Promise<CallTag | null> {
  const { data: tag, error } = await supabase
    .from('call_tags')
    .insert({
      organization_id: orgId,
      name: data.name,
      color: data.color ?? '#6366f1',
      category: data.category ?? null,
      is_auto: data.is_auto ?? false,
      rules: data.rules ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  return tag as CallTag;
}

/**
 * Actualiza un tag de llamada existente.
 */
export async function updateCallTag(
  id: string,
  orgId: number,
  data: CallTagUpdateInput,
  supabase: SupabaseClient
): Promise<CallTag | null> {
  const updateData: Record<string, unknown> = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.color !== undefined) updateData.color = data.color;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.is_auto !== undefined) updateData.is_auto = data.is_auto;
  if (data.rules !== undefined) updateData.rules = data.rules;

  const { data: tag, error } = await supabase
    .from('call_tags')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw error;

  return tag as CallTag;
}

/**
 * Elimina un tag de llamada. Las relaciones se borran por cascade.
 */
export async function deleteCallTag(
  id: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('call_tags')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw error;
}

/**
 * Lista los tags vinculados a una llamada específica.
 */
export async function getCallTagsForCall(
  callId: string,
  orgId: number,
  supabase: SupabaseClient
): Promise<CallTagRelation[]> {
  const { data, error } = await supabase
    .from('call_tag_relations')
    .select(`
      *,
      tag:call_tags(*)
    `)
    .eq('call_id', callId)
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[callTagService] getCallTagsForCall error:', error.message);
    return [];
  }

  return (data as CallTagRelation[]) || [];
}

/**
 * Vincula un tag a una llamada.
 * Si la relación ya existe, no la duplica.
 */
export async function tagCall(
  orgId: number,
  callId: string,
  tagId: string,
  source: 'manual' | 'ia',
  supabase: SupabaseClient,
  confidence?: number
): Promise<CallTagRelation | null> {
  // Verificar si ya existe la relación
  const { data: existing } = await supabase
    .from('call_tag_relations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('call_id', callId)
    .eq('tag_id', tagId)
    .maybeSingle();

  if (existing) {
    return existing as CallTagRelation;
  }

  const { data: relation, error } = await supabase
    .from('call_tag_relations')
    .insert({
      organization_id: orgId,
      call_id: callId,
      tag_id: tagId,
      source,
      confidence: confidence ?? null,
    })
    .select()
    .single();

  if (error) {
    console.warn('[callTagService] tagCall error:', error.message);
    return null;
  }

  return relation as CallTagRelation;
}

/**
 * Desvincula un tag de una llamada.
 */
export async function untagCall(
  orgId: number,
  callId: string,
  tagId: string,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('call_tag_relations')
    .delete()
    .eq('organization_id', orgId)
    .eq('call_id', callId)
    .eq('tag_id', tagId);

  if (error) throw error;
}
