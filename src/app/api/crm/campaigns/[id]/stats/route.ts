import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { getCampaignStats } from '@/lib/services/crm/whatsapp/campaignService';
import { syncCampaignFromEvents } from '@/lib/services/crm/whatsapp/campaignEvents';
import { getServiceClient } from '@/lib/supabase/server-service';

/** GET /api/crm/campaigns/[id]/stats?sync=1 → { counts, by_error_code, by_skip_reason, timeline[], estimated_cost, actual_cost } */
export const GET = withWhatsAppRoute(async (ctx, req, params) => {
  if (new URL(req.url).searchParams.get('sync') === '1') {
    const { data } = await ctx.supabase.from('campaigns').select('id').eq('id', params.id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (data) await syncCampaignFromEvents(params.id, getServiceClient()).catch(() => undefined);
  }
  const r = await getCampaignStats(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json(r);
});
