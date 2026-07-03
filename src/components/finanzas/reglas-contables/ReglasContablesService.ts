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
  { value: 'sale_payment', label: 'Cobro de Venta' },
  { value: 'sale_credit_note', label: 'Nota Crédito Venta' },
  { value: 'purchase', label: 'Compra' },
  { value: 'purchase_payment', label: 'Pago de Compra' },
  { value: 'cash_movement', label: 'Movimiento de Caja' },
  { value: 'bank_transaction', label: 'Transacción Bancaria' },
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'payroll', label: 'Nómina' },
  { value: 'inventory', label: 'Inventario' },
  { value: 'bank', label: 'Banco' },
  { value: 'refund', label: 'Reembolso' },
];

export const EVENT_TYPES = [
  { value: 'created', label: 'Creación' },
  { value: 'paid', label: 'Pago' },
  { value: 'partial_paid', label: 'Pago Parcial' },
  { value: 'voided', label: 'Anulación' },
  { value: 'confirmed', label: 'Confirmación' },
  { value: 'cancelled', label: 'Cancelación' },
  { value: 'refunded', label: 'Reembolso' },
  { value: 'adjusted', label: 'Ajuste' },
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
        name: regla.name,
        description: regla.description || null,
        source_type: regla.source_type,
        event_type: regla.event_type,
        debit_account_code: regla.debit_account_code,
        credit_account_code: regla.credit_account_code,
        tax_account_code: regla.tax_account_code || null,
        use_tax_from_document: regla.use_tax_from_document || false,
        priority: regla.priority || 0,
        conditions: regla.conditions || null,
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
