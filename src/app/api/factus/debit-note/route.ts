/**
 * API Route: Crear/Enviar Nota Débito a Factus
 * POST /api/factus/debit-note
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

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoice_sales')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    const { data: job, error: jobError } = await supabase
      .from('electronic_invoicing_jobs')
      .insert({
        organization_id: organizationId,
        invoice_id: invoiceId,
        document_type: 'debit_note',
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
      const result = await factusService.createDebitNote(
        credentials.environment,
        accessToken,
        {
          reference_code: `ND-${invoiceId.substring(0, 8)}`,
          billing_reference: {
            number: invoice.number,
            cufe: invoice.xml_uuid || '',
            uuid: invoice.xml_uuid || '',
          },
          debit_note_reason: reason,
          payment_method_code: invoice.payment_method_code || mapPaymentMethod(invoice.payment_method),
          observation: body.observation || '',
          send_email: body.send_email ?? true,
          items: items || [],
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
