import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import { processStripeWebhook, stripeAdapter } from '@/lib/services/crm/stripePaymentLinkService';

export const runtime = 'nodejs';

/**
 * POST /api/crm/webhooks/stripe — pagos de Payment Links del CRM (F10).
 * Sin sesión (el middleware excluye `/api/crm/webhooks/`). La firma se
 * verifica con `stripe.webhooks.constructEvent` (plataforma u organización);
 * la organización sale de la metadata de la sesión ya verificada y el pago
 * se registra por `paymentService` con idempotencia `stripe:<event.id>`.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (rawBody.length > 1024 * 1024) return NextResponse.json({ success: false, error: 'Cuerpo demasiado grande' }, { status: 413 });
    const outcome = await processStripeWebhook(rawBody, request.headers.get('stripe-signature'), { serviceClient: getServiceClient(), adapter: stripeAdapter });
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error('[CRM Webhook Stripe]', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'Error procesando el webhook' }, { status: 500 });
  }
}
