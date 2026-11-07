/**
 * POST /api/consignaciones/liquidaciones/[id]/facturar — reintento de una
 * liquidación «por facturar»: reutiliza el borrador ligado (o lo crea), lo emite
 * con la factura de venta de siempre y cierra (`fn_consignacion_cerrar`).
 * Idempotente. Permiso `finance.create`. Organización de la sesión; otra → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { facturarSchema } from '@/lib/finanzas/consignaciones/consignaciones';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  ErrorConsignacionServidor,
  facturarLiquidacion,
  respuestaErrorConsignacion,
  SIN_CACHE,
} from '@/lib/services/consignaciones/consignaciones.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorConsignacion('liquidacion_no_encontrada');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/consignaciones/liquidaciones/[id]/facturar' });
  const parsed = facturarSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaErrorConsignacion('datos_invalidos');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[consignaciones/facturar] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorConsignacion('sin_permiso');
  }

  try {
    const resultado = await facturarLiquidacion(ctx, id, parsed.data.clave_idempotencia);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorConsignacionServidor) return respuestaErrorConsignacion(err.codigo, err.detalle);
    throw err;
  }
});
