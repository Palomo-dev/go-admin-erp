'use client';

import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface NotaCredito {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  number: string;
  issue_date: string;
  due_date?: string;
  subtotal: number;
  tax_total: number;
  total: number;
  balance: number;
  status: string;
  notes?: string;
  document_type: string;
  related_invoice_id?: string;
  reference_code?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  customer?: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    identification_number?: string;
    phone?: string;
    address?: string;
  };
  related_invoice?: {
    id: string;
    number: string;
    total: number;
  };
  items?: NotaCreditoItem[];
}

export interface NotaCreditoItem {
  id: string;
  invoice_id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount: number;
  subtotal: number;
  total: number;
}

export interface EInvoiceJob {
  id: string;
  invoice_id: string;
  status: string;
  cufe?: string;
  qr_code?: string;
  created_at: string;
  updated_at: string;
}

export interface EInvoiceEvent {
  id: string;
  job_id: string;
  event_type: string;
  message?: string;
  created_at: string;
}

class NotasCreditoService {
  /**
   * Obtener listado de notas de crédito
   */
  async getNotasCredito(filters?: {
    status?: string;
    search?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<NotaCredito[]> {
    const organizationId = getOrganizationId();
    if (!organizationId) return [];

    let query = supabase
      .from('invoice_sales')
      .select(`
        *,
        customer:customers(id, first_name, last_name, email, identification_number)
      `)
      .eq('organization_id', organizationId)
      .eq('document_type', 'credit_note')
      .order('issue_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.search) {
      query = query.or(`number.ilike.%${filters.search}%,notes.ilike.%${filters.search}%`);
    }

    if (filters?.fromDate) {
      query = query.gte('issue_date', filters.fromDate);
    }

    if (filters?.toDate) {
      query = query.lte('issue_date', filters.toDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching notas credito:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Obtener nota de crédito por ID con todos los detalles
   */
  async getNotaCreditoById(id: string): Promise<NotaCredito | null> {
    const organizationId = getOrganizationId();
    if (!organizationId) return null;

    const { data, error } = await supabase
      .from('invoice_sales')
      .select(`
        *,
        customer:customers(id, first_name, last_name, email, identification_number, phone, address)
      `)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .eq('document_type', 'credit_note')
      .single();

    if (error) {
      console.error('Error fetching nota credito:', error);
      return null;
    }

    // Obtener items y factura relacionada
    if (data) {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', id);
      
      data.items = items || [];

      // Obtener factura relacionada si existe
      if (data.related_invoice_id) {
        const { data: relatedInvoice } = await supabase
          .from('invoice_sales')
          .select('id, number, total, issue_date, status')
          .eq('id', data.related_invoice_id)
          .single();
        
        data.related_invoice = relatedInvoice || null;
      }
    }

    return data;
  }

  /**
   * Obtener estado de facturación electrónica
   */
  async getEInvoiceStatus(invoiceId: string): Promise<EInvoiceJob | null> {
    const { data, error } = await supabase
      .from('electronic_invoicing_jobs')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return null;
    }

    return data;
  }

  /**
   * Obtener eventos de facturación electrónica
   */
  async getEInvoiceEvents(jobId: string): Promise<EInvoiceEvent[]> {
    const { data, error } = await supabase
      .from('electronic_invoicing_events')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching e-invoice events:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Anular nota de crédito
   */
  async anularNotaCredito(
    id: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const nota = await this.getNotaCreditoById(id);
    if (!nota) {
      return { success: false, error: 'Nota de crédito no encontrada' };
    }

    if (nota.status === 'cancelled' || nota.status === 'voided') {
      return { success: false, error: 'La nota de crédito ya está anulada' };
    }

    const { error } = await supabase
      .from('invoice_sales')
      .update({
        status: 'voided',
        notes: nota.notes 
          ? `${nota.notes}\n\nANULADA: ${reason || 'Sin motivo'}`
          : `ANULADA: ${reason || 'Sin motivo'}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Error anulando nota credito:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  }

  /**
   * Obtener estadísticas
   */
  async getStats(): Promise<{
    total: number;
    count: number;
    thisMonth: number;
    pending: number;
  }> {
    const organizationId = getOrganizationId();
    if (!organizationId) {
      return { total: 0, count: 0, thisMonth: 0, pending: 0 };
    }

    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('invoice_sales')
      .select('total, issue_date, status')
      .eq('organization_id', organizationId)
      .eq('document_type', 'credit_note')
      .neq('status', 'voided');

    if (error || !data) {
      return { total: 0, count: 0, thisMonth: 0, pending: 0 };
    }

    const total = data.reduce((sum, n) => sum + Number(n.total), 0);
    const count = data.length;
    const monthNotes = data.filter(
      n => new Date(n.issue_date) >= firstOfMonth
    );

    // Contar pendientes (draft)
    const pendingCount = data.filter(n => n.status === 'draft').length;

    return {
      total,
      count,
      thisMonth: monthNotes.reduce((sum, n) => sum + Number(n.total), 0),
      pending: pendingCount,
    };
  }

  /**
   * Reintentar envío a DIAN
   */
  async retryDianSubmission(invoiceId: string): Promise<{ success: boolean; error?: string }> {
    // Buscar el job existente
    const job = await this.getEInvoiceStatus(invoiceId);
    if (!job) {
      return { success: false, error: 'No se encontró el trabajo de facturación electrónica' };
    }

    if (job.status === 'accepted') {
      return { success: false, error: 'La nota de crédito ya fue aceptada por la DIAN' };
    }

    // Actualizar estado a pending para reintento
    const { error } = await supabase
      .from('electronic_invoicing_jobs')
      .update({
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  }
}

export const notasCreditoService = new NotasCreditoService();
