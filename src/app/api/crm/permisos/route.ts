import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, isOrgAdminContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';

/**
 * GET /api/crm/permisos — qué puede hacer la persona en el CRM (ola 3A), para
 * que las pantallas muestren u oculten botones. Resuelto en el SERVIDOR con la
 * sesión (regla dura 6): administrador de la organización (super admin o rol
 * 1/2 por id) = todo; si no, `get_user_permission_codes` (rol + cargo, con
 * precedencia del cargo), la misma fuente que `check_user_permission`.
 *
 * Es solo para la interfaz: cada ruta de escritura vuelve a exigir su permiso.
 * 200 { usuario_id, permisos: { 'crm.leads.view': true, … } }.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const codigos = Object.values(CRM_PERMISOS);
    let concedidos: Set<string>;
    if (isOrgAdminContext(ctx)) concedidos = new Set(codigos);
    else {
      const { data, error } = await ctx.supabase.rpc('get_user_permission_codes', { p_user_id: ctx.userId, p_organization_id: ctx.organizationId });
      if (error) throw error;
      concedidos = new Set(((data as string[] | null) ?? []).filter((c) => typeof c === 'string'));
    }
    const permisos = Object.fromEntries(codigos.map((c) => [c, concedidos.has(c)]));
    return NextResponse.json({ success: true, data: { usuario_id: ctx.userId, permisos } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/permisos');
  }
}
