import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { cancelCampaign } from '@/lib/services/crm/whatsapp/campaignService';

import { readOrgBody } from '@/lib/security/organizationBody';
/** POST /api/crm/campaigns/[id]/cancel (admin) → { data } (pending → skipped:canceled, créditos devueltos). */
export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  await readOrgBody(ctx, req);
  const data = await cancelCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true });
