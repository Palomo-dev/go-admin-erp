/**
 * GET|POST /api/cron/correo-dominio-sitio
 *
 * Retoma el alta en Resend de los dominios comprados que ya son el principal
 * del sitio y todavía no pueden enviar. Vercel Cron llama con GET.
 *
 * Seguridad: `withCron` (Bearer CRON_SECRET, fail-closed). La organización
 * sale de `organization_domains`, nunca del body.
 */
import { NextResponse } from 'next/server';
import { withCron } from '@/lib/utils/orgContext';
import { dependenciasCorreoSitio, reintentarCorreoDominiosSitio } from '@/lib/services/website/dominios/reintentoCorreoSitio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function procesar(): Promise<NextResponse> {
  try {
    const deps = await dependenciasCorreoSitio();
    if (!deps.proveedorListo) {
      return NextResponse.json({ omitido: 'sin_proveedor', revisados: 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const resultados = await reintentarCorreoDominiosSitio(deps);
    const contar = (estado: string) => resultados.filter((r) => r.estado === estado).length;
    return NextResponse.json(
      {
        revisados: resultados.length,
        verificados: contar('verificado'),
        pendientes: contar('pendiente'),
        errores: contar('error'),
        omitidos: contar('omitido'),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[cron/correo-dominio-sitio]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'No se pudieron preparar los dominios de correo', code: 'ERROR_INTERNO' }, { status: 500 });
  }
}

export const GET = withCron(procesar);
export const POST = withCron(procesar);
