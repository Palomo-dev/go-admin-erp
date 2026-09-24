/**
 * API Route: procesador de la cola de facturación electrónica.
 * GET|POST /api/factus/process-pending
 *
 * Lo llama Vercel Cron cada 2 minutos (`vercel.json`; Vercel Cron llama con
 * GET y manda `Authorization: Bearer ${CRON_SECRET}`). Se eligió Vercel Cron y
 * no pg_cron porque se despliega junto con este código: un pg_cron dado de
 * alta en la base antes del despliegue llamaría a la versión anterior de la
 * ruta, que no respeta retenciones ni bloqueos.
 *
 * Autenticación (fail-closed): `verifyCronSecret` (CRON_SECRET) o
 * `Bearer ${FACTUS_CRON_API_KEY}` si esa variable es un secreto real. Sin
 * ninguno configurado → 401 siempre.
 *
 * Qué hace (`procesarPendientes`):
 * 1. Verifica contra Factus las credenciales que la plataforma cargó y aún no
 *    se comprobaron; si el NIT de la cuenta es el de la organización, activa
 *    el servicio.
 * 2. Reclama hasta 10 jobs listos (FOR UPDATE SKIP LOCKED, solo de
 *    organizaciones con el servicio activo, no retenidos, con su espera de
 *    reintento cumplida) y los envía uno a uno.
 */

import { NextResponse } from 'next/server';
import { safeEqual, verifyCronSecret } from '@/lib/security/webhookSignatures';
import { readRealSecret } from '@/lib/security/secrets';
import { procesarPendientes } from '@/lib/services/einvoicing/colaFacturacion.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function procesar(request: Request): Promise<Response> {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { verificadas, resultados } = await procesarPendientes(10);
    return NextResponse.json({
      processed: resultados.length,
      verified: verificadas,
      results: resultados.map((r) => ({ jobId: r.jobId, status: r.estado })),
    });
  } catch (error: unknown) {
    console.error('[factus/process-pending] error:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Error procesando la cola' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return procesar(request);
}

export async function POST(request: Request) {
  return procesar(request);
}

/**
 * `Bearer FACTUS_CRON_API_KEY` (si es un secreto real) o `CRON_SECRET`.
 * Sin ninguno configurado, `verifyCronSecret` lanza → false (fail-closed).
 */
function isAuthorizedCron(request: Request): boolean {
  const apiKey = readRealSecret('FACTUS_CRON_API_KEY');
  if (apiKey) {
    const auth = request.headers.get('authorization') || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (bearer && safeEqual(bearer, apiKey)) return true;
  }
  try {
    verifyCronSecret(request);
    return true;
  } catch {
    return false;
  }
}
