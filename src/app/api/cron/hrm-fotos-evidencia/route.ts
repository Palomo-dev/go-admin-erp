/**
 * GET|POST /api/cron/hrm-fotos-evidencia — tarea diaria de Marcación (plan §5.2, D5).
 * La llama pg_cron (`hrm-fotos-evidencia`, 5:40 UTC) con el secreto del cron. Borra
 * del bucket privado las fotos de evidencia vencidas que no tienen retención por
 * caso (reclamo o ajuste abierto) y deja la marca sin foto. La marca no se borra.
 */
import { NextResponse } from 'next/server';
import { withCron } from '@/lib/utils/orgContext';
import { borrarFotosVencidas } from '@/lib/services/hrm/kioscoGestionService.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function procesar(): Promise<NextResponse> {
  try {
    return NextResponse.json(await borrarFotosVencidas(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cron/hrm-fotos-evidencia]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'No se pudieron borrar las fotos vencidas', code: 'ERROR_INTERNO' }, { status: 500 });
  }
}

export const GET = withCron(procesar);
export const POST = withCron(procesar);
