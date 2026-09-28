/**
 * POST /api/cotizaciones/[id]/estado — { estado: 'sent' | 'accepted' | 'rejected' }.
 * Transiciones válidas en la base (`fn_cotizacion_cambiar_estado`): solo desde
 * borrador o enviada; una vencida solo se rechaza; 'expired' y 'converted' no
 * se piden a mano. Pedir el estado que ya tiene no hace nada.
 * Permiso finance.create o sales_management. Organización de la sesión.
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { cambioEstadoSchema, PERMISOS_COTIZACION } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { errorCotizacion, idDeRuta, SIN_CACHE, sinClavesDeOrganizacion, tieneAlguno } from '@/lib/finanzas/ventas/rutasCotizaciones.server';
import { cambiarEstadoCotizacion, ErrorCotizacionServidor } from '@/lib/services/ventas/cotizaciones.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/cotizaciones/[id]/estado' });
  const id = await idDeRuta(routeParams);
  if (!id) return errorCotizacion(ctx, 'cotizacion_no_encontrada');
  const parsed = cambioEstadoSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return errorCotizacion(ctx, 'transicion_invalida');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.ESCRIBIR))) return errorCotizacion(ctx, 'sin_permiso', 'POST /api/cotizaciones/[id]/estado');
  try {
    return NextResponse.json({ resultado: await cambiarEstadoCotizacion(ctx, id, parsed.data.estado) }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCotizacionServidor) return errorCotizacion(ctx, err.codigo);
    throw err;
  }
});
