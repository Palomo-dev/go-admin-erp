import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { materializeCampaign } from '@/lib/services/crm/whatsapp/campaignMaterialize';

import { readOrgBody } from '@/lib/security/organizationBody';
/** POST /api/crm/campaigns/[id]/materialize → { total, pending, skipped, skipped_by_reason, estimated_cost }. Re-ejecutable. */
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  await readOrgBody(ctx, req);
  const r = await materializeCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ success: true, ...r });
});
