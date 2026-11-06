/**
 * POST /api/finanzas/reglas-contables — crea una regla en la organización de la
 * sesión. Permiso `finance.create`, aquí, con el cliente de la sesión: RLS y
 * `trg_accounting_rules_validar_cuentas` siguen aplicando.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { camposDeRegla, errorDeRegla, estadoHttpErrorRegla } from '@/lib/finanzas/reglasContables';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const POST = withOrg(async (ctx, req) => {
  const body = await readOrgBody(ctx, req, { route: 'POST /api/finanzas/reglas-contables' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) {
    return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
  }
  const campos = camposDeRegla(body, 'crear');
  if (!campos) {
    return NextResponse.json({ codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  const { data, error } = await ctx.supabase
    .from('accounting_rules')
    .insert({ ...campos, organization_id: ctx.organizationId })
    .select()
    .single();
  if (error) {
    const fallo = errorDeRegla(error);
    return NextResponse.json(fallo, { status: estadoHttpErrorRegla(fallo.codigo), headers: SIN_CACHE });
  }
  return NextResponse.json(data, { status: 201, headers: SIN_CACHE });
});
