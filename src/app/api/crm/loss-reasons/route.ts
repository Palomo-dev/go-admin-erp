import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';

/**
 * GET /api/crm/loss-reasons — catálogo de motivos de pérdida para
 * `LoseDialog` (CRM ola 3B, plan §4.8): los globales (`organization_id` nulo)
 * y los de la organización de la sesión, activos. Columnas verificadas por
 * MCP: id, organization_id, code, label, is_active, is_global, sort_order.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'GET /api/crm/loss-reasons');
    const { data, error } = await ctx.supabase
      .from('loss_reasons')
      .select('id, code, label, is_active, sort_order')
      .or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .limit(200);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (error) {
    return respuestaErrorCrm(error, 'GET /api/crm/loss-reasons');
  }
}
