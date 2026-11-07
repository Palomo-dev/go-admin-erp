/**
 * GET /api/consignaciones/[id] — una nota con sus líneas (entregado, vendido,
 * devuelto, en su poder) y sus liquidaciones (Figma `2335:139356`). RLS por
 * pertenencia y filtro por la organización de la sesión. Permiso `finance.view`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import {
  detalleConsignacion,
  ErrorConsignacionServidor,
  respuestaErrorConsignacion,
  SIN_CACHE,
} from '@/lib/services/consignaciones/consignaciones.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/consignaciones/[id]' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) return respuestaErrorConsignacion('nota_no_encontrada');
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaErrorConsignacion('sin_permiso');
  try {
    return NextResponse.json(await detalleConsignacion(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorConsignacionServidor) return respuestaErrorConsignacion(err.codigo);
    throw err;
  }
});
