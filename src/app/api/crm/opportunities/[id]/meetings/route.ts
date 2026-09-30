import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, exigirUuid, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';

/**
 * GET /api/crm/opportunities/[id]/meetings — reuniones vinculadas (CRM ola 1,
 * M3 · «Conexiones» del detalle, plan §4.6).
 *
 * Lee `calendar_events.opportunity_id` (columna nueva de 20260930160400, con
 * índice parcial) filtrando SIEMPRE por la organización de la sesión.
 * `crm.opportunities.view`. 404 si la oportunidad no es de la organización.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/opportunities/[id]/meetings');
    const { data: opp, error: e1 } = await ctx.supabase.from('opportunities').select('id').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (e1) throw e1;
    if (!opp) throw new CrmHttpError(404, 'oportunidad_no_encontrada', 'Oportunidad no encontrada');
    const { data, error } = await ctx.supabase
      .from('calendar_events')
      .select('id, title, description, location, start_at, end_at, timezone, status, assigned_to, customer_id, created_by, created_at')
      .eq('organization_id', ctx.organizationId)
      .eq('opportunity_id', id)
      .order('start_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/opportunities/[id]/meetings');
  }
}
