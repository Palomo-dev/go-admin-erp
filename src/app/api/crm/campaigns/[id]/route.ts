import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { parseWith, zUpdateCampaignBody } from '@/lib/services/crm/whatsapp/schemas';
import { deleteCampaign, requireCampaign, updateCampaign, type UpdateCampaignInput } from '@/lib/services/crm/whatsapp/campaignStore';
import { isOrgAdminContext } from '@/lib/utils/orgContext';

/** GET | PATCH (solo draft/scheduled) | DELETE /api/crm/campaigns/[id] */
export const GET = withWhatsAppRoute(async (ctx, _req, params) => {
  const data = await requireCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ data, can_manage: isOrgAdminContext(ctx) });
});

export const PATCH = withWhatsAppRoute(async (ctx, req, params) => {
  const b = parseWith(zUpdateCampaignBody, await readJson<unknown>(req));
  const data = await updateCampaign(ctx.organizationId, params.id, b as UpdateCampaignInput, ctx.supabase);
  return NextResponse.json({ data });
});

export const DELETE = withWhatsAppRoute(async (ctx, _req, params) => {
  await deleteCampaign(ctx.organizationId, params.id, ctx.supabase);
  return NextResponse.json({ success: true });
});
