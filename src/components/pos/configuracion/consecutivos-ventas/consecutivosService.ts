import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface SaleSequence {
  id: number;
  organization_id: number;
  branch_id: number;
  sequence_type: string;
  prefix: string | null;
  current_number: number;
  padding: number;
  reset_period: string | null;
  last_reset_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branches?: { id: number; name: string };
}

export interface SaleSequenceFormData {
  branch_id: number;
  sequence_type: string;
  prefix: string;
  current_number: number;
  padding: number;
  reset_period: string | null;
  is_active: boolean;
}

export interface Branch {
  id: number;
  name: string;
}

export interface ConsecutivosStats {
  total: number;
  active: number;
  byType: Record<string, number>;
}

export const SEQUENCE_TYPES = [
  { value: 'sale', label: 'Ventas' },
  { value: 'order', label: 'Pedidos' },
  { value: 'quote', label: 'Cotizaciones' },
  { value: 'ticket', label: 'Tickets' },
  { value: 'return', label: 'Devoluciones' },
];

export const RESET_PERIODS = [
  { value: null, label: 'Sin reset' },
  { value: 'daily', label: 'Diario' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'yearly', label: 'Anual' },
];

export class ConsecutivosService {
  // Obtener todas las secuencias
  static async getSequences(): Promise<SaleSequence[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('sale_sequences')
      .select(`
        *,
        branches(id, name)
      `)
      .eq('organization_id', orgId)
      .order('sequence_type')
      .order('branch_id');

    if (error) throw error;
    return data || [];
  }

  // Obtener una secuencia por ID
  static async getSequenceById(id: number): Promise<SaleSequence | null> {
    const { data, error } = await supabase
      .from('sale_sequences')
      .select(`
        *,
        branches(id, name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  // Crear nueva secuencia
  static async createSequence(formData: SaleSequenceFormData): Promise<SaleSequence> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('sale_sequences')
      .insert({
        organization_id: orgId,
        branch_id: formData.branch_id,
        sequence_type: formData.sequence_type,
        prefix: formData.prefix || null,
        current_number: formData.current_number,
        padding: formData.padding,
        reset_period: formData.reset_period,
        is_active: formData.is_active,
      })
      .select(`
        *,
        branches(id, name)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  // Actualizar secuencia
  static async updateSequence(id: number, formData: Partial<SaleSequenceFormData>): Promise<SaleSequence> {
    const { data, error } = await supabase
      .from('sale_sequences')
      .update({
        ...formData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        branches(id, name)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  // Duplicar secuencia
  static async duplicateSequence(id: number): Promise<SaleSequence> {
    const original = await this.getSequenceById(id);
    if (!original) throw new Error('Secuencia no encontrada');

    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('sale_sequences')
      .insert({
        organization_id: orgId,
        branch_id: original.branch_id,
        sequence_type: original.sequence_type,
        prefix: original.prefix ? `${original.prefix}-COPIA` : 'COPIA',
        current_number: 0,
        padding: original.padding,
        reset_period: original.reset_period,
        is_active: false,
      })
      .select(`
        *,
        branches(id, name)
      `)
      .single();

    if (error) throw error;
    return data;
  }

  // Eliminar secuencia
  static async deleteSequence(id: number): Promise<void> {
    const { error } = await supabase
      .from('sale_sequences')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Activar/desactivar secuencia
  static async toggleSequence(id: number, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('sale_sequences')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // Resetear número de secuencia
  static async resetSequence(id: number): Promise<void> {
    const { error } = await supabase
      .from('sale_sequences')
      .update({ 
        current_number: 0, 
        last_reset_at: new Date().toISOString(),
        updated_at: new Date().toISOString() 
      })
      .eq('id', id);

    if (error) throw error;
  }

  // Obtener estadísticas
  static async getStats(): Promise<ConsecutivosStats> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('sale_sequences')
      .select('id, is_active, sequence_type')
      .eq('organization_id', orgId);

    if (error) throw error;

    const byType: Record<string, number> = {};
    data?.forEach(seq => {
      byType[seq.sequence_type] = (byType[seq.sequence_type] || 0) + 1;
    });

    return {
      total: data?.length || 0,
      active: data?.filter(s => s.is_active).length || 0,
      byType,
    };
  }

  // Obtener sucursales
  static async getBranches(): Promise<Branch[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Generar preview del consecutivo
  static generatePreview(prefix: string | null, number: number, padding: number): string {
    const paddedNumber = String(number).padStart(padding, '0');
    return prefix ? `${prefix}${paddedNumber}` : paddedNumber;
  }

  // Importar secuencias desde CSV
  static async importFromCSV(csvData: string): Promise<{ success: number; errors: string[] }> {
    const orgId = getOrganizationId();
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    const errors: string[] = [];
    let success = 0;

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      
      headers.forEach((h, idx) => {
        row[h] = values[idx] || '';
      });

      try {
        await supabase.from('sale_sequences').insert({
          organization_id: orgId,
          branch_id: parseInt(row.branch_id) || 1,
          sequence_type: row.sequence_type || 'sale',
          prefix: row.prefix || null,
          current_number: parseInt(row.current_number) || 0,
          padding: parseInt(row.padding) || 6,
          reset_period: row.reset_period || null,
          is_active: row.is_active === 'true',
        });
        success++;
      } catch (err: any) {
        errors.push(`Línea ${i + 1}: ${err.message}`);
      }
    }

    return { success, errors };
  }

  // Exportar secuencias a CSV
  static exportToCSV(sequences: SaleSequence[]): void {
    const headers = ['branch_id', 'branch_name', 'sequence_type', 'prefix', 'current_number', 'padding', 'reset_period', 'is_active'];
    const csvContent = [
      headers.join(','),
      ...sequences.map(seq => [
        seq.branch_id,
        seq.branches?.name || '',
        seq.sequence_type,
        seq.prefix || '',
        seq.current_number,
        seq.padding,
        seq.reset_period || '',
        seq.is_active,
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `consecutivos_ventas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}
