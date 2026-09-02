import { NextRequest, NextResponse } from 'next/server';
import { handleEmailWebhook } from '@/lib/services/crm/emailService';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/email/webhook — Webhook de Resend (sin auth, valida Svix).
 *
 * Este endpoint NO usa getServerOrgContext porque es llamado por Resend,
 * no por un usuario autenticado. La seguridad se basa en la verificación
 * de firma Svix con RESEND_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();

    // Svix requiere los headers en formato plano
    const headers: Record<string, string> = {
      'webhook-id': request.headers.get('webhook-id') || '',
      'webhook-timestamp': request.headers.get('webhook-timestamp') || '',
      'webhook-signature': request.headers.get('webhook-signature') || '',
    };

    // Cliente con service role para el webhook (bypass RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const result = await handleEmailWebhook(payload, headers, supabase);

    return NextResponse.json(
      { success: true, processed: result.processed, event_id: result.event_id },
      { status: 200 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Email Webhook] error:', message);

    // Si es error de firma, retornar 401
    if (message.includes('firma') || message.includes('signature')) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
