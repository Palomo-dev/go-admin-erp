/**
 * POST /api/consignaciones/[id]/liquidar — «Facturar y cerrar» (Figma
 * `2335:139356`): registra lo vendido y lo devuelto (`fn_consignacion_liquidar`:
 * vuelven a la bodega con su asiento de reclasificación), factura lo vendido con
 * la factura de venta de siempre (guardar + emitir) y cierra la liquidación
 * (`fn_consignacion_cerrar`: comisión aplicada como saldo a favor). Si la
 * factura no se puede emitir, la liquidación queda «por facturar» y la
 * respuesta trae `errorFactura` para reintentar.
 *
 * Permiso `finance.create`, resuelto aquí y otra vez en la base (que además exige
 * inventario «trasladar»). Organización de la sesión; otra → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { liquidarSchema } from '@/lib/finanzas/consignaciones/consignaciones';
import { sinClavesDeOrganizacion, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  ErrorConsignacionServidor,
  liquidarConsignacion,
  respuestaErrorConsignacion,
  SIN_CACHE,
} from '@/lib/services/consignaciones/consignaciones.server';

export const dynamic = 'force-dynamic';

export const POST = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorConsignacion('nota_no_encontrada');

  const raw: unknown = await readOrgBody(ctx, req, { route: 'POST /api/consignaciones/[id]/liquidar' });
  const parsed = liquidarSchema.safeParse(sinClavesDeOrganizacion(raw));
  if (!parsed.success) return respuestaErrorConsignacion('datos_invalidos', parsed.error.issues.map((i) => i.path.join('.')));

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    console.warn('[consignaciones/liquidar] permiso faltante → 403', { organizationId: ctx.organizationId, userId: ctx.userId });
    return respuestaErrorConsignacion('sin_permiso');
  }

  try {
    const resultado = await liquidarConsignacion(ctx, id, parsed.data);
    return NextResponse.json({ resultado }, { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorConsignacionServidor) return respuestaErrorConsignacion(err.codigo, err.detalle);
    throw err;
  }
});
