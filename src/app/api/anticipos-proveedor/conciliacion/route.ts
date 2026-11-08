/**
 * GET /api/anticipos-proveedor/conciliacion — P6 del Contador: saldo por
 * anticipo y por proveedor (tabla, libros de su cuenta y auxiliar por NIT), con
 * lo aplicado, la retención descontada, lo devuelto y lo anulado de cada uno
 * (`fn_anticipos_proveedor_conciliacion`, solo lectura, filtra por sucursal en
 * la base). Permiso `finance.view`. Organización de la sesión; otra en la
 * query → 403.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  conciliacionAnticipos,
  ErrorAnticipoServidor,
  respuestaErrorAnticipo,
  SIN_CACHE,
} from '@/lib/services/anticiposProveedor/anticiposProveedor.server';

export const dynamic = 'force-dynamic';

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/anticipos-proveedor/conciliacion' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.view'))) return respuestaErrorAnticipo('sin_permiso');
  try {
    return NextResponse.json(await conciliacionAnticipos(ctx), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorAnticipoServidor) return respuestaErrorAnticipo(err.codigo);
    throw err;
  }
});
