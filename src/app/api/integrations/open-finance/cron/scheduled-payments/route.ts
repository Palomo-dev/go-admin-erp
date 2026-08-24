// ============================================================
// /api/integrations/open-finance/cron/scheduled-payments
// Cron job de ejecucion de pagos programados pendientes.
// POST - ejecuta pagos con method='open_finance_scheduled' vencidos.
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

// POST - ejecuta pagos programados pendientes
export async function POST(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const report = await cronJobs.runScheduledPayments();
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('[Cron Scheduled Payments] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
