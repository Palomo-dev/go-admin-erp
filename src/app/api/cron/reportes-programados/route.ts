/**
 * GET /api/cron/reportes-programados — envíos programados vencidos
 * (`ejecutarEnviosVencidos`). Vercel Cron cada 15 minutos.
 *
 * Seguridad: `CRON_SECRET` (Bearer o `x-cron-secret`, `withCron`). Sin
 * `SUPABASE_JWT_SECRET` real no se procesa nada (503): sin él no hay forma de
 * generar cada reporte con el alcance de su destinatario, y no se cae a
 * ejecutarlos con el service role.
 */
import { NextResponse } from 'next/server';
import { withCron } from '@/lib/utils/orgContext';
import { readRealSecret } from '@/lib/security/secrets';
import { ejecutarEnviosVencidos } from '@/lib/services/reportes/programados/cron.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const GET = withCron(async () => {
  if (!readRealSecret('SUPABASE_JWT_SECRET', { min: 32 })) {
    return NextResponse.json({ error: 'Envíos programados sin configurar', code: 'JWT_NO_CONFIGURADO' }, { status: 503 });
  }
  try {
    const resumen = await ejecutarEnviosVencidos();
    return NextResponse.json({ procesados: resumen.length, resumen }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cron/reportes-programados]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'No se pudieron procesar los envíos', code: 'ERROR_INTERNO' }, { status: 500 });
  }
});
