import { supabase } from '@/lib/supabase/config';
import { getOrganizationId as getOrganizationIdFromContext } from '@/lib/hooks/useOrganization';

/**
 * Servicio CRM para gestionar verticales (líneas de negocio) por organización.
 * Tabla: verticals (id, organization_id, name, description, is_active, created_at, updated_at)
 */

export interface Vertical {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VerticalInput {
  name: string;
  description?: string | null;
}

export interface VerticalUpdateInput {
  name?: string;
  description?: string | null;
  is_active?: boolean;
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
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { data: result, error } = await supabase
        .from('verticals')
        .update(updateData)
        .eq('id', id)
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
      const { error } = await supabase
        .from('verticals')
        .update({
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error en verticalsService.delete:', err);
      throw err;
    }
  }
}

export const verticalsService = new VerticalsService();
export default verticalsService;
