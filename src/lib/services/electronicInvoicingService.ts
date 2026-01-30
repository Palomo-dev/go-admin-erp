/**
 * Servicio centralizado de Facturación Electrónica
 * Maneja la integración con Factus y la cola de trabajos
 */

import { supabase } from '@/lib/supabase/config';

// Estados posibles de un job de facturación electrónica
export type EInvoiceStatus = 
  | 'pending'      // Pendiente de envío
  | 'processing'   // En proceso de envío
  | 'sent'         // Enviado a DIAN
  | 'accepted'     // Aceptado por DIAN
  | 'rejected'     // Rechazado por DIAN
  | 'failed'       // Error técnico
  | 'cancelled';   // Cancelado

// Tipos de documento electrónico
export type EDocumentType = 'invoice' | 'credit_note' | 'debit_note' | 'support_document';

// Proveedores de facturación electrónica
export type EInvoiceProvider = 'factus' | 'carvajal' | 'siigo' | 'alegra' | 'other';

export interface ElectronicInvoiceJob {
  id: string;
  organization_id: number;
  invoice_id: string;
  document_type: EDocumentType;
  provider: EInvoiceProvider;
  status: EInvoiceStatus;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  request_payload: any;
  response_payload: any;
  cufe: string | null;
  qr_code: string | null;
  error_code: string | null;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobParams {
  organizationId: number;
  invoiceId: string;
  documentType?: EDocumentType;
  provider?: EInvoiceProvider;
  sendEmail?: boolean;
}

export interface InvoiceForEInvoicing {
  id: string;
  number: string;
  customer_id: string;
  total: number;
  status: string;
  issue_date: string;
  // Estado de facturación electrónica (del job)
  einvoice_status?: EInvoiceStatus | null;
  einvoice_cufe?: string | null;
  einvoice_qr?: string | null;
}

class ElectronicInvoicingService {
  /**
   * Crear un job de facturación electrónica para una factura
   */
  async createJob(params: CreateJobParams): Promise<{ success: boolean; jobId?: string; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('electronic_invoicing_jobs')
        .insert({
          organization_id: params.organizationId,
          invoice_id: params.invoiceId,
          document_type: params.documentType || 'invoice',
          provider: params.provider || 'factus',
          status: 'pending',
          attempt_count: 0,
          max_attempts: 5,
        })
        .select('id')
        .single();

      if (error) throw error;

      return { success: true, jobId: data.id };
    } catch (error: any) {
      console.error('Error creating e-invoice job:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtener el estado de facturación electrónica de una factura
   */
  async getInvoiceEInvoiceStatus(invoiceId: string): Promise<ElectronicInvoiceJob | null> {
    try {
      const { data, error } = await supabase
        .from('electronic_invoicing_jobs')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error getting e-invoice status:', error);
      return null;
    }
  }

  /**
   * Obtener múltiples estados de facturación electrónica
   */
  async getMultipleInvoiceStatuses(invoiceIds: string[]): Promise<Map<string, ElectronicInvoiceJob>> {
    const statusMap = new Map<string, ElectronicInvoiceJob>();
    
    if (invoiceIds.length === 0) return statusMap;

    try {
      const { data, error } = await supabase
        .from('electronic_invoicing_jobs')
        .select('*')
        .in('invoice_id', invoiceIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Agrupar por invoice_id, manteniendo solo el más reciente
      data?.forEach((job) => {
        if (!statusMap.has(job.invoice_id)) {
          statusMap.set(job.invoice_id, job);
        }
      });

      return statusMap;
    } catch (error) {
      console.error('Error getting multiple e-invoice statuses:', error);
      return statusMap;
    }
  }

  /**
   * Enviar factura a DIAN (a través de la API)
   */
  async sendToFactus(invoiceId: string, organizationId: number): Promise<{ success: boolean; error?: string }> {
    try {
      // Primero crear el job
      const jobResult = await this.createJob({
        organizationId,
        invoiceId,
        documentType: 'invoice',
        provider: 'factus',
      });

      if (!jobResult.success) {
        return { success: false, error: jobResult.error };
      }

      // Llamar a la API para procesar el job
      const response = await fetch('/api/factus/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId, organizationId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Error al enviar a DIAN' };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error sending to Factus:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Reintentar envío de factura
   */
  async retryJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'pending',
          next_retry_at: new Date().toISOString(),
          error_code: null,
          error_message: null,
        })
        .eq('id', jobId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error retrying job:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancelar job de facturación electrónica
   */
  async cancelJob(jobId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase
        .from('electronic_invoicing_jobs')
        .update({ status: 'cancelled' })
        .eq('id', jobId);

      if (error) throw error;

      return { success: true };
    } catch (error: any) {
      console.error('Error cancelling job:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verificar si una factura tiene datos completos para FE
   */
  async validateInvoiceForEInvoicing(invoiceId: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Obtener la factura con cliente
      const { data: invoice, error } = await supabase
        .from('invoice_sales')
        .select(`
          *,
          customer:customers(
            id,
            identification_type,
            identification_number,
            dv,
            email,
            municipality_id,
            tribute_id,
            legal_organization_id
          )
        `)
        .eq('id', invoiceId)
        .single();

      if (error || !invoice) {
        errors.push('Factura no encontrada');
        return { valid: false, errors };
      }

      // Validaciones del cliente
      if (!invoice.customer) {
        errors.push('La factura no tiene cliente asignado');
      } else {
        if (!invoice.customer.identification_type) {
          errors.push('El cliente no tiene tipo de identificación');
        }
        if (!invoice.customer.identification_number) {
          errors.push('El cliente no tiene número de identificación');
        }
        if (!invoice.customer.email) {
          errors.push('El cliente no tiene email');
        }
        if (!invoice.customer.municipality_id) {
          errors.push('El cliente no tiene municipio asignado');
        }
      }

      // Validaciones de la factura
      if (!invoice.number) {
        errors.push('La factura no tiene número');
      }

      return { valid: errors.length === 0, errors };
    } catch (error: any) {
      errors.push(`Error de validación: ${error.message}`);
      return { valid: false, errors };
    }
  }

  /**
   * Obtener estadísticas de facturación electrónica
   */
  async getStats(organizationId: number): Promise<{
    total: number;
    pending: number;
    processing: number;
    accepted: number;
    rejected: number;
    failed: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('electronic_invoicing_jobs')
        .select('status')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const stats = {
        total: data?.length || 0,
        pending: 0,
        processing: 0,
        accepted: 0,
        rejected: 0,
        failed: 0,
      };

      data?.forEach((job) => {
        if (job.status === 'pending') stats.pending++;
        else if (job.status === 'processing' || job.status === 'sent') stats.processing++;
        else if (job.status === 'accepted') stats.accepted++;
        else if (job.status === 'rejected') stats.rejected++;
        else if (job.status === 'failed') stats.failed++;
      });

      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return { total: 0, pending: 0, processing: 0, accepted: 0, rejected: 0, failed: 0 };
    }
  }

  /**
   * Descargar PDF de factura electrónica
   */
  async downloadPDF(invoiceNumber: string): Promise<Blob | null> {
    try {
      const response = await fetch(`/api/factus/download?type=pdf&invoiceNumber=${invoiceNumber}`);
      if (!response.ok) throw new Error('Error descargando PDF');
      return await response.blob();
    } catch (error) {
      console.error('Error downloading PDF:', error);
      return null;
    }
  }

  /**
   * Descargar XML de factura electrónica
   */
  async downloadXML(invoiceNumber: string): Promise<string | null> {
    try {
      const response = await fetch(`/api/factus/download?type=xml&invoiceNumber=${invoiceNumber}`);
      if (!response.ok) throw new Error('Error descargando XML');
      return await response.text();
    } catch (error) {
      console.error('Error downloading XML:', error);
      return null;
    }
  }
}

// Exportar instancia singleton
export const electronicInvoicingService = new ElectronicInvoicingService();

// Helper para obtener color de estado
export function getEInvoiceStatusColor(status: EInvoiceStatus | null | undefined): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'processing':
    case 'sent':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    case 'accepted':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'rejected':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'failed':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
    case 'cancelled':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

// Helper para obtener texto de estado
export function getEInvoiceStatusText(status: EInvoiceStatus | null | undefined): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'processing':
      return 'Procesando';
    case 'sent':
      return 'Enviado';
    case 'accepted':
      return 'Aceptada DIAN';
    case 'rejected':
      return 'Rechazada DIAN';
    case 'failed':
      return 'Error';
    case 'cancelled':
      return 'Cancelada';
    default:
      return 'Sin FE';
  }
}

// Helper para obtener icono de estado
export function getEInvoiceStatusIcon(status: EInvoiceStatus | null | undefined): string {
  switch (status) {
    case 'pending':
      return 'Clock';
    case 'processing':
    case 'sent':
      return 'Loader2';
    case 'accepted':
      return 'CheckCircle2';
    case 'rejected':
      return 'XCircle';
    case 'failed':
      return 'AlertTriangle';
    case 'cancelled':
      return 'Ban';
    default:
      return 'FileX';
  }
}
