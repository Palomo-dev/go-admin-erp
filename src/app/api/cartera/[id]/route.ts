/**
 * GET /api/cartera/[id] — detalle de una cuenta por cobrar: cuenta con estado y
 * días vivos, factura, cliente (con su cartera total), cuotas y pagos (vivos y
 * anulados). `?origen=pos` basta con `pos.view` (CxC del POS, D3); si no,
 * `finance.view`. Cuenta de otra organización → 404.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { detalleCuenta, ErrorCarteraServidor } from '@/lib/services/cartera/cuentasPorCobrar.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const GET = withOrg(async (ctx, req, routeParams) => {
  await readOrgBody(ctx, req, { route: 'GET /api/cartera/[id]' });
  const params = routeParams ? await routeParams.params : {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Cuenta no encontrada', codigo: 'cuenta_no_encontrada' }, { status: 404, headers: SIN_CACHE });
  }
  const pos = new URL(req.url).searchParams.get('origen') === 'pos';
  const puede = (await hasOrgAdminOrPermission(ctx, 'finance.view')) || (pos && (await hasOrgAdminOrPermission(ctx, 'pos.view')));
  if (!puede) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await detalleCuenta(ctx, id), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCarteraServidor) {
      const estado = err.codigo === 'cuenta_no_encontrada' ? 404 : err.codigo === 'sin_permiso' ? 403 : 500;
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: estado, headers: SIN_CACHE });
    }
    throw err;
  }
});
