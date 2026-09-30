/**
 * POST /api/reportes/programados/[id]/prueba — manda el envío ahora, solo al
 * correo de quien lo pide y con SU alcance. No cambia el próximo envío.
 *
 * Permiso `reports.export`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirPermisos, idDeRuta } from '@/lib/services/compras/rutas.server';
import { ErrorEnvioServidor, codigoErrorEnvio } from '@/lib/services/finanzas/enviarDocumento.server';
import { EmailError } from '@/lib/services/crm/email/types';
import { ErrorPdfNoDisponible } from '@/lib/documents/server/pdf';
import { enviarPrueba } from '@/lib/services/reportes/programados/programados.server';
import { respuestaErrorReportes } from '@/lib/services/reportes/rutas.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const RUTA = 'POST /api/reportes/programados/[id]/prueba';

export const POST = withOrg(async (ctx, _req, routeParams) => {
  try {
    const id = await idDeRuta(routeParams);
    await exigirPermisos(ctx, ['reports.export'], RUTA);
    const resultado = await enviarPrueba(ctx, id);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorPdfNoDisponible) {
      return NextResponse.json({ error: 'PDF_NO_DISPONIBLE', codigo: 'PDF_NO_DISPONIBLE' }, { status: 503, headers: SIN_CACHE });
    }
    if (err instanceof EmailError || err instanceof ErrorEnvioServidor) {
      const codigo = err instanceof ErrorEnvioServidor ? err.codigo : codigoErrorEnvio(err);
      return NextResponse.json({ error: codigo, codigo }, { status: codigo === 'correo_no_configurado' ? 409 : 502, headers: SIN_CACHE });
    }
    return respuestaErrorReportes(RUTA, err);
  }
});
