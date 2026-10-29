import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret, webhookErrorResponse } from '@/lib/security/webhookSignatures';
import { getServiceClient } from '@/lib/supabase/server-service';

export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/expire-web-order-changes
 * Vence los cambios de pedido con link sin pagar (expires_at pasado) y libera su reserva CHG-….
 * Seguridad: `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  try {
    verifyCronSecret(request);
  } catch (err) {
    return webhookErrorResponse(err);
  }
  const { data, error } = await getServiceClient().rpc('fn_web_order_changes_expirar');
  if (error) {
    console.error('[cron expire-web-order-changes]', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true, vencidos: data ?? 0 });
}
