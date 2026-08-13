import { supabase } from '@/lib/supabase/config';

export type WarrantyClaimStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'in_process'
  | 'resolved'
  | 'cancelled';

export type ResolutionType =
  | 'repair'
  | 'replacement'
  | 'refund'
  | 'store_credit'
  | 'rejected';

export interface WarrantyClaim {
  id: string;
  organization_id: number;
  serial_number_id: number;
  customer_id: string | null;
  claim_date: string;
  claim_reason: string;
  description: string | null;
  status: WarrantyClaimStatus;
  resolution: string | null;
  resolution_date: string | null;
  resolved_by: string | null;
  resolution_type: ResolutionType | null;
  replacement_serial_id: number | null;
  refund_amount: number | null;
  supplier_rma_number: string | null;
  supplier_response: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  attachments: any[];
}

export interface WarrantyClaimSerialDetails {
  id: number;
  serial: string;
  product_id: number;
  warranty_start?: string | null;
  warranty_end?: string | null;
  warranty_months?: number | null;
  sale_date?: string | null;
  cost_at_purchase?: number;
  price_at_sale?: number | null;
  current_branch_id?: number | null;
  products?: { name: string; sku: string; brand: string | null; reference?: string | null };
  branches?: { name: string } | null;
  customers?: { id: string; full_name: string; phone: string | null; email: string | null } | null;
}

export interface WarrantyClaimWithDetails extends WarrantyClaim {
  serial_numbers?: WarrantyClaimSerialDetails;
  customers?: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    address?: string | null;
  } | null;
  resolved_by_user?: { email: string } | null;
  created_by_user?: { email: string } | null;
  replacement_serial?: { id: number; serial: string } | null;
}

export interface WarrantyClaimStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  in_process: number;
  resolved: number;
  cancelled: number;
  totalRefundAmount: number;
}

export interface WarrantyClaimFilters {
  search?: string;
  status?: WarrantyClaimStatus | undefined;
  resolutionType?: ResolutionType | undefined;
  dateFrom?: string;
  dateTo?: string;
}

