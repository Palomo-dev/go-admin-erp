import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { syncFromMeta } from '@/lib/services/crm/whatsapp/templateService';
import { parseWith, zChannelIdBody } from '@/lib/services/crm/whatsapp/schemas';

/** POST /api/crm/whatsapp/templates/sync (admin) { channelId? } → { created, updated, total }. GET /{WABA_ID}/message_templates (v26.0) o Twilio ApprovalRequests. */
export const runtime = 'nodejs';

export const POST = withWhatsAppRoute(async (ctx, req) => {
  const b = parseWith(zChannelIdBody, await readJson<unknown>(req));
  const r = await syncFromMeta(ctx.organizationId, b.channelId ?? null, ctx.userId, ctx.supabase);
  return NextResponse.json({ success: true, ...r });
}, { admin: true });
