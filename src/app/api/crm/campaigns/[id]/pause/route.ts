import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { pauseCampaign } from '@/lib/services/crm/whatsapp/campaignService';

/** POST /api/crm/campaigns/[id]/pause (admin) → { data } (statistics.state='paused'). */
export const POST = withWhatsAppRoute(async (ctx, _req, params) => {
  const data = await pauseCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true });
