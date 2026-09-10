import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { materializeCampaign } from '@/lib/services/crm/whatsapp/campaignMaterialize';

/** POST /api/crm/campaigns/[id]/materialize → { total, pending, skipped, skipped_by_reason, estimated_cost }. Re-ejecutable. */
export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = withWhatsAppRoute(async (ctx, _req, params) => {
  const r = await materializeCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ success: true, ...r });
});
