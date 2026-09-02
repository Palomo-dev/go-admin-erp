import { supabase } from '@/lib/supabase/config';
import { promotionEngine } from '@/lib/services/promotionEngine';

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface QuotationItem {
  id?: string;
  quotation_id?: string;
  product_id?: number | null;
  description: string;
  qty: number;
  unit_price: number;
  discount_amount?: number;
  tax_code?: string | null;
  tax_rate?: number;
  tax_included: boolean;
  total_line: number;
}

export interface Quotation {
  id: string;
  organization_id: number;
  branch_id?: number | null;
  number: string;
  customer_id: string;
  issue_date: string;
  valid_until?: string | null;
  currency: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  status: QuotationStatus;
  payment_terms?: number | null;
  payment_method?: string | null;
  notes?: string | null;
  terms_conditions?: string | null;
  salesperson_id?: string | null;
  converted_invoice_id?: string | null;
  opportunity_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  customers?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
    address?: string;
    identification_number?: string;
    identification_type?: string;
    avatar_url?: string | null;
  } | null;
  quotation_items?: QuotationItem[];
}

export interface QuotationFilters {
  busqueda?: string;
  status?: QuotationStatus | 'todos';
  fechaInicio?: string;
  fechaFin?: string;
  customer_id?: string;
}

export class CotizacionesService {
  static async generateQuotationNumber(organizationId: number): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select('number')
        .eq('organization_id', organizationId)
        .like('number', 'COT-%')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      let nextNumber = 1;
      if (data && data.length > 0) {
        const match = data[0].number.match(/COT-(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1], 10) + 1;
        }
      }
      return `COT-${nextNumber.toString().padStart(4, '0')}`;
    } catch (error) {
      console.error('Error generating quotation number:', error);
      return `COT-${Date.now()}`;
    }
  }

  static async listQuotations(
    organizationId: number,
    filters?: QuotationFilters
  ): Promise<Quotation[]> {
    try {
      let query = supabase
        .from('quotations')
        .select(
          `id, number, customer_id, issue_date, valid_until, currency, subtotal, tax_total, discount_total, total, status, payment_terms, payment_method, salesperson_id, converted_invoice_id, opportunity_id, created_at, updated_at, customers (id, full_name, email, phone)`
        )
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (filters?.status && filters.status !== 'todos') {
        query = query.eq('status', filters.status);
      }
      if (filters?.customer_id) {
        query = query.eq('customer_id', filters.customer_id);
      }
      if (filters?.fechaInicio) {
        query = query.gte('issue_date', filters.fechaInicio);
      }
      if (filters?.fechaFin) {
        query = query.lte('issue_date', filters.fechaFin);
      }

      const { data, error } = await query;
      if (error) throw error;

      let result = data as unknown as Quotation[];

      if (filters?.busqueda) {
        const term = filters.busqueda.toLowerCase();
        result = result.filter(
          (q) =>
            q.number?.toLowerCase().includes(term) ||
            q.customers?.full_name?.toLowerCase().includes(term)
        );
      }

      return result;
    } catch (error) {
      console.error('Error listing quotations:', error);
      throw error;
    }
  }

  static async getQuotationById(id: string): Promise<Quotation | null> {
    try {
      const { data, error } = await supabase
        .from('quotations')
        .select(
          `*,
          customers (id, full_name, email, phone, address, identification_number, identification_type, avatar_url),
          quotation_items (*)
          `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Quotation;
    } catch (error) {
      console.error('Error getting quotation:', error);
      throw error;
    }
  }

  static async createQuotation(
    quotationData: Omit<Quotation, 'id' | 'created_at' | 'updated_at'>,
    items: QuotationItem[]
  ): Promise<Quotation> {
    try {
      // --- Evaluar promociones activas para Finanzas (cotizaciones) ---
      let evaluatedItems = items;
      try {
        const promoResult = await promotionEngine.evaluate({
          channel: 'finances',
          items: items.map(it => ({
            product_id: it.product_id || 0,
            quantity: Number(it.qty) || 0,
            unit_price: Number(it.unit_price) || 0,
          })),
          organization_id: quotationData.organization_id,
          branch_id: quotationData.branch_id ?? undefined,
        });

        if (promoResult.discountTotal > 0) {
          evaluatedItems = items.map(it => {
            if (!it.discount_amount || it.discount_amount === 0) {
              const promoDiscount = promoResult.itemDiscounts[it.product_id || 0] || 0;
              if (promoDiscount > 0) {
                return { ...it, discount_amount: promoDiscount };
              }
            }
            return it;
          });
        }
      } catch (promoErr) {
        console.warn('[cotizacionesService] No se pudieron evaluar promociones:', promoErr);
      }

      const { data, error } = await supabase
        .from('quotations')
        .insert(quotationData)
        .select()
        .single();

      if (error) throw error;

      const quotationId = data.id;
      const itemsToInsert = evaluatedItems.map((item) => ({
        ...item,
        quotation_id: quotationId,
      }));

      const { error: itemsError } = await supabase
        .from('quotation_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      return data as Quotation;
    } catch (error) {
      console.error('Error creating quotation:', error);
      throw error;
    }
  }

  static async updateQuotation(
    id: string,
    updates: Partial<Quotation>,
    items?: QuotationItem[]
  ): Promise<Quotation> {
    try {
      const { data, error } = await supabase
        .from('quotations')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (items) {
        await supabase.from('quotation_items').delete().eq('quotation_id', id);
        const itemsToInsert = items.map((item) => ({
          ...item,
          quotation_id: id,
          id: undefined,
        }));
        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      return data as Quotation;
    } catch (error) {
      console.error('Error updating quotation:', error);
      throw error;
    }
  }

  static async changeStatus(
    id: string,
    status: QuotationStatus
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('quotations')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error changing quotation status:', error);
      throw error;
    }
  }

  static async duplicateQuotation(id: string): Promise<Quotation | null> {
    try {
      const original = await this.getQuotationById(id);
      if (!original) throw new Error('Cotización no encontrada');

      const newNumber = await this.generateQuotationNumber(original.organization_id);

      const { data, error } = await supabase
        .from('quotations')
        .insert({
          organization_id: original.organization_id,
          branch_id: original.branch_id,
          number: newNumber,
          customer_id: original.customer_id,
          issue_date: new Date().toISOString().split('T')[0],
          valid_until: original.valid_until,
          currency: original.currency,
          subtotal: original.subtotal,
          tax_total: original.tax_total,
          discount_total: original.discount_total,
          total: original.total,
          status: 'draft',
          payment_terms: original.payment_terms,
          payment_method: original.payment_method,
          notes: original.notes,
          terms_conditions: original.terms_conditions,
          salesperson_id: original.salesperson_id,
          opportunity_id: original.opportunity_id || null,
        })
        .select()
        .single();

      if (error) throw error;

      if (original.quotation_items && original.quotation_items.length > 0) {
        const itemsToInsert = original.quotation_items.map((item) => ({
          quotation_id: data.id,
          product_id: item.product_id,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
          tax_code: item.tax_code,
          tax_rate: item.tax_rate,
          tax_included: item.tax_included,
          total_line: item.total_line,
        }));
        const { error: itemsError } = await supabase
          .from('quotation_items')
          .insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      return data as Quotation;
    } catch (error) {
      console.error('Error duplicating quotation:', error);
      throw error;
    }
  }

  static async convertToInvoice(
    quotationId: string,
    organizationId: number,
    branchId: number,
    opportunityId?: string | null
  ): Promise<string> {
    try {
      const quotation = await this.getQuotationById(quotationId);
      if (!quotation) throw new Error('Cotización no encontrada');
      if (quotation.status === 'converted')
        throw new Error('Esta cotización ya fue convertida a factura');

      const { data: invoiceNumberData } = await supabase
        .from('invoice_sales')
        .select('number')
        .eq('organization_id', organizationId)
        .like('number', 'FACT-%')
        .order('created_at', { ascending: false })
        .limit(1);

      let nextInvoiceNumber = 1;
      if (invoiceNumberData && invoiceNumberData.length > 0) {
        const match = invoiceNumberData[0].number.match(/FACT-(\d+)/);
        if (match) nextInvoiceNumber = parseInt(match[1], 10) + 1;
      }
      const invoiceNumber = `FACT-${nextInvoiceNumber.toString().padStart(4, '0')}`;

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (quotation.payment_terms || 30));

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoice_sales')
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          customer_id: quotation.customer_id,
          number: invoiceNumber,
          issue_date: new Date().toISOString().split('T')[0],
          due_date: dueDate.toISOString().split('T')[0],
          currency: quotation.currency,
          subtotal: quotation.subtotal,
          tax_total: quotation.tax_total,
          total: quotation.total,
          balance: quotation.total,
          status: 'issued',
          payment_method: quotation.payment_method,
          payment_terms: quotation.payment_terms,
          notes: quotation.notes,
          tax_included: quotation.quotation_items?.[0]?.tax_included || false,
          salesperson_id: quotation.salesperson_id,
          opportunity_id: opportunityId || quotation.opportunity_id || null,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      if (quotation.quotation_items && quotation.quotation_items.length > 0) {
        const invoiceItemsToInsert = quotation.quotation_items.map((item) => ({
          invoice_sales_id: invoiceData.id,
          invoice_id: invoiceData.id,
          invoice_type: 'sale' as const,
          product_id: item.product_id,
          description: item.description,
          qty: item.qty,
          unit_price: item.unit_price,
          tax_code: item.tax_code,
          tax_rate: item.tax_rate || 0,
          tax_included: item.tax_included,
          total_line: item.total_line,
          discount_amount: item.discount_amount || 0,
        }));

        const { error: itemsError } = await supabase
          .from('invoice_items')
          .insert(invoiceItemsToInsert);
        if (itemsError) throw itemsError;
      }

      await this.changeStatus(quotationId, 'converted');

      await supabase
        .from('quotations')
        .update({ converted_invoice_id: invoiceData.id })
        .eq('id', quotationId);

      return invoiceData.id;
    } catch (error) {
      console.error('Error converting quotation to invoice:', error);
      throw error;
    }
  }

  static async deleteQuotation(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('quotations').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting quotation:', error);
      throw error;
    }
  }
}
