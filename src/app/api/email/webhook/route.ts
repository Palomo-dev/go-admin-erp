import { NextRequest, NextResponse } from 'next/server';
import { handleEmailWebhook } from '@/lib/services/crm/email/webhookService';
import { webhookErrorResponse, WebhookError } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/email/webhook — Resend (svix). Sin sesión: la seguridad es la
 * firma (`verifyResendWebhook`, fail-closed: sin RESEND_WEBHOOK_SECRET → 401).
 * Raw body obligatorio. Responde 200 aunque el evento sea desconocido o
 * duplicado (Resend reintenta 8 veces ante no-2xx).
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  for (const k of ['svix-id', 'svix-timestamp', 'svix-signature', 'webhook-id', 'webhook-timestamp', 'webhook-signature']) {
    headers[k] = request.headers.get(k) ?? '';
  }
  try {
    const result = await handleEmailWebhook(rawBody, headers, getServiceClient());
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err) {
    if (err instanceof WebhookError) return webhookErrorResponse(err);
    const message = err instanceof Error ? err.message : 'Error desconocido';
    console.error('[Email Webhook] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
