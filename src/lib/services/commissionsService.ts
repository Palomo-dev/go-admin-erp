import { supabase } from '@/lib/supabase/config';

export type CommissionType = 'salesperson' | 'intermediation_sale' | 'intermediation_purchase';
export type CommissionSourceType = 'sale' | 'invoice_sale' | 'invoice_purchase' | 'opportunity';
export type CommissionPayeeType = 'employee' | 'supplier' | 'third_party';
export type CommissionStatus = 'accrued' | 'paid' | 'cancelled';

export interface Commission {
  id: string;
  organization_id: number;
  branch_id: number | null;
  commission_type: CommissionType;
  source_type: CommissionSourceType;
  source_id: string;
  source_item_id: string | null;
  payee_type: CommissionPayeeType;
  payee_id: string | null;
  payee_name: string | null;
  base_amount: number;
  commission_rate: number;
  commission_amount: number;
  currency: string | null;
  status: CommissionStatus;
  accrued_at: string | null;
  paid_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionFilters {
  status?: CommissionStatus | 'all';
  commission_type?: CommissionType | 'all';
  source_type?: CommissionSourceType | 'all';
  payee_id?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CommissionStats {
  total: number;
  accrued: number;
  paid: number;
  cancelled: number;
  totalAccruedAmount: number;
  totalPaidAmount: number;
  byType: { type: CommissionType; count: number; amount: number }[];
  bySource: { source: CommissionSourceType; count: number; amount: number }[];
}

class CommissionsService {
  private getOrgId(): number {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('organizationId') : null;
    return stored ? parseInt(stored, 10) : 0;
  }

  async getCommissions(filters?: CommissionFilters): Promise<Commission[]> {
    let query = supabase
      .from('commissions')
      .select('*')
      .eq('organization_id', this.getOrgId())
      .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }
    if (filters?.commission_type && filters.commission_type !== 'all') {
      query = query.eq('commission_type', filters.commission_type);
    }
    if (filters?.source_type && filters.source_type !== 'all') {
      query = query.eq('source_type', filters.source_type);
    }
    if (filters?.payee_id) {
      query = query.eq('payee_id', filters.payee_id);
    }
    if (filters?.dateFrom) {
      query = query.gte('accrued_at', filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte('accrued_at', filters.dateTo);
    }
    if (filters?.search) {
      query = query.or(`payee_name.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getStats(filters?: CommissionFilters): Promise<CommissionStats> {
    const commissions = await this.getCommissions(filters);

    const byTypeMap = new Map<CommissionType, { count: number; amount: number }>();
    const bySourceMap = new Map<CommissionSourceType, { count: number; amount: number }>();

    let accrued = 0;
    let paid = 0;
    let cancelled = 0;
    let totalAccruedAmount = 0;
    let totalPaidAmount = 0;

    for (const c of commissions) {
      if (c.status === 'accrued') {
        accrued++;
        totalAccruedAmount += Number(c.commission_amount || 0);
      } else if (c.status === 'paid') {
        paid++;
        totalPaidAmount += Number(c.commission_amount || 0);
      } else if (c.status === 'cancelled') {
        cancelled++;
      }

      const typeKey = c.commission_type;
      if (!byTypeMap.has(typeKey)) byTypeMap.set(typeKey, { count: 0, amount: 0 });
      byTypeMap.get(typeKey)!.count++;
      byTypeMap.get(typeKey)!.amount += Number(c.commission_amount || 0);

      const sourceKey = c.source_type;
      if (!bySourceMap.has(sourceKey)) bySourceMap.set(sourceKey, { count: 0, amount: 0 });
      bySourceMap.get(sourceKey)!.count++;
      bySourceMap.get(sourceKey)!.amount += Number(c.commission_amount || 0);
    }

    return {
      total: commissions.length,
      accrued,
      paid,
      cancelled,
      totalAccruedAmount,
      totalPaidAmount,
      byType: Array.from(byTypeMap.entries()).map(([type, v]) => ({ type, ...v })),
      bySource: Array.from(bySourceMap.entries()).map(([source, v]) => ({ source, ...v })),
    };
  }

  async markAsPaid(id: string): Promise<Commission> {
    const { data, error } = await supabase
      .from('commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async markAsCancelled(id: string, reason?: string): Promise<Commission> {
    const { data, error } = await supabase
      .from('commissions')
      .update({
        status: 'cancelled',
        notes: reason ? `Cancelada: ${reason}` : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async bulkMarkAsPaid(ids: string[]): Promise<void> {
    const { error } = await supabase
      .from('commissions')
      .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
  }

  async getCommissionsByPayee(payeeId: string): Promise<Commission[]> {
    const { data, error } = await supabase
      .from('commissions')
      .select('*')
      .eq('organization_id', this.getOrgId())
      .eq('payee_id', payeeId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }
}

export const commissionsService = new CommissionsService();
