// ============================================================
// POST /api/integrations/qr/expire-sessions
// Job programado (cron) para marcar sesiones QR expiradas.
// Puede invocarse manualmente o desde un cron job externo.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    // Verificar secreto de cron si CRON_SECRET esta configurado
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret) {
      const providedSecret = request.headers.get('x-cron-secret');

      if (providedSecret !== cronSecret) {
        return NextResponse.json(
          { error: 'No autorizado: secreto de cron invalido' },
          { status: 401 },
        );
      }
    }

    // Si CRON_SECRET no esta configurado, se permite sin auth (desarrollo)

    const supabase = getSupabaseAdmin();

    // Marcar como expiradas las sesiones pending cuya fecha ya paso
    const { data, error } = await supabase
      .from('payment_qr_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      console.error('[expire-sessions] Error al expirar sesiones QR:', error);
      return NextResponse.json(
        { success: false, error: `Error al expirar sesiones: ${error.message}` },
        { status: 500 },
      );
    }

    const expiredCount = data?.length ?? 0;

    return NextResponse.json({
      success: true,
      expiredCount,
      message: `${expiredCount} sesiones expiradas`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[expire-sessions] Excepcion:', err);
    return NextResponse.json(
      { success: false, error: `Error interno: ${message}` },
      { status: 500 },
    );
  }
}
