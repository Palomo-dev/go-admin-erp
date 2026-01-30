import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getCurrentBranchId } from '@/lib/hooks/useOrganization';

export interface PaymentMethod {
  code: string;
  name: string;
  requires_reference: boolean;
  is_active: boolean;
  is_system: boolean;
}

export interface OrganizationPaymentMethod {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean;
  settings: Record<string, any>;
  payment_methods?: PaymentMethod;
}

export interface OrganizationTax {
  id: string;
  organization_id: number;
  name: string;
  rate: number;
  description?: string;
  is_default: boolean;
  is_active: boolean;
}

export interface ServiceCharge {
  id: number;
  organization_id: number;
  branch_id?: number;
  name: string;
  charge_type: 'percentage' | 'fixed';
  charge_value: number;
  min_amount?: number;
  min_guests?: number;
  applies_to: string;
  is_taxable: boolean;
  is_optional: boolean;
  is_active: boolean;
}

export interface InvoiceSequence {
  id: number;
  organization_id: number;
  branch_id: number;
  document_type: string;
  resolution_number?: string;
  resolution_date?: string;
  prefix: string;
  range_start: number;
  range_end: number;
  current_number: number;
  valid_from?: string;
  valid_until?: string;
  is_active: boolean;
  alert_threshold: number;
}

export interface SaleSequence {
  id: number;
  organization_id: number;
  branch_id: number;
  sequence_type: string;
  prefix?: string;
  current_number: number;
  padding: number;
  reset_period?: string;
  last_reset_at?: string;
  is_active: boolean;
  branches?: { name: string };
}

export interface ConfigStats {
  paymentMethods: number;
  taxes: number;
  serviceCharges: number;
  invoiceSequences: number;
  saleSequences: number;
}

export class ConfiguracionService {
  // Obtener métodos de pago de la organización
  static async getPaymentMethods(): Promise<OrganizationPaymentMethod[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_payment_methods')
      .select(`
        id,
        organization_id,
        payment_method_code,
        is_active,
        settings,
        payment_methods!inner(code, name, requires_reference, is_active, is_system)
      `)
      .eq('organization_id', orgId)
      .order('payment_method_code');

    if (error) throw error;
    return data || [];
  }

  // Obtener todos los métodos de pago disponibles
  static async getAllPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Activar/desactivar método de pago
  static async togglePaymentMethod(id: number, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('organization_payment_methods')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // Agregar método de pago a la organización
  static async addPaymentMethod(code: string): Promise<void> {
    const orgId = getOrganizationId();

    const { error } = await supabase
      .from('organization_payment_methods')
      .insert({
        organization_id: orgId,
        payment_method_code: code,
        is_active: true,
        settings: {},
      });

    if (error) throw error;
  }

  // Obtener impuestos de la organización
  static async getTaxes(): Promise<OrganizationTax[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('organization_taxes')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Obtener cargos de servicio
  static async getServiceCharges(): Promise<ServiceCharge[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('service_charges')
      .select('*')
      .eq('organization_id', orgId)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  // Activar/desactivar cargo de servicio
  static async toggleServiceCharge(id: number, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('service_charges')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  // Obtener secuencias de facturación
  static async getInvoiceSequences(): Promise<InvoiceSequence[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('invoice_sequences')
      .select('*')
      .eq('organization_id', orgId)
      .order('prefix');

    if (error) throw error;
    return data || [];
  }

  // Obtener secuencias de ventas
  static async getSaleSequences(): Promise<SaleSequence[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('sale_sequences')
      .select(`
        *,
        branches(name)
      `)
      .eq('organization_id', orgId)
      .order('sequence_type');

    if (error) throw error;
    return data || [];
  }

  // Obtener estadísticas de configuración
  static async getConfigStats(): Promise<ConfigStats> {
    const orgId = getOrganizationId();

    const [paymentMethods, taxes, serviceCharges, invoiceSequences, saleSequences] = await Promise.all([
      supabase.from('organization_payment_methods').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('organization_taxes').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('service_charges').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('invoice_sequences').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('sale_sequences').select('id', { count: 'exact' }).eq('organization_id', orgId).eq('is_active', true),
    ]);

    return {
      paymentMethods: paymentMethods.count || 0,
      taxes: taxes.count || 0,
      serviceCharges: serviceCharges.count || 0,
      invoiceSequences: invoiceSequences.count || 0,
      saleSequences: saleSequences.count || 0,
    };
  }

  // Obtener sucursales
  static async getBranches(): Promise<{ id: number; name: string }[]> {
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
}
