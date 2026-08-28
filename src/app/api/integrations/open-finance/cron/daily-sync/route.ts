// ============================================================
// /api/integrations/open-finance/cron/daily-sync
// Cron job de sincronizacion diaria de transacciones.
// POST - ejecuta sincronizacion de todos los links activos.
// Sin auth de sesion: verifica CRON_SECRET en header de autorizacion.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { cronJobs } from '@/lib/services/integrations/openFinance/cronJobs';

/** Verifica el secret de autorizacion del cron job */
function verifyCronSecret(request: NextRequest): boolean {
  const secret = process.env.OPEN_FINANCE_CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

// POST - ejecuta sincronizacion diaria
export async function POST(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const report = await cronJobs.runDailySync();
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('[Cron Daily Sync] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
