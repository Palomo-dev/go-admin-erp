import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface FinanzasFilters {
  dateFrom: string;
  dateTo: string;
  branchId: number | null;
  status: string | null;
  currency: string | null;
}

export interface FinanzasKPI {
  totalFacturado: number;
  totalPagado: number;
  totalBalance: number;
  facturasEmitidas: number;
  facturasPagadas: number;
  facturasAnuladas: number;
  cuentasPorCobrar: number;
  cuentasPorPagar: number;
}

export interface FacturaResumen {
  id: string;
  number: string;
  issue_date: string;
  due_date: string;
  customer_name: string | null;
  branch_name: string;
  subtotal: number;
  tax_total: number;
  total: number;
  balance: number;
  status: string;
  currency: string;
  document_type: string;
}

export interface PagoPorMetodo {
  method: string;
  total: number;
  count: number;
}

export interface PagoPorDia {
  fecha: string;
  ingresos: number;
  count: number;
}

export interface AgingBucket {
  label: string;
  ar_total: number;
  ar_count: number;
  ap_total: number;
  ap_count: number;
}

export interface CxCResumen {
  customer_id: string;
  customer_name: string;
  total_amount: number;
  total_balance: number;
  count: number;
  max_days_overdue: number;
}

export interface CxPResumen {
  supplier_id: number;
  supplier_name: string;
  total_amount: number;
  total_balance: number;
  count: number;
  max_days_overdue: number;
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const finanzasReportService = {

  async getKPIs(organizationId: number, filters: FinanzasFilters): Promise<FinanzasKPI> {
    // Facturas en el período
    let invQuery = supabase
      .from('invoice_sales')
      .select('total, balance, status')
      .eq('organization_id', organizationId)
      .gte('issue_date', filters.dateFrom)
      .lte('issue_date', filters.dateTo + 'T23:59:59.999Z');

    if (filters.branchId) invQuery = invQuery.eq('branch_id', filters.branchId);
    if (filters.currency) invQuery = invQuery.eq('currency', filters.currency);

    const { data: invoices } = await invQuery;

    let totalFacturado = 0;
    let totalBalance = 0;
    let facturasEmitidas = 0;
    let facturasPagadas = 0;
    let facturasAnuladas = 0;

    for (const inv of invoices || []) {
      facturasEmitidas++;
      if (inv.status === 'paid') facturasPagadas++;
      else if (inv.status === 'cancelled' || inv.status === 'voided') facturasAnuladas++;
      if (inv.status !== 'cancelled' && inv.status !== 'voided') {
        totalFacturado += Number(inv.total) || 0;
        totalBalance += Number(inv.balance) || 0;
      }
    }

    // Pagos en el período
    let payQuery = supabase
      .from('payments')
      .select('amount')
      .eq('organization_id', organizationId)
      .eq('status', 'completed')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    if (filters.branchId) payQuery = payQuery.eq('branch_id', filters.branchId);
    if (filters.currency) payQuery = payQuery.eq('currency', filters.currency);

    const { data: payments } = await payQuery;
    const totalPagado = (payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

    // Cuentas por cobrar pendientes
    const { data: arData } = await supabase
      .from('accounts_receivable')
      .select('balance')
      .eq('organization_id', organizationId)
      .neq('status', 'paid')
      .neq('status', 'cancelled');

    const cuentasPorCobrar = (arData || []).reduce((s, r) => s + (Number(r.balance) || 0), 0);

    // Cuentas por pagar pendientes
    const { data: apData } = await supabase
      .from('accounts_payable')
      .select('balance')
      .eq('organization_id', organizationId)
      .neq('status', 'paid')
      .neq('status', 'cancelled');

    const cuentasPorPagar = (apData || []).reduce((s, r) => s + (Number(r.balance) || 0), 0);

    return {
      totalFacturado, totalPagado, totalBalance,
      facturasEmitidas, facturasPagadas, facturasAnuladas,
      cuentasPorCobrar, cuentasPorPagar,
    };
  },

  async getFacturas(
    organizationId: number,
    filters: FinanzasFilters,
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ data: FacturaResumen[]; total: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let baseQuery = supabase
      .from('invoice_sales')
      .select('id, number, issue_date, due_date, customer_id, branch_id, subtotal, tax_total, total, balance, status, currency, document_type', { count: 'exact' })
      .eq('organization_id', organizationId)
      .gte('issue_date', filters.dateFrom)
      .lte('issue_date', filters.dateTo + 'T23:59:59.999Z');

    if (filters.branchId) baseQuery = baseQuery.eq('branch_id', filters.branchId);
    if (filters.status) baseQuery = baseQuery.eq('status', filters.status);
    if (filters.currency) baseQuery = baseQuery.eq('currency', filters.currency);

    const { data, count, error } = await baseQuery
      .order('issue_date', { ascending: false })
      .range(from, to);

    if (error || !data) return { data: [], total: count ?? 0 };

    // Resolver nombres
    const customerIds = Array.from(new Set(data.map((d) => d.customer_id).filter(Boolean)));
    const branchIds = Array.from(new Set(data.map((d) => d.branch_id).filter(Boolean)));

    const [custRes, branchRes] = await Promise.all([
      customerIds.length > 0
        ? supabase.from('customers').select('id, full_name, first_name, last_name').in('id', customerIds)
        : { data: [] },
      branchIds.length > 0
        ? supabase.from('branches').select('id, name').in('id', branchIds)
        : { data: [] },
    ]);

    const custMap: Record<string, string> = {};
    for (const c of custRes.data || []) {
      custMap[c.id] = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sin nombre';
    }
    const branchMap: Record<number, string> = {};
    for (const b of branchRes.data || []) branchMap[b.id] = b.name;

    return {
      data: data.map((inv) => ({
        id: inv.id,
        number: inv.number || '',
        issue_date: inv.issue_date,
        due_date: inv.due_date,
        customer_name: custMap[inv.customer_id] || null,
        branch_name: branchMap[inv.branch_id] || '',
        subtotal: Number(inv.subtotal) || 0,
        tax_total: Number(inv.tax_total) || 0,
        total: Number(inv.total) || 0,
        balance: Number(inv.balance) || 0,
        status: inv.status || '',
        currency: inv.currency || 'COP',
        document_type: inv.document_type || 'invoice',
      })),
      total: count ?? 0,
    };
  },

  async getPagosPorMetodo(
    organizationId: number,
    filters: FinanzasFilters
  ): Promise<PagoPorMetodo[]> {
    let query = supabase
      .from('payments')
      .select('method, amount')
      .eq('organization_id', organizationId)
      .eq('status', 'completed')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z');

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.currency) query = query.eq('currency', filters.currency);

    const { data } = await query;
    if (!data) return [];

    const grouped: Record<string, { total: number; count: number }> = {};
    for (const p of data) {
      const m = p.method || 'Otro';
      if (!grouped[m]) grouped[m] = { total: 0, count: 0 };
      grouped[m].total += Number(p.amount) || 0;
      grouped[m].count += 1;
    }

    return Object.entries(grouped)
      .map(([method, v]) => ({ method, total: v.total, count: v.count }))
      .sort((a, b) => b.total - a.total);
  },

  async getPagosPorDia(
    organizationId: number,
    filters: FinanzasFilters
  ): Promise<PagoPorDia[]> {
    let query = supabase
      .from('payments')
      .select('amount, created_at')
      .eq('organization_id', organizationId)
      .eq('status', 'completed')
      .gte('created_at', filters.dateFrom)
      .lte('created_at', filters.dateTo + 'T23:59:59.999Z')
      .order('created_at', { ascending: true });

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);
    if (filters.currency) query = query.eq('currency', filters.currency);

    const { data } = await query;
    if (!data) return [];

    const grouped: Record<string, { ingresos: number; count: number }> = {};
    for (const p of data) {
      const fecha = new Date(p.created_at).toISOString().split('T')[0];
      if (!grouped[fecha]) grouped[fecha] = { ingresos: 0, count: 0 };
      grouped[fecha].ingresos += Number(p.amount) || 0;
      grouped[fecha].count += 1;
    }

    return Object.entries(grouped).map(([fecha, v]) => ({
      fecha, ingresos: v.ingresos, count: v.count,
    }));
  },

