/**
 * DELETE /api/finanzas/presupuestos/:id — borra un presupuesto de la
 * organización de la sesión (sus líneas se van por `on delete cascade`).
 * Borrador: `finance.create`. Aprobado, activo o cerrado: `finance.approve`,
 * porque alimenta el informe de presupuesto contra lo real.
 */
import { NextResponse } from 'next/server';
import { hasOrgAdminOrPermission, withOrg } from '@/lib/utils/orgContext';
import { esUuid, permisoParaBorrar } from '@/lib/finanzas/presupuestos/presupuestoLogica';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const responder = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });

export const DELETE = withOrg(async (ctx, req) => {
  const id = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  if (!esUuid(id)) return responder({ codigo: 'datos_invalidos' }, 400);
  const org = ctx.organizationId;

  const { data: presupuesto, error } = await ctx.supabase
    .from('budgets')
    .select('id, status')
    .eq('id', id)
    .eq('organization_id', org)
    .maybeSingle();
  if (error) {
    console.error('No se pudo leer el presupuesto:', error);
    return responder({ codigo: 'error' }, 500);
  }
  if (!presupuesto) return responder({ codigo: 'no_encontrado' }, 404);
  if (!(await hasOrgAdminOrPermission(ctx, permisoParaBorrar(presupuesto.status as string)))) {
    return responder({ codigo: 'sin_permiso' }, 403);
  }

  const { error: errBorrar } = await ctx.supabase.from('budgets').delete().eq('id', id).eq('organization_id', org);
  if (errBorrar) {
    console.error('No se pudo borrar el presupuesto:', errBorrar);
    return responder({ codigo: 'error' }, 500);
  }
  return responder({ id });
});
