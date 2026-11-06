/**
 * PATCH  /api/finanzas/reglas-contables/[id] — actualiza los campos enviados.
 * DELETE /api/finanzas/reglas-contables/[id] — elimina la regla.
 *
 * Antes el servicio del navegador escribía solo con `.eq('id', id)`: quien
 * perteneciera a dos empresas podía tocar una regla de la que no tenía activa.
 * Aquí la organización sale de la sesión y filtra siempre. Permiso
 * `finance.create`. Una regla de otra empresa responde 404.
 */
import { NextResponse } from 'next/server';
import { withOrg, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { camposDeRegla, errorDeRegla, estadoHttpErrorRegla } from '@/lib/finanzas/reglasContables';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sinPermiso() {
  return NextResponse.json({ codigo: 'sin_permiso' }, { status: 403, headers: SIN_CACHE });
}

function noEncontrada() {
  return NextResponse.json({ codigo: 'regla_no_encontrada' }, { status: 404, headers: SIN_CACHE });
}

function idDe(params: Record<string, string | string[] | undefined> | undefined): string | null {
  const id = params?.id;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

export const PATCH = withOrg(async (ctx, req, routeParams) => {
  const body = await readOrgBody(ctx, req, { route: 'PATCH /api/finanzas/reglas-contables/[id]' });
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) return sinPermiso();
  const id = idDe(await routeParams?.params);
  if (!id) return noEncontrada();
  const campos = camposDeRegla(body, 'actualizar');
  if (!campos) {
    return NextResponse.json({ codigo: 'datos_invalidos' }, { status: 400, headers: SIN_CACHE });
  }
  const { data, error } = await ctx.supabase
    .from('accounting_rules')
    .update(campos)
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select()
    .maybeSingle();
  if (error) {
    const fallo = errorDeRegla(error);
    return NextResponse.json(fallo, { status: estadoHttpErrorRegla(fallo.codigo), headers: SIN_CACHE });
  }
  if (!data) return noEncontrada();
  return NextResponse.json(data, { headers: SIN_CACHE });
});

export const DELETE = withOrg(async (ctx, _req, routeParams) => {
  if (!(await hasOrgAdminOrPermission(ctx, 'finance.create'))) return sinPermiso();
  const id = idDe(await routeParams?.params);
  if (!id) return noEncontrada();
  const { data, error } = await ctx.supabase
    .from('accounting_rules')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .select('id')
    .maybeSingle();
  if (error) {
    const fallo = errorDeRegla(error);
    return NextResponse.json(fallo, { status: estadoHttpErrorRegla(fallo.codigo), headers: SIN_CACHE });
  }
  if (!data) return noEncontrada();
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
});