class WarrantyClaimsService {
  async getClaims(
    organizationId: number,
    filters: WarrantyClaimFilters = {},
    page = 1,
    pageSize = 20
  ): Promise<{ data: WarrantyClaimWithDetails[]; count: number; error: Error | null }> {
    try {
      let query = supabase
        .from('warranty_claims')
        .select(
          `
          *,
          serial_numbers!warranty_claims_serial_number_id_fkey (
            id, serial, product_id,
            products!fk_serial_product ( name, sku, brand )
          ),
          customers ( id, full_name, phone, email ),
          resolved_by_user:profiles!warranty_claims_resolved_by_fkey ( email ),
          created_by_user:profiles!warranty_claims_created_by_fkey ( email ),
          replacement_serial:serial_numbers!warranty_claims_replacement_serial_id_fkey ( id, serial )
        `,
          { count: 'exact' }
        )
        .eq('organization_id', organizationId);

      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.resolutionType) {
        query = query.eq('resolution_type', filters.resolutionType);
      }
      if (filters.dateFrom) {
        query = query.gte('claim_date', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('claim_date', filters.dateTo);
      }
      if (filters.search) {
        query = query.or(
          `claim_reason.ilike.%${filters.search}%,description.ilike.%${filters.search}%`
        );
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await query
        .order('claim_date', { ascending: false })
        .range(from, to);

      if (error) throw error;

      let resultData = (data || []) as WarrantyClaimWithDetails[];

      if (filters.search) {
        const term = filters.search.toLowerCase();
        resultData = resultData.filter((claim) => {
          const serialMatch = claim.serial_numbers?.serial?.toLowerCase().includes(term);
          const customerMatch = claim.customers?.full_name?.toLowerCase().includes(term);
          return serialMatch || customerMatch;
        });
      }

      return { data: resultData, count: count || 0, error: null };
    } catch (error: any) {
      console.error('Error obteniendo reclamos de garantía:', error?.message || error);
      return { data: [], count: 0, error: error as Error };
    }
  }

  async getClaimById(
    id: string
  ): Promise<{ data: WarrantyClaimWithDetails | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('warranty_claims')
        .select(
          `
          *,
          serial_numbers!warranty_claims_serial_number_id_fkey (
            id, serial, product_id, warranty_start, warranty_end, warranty_months,
            sale_date, cost_at_purchase, price_at_sale,
            current_branch_id,
            products!fk_serial_product ( name, sku, brand, reference ),
            branches!serial_numbers_current_branch_id_fkey ( name ),
            customers!serial_numbers_sold_to_customer_id_fkey ( id, full_name, phone, email )
          ),
          customers ( id, full_name, phone, email, address ),
          resolved_by_user:profiles!warranty_claims_resolved_by_fkey ( email ),
          created_by_user:profiles!warranty_claims_created_by_fkey ( email ),
          replacement_serial:serial_numbers!warranty_claims_replacement_serial_id_fkey ( id, serial )
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return { data: data as WarrantyClaimWithDetails, error: null };
    } catch (error: any) {
      console.error('Error obteniendo detalle de reclamo:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  async getStats(organizationId: number): Promise<{ data: WarrantyClaimStats | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('warranty_claims')
        .select('status, refund_amount')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const stats: WarrantyClaimStats = {
        total: data.length,
        pending: 0,
        approved: 0,
        rejected: 0,
        in_process: 0,
        resolved: 0,
        cancelled: 0,
        totalRefundAmount: 0,
      };

      data.forEach((claim: any) => {
        if (claim.status in stats) {
          (stats as any)[claim.status]++;
        }
        if (claim.refund_amount) {
          stats.totalRefundAmount += Number(claim.refund_amount);
        }
      });

      return { data: stats, error: null };
    } catch (error: any) {
      console.error('Error obteniendo stats de garantías:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  async createClaim(
    claimData: Partial<WarrantyClaim>
  ): Promise<{ data: WarrantyClaim | null; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('warranty_claims')
        .insert(claimData)
        .select()
        .single();

      if (error) throw error;

      return { data: data as WarrantyClaim, error: null };
    } catch (error: any) {
      console.error('Error creando reclamo de garantía:', error?.message || error);
      return { data: null, error: error as Error };
    }
  }

  async updateStatus(
    id: string,
    status: WarrantyClaimStatus,
    resolutionData?: {
      resolution?: string;
      resolution_type?: ResolutionType;
      refund_amount?: number;
      replacement_serial_id?: number;
      supplier_rma_number?: string;
      supplier_response?: string;
    }
  ): Promise<{ error: Error | null }> {
    try {
      const updateData: any = { status };

      if (status === 'resolved' || status === 'rejected') {
        updateData.resolution_date = new Date().toISOString();
        if (resolutionData) {
          if (resolutionData.resolution) updateData.resolution = resolutionData.resolution;
          if (resolutionData.resolution_type) updateData.resolution_type = resolutionData.resolution_type;
          if (resolutionData.refund_amount !== undefined) updateData.refund_amount = resolutionData.refund_amount;
          if (resolutionData.replacement_serial_id) updateData.replacement_serial_id = resolutionData.replacement_serial_id;
          if (resolutionData.supplier_rma_number) updateData.supplier_rma_number = resolutionData.supplier_rma_number;
          if (resolutionData.supplier_response) updateData.supplier_response = resolutionData.supplier_response;
        }
      }

      const { error } = await supabase
        .from('warranty_claims')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      return { error: null };
    } catch (error: any) {
      console.error('Error actualizando reclamo:', error?.message || error);
      return { error: error as Error };
    }
  }

  async getSerialsForReplacement(
    organizationId: number,
    productId: number
  ): Promise<{ data: { id: number; serial: string }[]; error: Error | null }> {
    try {
      const { data, error } = await supabase
        .from('serial_numbers')
        .select('id, serial')
        .eq('organization_id', organizationId)
        .eq('product_id', productId)
        .eq('status', 'in_stock')
        .order('serial');

      if (error) throw error;

      return { data: data || [], error: null };
    } catch (error: any) {
      console.error('Error obteniendo seriales para reemplazo:', error?.message || error);
      return { data: [], error: error as Error };
    }
  }
}

export const warrantyClaimsService = new WarrantyClaimsService();
export default warrantyClaimsService;
