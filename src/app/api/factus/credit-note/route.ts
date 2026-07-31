/**
 * API Route: Crear/Enviar Nota Crédito a Factus
 * POST /api/factus/credit-note
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase/config';
import { getValidToken, getCredentials } from '@/lib/services/factusTokenManager';
import factusService, { mapPaymentMethod } from '@/lib/services/factusService';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, invoiceId, reason, items } = body;

    if (!organizationId || !invoiceId || !reason) {
      return NextResponse.json(
        { error: 'Se requieren organizationId, invoiceId y reason' },
        { status: 400 }
      );
    }

    const credentials = getCredentials();
    if (!credentials) {
      return NextResponse.json({ error: 'Credenciales de Factus no configuradas' }, { status: 404 });
    }

    const accessToken = await getValidToken();
    if (!accessToken) {
      return NextResponse.json({ error: 'No se pudo obtener token de Factus' }, { status: 500 });
    }

    const supabase = createSupabaseClient();

    // Obtener la nota crédito (registrada en invoice_sales con document_type='credit_note')
    const { data: creditNote, error: creditNoteError } = await supabase
      .from('invoice_sales')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (creditNoteError || !creditNote) {
      return NextResponse.json({ error: 'Nota de crédito no encontrada' }, { status: 404 });
    }

    // Obtener la factura original usando related_invoice_id
    const originalInvoiceId = creditNote.related_invoice_id;
    if (!originalInvoiceId) {
      return NextResponse.json(
        { error: 'La nota de crédito no tiene factura original relacionada' },
        { status: 400 }
      );
    }

    const { data: originalInvoice, error: originalInvoiceError } = await supabase
      .from('invoice_sales')
      .select('*')
      .eq('id', originalInvoiceId)
      .single();

    if (originalInvoiceError || !originalInvoice) {
      return NextResponse.json({ error: 'Factura original no encontrada' }, { status: 404 });
    }

    // Validar que la factura original tenga CUFE (fue aceptada por DIAN)
    if (!originalInvoice.xml_uuid) {
      return NextResponse.json(
        { error: 'La factura original no fue enviada a DIAN (sin CUFE). No se puede crear la nota crédito electrónica.' },
        { status: 400 }
      );
    }

    // Si no se pasan items en el body, obtenerlos de la nota crédito
    let creditNoteItems = items;
    if (!creditNoteItems || creditNoteItems.length === 0) {
      const { data: noteItems, error: noteItemsError } = await supabase
        .from('invoice_items')
        .select('qty, unit_price, tax_rate, tax_code, description, total_line, discount_amount')
        .eq('invoice_sales_id', invoiceId);

      if (noteItemsError) {
        return NextResponse.json({ error: 'Error obteniendo items de la nota crédito' }, { status: 500 });
      }

      creditNoteItems = (noteItems || []).map((item: any) => ({
        code_reference: item.code_reference || 1,
        name: item.description || 'Nota crédito',
        quantity: Math.abs(Number(item.qty) || 0),
        discount_rate: 0,
        price: Math.abs(Number(item.unit_price) || 0),
        tax_rate: Number(item.tax_rate) || 0,
        withholding_taxes: [],
      }));
    }

    const { data: job, error: jobError } = await supabase
      .from('electronic_invoicing_jobs')
      .insert({
        organization_id: organizationId,
        invoice_id: invoiceId,
        document_type: 'credit_note',
        provider: 'factus',
        status: 'processing',
        request_payload: {},
      })
      .select()
      .single();

    if (jobError) {
      return NextResponse.json({ error: 'Error creando job' }, { status: 500 });
    }

    try {
      const result = await factusService.createCreditNote(
        credentials.environment,
        accessToken,
        {
          reference_code: `NC-${invoiceId.substring(0, 8)}`,
          billing_reference: {
            number: originalInvoice.number,
            cufe: originalInvoice.xml_uuid,
            uuid: originalInvoice.xml_uuid,
          },
          credit_note_reason: reason,
          payment_method_code: originalInvoice.payment_method_code || mapPaymentMethod(originalInvoice.payment_method),
          observation: body.observation || creditNote.description || '',
          send_email: body.send_email ?? true,
          items: creditNoteItems,
        }
      );

      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: result.data?.is_validated ? 'accepted' : 'sent',
          response_payload: result,
          cufe: result.data?.cufe,
          processed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      // Actualizar la nota crédito con el CUFE y número asignado por Factus/DIAN
      if (result.data?.cufe) {
        await supabase
          .from('invoice_sales')
          .update({
            xml_uuid: result.data.cufe,
            einvoice_number: result.data.number || null,
            einvoice_qr: (result.data as any)?.qr_data || null,
          })
          .eq('id', invoiceId);
      }

      await supabase
        .from('electronic_invoicing_events')
        .insert({
          job_id: job.id,
          event_type: result.data?.is_validated ? 'validated' : 'sent',
          event_code: '200',
          event_message: result.message,
          metadata: { number: result.data?.number, cufe: result.data?.cufe },
        });

      return NextResponse.json({ success: true, data: result.data, jobId: job.id });
    } catch (error: any) {
      await supabase
        .from('electronic_invoicing_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          attempt_count: 1,
        })
        .eq('id', job.id);

      await supabase
        .from('electronic_invoicing_events')
        .insert({ job_id: job.id, event_type: 'error', event_message: error.message });

      return NextResponse.json({ error: error.message, jobId: job.id }, { status: 500 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
