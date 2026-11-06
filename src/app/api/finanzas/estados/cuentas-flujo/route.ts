/**
 * PUT /api/finanzas/estados/cuentas-flujo — el Contador marca cuentas: efectivo
 * o equivalente y categoría de flujo. Exige `finance.approve`, aquí y en la base.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { ErrorEstados, guardarCuentasFlujo } from '@/lib/finanzas/estados/fuente.server';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const PUT = withOrg(async (ctx, req) => {
  const body = (await readOrgBody(ctx, req, { route: 'PUT /api/finanzas/estados/cuentas-flujo' })) as { cuentas?: unknown };
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.approve'))) {
    return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  if (!Array.isArray(body?.cuentas)) {
    return NextResponse.json({ codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  try {
    return NextResponse.json(await guardarCuentasFlujo(ctx, body.cuentas), { headers: SIN_CACHE });
  } catch (error) {
    if (error instanceof ErrorEstados) {
      return NextResponse.json({ codigo: error.codigo }, { status: error.estado, headers: SIN_CACHE });
    }
    throw error;
  }
});