  async getAging(organizationId: number): Promise<AgingBucket[]> {
    const buckets: AgingBucket[] = [
      { label: 'Vigente', ar_total: 0, ar_count: 0, ap_total: 0, ap_count: 0 },
      { label: '1-30 días', ar_total: 0, ar_count: 0, ap_total: 0, ap_count: 0 },
      { label: '31-60 días', ar_total: 0, ar_count: 0, ap_total: 0, ap_count: 0 },
      { label: '61-90 días', ar_total: 0, ar_count: 0, ap_total: 0, ap_count: 0 },
      { label: '+90 días', ar_total: 0, ar_count: 0, ap_total: 0, ap_count: 0 },
    ];

    // AR
    const { data: arData } = await supabase
      .from('accounts_receivable')
      .select('balance, days_overdue')
      .eq('organization_id', organizationId)
      .neq('status', 'paid').neq('status', 'cancelled');

    for (const r of arData || []) {
      const days = Number(r.days_overdue) || 0;
      const bal = Number(r.balance) || 0;
      const idx = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
      buckets[idx].ar_total += bal;
      buckets[idx].ar_count += 1;
    }

    // AP
    const { data: apData } = await supabase
      .from('accounts_payable')
      .select('balance, days_overdue')
      .eq('organization_id', organizationId)
      .neq('status', 'paid').neq('status', 'cancelled');

    for (const r of apData || []) {
      const days = Number(r.days_overdue) || 0;
      const bal = Number(r.balance) || 0;
      const idx = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
      buckets[idx].ap_total += bal;
      buckets[idx].ap_count += 1;
    }

    return buckets;
  },

