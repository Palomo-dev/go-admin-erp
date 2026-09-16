import { NextResponse } from 'next/server';
import { withWhatsAppRoute } from '@/lib/services/crm/whatsapp/http';
import { syncFromMeta } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, zChannelIdBody } from '@/lib/services/crm/whatsapp/schemas';

import { readOrgBody } from '@/lib/security/organizationBody';
/** POST /api/crm/whatsapp/templates/sync (admin) { channelId? } → { created, updated, total }. GET /{WABA_ID}/message_templates (v26.0) o Twilio ApprovalRequests. */
export const runtime = 'nodejs';

export const POST = withWhatsAppRoute(async (ctx, req) => {
  const b = parseWith(zChannelIdBody, await readOrgBody<unknown>(ctx, req));
  const r = await syncFromMeta(ctx.organizationId, b.channelId ?? null, ctx.userId, ctx.supabase);
  return NextResponse.json({ success: true, ...r });
}, { admin: true });
