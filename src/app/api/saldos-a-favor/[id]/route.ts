/**
 * GET /api/saldos-a-favor/[id] — detalle de un saldo a favor para la hoja
 * lateral (Figma `1020:91478`): la fila (misma RPC del listado: permiso,
 * sucursal y vencido los decide la base), su documento de origen, las
 * aplicaciones a facturas, las devoluciones en dinero y la anulación.
 *
 * Permiso `finance.view`. Organización de la sesión; otra en la query → 403.
 * Lectura con el cliente de la sesión (RLS por pertenencia).
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ErrorSaldoFavorServidor, respuestaError, SIN_CACHE, UUID_RE } from '@/lib/services/saldosAFavor/saldosAFavor.server';
import { detalleSaldo } from '@/lib/services/saldosAFavor/listadoSaldos.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req, routeParams) => {
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  await readOrgBody(ctx, req, { route: 'GET /api/saldos-a-favor/[id]' });
  if (!UUID_RE.test(id)) return respuestaError('saldo_no_encontrado');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaError('sin_permiso');

  try {
    return NextResponse.json(await detalleSaldo(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo);
    throw err;
  }
});
