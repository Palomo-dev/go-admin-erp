import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { resumeCampaign } from '@/lib/services/crm/whatsapp/campaignService';

import { readOrgBody } from '@/lib/security/organizationBody';
/** POST /api/crm/campaigns/[id]/resume (admin) → { data } (sending + job campaign_batch). */
export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  await readOrgBody(ctx, req);
  const data = await resumeCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true });
