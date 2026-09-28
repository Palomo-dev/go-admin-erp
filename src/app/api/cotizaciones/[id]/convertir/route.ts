/**
 * POST /api/cotizaciones/[id]/convertir — { branch_id?, opportunity_id? }
 * convierte la cotización en una factura de venta BORRADOR con la lógica
 * canónica de facturas (`fn_cotizacion_convertir` → `fn_factura_venta_guardar`:
 * venta ligada, impuestos del documento, comisión del vendedor) y la marca
 * 'converted' en la misma transacción; la factura se emite después con la
 * emisión estándar (kardex, cartera y asiento nacen ahí). Idempotente: una
 * cotización ya convertida devuelve su factura. No convierte rechazadas ni
 * vencidas.
 *
 * Permiso finance.create (crea una factura), aquí y en la base. La usan el
 * detalle de la cotización y el cierre «al ganar» del CRM (WonCloseModal).
 */
import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { convertirSchema, PERMISOS_COTIZACION } from '@/lib/finanzas/ventas/contratoCotizaciones';
import { errorCotizacion, idDeRuta, SIN_CACHE, sinClavesDeOrganizacion, tieneAlguno } from '@/lib/finanzas/ventas/rutasCotizaciones.server';
import { convertirCotizacion, ErrorCotizacionServidor } from '@/lib/services/ventas/cotizaciones.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/cotizaciones/[id]/convertir' });
  const id = await idDeRuta(routeParams);
  if (!id) return errorCotizacion(ctx, 'cotizacion_no_encontrada');
  const parsed = convertirSchema.safeParse(sinClavesDeOrganizacion(raw ?? {}));
  if (!parsed.success) return errorCotizacion(ctx, 'datos_invalidos');
  if (!(await tieneAlguno(ctx, PERMISOS_COTIZACION.CONVERTIR))) return errorCotizacion(ctx, 'sin_permiso', 'POST /api/cotizaciones/[id]/convertir');
  try {
    const resultado = await convertirCotizacion(ctx, id, {
      branchId: parsed.data.branch_id ?? null,
      opportunityId: parsed.data.opportunity_id ?? null,
    });
    return NextResponse.json({ resultado }, { status: resultado.yaConvertida ? 200 : 201, headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCotizacionServidor) return errorCotizacion(ctx, err.codigo);
    throw err;
  }
});
