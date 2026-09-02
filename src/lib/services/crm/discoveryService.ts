import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Gestión de discovery templates y discovery_data en opportunities.
 * Tablas: discovery_templates, opportunities.discovery_data (jsonb)
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Una sección dentro del template de discovery. */
export interface DiscoverySection {
  id: string;
  title: string;
  questions: DiscoveryQuestion[];
}

/** Una pregunta dentro de una sección de discovery. */
export interface DiscoveryQuestion {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'multiselect' | 'boolean';
  options?: string[];
  required?: boolean;
  placeholder?: string;
}

/** Respuesta a una pregunta de discovery. */
export interface DiscoveryAnswer {
  questionId: string;
  sectionId: string;
  value: unknown;
}

/** Estructura completa de discovery_data almacenada en opportunities.discovery_data. */
export interface DiscoveryData {
  templateId: string | null;
  templateName: string | null;
  sections: {
    sectionId: string;
    sectionTitle: string;
    answers: DiscoveryAnswer[];
  }[];
  completedAt: string | null;
  updatedAt: string | null;
}

export interface DiscoveryTemplate {
  id: string;
  organization_id: number;
  name: string;
  vertical_id: string | null;
  sections: DiscoverySection[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DiscoveryTemplateInput {
  name: string;
  vertical_id?: string | null;
  sections: DiscoverySection[];
  is_active?: boolean;
}

export interface DiscoveryTemplateUpdateInput {
  name?: string;
  vertical_id?: string | null;
  sections?: DiscoverySection[];
  is_active?: boolean;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Obtiene los discovery templates activos de una organización.
 */
export async function getDiscoveryTemplates(
  organizationId: number,
  supabase: SupabaseClient
): Promise<DiscoveryTemplate[]> {
  const { data, error } = await supabase
    .from('discovery_templates')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.warn('discoveryService.getDiscoveryTemplates - error:', error.message);
    return [];
  }

  return (data || []) as DiscoveryTemplate[];
}

/**
 * Crea un nuevo discovery template.
 */
export async function createDiscoveryTemplate(
  organizationId: number,
  data: DiscoveryTemplateInput,
  supabase: SupabaseClient
): Promise<DiscoveryTemplate | null> {
  const { data: result, error } = await supabase
    .from('discovery_templates')
    .insert({
      organization_id: organizationId,
      name: data.name,
      vertical_id: data.vertical_id ?? null,
      sections: data.sections,
      is_active: data.is_active ?? true,
    })
    .select()
    .single();

  if (error) throw error;

  return result as DiscoveryTemplate;
}

/**
 * Actualiza un discovery template existente.
 */
export async function updateDiscoveryTemplate(
  id: string,
  organizationId: number,
  data: DiscoveryTemplateUpdateInput,
  supabase: SupabaseClient
): Promise<DiscoveryTemplate | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateData.name = data.name;
  if (data.vertical_id !== undefined) updateData.vertical_id = data.vertical_id;
  if (data.sections !== undefined) updateData.sections = data.sections;
  if (data.is_active !== undefined) updateData.is_active = data.is_active;

  const { data: result, error } = await supabase
    .from('discovery_templates')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error) throw error;

  return result as DiscoveryTemplate;
}

/**
 * Elimina un discovery template.
 */
export async function deleteDiscoveryTemplate(
  id: string,
  organizationId: number,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('discovery_templates')
    .delete()
    .eq('id', id)
    .eq('organization_id', organizationId);

  if (error) throw error;
}

/**
 * Obtiene el discovery_data de una oportunidad.
 */
export async function getDiscoveryData(
  opportunityId: string,
  supabase: SupabaseClient
): Promise<DiscoveryData | null> {
  const { data, error } = await supabase
    .from('opportunities')
    .select('discovery_data')
    .eq('id', opportunityId)
    .maybeSingle();

  if (error) {
    console.warn('discoveryService.getDiscoveryData - error:', error.message);
    return null;
  }

  if (!data || !data.discovery_data) return null;

  return data.discovery_data as DiscoveryData;
}

/**
 * Guarda el discovery_data en una oportunidad.
 */
export async function saveDiscoveryData(
  opportunityId: string,
  discoveryData: DiscoveryData,
  supabase: SupabaseClient
): Promise<DiscoveryData | null> {
  const dataToSave: DiscoveryData = {
    ...discoveryData,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('opportunities')
    .update({
      discovery_data: dataToSave,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId);

  if (error) throw error;

  return dataToSave;
}

/**
 * Inicializa el discovery_data de una oportunidad desde un template.
 * Crea la estructura vacía con todas las preguntas del template.
 */
export async function initializeDiscoveryFromTemplate(
  opportunityId: string,
  templateId: string,
  supabase: SupabaseClient
): Promise<DiscoveryData | null> {
  // 1. Obtener el template
  const { data: template, error: templateError } = await supabase
    .from('discovery_templates')
    .select('*')
    .eq('id', templateId)
    .maybeSingle();

  if (templateError || !template) {
    console.warn('discoveryService.initializeDiscoveryFromTemplate - template not found:', templateId);
    return null;
  }

  const tpl = template as DiscoveryTemplate;

  // 2. Construir estructura vacía
  const discoveryData: DiscoveryData = {
    templateId: tpl.id,
    templateName: tpl.name,
    sections: tpl.sections.map((section) => ({
      sectionId: section.id,
      sectionTitle: section.title,
      answers: section.questions.map((question) => ({
        questionId: question.id,
        sectionId: section.id,
        value: null,
      })),
    })),
    completedAt: null,
    updatedAt: new Date().toISOString(),
  };

  // 3. Guardar en la oportunidad
  const { error: updateError } = await supabase
    .from('opportunities')
    .update({
      discovery_data: discoveryData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', opportunityId);

  if (updateError) throw updateError;

  return discoveryData;
}
