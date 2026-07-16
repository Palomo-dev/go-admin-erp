import { supabase } from '@/lib/supabase/config';
import { getCurrentBranchId, getCurrentUserId } from '@/lib/hooks/useOrganization';

export interface SaldoAFavor {
  id: string;
  customer_id: string;
  customer_name: string | null;
  amount: number;
  balance: number;
  used: number;
  status: string;
  notes: string | null;
  expiry_date: string | null;
  created_at: string;
}

export interface ClienteSimple {
  id: string;
  full_name: string;
}

export interface FacturaPendiente {
  id: string;
  number: string;
  total: number;
  balance: number;
  issue_date: string;
}

export interface CrearSaldoInput {
  organizationId: number;
  customerId: string;
  amount: number;
  cashAccount?: string;
  notes?: string;
  expiry?: string | null;
}

export interface AplicarSaldoInput {
  creditId: string;
  invoiceId: string;
  amount: number;
}

export const saldosAFavorService = {
  /** Lista los saldos a favor de la organización. */
  async listar(organizationId: number): Promise<SaldoAFavor[]> {
    const { data, error } = await supabase.rpc('fn_list_customer_credits', {
      p_org: organizationId,
    });
    if (error) throw error;
    return (data || []) as SaldoAFavor[];
  },

  /** Lista los clientes de la organización para el selector. */
  async listarClientes(organizationId: number): Promise<ClienteSimple[]> {
    const { data, error } = await supabase
      .from('customers')
      .select('id, full_name')
      .eq('organization_id', organizationId)
      .order('full_name', { ascending: true });
    if (error) throw error;
    return (data || []) as ClienteSimple[];
  },

  /** Facturas de venta con saldo pendiente para un cliente. */
  async listarFacturasPendientes(
    organizationId: number,
    customerId: string
  ): Promise<FacturaPendiente[]> {
    const { data, error } = await supabase
      .from('invoice_sales')
      .select('id, number, total, balance, issue_date')
      .eq('organization_id', organizationId)
      .eq('customer_id', customerId)
      .is('document_type', null)
      .gt('balance', 0)
      .in('status', ['issued', 'partial', 'overdue'])
      .order('issue_date', { ascending: true });
    if (error) throw error;
    return (data || []) as FacturaPendiente[];
  },

  /** Crea un saldo a favor (anticipo) y su asiento contable. */
  async crear(input: CrearSaldoInput): Promise<string> {
    const userId = await getCurrentUserId();
    const branchId = getCurrentBranchId();
    const { data, error } = await supabase.rpc('fn_create_customer_credit', {
      p_org: input.organizationId,
      p_customer: input.customerId,
      p_amount: input.amount,
      p_cash_account: input.cashAccount || '1110',
      p_branch: branchId,
      p_notes: input.notes || null,
      p_expiry: input.expiry || null,
      p_created_by: userId,
    });
    if (error) throw error;
    return data as string;
  },

  /** Aplica un saldo a favor a una factura. */
  async aplicar(input: AplicarSaldoInput): Promise<string> {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase.rpc('fn_apply_customer_credit', {
      p_credit_id: input.creditId,
      p_invoice_id: input.invoiceId,
      p_amount: input.amount,
      p_created_by: userId,
    });
    if (error) throw error;
    return data as string;
  },
};
