import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getPipelineFunnel } from '@/lib/services/crm/revenueOsService';
import { jsonOk, revenueRouteError } from '@/lib/services/crm/revenueOs/routeSupport';

/**
 * GET /api/crm/revenue/funnel — embudo actual (`fn_pipeline_funnel`) enriquecido
 * con `pipeline_id`, `is_won`, `is_lost` y `probability` de las etapas de la org.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const funnel = await getPipelineFunnel(ctx.organizationId, ctx.supabase);
    return jsonOk(funnel);
  } catch (error: unknown) {
    return revenueRouteError(error, 'CRM Revenue Funnel');
  }
}
