/**
 * GET /api/anticipos-proveedor/contexto?sucursal=<id>&proveedor=<id> — lo que
 * necesitan los diálogos compartidos con el saldo a favor: métodos de pago de
 * la organización, cuentas bancarias, caja abierta de la sucursal, el día y,
 * con proveedor, sus cuentas por pagar abiertas (para aplicar el anticipo).
 * Lectura con el cliente de la sesión. Ver: `finance.view`.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  contextoAnticipo,
  ErrorAnticipoServidor,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/anticipos-proveedor/contexto' });
  const url = new URL(req.url);
  const crudo = url.searchParams.get('sucursal');
  const sucursal = crudo && /^\d+$/.test(crudo) ? Number(crudo) : null;
  if (crudo && sucursal === null) return respuestaErrorAnticipo('datos_invalidos');
  const crudoProveedor = url.searchParams.get('proveedor');
  const proveedor = crudoProveedor && /^\d+$/.test(crudoProveedor) ? Number(crudoProveedor) : null;
  if (crudoProveedor && proveedor === null) return respuestaErrorAnticipo('datos_invalidos');

  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaErrorAnticipo('sin_permiso');

  try {
    return NextResponse.json(await contextoAnticipo(ctx, { branchId: sucursal, supplierId: proveedor }), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo);
    throw err;
  }
});
