/**
 * GET /api/cron/reportes-programados — envíos programados vencidos
 * (`ejecutarEnviosVencidos`). Vercel Cron cada 15 minutos.
 *
 * Seguridad: `CRON_SECRET` (Bearer o `x-cron-secret`, `withCron`). Vercel Cron
 * llama con GET. pg_cron llama con POST (`fn_crm_cron_post`).
 *
 * La sesión de cada destinatario sale de `SUPABASE_JWT_SECRET` si el entorno
 * lo tiene, y si no, de Auth con la clave de servicio. Sin esa segunda vía
 * producción respondía 503 y el correo con el PDF no salía.
 */
import { NextResponse } from 'next/server';
import { withCron } from '@/lib/utils/orgContext';
import { ejecutarEnviosVencidos } from '@/lib/services/reportes/programados/cron.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function procesar(): Promise<NextResponse> {
  try {
    const resumen = await ejecutarEnviosVencidos();
    return NextResponse.json({ procesados: resumen.length, resumen }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cron/reportes-programados]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'No se pudieron procesar los envíos', code: 'ERROR_INTERNO' }, { status: 500 });
  }
}

export const GET = withCron(procesar);
export const POST = withCron(procesar);
