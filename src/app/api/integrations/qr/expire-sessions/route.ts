// ============================================================
// POST /api/integrations/qr/expire-sessions
// Cron job: marca sesiones QR expiradas como 'expired'.
// Protegido por OPEN_FINANCE_CRON_SECRET o CRON_SECRET (Bearer).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getExpiredQrSessions } from '@/lib/services/integrations/qrShared/qrSessionService';

/** Verifica el secret de autorizacion del cron job (Bearer token). */
function verifyCronSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.OPEN_FINANCE_CRON_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${expectedSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Obtener sesiones expiradas usando el servicio compartido
    const expiredSessions = await getExpiredQrSessions();

    if (expiredSessions.length === 0) {
      return NextResponse.json({
        success: true,
        expiredCount: 0,
        message: 'No hay sesiones expiradas',
      });
    }

    const now = new Date().toISOString();
    const expiredIds = expiredSessions.map((s) => s.id);

    // Marcar como expired con doble verificacion de estado
    const supabase = getSupabaseAdmin();
    const { error: updateError } = await supabase
      .from('payment_qr_sessions')
      .update({ status: 'expired', updated_at: now })
      .in('id', expiredIds)
      .eq('status', 'pending');

    if (updateError) {
      console.error('[Cron QR Expire] Error marcando sesiones como expiradas:', updateError);
      return NextResponse.json({ error: 'Error actualizando sesiones' }, { status: 500 });
    }

    // Log de sesiones expiradas
    for (const session of expiredSessions) {
      console.log(
        `[Cron QR Expire] Sesion ${session.reference} (${session.provider_code}) expirada - monto: ${session.amount}`,
      );
    }

    return NextResponse.json({
      success: true,
      expiredCount: expiredSessions.length,
      sessions: expiredSessions.map((s) => ({
        id: s.id,
        reference: s.reference,
        provider: s.provider_code,
      })),
    });
  } catch (err) {
    console.error('[Cron QR Expire] Error:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
