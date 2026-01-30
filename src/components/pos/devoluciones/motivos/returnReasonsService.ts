import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';
import { 
  ReturnReason, 
  CreateReturnReasonData, 
  UpdateReturnReasonData,
  ReturnReasonFilters 
} from '../types';

export class ReturnReasonsService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org.id;
  }

  /**
   * Obtener todos los motivos de devolución
   */
  static async getAll(filters: ReturnReasonFilters = {}): Promise<ReturnReason[]> {
    try {
      const organizationId = this.getOrganizationId();
      
      let query = supabase
        .from('return_reasons')
        .select('*')
        .eq('organization_id', organizationId)
        .order('display_order', { ascending: true })
        .order('name', { ascending: true });

      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching return reasons:', error);
        throw new Error(`Error al obtener motivos: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAll:', error);
      throw error;
    }
  }

  /**
   * Obtener solo motivos activos (para uso en formularios)
   */
  static async getActive(): Promise<ReturnReason[]> {
    return this.getAll({ is_active: true });
  }

  /**
   * Obtener un motivo por ID
   */
  static async getById(id: number): Promise<ReturnReason | null> {
    try {
      const organizationId = this.getOrganizationId();

      const { data, error } = await supabase
        .from('return_reasons')
        .select('*')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw new Error(`Error al obtener motivo: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error in getById:', error);
      throw error;
    }
  }

  /**
   * Crear un nuevo motivo de devolución
   */
  static async create(data: CreateReturnReasonData): Promise<ReturnReason> {
    try {
      const organizationId = this.getOrganizationId();

      // Verificar código único
      const { data: existing } = await supabase
        .from('return_reasons')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('code', data.code)
        .single();

      if (existing) {
        throw new Error(`Ya existe un motivo con el código "${data.code}"`);
      }

      const insertData = {
        organization_id: organizationId,
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description || null,
        requires_photo: data.requires_photo ?? false,
        affects_inventory: data.affects_inventory ?? true,
        is_active: data.is_active ?? true,
        display_order: data.display_order ?? 0
      };

      const { data: result, error } = await supabase
        .from('return_reasons')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('Error creating return reason:', error);
        throw new Error(`Error al crear motivo: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  /**
   * Actualizar un motivo de devolución
   */
  static async update(id: number, data: UpdateReturnReasonData): Promise<ReturnReason> {
    try {
      const organizationId = this.getOrganizationId();

      // Verificar código único si se está cambiando
      if (data.code) {
        const { data: existing } = await supabase
          .from('return_reasons')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('code', data.code)
          .neq('id', id)
          .single();

        if (existing) {
          throw new Error(`Ya existe un motivo con el código "${data.code}"`);
        }
      }

      const updateData: any = { ...data };
      if (data.code) {
        updateData.code = data.code.toUpperCase();
      }

      const { data: result, error } = await supabase
        .from('return_reasons')
        .update(updateData)
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating return reason:', error);
        throw new Error(`Error al actualizar motivo: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  /**
   * Eliminar un motivo de devolución
   */
  static async delete(id: number): Promise<void> {
    try {
      const organizationId = this.getOrganizationId();

      // Verificar si está siendo usado en devoluciones
      const { data: usedInReturns } = await supabase
        .from('returns')
        .select('id')
        .eq('reason_id', id)
        .limit(1);

      if (usedInReturns && usedInReturns.length > 0) {
        throw new Error('No se puede eliminar el motivo porque está siendo usado en devoluciones existentes. Puede desactivarlo en su lugar.');
      }

      const { error } = await supabase
        .from('return_reasons')
        .delete()
        .eq('id', id)
        .eq('organization_id', organizationId);

      if (error) {
        console.error('Error deleting return reason:', error);
        throw new Error(`Error al eliminar motivo: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  /**
   * Duplicar un motivo de devolución
   */
  static async duplicate(id: number): Promise<ReturnReason> {
    try {
      const original = await this.getById(id);
      
      if (!original) {
        throw new Error('Motivo no encontrado');
      }

      // Generar nuevo código
      const newCode = `${original.code}_COPIA`;

      return this.create({
        code: newCode,
        name: `${original.name} (Copia)`,
        description: original.description,
        requires_photo: original.requires_photo,
        affects_inventory: original.affects_inventory,
        is_active: false,
        display_order: original.display_order + 1
      });
    } catch (error) {
      console.error('Error in duplicate:', error);
      throw error;
    }
  }

  /**
   * Cambiar estado activo/inactivo
   */
  static async toggleActive(id: number): Promise<ReturnReason> {
    try {
      const reason = await this.getById(id);
      
      if (!reason) {
        throw new Error('Motivo no encontrado');
      }

      return this.update(id, { is_active: !reason.is_active });
    } catch (error) {
      console.error('Error in toggleActive:', error);
      throw error;
    }
  }

  /**
   * Reordenar motivos
   */
  static async reorder(orderedIds: number[]): Promise<void> {
    try {
      const organizationId = this.getOrganizationId();

      const updates = orderedIds.map((id, index) => 
        supabase
          .from('return_reasons')
          .update({ display_order: index })
          .eq('id', id)
          .eq('organization_id', organizationId)
      );

      await Promise.all(updates);
    } catch (error) {
      console.error('Error in reorder:', error);
      throw error;
    }
  }

  /**
   * Importar motivos desde CSV/JSON
   */
  static async importFromData(data: CreateReturnReasonData[]): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;

    for (const item of data) {
      try {
        await this.create(item);
        success++;
      } catch (error: any) {
        errors.push(`${item.code}: ${error.message}`);
      }
    }

    return { success, errors };
  }
}
