/**
 * GET /api/saldos-a-favor/contexto?sucursal=<id>&cliente=<uuid> — lo que
 * necesitan los diálogos: métodos de pago de la organización, cuentas
 * bancarias, caja abierta de la sucursal, el día y, con cliente, sus facturas
 * de venta abiertas (para aplicar saldo). Lectura con el cliente de la sesión,
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
  UUID_RE,
} from '@/lib/services/saldosAFavor/saldosAFavor.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/saldos-a-favor/contexto' });
  const url = new URL(req.url);
  const crudo = url.searchParams.get('sucursal');
  const sucursal = crudo && /^\d+$/.test(crudo) ? Number(crudo) : null;
  if (crudo && sucursal === null) return respuestaError('datos_invalidos');
  const cliente = url.searchParams.get('cliente');
  if (cliente && !UUID_RE.test(cliente)) return respuestaError('datos_invalidos');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaError('sin_permiso');

  try {
    return NextResponse.json(await contextoSaldo(ctx, { branchId: sucursal, customerId: cliente }), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorSaldoFavorServidor) return respuestaError(err.codigo);
    throw err;
  }
});