  async getTopCxC(organizationId: number, limit: number = 10): Promise<CxCResumen[]> {
    const { data } = await supabase
      .from('accounts_receivable')
      .select('customer_id, amount, balance, days_overdue')
      .eq('organization_id', organizationId)
      .neq('status', 'paid').neq('status', 'cancelled');

    if (!data || data.length === 0) return [];

    const grouped: Record<string, { amount: number; balance: number; count: number; maxDays: number }> = {};
    for (const r of data) {
      const cid = r.customer_id;
      if (!cid) continue;
      if (!grouped[cid]) grouped[cid] = { amount: 0, balance: 0, count: 0, maxDays: 0 };
      grouped[cid].amount += Number(r.amount) || 0;
      grouped[cid].balance += Number(r.balance) || 0;
      grouped[cid].count += 1;
      grouped[cid].maxDays = Math.max(grouped[cid].maxDays, Number(r.days_overdue) || 0);
    }

    const customerIds = Object.keys(grouped);
    const { data: customers } = await supabase
      .from('customers').select('id, full_name, first_name, last_name').in('id', customerIds);

    const nameMap: Record<string, string> = {};
    for (const c of customers || []) {
      nameMap[c.id] = c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Sin nombre';
    }

    return Object.entries(grouped)
      .map(([cid, v]) => ({
        customer_id: cid,
        customer_name: nameMap[cid] || 'Sin nombre',
        total_amount: v.amount, total_balance: v.balance,
        count: v.count, max_days_overdue: v.maxDays,
      }))
      .sort((a, b) => b.total_balance - a.total_balance)
      .slice(0, limit);
  },

  async getTopCxP(organizationId: number, limit: number = 10): Promise<CxPResumen[]> {
    const { data } = await supabase
      .from('accounts_payable')
      .select('supplier_id, amount, balance, days_overdue')
      .eq('organization_id', organizationId)
      .neq('status', 'paid').neq('status', 'cancelled');

    if (!data || data.length === 0) return [];

    const grouped: Record<number, { amount: number; balance: number; count: number; maxDays: number }> = {};
    for (const r of data) {
      const sid = r.supplier_id;
      if (!sid) continue;
      if (!grouped[sid]) grouped[sid] = { amount: 0, balance: 0, count: 0, maxDays: 0 };
      grouped[sid].amount += Number(r.amount) || 0;
      grouped[sid].balance += Number(r.balance) || 0;
      grouped[sid].count += 1;
      grouped[sid].maxDays = Math.max(grouped[sid].maxDays, Number(r.days_overdue) || 0);
    }

    const supplierIds = Object.keys(grouped).map(Number);
    const { data: suppliers } = await supabase
      .from('suppliers').select('id, name').in('id', supplierIds);

    const nameMap: Record<number, string> = {};
    for (const s of suppliers || []) nameMap[s.id] = s.name || 'Sin nombre';

    return Object.entries(grouped)
      .map(([sid, v]) => ({
        supplier_id: Number(sid),
        supplier_name: nameMap[Number(sid)] || 'Sin nombre',
        total_amount: v.amount, total_balance: v.balance,
        count: v.count, max_days_overdue: v.maxDays,
      }))
      .sort((a, b) => b.total_balance - a.total_balance)
      .slice(0, limit);
  },

  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    const { data } = await supabase.from('branches').select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true).order('name');
    return data || [];
  },

  async saveReport(organizationId: number, userId: string, report: { name: string; filters: FinanzasFilters }) {
    const { data, error } = await supabase.from('saved_reports').insert({
      organization_id: organizationId, user_id: userId,
      name: report.name, module: 'finanzas', filters: report.filters as any,
    }).select().single();
    if (error) { console.error('Error saving report:', error); return null; }
    return data;
  },

  async getSavedReports(organizationId: number) {
    const { data } = await supabase.from('saved_reports').select('*')
      .eq('organization_id', organizationId).eq('module', 'finanzas')
      .order('created_at', { ascending: false });
    return data || [];
  },
};
