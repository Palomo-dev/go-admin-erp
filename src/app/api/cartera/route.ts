/**
 * GET /api/cartera — cuentas por cobrar paginadas, filtradas y ordenadas en el
 * servidor (`fn_cxc_listado`) con el resumen (KPIs y tramos de antigüedad).
 * `origen=pos` es la cartera del POS (D3): basta `pos.view`. Si no, `finance.view`.
 * Organización de la sesión; query por listas blancas.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { consultaCarteraDesde } from '@/lib/finanzas/cartera/listadoCartera';
import { ErrorCarteraServidor, listadoCartera } from '@/lib/services/cartera/cuentasPorCobrar.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const GET = withOrg(async (ctx, req) => {
  await readOrgBody(ctx, req, { route: 'GET /api/cartera' });
  const consulta = consultaCarteraDesde(new URL(req.url).searchParams);
  const puede =
    (await hasOrgAdminOrPermission(ctx, 'finance.view')) ||
    (consulta.origen === 'pos' && (await hasOrgAdminOrPermission(ctx, 'pos.view')));
  if (!puede) {
    return NextResponse.json({ error: 'Sin permiso', codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await listadoCartera(ctx, consulta), { headers: SIN_CACHE });
  } catch (err) {
    if (err instanceof ErrorCarteraServidor) {
      return NextResponse.json({ error: err.codigo, codigo: err.codigo }, { status: err.codigo === 'sin_permiso' ? 403 : 500, headers: SIN_CACHE });
    }
    throw err;
  }
});
