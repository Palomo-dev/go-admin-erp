/**
 * GET /api/cron/fotos-operacion — fotos diarias de Logística y Transporte (`ops_daily_snapshots`).
 *
 * Vercel Cron cada hora (minuto 50); cada organización con Logística o Transporte activos se
 * fotografía una vez al día, en la última hora de SU día (zona de la organización). Base de la
 * comparación «vs. cierre de ayer» y de la mini-gráfica de los widgets del Inicio (Figma `03` ›
 * Inicio, 2917:45049 y 2917:45560). Detalle y reglas: `lib/dashboard/fotosOperacion.cron.ts`.
 *
 * Seguridad: `Authorization: Bearer CRON_SECRET` (`withCron`, fail-closed). Cliente
 * service_role: las organizaciones salen de `organization_modules`, nunca de la petición.
 */
import { NextResponse } from 'next/server';
import { withCron } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { tomarFotosOperacion } from '@/lib/dashboard/fotosOperacion.cron';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function procesar(): Promise<NextResponse> {
  try {
    const resumen = await tomarFotosOperacion(getServiceClient());
    return NextResponse.json(resumen, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[cron/fotos-operacion]', err instanceof Error ? err.message : 'error');
    return NextResponse.json({ error: 'No se pudieron tomar las fotos de la operación', code: 'ERROR_INTERNO' }, { status: 500 });
  }
}

export const GET = withCron(procesar);
