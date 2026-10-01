/**
 * GET|POST /api/cron/avisos-miembro
 * Vercel y pg_cron revisan atraso y vencimiento y mandan los correos pendientes.
 * El trigger pide POST con `{ solo: "correo" }` para no repetir el barrido.
 */
import { NextResponse } from 'next/server';
import { withCron } from '@/lib/utils/orgContext';
import { correrAvisos } from '@/lib/services/avisos/despacho.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function soloCorreo(req: Request): Promise<boolean> {
  if (req.method !== 'POST') return false;
  try {
    const body = (await req.json()) as { solo?: unknown };
    return body?.solo === 'correo';
  } catch {
    return false;
  }
}

async function procesar(req: Request): Promise<NextResponse> {
  try {
    const resumen = await correrAvisos({ soloCorreo: await soloCorreo(req) });
    return NextResponse.json(resumen, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cron/avisos-miembro]', err instanceof Error ? err.name : 'error');
    return NextResponse.json({ error: 'No se pudieron procesar los avisos', code: 'ERROR_INTERNO' }, { status: 500 });
  }
}

export const GET = withCron(procesar);
export const POST = withCron(procesar);
