// ============================================================
// POST /api/integrations/qr/auto-match
// Auto-concilia un payment con un bank_transaction despues de un webhook.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { autoMatchFromWebhook } from '@/lib/services/integrations/qrShared/autoReconciliation';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { paymentId, bankTransactionId, organizationId } = await request.json();

    if (!paymentId || !bankTransactionId || !organizationId) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: paymentId, bankTransactionId, organizationId' },
        { status: 400 }
      );
    }

    const result = await autoMatchFromWebhook(
      paymentId,
      bankTransactionId,
      organizationId
    );

    return NextResponse.json(result);
  } catch (err) {
    console.error('[API QR Auto-Match] Error:', err);
    return NextResponse.json(
      { success: false, message: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
