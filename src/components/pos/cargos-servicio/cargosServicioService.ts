import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';
import { 
  ServiceCharge, 
  CreateServiceChargeData, 
  UpdateServiceChargeData,
  ServiceChargeFilters
} from './types';

export class CargosServicioService {
  /**
   * Obtener todos los cargos de servicio
   */
  static async getAll(filters: ServiceChargeFilters = {}): Promise<ServiceCharge[]> {
    try {
      const organizationId = getOrganizationId();
      
      let query = supabase
        .from('service_charges')
        .select(`
          *,
          branch:branches (
            id,
            name
          )
        `)
        .eq('organization_id', organizationId)
        .order('name', { ascending: true });

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.branch_id) {
        query = query.eq('branch_id', filters.branch_id);
      }

      if (filters.applies_to) {
        query = query.eq('applies_to', filters.applies_to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching service charges:', error);
        throw new Error(`Error al obtener cargos de servicio: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAll:', error);
      throw error;
    }
  }

  /**
   * Obtener cargos activos
   */
  static async getActive(): Promise<ServiceCharge[]> {
    return this.getAll({ is_active: true });
  }

  /**
   * Obtener un cargo por ID
   */
  static async getById(id: number): Promise<ServiceCharge | null> {
    try {
      const { data, error } = await supabase
        .from('service_charges')
        .select(`
          *,
          branch:branches (
            id,
            name
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Error al obtener cargo: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error in getById:', error);
      throw error;
    }
  }

  /**
   * Crear cargo de servicio
   */
  static async create(data: CreateServiceChargeData): Promise<ServiceCharge> {
    try {
      const organizationId = getOrganizationId();

      const { data: result, error } = await supabase
        .from('service_charges')
        .insert([{
          organization_id: organizationId,
          name: data.name,
          charge_type: data.charge_type,
          charge_value: data.charge_value,
          min_amount: data.min_amount || null,
          min_guests: data.min_guests || null,
          applies_to: data.applies_to,
          is_taxable: data.is_taxable,
          is_optional: data.is_optional,
          branch_id: data.branch_id || null,
          is_active: true
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating service charge:', error);
        throw new Error(`Error al crear cargo: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  }

  /**
   * Actualizar cargo de servicio
   */
  static async update(id: number, data: UpdateServiceChargeData): Promise<ServiceCharge> {
    try {
      const updateData: any = { 
        ...data,
        updated_at: new Date().toISOString()
      };

      const { data: result, error } = await supabase
        .from('service_charges')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating service charge:', error);
        throw new Error(`Error al actualizar cargo: ${error.message}`);
      }

      return result;
    } catch (error) {
      console.error('Error in update:', error);
      throw error;
    }
  }

  /**
   * Eliminar cargo de servicio
   */
  static async delete(id: number): Promise<void> {
    try {
      const { error } = await supabase
        .from('service_charges')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting service charge:', error);
        throw new Error(`Error al eliminar cargo: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in delete:', error);
      throw error;
    }
  }

  /**
   * Activar/Desactivar cargo
   */
  static async toggleActive(id: number, isActive: boolean): Promise<ServiceCharge> {
    return this.update(id, { is_active: isActive });
  }

  /**
   * Duplicar cargo de servicio
   */
  static async duplicate(id: number): Promise<ServiceCharge> {
    try {
      const original = await this.getById(id);
      if (!original) {
        throw new Error('Cargo no encontrado');
      }

      return this.create({
        name: `${original.name} (copia)`,
        charge_type: original.charge_type,
        charge_value: original.charge_value,
        min_amount: original.min_amount,
        min_guests: original.min_guests,
        applies_to: original.applies_to,
        is_taxable: original.is_taxable,
        is_optional: original.is_optional,
        branch_id: original.branch_id
      });
    } catch (error) {
      console.error('Error in duplicate:', error);
      throw error;
    }
  }

  /**
   * Obtener sucursales disponibles
   */
  static async getBranches(): Promise<{ id: number; name: string }[]> {
    try {
      const organizationId = getOrganizationId();

      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error fetching branches:', error);
        throw new Error(`Error al obtener sucursales: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error in getBranches:', error);
      throw error;
    }
  }

  /**
   * Importar cargos desde CSV
   */
  static async importFromCSV(csvData: string): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = [];
    let imported = 0;

    try {
      const lines = csvData.trim().split('\n');
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
      
      // Validar headers
      const requiredHeaders = ['name', 'charge_type', 'charge_value'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      if (missingHeaders.length > 0) {
        throw new Error(`Headers faltantes: ${missingHeaders.join(', ')}`);
      }

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = lines[i].split(',').map(v => v.trim());
          const row: Record<string, string> = {};
          
          headers.forEach((header, index) => {
            row[header] = values[index] || '';
          });

          if (!row.name || !row.charge_type || !row.charge_value) {
            errors.push(`Fila ${i + 1}: Campos requeridos faltantes`);
            continue;
          }

          await this.create({
            name: row.name,
            charge_type: row.charge_type as 'percentage' | 'fixed',
            charge_value: parseFloat(row.charge_value),
            min_amount: row.min_amount ? parseFloat(row.min_amount) : undefined,
            min_guests: row.min_guests ? parseInt(row.min_guests) : undefined,
            applies_to: (row.applies_to as any) || 'all',
            is_taxable: row.is_taxable?.toLowerCase() === 'true',
            is_optional: row.is_optional?.toLowerCase() === 'true'
          });

          imported++;
        } catch (rowError: any) {
          errors.push(`Fila ${i + 1}: ${rowError.message}`);
        }
      }

      return { imported, errors };
    } catch (error: any) {
      throw new Error(`Error al importar: ${error.message}`);
    }
  }

  /**
   * Calcular cargo aplicable
   */
  static calculateCharge(
    charge: ServiceCharge, 
    subtotal: number, 
    guests: number = 1
  ): number {
    // Verificar condiciones mínimas
    if (charge.min_amount && subtotal < charge.min_amount) {
      return 0;
    }
    if (charge.min_guests && guests < charge.min_guests) {
      return 0;
    }

    // Calcular según tipo
    if (charge.charge_type === 'percentage') {
      return (subtotal * charge.charge_value) / 100;
    } else {
      return charge.charge_value;
    }
  }
}
