import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

export interface AccountingRule {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  source_type: string;
  event_type: string;
  debit_account_code: string;
  credit_account_code: string;
  tax_account_code: string | null;
  use_tax_from_document: boolean;
  is_active: boolean;
  priority: number;
  conditions: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface ChartAccount {
  account_code: string;
  organization_id: number;
  name: string;
  type: string;
  parent_code: string | null;
  is_active: boolean;
  description: string | null;
}

export const SOURCE_TYPES = [
  { value: 'sale', label: 'Venta' },
  { value: 'purchase', label: 'Compra' },
  { value: 'payment', label: 'Pago' },
  { value: 'receipt', label: 'Cobro' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'expense', label: 'Gasto' },
  { value: 'bank', label: 'Banco' },
];

export const EVENT_TYPES = [
  { value: 'create', label: 'Creación' },
  { value: 'confirm', label: 'Confirmación' },
  { value: 'cancel', label: 'Cancelación' },
  { value: 'payment', label: 'Pago' },
  { value: 'refund', label: 'Reembolso' },
  { value: 'adjustment', label: 'Ajuste' },
];

export class ReglasContablesService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async obtenerReglas(): Promise<AccountingRule[]> {
    const organizationId = this.getOrganizationId();
    
    const { data, error } = await supabase
      .from('accounting_rules')
      .select('*')
      .eq('organization_id', organizationId)
      .order('source_type')
      .order('priority', { ascending: true });

    if (error) {
      console.error('Error obteniendo reglas:', error);
      throw error;
    }

    return data || [];
  }

  static async obtenerRegla(id: string): Promise<AccountingRule | null> {
    const { data, error } = await supabase
      .from('accounting_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error obteniendo regla:', error);
      return null;
    }

    return data;
  }

  static async crearRegla(regla: Partial<AccountingRule>): Promise<AccountingRule> {
    const organizationId = this.getOrganizationId();
    
    const { data, error } = await supabase
      .from('accounting_rules')
      .insert({
        ...regla,
        organization_id: organizationId,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando regla:', error);
      throw error;
    }

    return data;
  }

  static async actualizarRegla(id: string, regla: Partial<AccountingRule>): Promise<AccountingRule> {
    const { data, error } = await supabase
      .from('accounting_rules')
      .update({
        ...regla,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando regla:', error);
      throw error;
    }

    return data;
  }

  static async eliminarRegla(id: string): Promise<void> {
    const { error } = await supabase
      .from('accounting_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error eliminando regla:', error);
      throw error;
    }
  }

  static async toggleActivo(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('accounting_rules')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('Error actualizando estado:', error);
      throw error;
    }
  }

  static async duplicarRegla(id: string): Promise<AccountingRule> {
    const original = await this.obtenerRegla(id);
    if (!original) throw new Error('Regla no encontrada');

    const { id: _, created_at, updated_at, ...rest } = original;
    return this.crearRegla({
      ...rest,
      name: `${rest.name} (copia)`
    });
  }

  static async obtenerCuentasContables(): Promise<ChartAccount[]> {
    const organizationId = this.getOrganizationId();
    
    const { data, error } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('account_code');

    if (error) {
      console.error('Error obteniendo cuentas:', error);
      throw error;
    }

    return data || [];
  }
}
