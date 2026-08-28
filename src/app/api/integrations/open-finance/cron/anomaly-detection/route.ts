// ============================================================
// /api/integrations/open-finance/cron/anomaly-detection
// Cron job de deteccion de anomalias de tesoreria.
// POST - ejecuta deteccion de anomalias para todas las organizaciones.
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

// POST - ejecuta deteccion de anomalias
export async function POST(request: NextRequest) {
  try {
    if (!verifyCronSecret(request)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const report = await cronJobs.runAnomalyDetection();
    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('[Cron Anomaly Detection] Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
