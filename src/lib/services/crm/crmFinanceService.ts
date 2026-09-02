import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Vista 360° financiera (Fase 9 - Ficha 360°).
 *
 * Reusa tablas financieras existentes sin duplicar lógica:
 *   - invoice_sales (facturas con opportunity_id, customer_id, total, balance, status)
 *   - payments (pagos con source, source_id, amount, status, payment_date)
 *   - accounts_receivable (cartera con invoice_id, customer_id, balance, status)
 *   - commissions (comisiones con source_type, source_id, payee_id, commission_amount, status)
 *   - credit_notes (notas crédito con customer_id, amount, balance, status)
 *   - quotations (cotizaciones con opportunity_id, total, status, payment_link_url, signature_id)
 *
 * No crea tablas nuevas. Solo lecturas con JOINs/filtros sobre existentes.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface InvoiceSalesRow {
  id: string;
  number: string;
  customer_id: string;
  opportunity_id: string | null;
  total: number;
  balance: number;
  status: string;
  issue_date: string | null;
  due_date: string | null;
  currency: string | null;
}

export interface PaymentRow {
  id: string;
  source: string | null;
  source_id: string | null;
  amount: number;
  currency: string;
  reference: string | null;
  status: string | null;
  payment_date: string | null;
  method: string | null;
}

export interface AccountsReceivableRow {
  id: string;
  invoice_id: string | null;
  customer_id: string | null;
  amount: number;
  balance: number;
  status: string | null;
  due_date: string | null;
  days_overdue: number | null;
}

export interface CommissionRow {
  id: string;
  source_type: string;
  source_id: string;
  payee_id: string | null;
  payee_name: string | null;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: string;
  currency: string | null;
}

export interface CreditNoteRow {
  id: string;
  customer_id: string;
  amount: number;
  balance: number;
  status: string;
  expiry_date: string | null;
  notes: string | null;
}

export interface QuotationFinanceRow {
  id: string;
  number: string;
  customer_id: string;
  opportunity_id: string | null;
  total: number;
  status: string;
  payment_link_url: string | null;
  signature_id: string | null;
  issue_date: string;
  valid_until: string | null;
}

export interface CustomerFinance360 {
  invoices: InvoiceSalesRow[];
  payments: PaymentRow[];
  accounts_receivable: AccountsReceivableRow[];
  commissions: CommissionRow[];
  credit_notes: CreditNoteRow[];
  summary: {
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
    total_commission_accrued: number;
    total_commission_paid: number;
    total_credit_notes: number;
  };
}

