import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { getCampaignStats } from '@/lib/services/crm/whatsapp/campaignService';
import { syncCampaignProviderReceipts } from '@/lib/services/crm/whatsapp/campaignEvents';
import { requireCampaign } from '@/lib/services/crm/whatsapp/campaignStore';
import { getServiceClient } from '@/lib/supabase/server-service';
import { readOrgBody } from '@/lib/security/organizationBody';
import { exigirPermisoCrm, CRM_PERMISOS } from '@/lib/services/crm/crmRouteSupport';

/** GET /api/crm/campaigns/[id]/stats?sync=1 → { counts, by_error_code, by_skip_reason, timeline[], estimated_cost, actual_cost } */
export const GET = withWhatsAppRoute(async (ctx, req, params) => {
  readOrgBody(ctx, {}, { request: req });
  await exigirPermisoCrm(ctx, [CRM_PERMISOS.oportunidadesVer], 'Consultar cifras de campañas');
  if (new URL(req.url).searchParams.get('sync') === '1') {
    await requireCampaign(ctx.organizationId, params.id, ctx.supabase);
    await syncCampaignProviderReceipts(ctx.organizationId, params.id, getServiceClient());
  }
  const r = await getCampaignStats(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json(r);
});
