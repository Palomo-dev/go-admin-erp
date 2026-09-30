/**
 * GET /api/reportes/cierres/[id]/excel — libro del cierre congelado.
 *
 * Lee `report_closings.snapshot` con la sesión (la RLS de lectura ya exige
 * membresía y alcance de sucursal) y arma el mismo Excel que el diálogo
 * descarga al generar. Permiso `reports.export` o `finance.view`, el mismo
 * del PDF.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { SIN_CACHE, exigirAlgunPermiso, idDeRuta } from '@/lib/services/compras/rutas.server';
import { excelDelCierre } from '@/lib/services/reportes/cierres/cierres.server';
import { respuestaErrorReportes, sujetoDeContexto } from '@/lib/services/reportes/rutas.server';

export const dynamic = 'force-dynamic';
const RUTA = 'GET /api/reportes/cierres/[id]/excel';

export const GET = withOrg(async (ctx, req, routeParams) => {
  try {
    const id = await idDeRuta(routeParams);
    await exigirAlgunPermiso(ctx, ['reports.export', 'finance.view'], RUTA);
    const idioma = new URL(req.url).searchParams.get('idioma');
    const archivo = await excelDelCierre(sujetoDeContexto(ctx), id, idioma);
    return new NextResponse(Buffer.from(archivo.bytes), {
      headers: {
        ...SIN_CACHE,
        'Content-Type': archivo.tipo,
        'Content-Disposition': `attachment; filename="${archivo.nombre}"`,
      },
    });
  } catch (err) {
    return respuestaErrorReportes(RUTA, err);
  }
});
