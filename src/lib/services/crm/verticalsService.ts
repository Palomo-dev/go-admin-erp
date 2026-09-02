import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM para gestionar verticales (líneas de negocio) por organización.
 * Tabla: verticals (id, organization_id, name, description, is_active, created_at,
 *   updated_at, slug, color, sort_order, positioning jsonb, metadata jsonb)
 */

export interface Vertical {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  slug: string | null;
  color: string | null;
  sort_order: number;
  positioning: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface VerticalInput {
  name: string;
  description?: string | null;
  slug?: string | null;
  color?: string | null;
  sort_order?: number;
  positioning?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface VerticalUpdateInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
  slug?: string | null;
  color?: string | null;
  sort_order?: number;
  positioning?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

class VerticalsService {
  private getOrgId(): number {
    return getOrganizationIdFromContext();
  }

  /**
   * Obtiene las verticales activas de la organización actual.
   */
  async list(): Promise<Vertical[]> {
    try {
      const orgId = this.getOrgId();
      const { data, error } = await supabase
        .from('verticals')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.warn('Advertencia obteniendo verticales:', error.message);
        return [];
      }
      return (data || []) as Vertical[];
    } catch (err) {
      console.warn('Error en verticalsService.list:', err);
      return [];
    }
  }

  /**
   * Obtiene todas las verticales (incluyendo inactivas) de la organización.
   */
  async listAll(): Promise<Vertical[]> {
    try {
      const orgId = this.getOrgId();
      const { data, error } = await supabase
        .from('verticals')
        .select('*')
        .eq('organization_id', orgId)
        .order('name');

      if (error) {
        console.warn('Advertencia obteniendo todas las verticales:', error.message);
        return [];
      }
      return (data || []) as Vertical[];
    } catch (err) {
      console.warn('Error en verticalsService.listAll:', err);
      return [];
    }
  }

  /**
   * Crea una nueva vertical en la organización actual.
   */
  async create(input: VerticalInput): Promise<Vertical | null> {
    try {
      const orgId = this.getOrgId();
      const { data, error } = await supabase
        .from('verticals')
        .insert({
          organization_id: orgId,
          name: input.name,
          description: input.description ?? null,
          is_active: true,
          slug: input.slug ?? null,
          color: input.color ?? null,
          sort_order: input.sort_order ?? 0,
          positioning: input.positioning ?? {},
          metadata: input.metadata ?? {},
        })
        .select()
        .single();

      if (error) throw error;
      return data as Vertical;
    } catch (err) {
      console.error('Error en verticalsService.create:', err);
      throw err;
    }
  }

  /**
   * Actualiza una vertical existente.
   */
  async update(id: string, data: VerticalUpdateInput): Promise<Vertical | null> {
    try {
      const orgId = this.getOrgId();
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;
      if (data.slug !== undefined) updateData.slug = data.slug;
      if (data.color !== undefined) updateData.color = data.color;
      if (data.sort_order !== undefined) updateData.sort_order = data.sort_order;
      if (data.positioning !== undefined) updateData.positioning = data.positioning;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;

      const { data: result, error } = await supabase
        .from('verticals')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();

      if (error) throw error;
      return result as Vertical;
    } catch (err) {
      console.error('Error en verticalsService.update:', err);
      throw err;
    }
  }

  /**
   * Soft delete: marca la vertical como inactiva.
   */
  async delete(id: string): Promise<void> {
    try {
      const orgId = this.getOrgId();
      const { error } = await supabase
        .from('verticals')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('organization_id', orgId);

      if (error) throw error;
    } catch (err) {
      console.error('Error en verticalsService.delete:', err);
      throw err;
    }
  }
}

export const verticalsService = new VerticalsService();
export default verticalsService;

// ─── Funciones server-side (usan ctx.supabase con cookies/RLS del usuario) ───
// Siguen el mismo patrón que importVerticalTemplate(orgId, supabaseClient).

/**
 * Lista las verticales de una organización (server-side).
 * @param orgId - ID de la organización
 * @param supabaseClient - Cliente Supabase server-side (con sesión del usuario)
 * @param includeInactive - Si true, incluye verticales inactivas (soft-deleted)
 * @returns Array de verticales
 */
export async function listVerticals(
  orgId: number,
  supabaseClient: SupabaseClient,
  includeInactive = false
): Promise<Vertical[]> {
  let query = supabaseClient
    .from('verticals')
    .select('*')
    .eq('organization_id', orgId);

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('sort_order', { ascending: true });

  if (error) {
    console.warn('verticalsService.listVerticals - error:', error.message);
    return [];
  }
  return (data || []) as Vertical[];
}

/**
 * Crea una nueva vertical (server-side).
 * @param orgId - ID de la organización
 * @param input - Datos de la vertical a crear
 * @param supabaseClient - Cliente Supabase server-side
 * @returns La vertical creada
 */
export async function createVertical(
  orgId: number,
  input: VerticalInput,
  supabaseClient: SupabaseClient
): Promise<Vertical> {
  const { data, error } = await supabaseClient
    .from('verticals')
    .insert({
      organization_id: orgId,
      name: input.name,
      description: input.description ?? null,
      is_active: true,
      slug: input.slug ?? null,
      color: input.color ?? null,
      sort_order: input.sort_order ?? 0,
      positioning: input.positioning ?? {},
      metadata: input.metadata ?? {},
    })
    .select()
    .single();

  if (error) throw error;
  return data as Vertical;
}

/**
 * Actualiza una vertical existente (server-side).
 * Valida que la vertical pertenezca a la organización.
 * @param orgId - ID de la organización
 * @param id - ID de la vertical a actualizar
 * @param update - Campos a actualizar
 * @param supabaseClient - Cliente Supabase server-side
 * @returns La vertical actualizada, o null si no existe/no pertenece a la org
 */
export async function updateVertical(
  orgId: number,
  id: string,
  update: VerticalUpdateInput,
  supabaseClient: SupabaseClient
): Promise<Vertical | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (update.name !== undefined) updateData.name = update.name;
  if (update.description !== undefined) updateData.description = update.description;
  if (update.is_active !== undefined) updateData.is_active = update.is_active;
  if (update.slug !== undefined) updateData.slug = update.slug;
  if (update.color !== undefined) updateData.color = update.color;
  if (update.sort_order !== undefined) updateData.sort_order = update.sort_order;
  if (update.positioning !== undefined) updateData.positioning = update.positioning;
  if (update.metadata !== undefined) updateData.metadata = update.metadata;

