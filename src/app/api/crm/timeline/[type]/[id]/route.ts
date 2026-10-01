import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, tienePermisoCrm, CrmHttpError } from '@/lib/services/crm/crmRouteSupport';
import { getTimeline, TimelineEntityNotFoundError, type TimelineAccess } from '@/lib/services/crm/timelineService';
import { leerConsultaTimeline } from '@/lib/services/crm/timeline/query';
import { exigirUuid } from '@/lib/services/crm/crmErrors';
import { getOrgTimezoneServer } from '@/lib/services/crm/revenueOsService';

export const dynamic = 'force-dynamic';

/** Historial de cliente/oportunidad con RLS y restricciones de sesión. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request, { route: 'GET /api/crm/timeline/[type]/[id]' });
    const { type, id } = await params;
    if (type !== 'customer' && type !== 'opportunity') throw new CrmHttpError(400, 'tipo_invalido', 'Tipo de entidad inválido');
    exigirUuid(id);
    const access: TimelineAccess = {};
    if (type === 'opportunity') await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET timeline oportunidad');
    else if (!(await tienePermisoCrm(ctx, CRM_PERMISOS.clientesVer))) {
      await exigirPermisoCrm(ctx, [CRM_PERMISOS.leadsVer], 'GET timeline cliente');
      access.onlyLeads = true;
    }
    if (!(await tienePermisoCrm(ctx, CRM_PERMISOS.llamadasVerTodas))) access.callUserId = ctx.userId;
    const query = leerConsultaTimeline(request.nextUrl.searchParams);
    access.timezone = await getOrgTimezoneServer(ctx.organizationId, ctx.supabase);
    const result = await getTimeline(ctx.organizationId, type, id, ctx.supabase, query, access);
    return NextResponse.json({ success: true, data: result.entries, next_cursor: result.next_cursor },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof TimelineEntityNotFoundError) return respuestaErrorCrm(new CrmHttpError(404, 'entidad_no_encontrada', error.message), 'GET timeline');
    // Incluye el código de OrgContextError para la recuperación única de sesión.
    if (error instanceof OrgContextError) return respuestaErrorCrm(error, 'GET timeline');
    return respuestaErrorCrm(error, 'GET timeline');
  }
}
