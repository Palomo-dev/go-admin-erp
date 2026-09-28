/**
 * POST /api/cotizaciones/[id]/duplicar — { valid_until? } copia la cotización
 * como borrador nuevo, con número nuevo y vigencia desde hoy (la misma
 * duración que la original, o la fecha pedida) — `fn_cotizacion_duplicar`.
 * Permiso finance.create o sales_management. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { duplicarSchema, PERMISOS_COTIZACION } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { errorCotizacion, idDeRuta, SIN_CACHE, sinClavesDeOrganizacion, tieneAlguno } from '@/lib/finanzas/ventas/rutasCotizaciones.server';
import { duplicarCotizacion, ErrorCotizacionServidor } from '@/lib/services/ventas/cotizaciones.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/cotizaciones/[id]/duplicar' });
  const id = await idDeRuta(routeParams);
  if (!id) return errorCotizacion(ctx, 'cotizacion_no_encontrada');
  const parsed = duplicarSchema.safeParse(sinClavesDeOrganizacion(raw ?? {}));
  if (!parsed.success) return errorCotizacion(ctx, 'datos_invalidos');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.ESCRIBIR))) return errorCotizacion(ctx, 'sin_permiso', 'POST /api/cotizaciones/[id]/duplicar');
  try {
    const resultado = await duplicarCotizacion(ctx, id, parsed.data.valid_until ?? null);
    return NextResponse.json({ resultado }, { status: 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCotizacionServidor) return errorCotizacion(ctx, err.codigo);
    throw err;
  }
});