  const { data, error } = await supabaseClient
    .from('verticals')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return (data as Vertical) ?? null;
}

/**
 * Soft delete: marca la vertical como inactiva (server-side).
 * Valida que la vertical pertenezca a la organización.
 * @param orgId - ID de la organización
 * @param id - ID de la vertical a desactivar
 * @param supabaseClient - Cliente Supabase server-side
 * @returns true si se desactivó, false si no existía/no pertenecía a la org
 */
export async function deleteVertical(
  orgId: number,
  id: string,
  supabaseClient: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('verticals')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

// ─── Plantilla de 6 verticales de ejemplo ────────────────────────────────────

interface VerticalTemplate {
  name: string;
  slug: string;
  description: string;
  color: string;
  sort_order: number;
  positioning: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

const VERTICAL_TEMPLATES: VerticalTemplate[] = [
  {
    name: 'Restaurantes',
    slug: 'restaurantes',
    description: 'Restaurantes, cafeterías y negocios de comida',
    color: '#f97316',
    sort_order: 1,
    positioning: { value_proposition: 'POS + inventario + facturación electrónica', key_pain: 'Control de mesas y comandas' },
    metadata: { default_currency: 'COP', billing_cycle: 'monthly' },
  },
  {
    name: 'Hoteles',
    slug: 'hoteles',
    description: 'Hoteles, hostales y alojamiento',
    color: '#8b5cf6',
    sort_order: 2,
    positioning: { value_proposition: 'PMS + channel manager + POS', key_pain: 'Gestión de reservas y disponibilidad' },
    metadata: { default_currency: 'COP', billing_cycle: 'monthly' },
  },
  {
    name: 'Retail',
    slug: 'retail',
    description: 'Tiendas de retail y comercio',
    color: '#3b82f6',
    sort_order: 3,
    positioning: { value_proposition: 'POS + inventario multi-sucursal + e-commerce', key_pain: 'Sincronización de inventario entre sucursales' },
    metadata: { default_currency: 'COP', billing_cycle: 'monthly' },
  },
  {
    name: 'Supermercados',
    slug: 'supermercados',
    description: 'Supermercados y minimarkets',
    color: '#22c55e',
    sort_order: 4,
    positioning: { value_proposition: 'POS + pesaje + inventario + fidelización', key_pain: 'Gestión de perecederos y lotes' },
    metadata: { default_currency: 'COP', billing_cycle: 'monthly' },
  },
  {
    name: 'Servicios',
    slug: 'servicios',
    description: 'Empresas de servicios profesionales',
    color: '#06b6d4',
    sort_order: 5,
    positioning: { value_proposition: 'Facturación + CRM + gestión de proyectos', key_pain: 'Control de horas y billables' },
    metadata: { default_currency: 'COP', billing_cycle: 'monthly' },
  },
  {
    name: 'Multisucursal',
    slug: 'multisucursal',
    description: 'Empresas con múltiples sucursales o franquicias',
    color: '#ec4899',
    sort_order: 6,
    positioning: { value_proposition: 'Consolidación multi-sucursal + reportes centrales', key_pain: 'Visibilidad consolidada y control central' },
    metadata: { default_currency: 'COP', billing_cycle: 'monthly' },
  },
];

/**
 * Importa los 6 verticales de plantilla de forma idempotente.
 * Solo crea los verticales que no existan previamente (valida por slug).
 *
 * @param orgId - ID de la organización
 * @param supabaseClient - Cliente Supabase (server-side)
 * @returns Número de verticales creados
 */
export async function importVerticalTemplate(
  orgId: number,
  supabaseClient: SupabaseClient
): Promise<number> {
  let createdCount = 0;

  for (const template of VERTICAL_TEMPLATES) {
    // Verificar si ya existe un vertical con ese slug para la org
    const { data: existing } = await supabaseClient
      .from('verticals')
      .select('id')
      .eq('organization_id', orgId)
      .eq('slug', template.slug)
      .maybeSingle();

    if (existing) {
      continue; // Ya existe, saltar
    }

    const { error } = await supabaseClient
      .from('verticals')
      .insert({
        organization_id: orgId,
        name: template.name,
        description: template.description,
        is_active: true,
        slug: template.slug,
        color: template.color,
        sort_order: template.sort_order,
        positioning: template.positioning,
        metadata: template.metadata,
      });

    if (error) {
      console.warn(`verticalsService.importVerticalTemplate - error creando "${template.name}":`, error.message);
    } else {
      createdCount++;
    }
  }

  return createdCount;
}
