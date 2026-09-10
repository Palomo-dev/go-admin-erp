import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { parseWith, zLaunchBody } from '@/lib/services/crm/whatsapp/schemas';
import { launchCampaign } from '@/lib/services/crm/whatsapp/campaignService';

/** POST /api/crm/campaigns/[id]/launch (admin) { scheduled_at?, force? } → { data } (scheduled | sending). 402 NO_CREDITS, 409 NOT_MATERIALIZED/TIER_EXCEEDED/TEMPLATE_NOT_APPROVED. */
export const runtime = 'nodejs';

export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  const b = parseWith(zLaunchBody, await readJson<unknown>(req));
  const data = await launchCampaign(ctx.organizationId, ctx.userId, params.id, { scheduledAt: b.scheduled_at ?? b.scheduledAt ?? null, force: b.force === true }, ctx.supabase);
  return NextResponse.json({ data });
}, { admin: true });