export interface OpportunityFinance360 {
  invoices: InvoiceSalesRow[];
  payments: PaymentRow[];
  commissions: CommissionRow[];
  quotations: QuotationFinanceRow[];
  summary: {
    total_invoiced: number;
    total_paid: number;
    total_outstanding: number;
    total_commission_accrued: number;
    total_commission_paid: number;
    quotations_count: number;
  };
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Vista financiera 360° de un cliente.
 * Combina facturas, pagos, cartera, comisiones y notas crédito.
 */
export async function getCustomerFinance360(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<CustomerFinance360> {
  // 1. Facturas del cliente
  const { data: invoicesData } = await supabase
    .from('invoice_sales')
    .select('id, number, customer_id, opportunity_id, total, balance, status, issue_date, due_date, currency')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .order('issue_date', { ascending: false });

  const invoices = (invoicesData || []) as unknown as InvoiceSalesRow[];

  // 2. Pagos asociados a las facturas del cliente
  const invoiceIds = invoices.map((inv) => inv.id);
  let payments: PaymentRow[] = [];
  if (invoiceIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('id, source, source_id, amount, currency, reference, status, payment_date, method')
      .eq('organization_id', orgId)
      .eq('source', 'invoice_sales')
      .in('source_id', invoiceIds)
      .order('payment_date', { ascending: false });
    payments = (paymentsData || []) as unknown as PaymentRow[];
  }

  // 3. Cartera (accounts_receivable) del cliente
  const { data: arData } = await supabase
    .from('accounts_receivable')
    .select('id, invoice_id, customer_id, amount, balance, status, due_date, days_overdue')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .order('due_date', { ascending: false });

  const accountsReceivable = (arData || []) as unknown as AccountsReceivableRow[];

  // 4. Comisiones del cliente (vía opportunity_id → buscar oportunidades del cliente)
  // Primero obtenemos los opportunity_ids del cliente
  const { data: oppData } = await supabase
    .from('opportunities')
    .select('id')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId);

  const oppIds = (oppData || []).map((o) => (o as { id: string }).id);
  let commissions: CommissionRow[] = [];
  if (oppIds.length > 0) {
    const { data: commData } = await supabase
      .from('commissions')
      .select('id, source_type, source_id, payee_id, payee_name, base_amount, commission_rate, commission_amount, status, currency')
      .eq('organization_id', orgId)
      .eq('source_type', 'opportunity')
      .in('source_id', oppIds)
      .order('created_at', { ascending: false });
    commissions = (commData || []) as unknown as CommissionRow[];
  }

  // 5. Notas crédito del cliente
  const { data: cnData } = await supabase
    .from('credit_notes')
    .select('id, customer_id, amount, balance, status, expiry_date, notes')
    .eq('organization_id', orgId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  const creditNotes = (cnData || []) as unknown as CreditNoteRow[];

  // 6. Resumen calculado
  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const totalPaid = payments
    .filter((p) => p.status === 'completed' || p.status === 'confirmed')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalOutstanding = accountsReceivable.reduce((sum, ar) => sum + Number(ar.balance || 0), 0);
  const totalCommissionAccrued = commissions
    .filter((c) => c.status === 'accrued')
    .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
  const totalCommissionPaid = commissions
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
  const totalCreditNotes = creditNotes.reduce((sum, cn) => sum + Number(cn.balance || 0), 0);

  return {
    invoices,
    payments,
    accounts_receivable: accountsReceivable,
    commissions,
    credit_notes: creditNotes,
    summary: {
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      total_outstanding: totalOutstanding,
      total_commission_accrued: totalCommissionAccrued,
      total_commission_paid: totalCommissionPaid,
      total_credit_notes: totalCreditNotes,
    },
  };
}

/**
 * Vista financiera 360° de una oportunidad.
 * Combina facturas, pagos, comisiones y cotizaciones vinculadas.
 */
export async function getOpportunityFinance360(
  orgId: number,
  opportunityId: string,
  supabase: SupabaseClient
): Promise<OpportunityFinance360> {
  // 1. Facturas vinculadas a la oportunidad
  const { data: invoicesData } = await supabase
    .from('invoice_sales')
    .select('id, number, customer_id, opportunity_id, total, balance, status, issue_date, due_date, currency')
    .eq('organization_id', orgId)
    .eq('opportunity_id', opportunityId)
    .order('issue_date', { ascending: false });

  const invoices = (invoicesData || []) as unknown as InvoiceSalesRow[];

  // 2. Pagos vinculados a esas facturas
  const invoiceIds = invoices.map((inv) => inv.id);
  let payments: PaymentRow[] = [];
  if (invoiceIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('id, source, source_id, amount, currency, reference, status, payment_date, method')
      .eq('organization_id', orgId)
      .eq('source', 'invoice_sales')
      .in('source_id', invoiceIds)
      .order('payment_date', { ascending: false });
    payments = (paymentsData || []) as unknown as PaymentRow[];
  }

  // 3. Comisiones vinculadas a la oportunidad
  const { data: commData } = await supabase
    .from('commissions')
    .select('id, source_type, source_id, payee_id, payee_name, base_amount, commission_rate, commission_amount, status, currency')
    .eq('organization_id', orgId)
    .eq('source_type', 'opportunity')
    .eq('source_id', opportunityId)
    .order('created_at', { ascending: false });

  const commissions = (commData || []) as unknown as CommissionRow[];

  // 4. Cotizaciones vinculadas a la oportunidad
  const { data: quotData } = await supabase
    .from('quotations')
    .select('id, number, customer_id, opportunity_id, total, status, payment_link_url, signature_id, issue_date, valid_until')
    .eq('organization_id', orgId)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false });

  const quotations = (quotData || []) as unknown as QuotationFinanceRow[];

  // 5. Resumen
  const totalInvoiced = invoices.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
  const totalPaid = payments
    .filter((p) => p.status === 'completed' || p.status === 'confirmed')
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance || 0), 0);
  const totalCommissionAccrued = commissions
    .filter((c) => c.status === 'accrued')
    .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);
  const totalCommissionPaid = commissions
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.commission_amount || 0), 0);

  return {
    invoices,
    payments,
    commissions,
    quotations,
    summary: {
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      total_outstanding: totalOutstanding,
      total_commission_accrued: totalCommissionAccrued,
      total_commission_paid: totalCommissionPaid,
      quotations_count: quotations.length,
    },
  };
}
