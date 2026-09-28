/**
 * /api/cotizaciones
 *
 * GET  — listado con el estado vivo ('expired' derivado al leer en la zona de
 *        la organización, `fn_cotizaciones_listado`). Permiso finance.view o
 *        sales_management. Filtros por lista blanca (`filtrosCotizacionSchema`).
 * POST — crea una cotización en una transacción (`fn_cotizacion_guardar`):
 *        número y totales en la base. Permiso finance.create o sales_management.
 *
 * La organización sale de la sesión; una organización ajena en la query o en
 * el cuerpo → 403. Contrato y permisos: `contratoCotizaciones.ts`.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { filtrosCotizacionSchema, guardarCotizacionSchema, PERMISOS_COTIZACION } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { errorCotizacion, SIN_CACHE, sinClavesDeOrganizacion, tieneAlguno } from '@/lib/finanzas/ventas/rutasCotizaciones.server';
import { ErrorCotizacionServidor, guardarCotizacion, listarCotizaciones } from '@/lib/services/ventas/cotizaciones.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/cotizaciones' });
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.LEER))) return errorCotizacion(ctx, 'sin_permiso', 'GET /api/cotizaciones');
  const filtros = filtrosCotizacionSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!filtros.success) return errorCotizacion(ctx, 'datos_invalidos');
  try {
    return NextResponse.json({ cotizaciones: await listarCotizaciones(ctx, filtros.data) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCotizacionServidor) return errorCotizacion(ctx, err.codigo);
    throw err;
  }
});

export const POST = withOrg(async (ctx, req) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/cotizaciones' });
  const parsed = guardarCotizacionSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return errorCotizacion(ctx, 'datos_invalidos');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.ESCRIBIR))) return errorCotizacion(ctx, 'sin_permiso', 'POST /api/cotizaciones');
  try {
    return NextResponse.json({ resultado: await guardarCotizacion(ctx, null, parsed.data) }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCotizacionServidor) return errorCotizacion(ctx, err.codigo);
    throw err;
  }
});
