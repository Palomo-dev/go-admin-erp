/**
 * POST /api/finanzas/presupuestos/:id/aprobar — aprueba un presupuesto en borrador
 * de la organización de la sesión. Permiso `finance.approve`, aquí y en la base.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const POST = withOrg(async (ctx, req) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.approve'))) {
    return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const id = new URL(req.url).pathname.split('/').slice(-2, -1)[0] ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  const { data, error } = await ctx.supabase.rpc('fn_presupuesto_aprobar', {
    p_organization_id: ctx.organizationId,
    p_budget_id: id,
  });
  if (error) {
    const estado = error.code === '42501' ? 403 : error.code === '22023' ? 409 : 500;
    if (estado === 500) console.error('No se pudo aprobar el presupuesto:', error);
    return NextResponse.json({ codigo: estado === 403 ? 'sin_permiso' : estado === 409 ? 'no_aprobable' : 'error' }, { status: estado, headers: SIN_CACHE });
  }
  return NextResponse.json(data, { headers: SIN_CACHE });
});
