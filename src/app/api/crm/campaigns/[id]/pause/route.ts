import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { pauseCampaign } from '@/lib/services/crm/whatsapp/campaignService';

import { readOrgBody } from '@/lib/security/organizationBody';
/** POST /api/crm/campaigns/[id]/pause (admin) → { data } (statistics.state='paused'). */
export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  await readOrgBody(ctx, req);
  const data = await pauseCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true });
