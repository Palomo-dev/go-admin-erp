/**
 * /api/cotizaciones/[id]
 *
 * GET    — detalle con el estado vivo, líneas y cliente (finance.view o
 *          sales_management). De otra organización o inexistente → 404 (antes
 *          `.single()` lanzaba y «no encontrada» nunca aparecía).
 * PUT    — edita una cotización en borrador o enviada (`fn_cotizacion_guardar`):
 *          cliente, sucursal, oportunidad y líneas; totales en la base.
 * DELETE — elimina un borrador (`fn_cotizacion_eliminar`).
 * Escribir: finance.create o sales_management. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg, type ServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { guardarCotizacionSchema, PERMISOS_COTIZACION } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { errorCotizacion, idDeRuta, SIN_CACHE, sinClavesDeOrganizacion, tieneAlguno } from '@/lib/finanzas/ventas/rutasCotizaciones.server';
import { detalleCotizacion, eliminarCotizacion, ErrorCotizacionServidor, guardarCotizacion } from '@/lib/services/ventas/cotizaciones.server';

export const dynamic = 'force-dynamic';

function fallo(ctx: ServerOrgContext, err: unknown): Promise<Response> {
  if (err instanceof ErrorCotizacionServidor) return errorCotizacion(ctx, err.codigo);
  throw err;
}

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/cotizaciones/[id]' });
  const id = await idDeRuta(routeParams);
  if (!id) return errorCotizacion(ctx, 'cotizacion_no_encontrada');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.LEER))) return errorCotizacion(ctx, 'sin_permiso', 'GET /api/cotizaciones/[id]');
  try {
    return NextResponse.json({ cotizacion: await detalleCotizacion(ctx, id) }, { headers: SIN_CACHE });
  } catch (err) {
    return fallo(ctx, err);
  }
});

export const PUT = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'PUT /api/cotizaciones/[id]' });
  const id = await idDeRuta(routeParams);
  if (!id) return errorCotizacion(ctx, 'cotizacion_no_encontrada');
  const parsed = guardarCotizacionSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return errorCotizacion(ctx, 'datos_invalidos');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.ESCRIBIR))) return errorCotizacion(ctx, 'sin_permiso', 'PUT /api/cotizaciones/[id]');
  try {
    return NextResponse.json({ resultado: await guardarCotizacion(ctx, id, parsed.data) }, { headers: SIN_CACHE });
  } catch (err) {
    return fallo(ctx, err);
  }
});

export const DELETE = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'DELETE /api/cotizaciones/[id]' });
  const id = await idDeRuta(routeParams);
  if (!id) return errorCotizacion(ctx, 'cotizacion_no_encontrada');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.ESCRIBIR))) return errorCotizacion(ctx, 'sin_permiso', 'DELETE /api/cotizaciones/[id]');
  try {
    await eliminarCotizacion(ctx, id);
    return NextResponse.json({ resultado: { eliminada: true } }, { headers: SIN_CACHE });
  } catch (err) {
    return fallo(ctx, err);
  }
});
