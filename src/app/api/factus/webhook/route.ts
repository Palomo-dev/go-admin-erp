/**
 * API Route: Webhook de eventos DIAN desde Factus
 * POST /api/factus/webhook
 *
 * Factus envía eventos cuando el estado de una factura cambia en DIAN:
 * - accepted: DIAN aceptó la factura
 * - rejected: DIAN rechazó la factura
 * - validated: Factura validada
 *
 * Seguridad: Verifica el webhook secret si está configurado
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseClient } from '@/lib/supabase/config';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-factus-signature') || '';
    const webhookSecret = process.env.FACTUS_WEBHOOK_SECRET;

    // Verificar firma si el secret está configurado
    if (webhookSecret) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (signature !== expectedSignature) {
        console.error('Webhook signature mismatch');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const event = JSON.parse(body);
    const supabase = createSupabaseClient();

    const { event_type, reference_code, cufe, number, status, message, errors } = event;

    // Buscar el job por reference_code
    const { data: job } = await supabase
      .from('electronic_invoicing_jobs')
      .select('id, organization_id, invoice_id, status')
      .or(`reference_code.eq.${reference_code},response_payload->reference_code.eq.${reference_code}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!job) {
      console.warn(`Webhook: No job found for reference_code ${reference_code}`);
      return NextResponse.json({ received: true, message: 'Job not found' });
    }

    // Mapear evento de Factus a estado interno
    const statusMap: Record<string, string> = {
      'accepted': 'accepted',
      'rejected': 'rejected',
      'validated': 'accepted',
      'failed': 'failed',
    };

    const newStatus = statusMap[event_type] || statusMap[status] || 'sent';

    // Actualizar job
    await supabase
      .from('electronic_invoicing_jobs')
      .update({
        status: newStatus,
        cufe: cufe || undefined,
        response_payload: event,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Registrar evento
    await supabase
      .from('electronic_invoicing_events')
      .insert({
        job_id: job.id,
        event_type: event_type || status || 'webhook',
        event_code: event.code || null,
        event_message: message || `Evento DIAN: ${event_type || status}`,
        metadata: { cufe, number, errors, raw: event },
      });

    // Si fue aceptado, actualizar la factura
    if (newStatus === 'accepted' && cufe) {
      await supabase
        .from('invoice_sales')
        .update({
          xml_uuid: cufe,
          validated_at: new Date().toISOString(),
          status: 'validated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.invoice_id);
    }

    // Si fue rechazado, marcar error en la factura
    if (newStatus === 'rejected') {
      await supabase
        .from('invoice_sales')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.invoice_id);
    }

    return NextResponse.json({ received: true, status: newStatus });
  } catch (error: any) {
    console.error('Error processing Factus webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
