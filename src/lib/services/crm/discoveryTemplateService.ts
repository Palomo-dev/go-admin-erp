import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface DiscoveryField {
  id: string;
  label: string;
  placeholder?: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select';
  required?: boolean;
  options?: string[]; // para type=select
}

export interface DiscoveryTemplate {
  id: string;
  organization_id: number;
  name: string;
  sections: DiscoveryField[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Template por defecto (software/SaaS) — se usa si la organización no tiene configurado uno
export const DEFAULT_DISCOVERY_FIELDS: DiscoveryField[] = [
  { id: 'who_is', label: 'Quién es (rol/cargo)', placeholder: 'Ej: Gerente general', type: 'text' },
  { id: 'business', label: 'Negocio', placeholder: 'Ej: Restaurante con 3 sedes', type: 'text' },
  { id: 'problem', label: 'Problema principal', placeholder: 'Ej: Control de inventario manual', type: 'text' },
  { id: 'users_count', label: 'N° usuarios', placeholder: 'Ej: 12', type: 'text' },
  { id: 'branches_count', label: 'N° sedes', placeholder: 'Ej: 3', type: 'text' },
  { id: 'current_software', label: 'Software actual', placeholder: 'Ej: Excel / Ninguno', type: 'text' },
  { id: 'current_spend', label: 'Cuánto paga hoy', placeholder: 'Ej: $500k/mes', type: 'text' },
  { id: 'decision_maker', label: 'Decisor', placeholder: 'Ej: CEO + CFO', type: 'text' },
  { id: 'implementation_date', label: 'Fecha implementación', placeholder: 'Ej: 2026-01-15', type: 'text' },
  { id: 'budget', label: 'Presupuesto', placeholder: 'Ej: $2M - $5M', type: 'text' },
];

/**
 * Obtiene el template de discovery activo para la organización actual.
 * Si no hay template configurado, devuelve el template por defecto.
 */
export async function getActiveDiscoveryTemplate(): Promise<{
  template: DiscoveryTemplate | null;
  fields: DiscoveryField[];
}> {
  const orgId = getOrganizationId();
  if (!orgId) {
    return { template: null, fields: DEFAULT_DISCOVERY_FIELDS };
  }

  const { data, error } = await supabase
    .from('discovery_templates')
    .select('*')
    .eq('organization_id', Number(orgId))
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { template: null, fields: DEFAULT_DISCOVERY_FIELDS };
  }

  const template = data as DiscoveryTemplate;
  return {
    template,
    fields: Array.isArray(template.sections) ? template.sections : DEFAULT_DISCOVERY_FIELDS,
  };
}

/**
 * Obtiene el template de discovery para una organización específica (server-side).
 */
export async function getDiscoveryTemplateForOrg(
  orgId: number,
  supabaseClient: typeof supabase
): Promise<{ template: DiscoveryTemplate | null; fields: DiscoveryField[] }> {
  const { data, error } = await supabaseClient
    .from('discovery_templates')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { template: null, fields: DEFAULT_DISCOVERY_FIELDS };
  }

  const template = data as DiscoveryTemplate;
  return {
    template,
    fields: Array.isArray(template.sections) ? template.sections : DEFAULT_DISCOVERY_FIELDS,
  };
}

/**
 * Guarda o actualiza el template de discovery de la organización.
 */
export async function saveDiscoveryTemplate(
  fields: DiscoveryField[],
  name?: string
): Promise<DiscoveryTemplate | null> {
  const orgId = getOrganizationId();
  if (!orgId) return null;

  // Verificar si ya existe un template activo
  const { data: existing } = await supabase
    .from('discovery_templates')
    .select('id')
    .eq('organization_id', Number(orgId))
    .eq('is_active', true)
    .maybeSingle();

  if (existing) {
    // Actualizar
    const { data, error } = await supabase
      .from('discovery_templates')
      .update({
        sections: fields as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data as DiscoveryTemplate;
  }

  // Crear nuevo
  const { data, error } = await supabase
    .from('discovery_templates')
    .insert({
      organization_id: Number(orgId),
      name: name || 'Discovery personalizado',
      sections: fields as unknown as Record<string, unknown>,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;
  return data as DiscoveryTemplate;
}
