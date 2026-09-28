/**
 * API Route: Webhook de eventos DIAN desde Factus
 * POST /api/factus/webhook
 *
 * Factus no documenta webhooks en su API v2; esta ruta se conserva para el
 * día que el plan SaaS los active. El estado de los documentos lo lleva la
 * cola (`colaFacturacion`) con la respuesta síncrona de la validación.
 *
 * Seguridad:
 * - Firma HMAC-SHA256 del body en `x-factus-signature`, comparada en tiempo
 *   constante, con `FACTUS_WEBHOOK_SECRET`.
 * - Sin secreto configurado: en producción se rechaza todo (503, fail-closed)
 *   y se registra; fuera de producción se acepta con aviso (desarrollo local).
 * - No hay sesión: trabaja con el cliente service-role. `reference_code` se
 *   valida con una lista blanca de caracteres.
 *
 * Corrección (2026-09-23): buscaba `electronic_invoicing_jobs.reference_code`,
 * columna que no existía, y escribía `invoice_sales.status = 'validated' /
 * 'rejected'`, valores que el CHECK contable rechaza. Ahora la columna existe
 * (migración 20260924031326) y el estado electrónico va en `einvoice_status`.
 * Un job en vuelo (`processing`) no se toca: su resultado lo registra quien lo
 * envió.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { safeEqual } from '@/lib/security/webhookSignatures';
import crypto from 'crypto';

/** Códigos de referencia que generamos (`INV-…`, `NC-…`, `DS-…`): sin comas, paréntesis ni espacios. */
const REFERENCE_CODE_RE = /^[A-Za-z0-9._-]{1,100}$/;

const ESTADOS: Record<string, 'accepted' | 'rejected' | 'failed' | 'sent'> = {
  accepted: 'accepted',
  validated: 'accepted',
  rejected: 'rejected',
  failed: 'failed',
  sent: 'sent',
};

const EVENTO: Record<string, string> = {
  accepted: 'accepted',
  rejected: 'rejected',
  failed: 'error',
  sent: 'sent',
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-factus-signature') || '';
    const webhookSecret = process.env.FACTUS_WEBHOOK_SECRET;

    if (webhookSecret) {
      const expectedSignature = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
      if (!safeEqual(signature, expectedSignature)) {
        console.error('[factus/webhook] firma inválida');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      console.error('[factus/webhook] FACTUS_WEBHOOK_SECRET no configurado: webhook rechazado (fail-closed)');
      return NextResponse.json({ error: 'Webhook no configurado' }, { status: 503 });
    } else {
      console.warn('[factus/webhook] FACTUS_WEBHOOK_SECRET no configurado: firma NO verificada (solo fuera de producción)');
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const referenceCode = event.reference_code;
    if (typeof referenceCode !== 'string' || !REFERENCE_CODE_RE.test(referenceCode)) {
      console.warn('[factus/webhook] reference_code ausente o con caracteres no permitidos');
      return NextResponse.json({ error: 'reference_code inválido' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data: jobs } = await supabase
      .from('electronic_invoicing_jobs')
      .select('id, organization_id, invoice_id, support_document_id, document_type, status')
      .eq('reference_code', referenceCode)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(2);

    const lista = (jobs ?? []) as Array<{ id: string; organization_id: number; invoice_id: string | null; support_document_id: string | null; document_type: string; status: string }>;
    if (lista.length === 0) {
      console.warn('[factus/webhook] no hay documento con ese reference_code');
      return NextResponse.json({ received: true, message: 'Job not found' });
    }
    if (lista.length > 1 && lista[0].organization_id !== lista[1].organization_id) {
      // Cada organización emite con su cuenta: un código repetido entre dos no se puede atribuir.
      console.warn('[factus/webhook] reference_code repetido entre organizaciones: evento ignorado');
      return NextResponse.json({ received: true, message: 'Ambiguous reference_code' });
    }
    const job = lista[0];

    const tipo = String(event.event_type ?? event.status ?? '');
    const nuevo = ESTADOS[tipo];
    const cufe = typeof event.cufe === 'string' ? event.cufe : null;
    const numero = typeof event.number === 'string' ? event.number : null;

    await supabase.from('electronic_invoicing_events').insert({
      job_id: job.id,
      organization_id: job.organization_id,
      event_type: nuevo ? EVENTO[nuevo] : 'notification',
      event_code: typeof event.code === 'string' ? event.code : null,
      event_message: typeof event.message === 'string' ? event.message.slice(0, 2000) : `Evento DIAN: ${tipo || 'sin tipo'}`,
      metadata: { origen: 'webhook', cufe, numero, errors: event.errors ?? null },
    });

    if (!nuevo || job.status === 'processing') {
      return NextResponse.json({ received: true, status: job.status });
    }

    await supabase
      .from('electronic_invoicing_jobs')
      .update({
        status: nuevo,
        ...(cufe ? { cufe } : {}),
        ...(nuevo === 'accepted' ? { processed_at: new Date().toISOString(), error_code: null, error_message: null } : {}),
      })
      .eq('id', job.id)
      .neq('status', 'processing');

    if (job.document_type === 'support_document' && job.support_document_id) {
      await supabase
        .from('support_documents')
        .update({
          status: nuevo,
          ...(cufe ? { cufe } : {}),
          ...(numero ? { number: numero } : {}),
          ...(nuevo === 'accepted' ? { is_validated: true, validated_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.support_document_id)
        .eq('organization_id', job.organization_id);
    } else if (job.invoice_id) {
      await supabase
        .from('invoice_sales')
        .update({
          einvoice_status: nuevo,
          ...(cufe ? { xml_uuid: cufe } : {}),
          ...(numero ? { einvoice_number: numero } : {}),
          ...(nuevo === 'accepted' ? { validated_at: new Date().toISOString() } : {}),
        })
        .eq('id', job.invoice_id)
        .eq('organization_id', job.organization_id);
    }

    return NextResponse.json({ received: true, status: nuevo });
  } catch (error: unknown) {
    console.error('[factus/webhook] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Error procesando el evento' }, { status: 500 });
  }
}
