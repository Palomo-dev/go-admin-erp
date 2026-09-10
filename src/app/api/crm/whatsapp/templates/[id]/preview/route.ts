import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { previewHsm, requireHsm } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, zHsmPreviewBody } from '@/lib/services/crm/whatsapp/schemas';
import { buildContext, sampleContext } from '@/lib/services/crm/email/variables';
import { estimateMessageCost } from '@/lib/services/crm/whatsapp/costs';
import { resolveChannel, resolveRecipient } from '@/lib/services/crm/whatsapp/channelService';
import { getWindow } from '@/lib/services/crm/whatsapp/windowService';

/**
 * POST /api/crm/whatsapp/templates/[id]/preview
 * { context?: {customerId?, opportunityId?, custom?}, variables?, channelId? }
 * → { header, body, footer, buttons, values, missing, category, status, variable_map, estimated_cost }
 */
export const POST = withWhatsAppRoute(async (ctx, req, params) => {
  const b = parseWith(zHsmPreviewBody, await readJson<unknown>(req));
  const t = await requireHsm(ctx.organizationId, params.id, ctx.supabase);
  const refs = b.context ?? {};
  const rctx = refs.customerId || refs.opportunityId
    ? await buildContext(ctx.organizationId, { customerId: refs.customerId ?? null, opportunityId: refs.opportunityId ?? null, userId: ctx.userId, custom: { ...(refs.custom ?? {}), ...(b.variables ?? {}) } }, ctx.supabase)
    : sampleContext({ custom: { ...(refs.custom ?? {}), ...(b.variables ?? {}) } });
  const preview = previewHsm(t, rctx, b.variables ?? {});
  let estimated_cost: Awaited<ReturnType<typeof estimateMessageCost>> | null = null;
  try {
    const channel = await resolveChannel(ctx.organizationId, b.channelId ?? t.meta.channel_id ?? null, ctx.supabase);
    const recipient = refs.customerId ? await resolveRecipient(ctx.organizationId, refs.customerId, channel.id, ctx.supabase) : null;
    const win = refs.customerId ? await getWindow(ctx.organizationId, refs.customerId, channel.id, ctx.supabase) : { is_open: false };
    estimated_cost = await estimateMessageCost({ provider: channel.provider, category: t.meta.category, recipient, windowOpen: win.is_open, isTemplate: true });
  } catch {
    estimated_cost = null;
  }
  return NextResponse.json({ ...preview, estimated_cost });
});
