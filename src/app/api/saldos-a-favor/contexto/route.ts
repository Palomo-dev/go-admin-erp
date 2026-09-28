/**
 * GET /api/saldos-a-favor/contexto?sucursal=<id> — lo que necesita el diálogo
 * del anticipo: métodos de pago de la organización, cuentas bancarias, caja
 * abierta de la sucursal y el día. Lectura con el cliente de la sesión,
 * filtrada por la organización de la sesión. Ver: `finance.view`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  contextoSaldo,
  ErrorSaldoFavorServidor,
  respuestaError,
  SIN_CACHE,
} from '@/lib/services/saldosAFavor/saldosAFavor.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/saldos-a-favor/contexto' });
  const url = new URL(req.url);
  const crudo = url.searchParams.get('sucursal');
  const sucursal = crudo && /^\d+$/.test(crudo) ? Number(crudo) : null;
  if (crudo && sucursal === null) return respuestaError('datos_invalidos');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaError('sin_permiso');

  try {
    return NextResponse.json(await contextoSaldo(ctx, sucursal), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo);
    throw err;
  }
});
