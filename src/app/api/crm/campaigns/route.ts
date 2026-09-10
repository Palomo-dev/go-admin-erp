import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { parseWith, searchParamsToObject, zCampaignListQuery, zCreateCampaignBody } from '@/lib/services/crm/whatsapp/schemas';
import { createCampaign, listCampaigns, type CreateCampaignInput } from '@/lib/services/crm/whatsapp/campaignStore';
import { isOrgAdminContext } from '@/lib/utils/orgContext';

/**
 * GET  /api/crm/campaigns?status=&channel=&q= → { data: Campaign[], can_manage }
 * POST /api/crm/campaigns CreateCampaignInput → 201 { data }
 *   { name, channel:'whatsapp'|'email', channel_id?, template_id?, content?, audience:{source:'segment'|'stage'|'manual', ...},
 *     scheduled_at?, throttle_mps?, respect_allowed_hours?, default_variables?, purpose? }
 *
 * `can_manage` dice si el usuario puede lanzar/pausar/reanudar/cancelar (esas
 * rutas exigen admin de organización): la UI lo usa para no ofrecer acciones
 * que van a devolver 403 (tester r1 · fallo 8).
 */
export const GET = withWhatsAppRoute(async (ctx, req) => {
  const q = parseWith(zCampaignListQuery, searchParamsToObject(new URL(req.url).searchParams), 'query');
  const data = await listCampaigns(ctx.organizationId, q, ctx.supabase);
  return NextResponse.json({ data, can_manage: isOrgAdminContext(ctx) });
});

export const POST = withWhatsAppRoute(async (ctx, req) => {
  const b = parseWith(zCreateCampaignBody, await readJson<unknown>(req));
  const data = await createCampaign(ctx.organizationId, ctx.userId, b as CreateCampaignInput, ctx.supabase);
  return NextResponse.json({ data }, { status: 201 });
});
