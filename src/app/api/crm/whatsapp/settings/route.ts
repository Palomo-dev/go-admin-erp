import { NextResponse } from 'next/server';
import { withWhatsAppRoute, readJson } from '@/lib/services/crm/whatsapp/http';
import { getOrgSettings, listChannels, saveOrgSettings, getChannelCredentials } from '@/lib/services/crm/whatsapp/channelService';
import { metaMessagingLimit } from '@/lib/services/crm/whatsapp/templateProvider';
import { isOrgAdminContext } from '@/lib/utils/orgContext';
import { parseWith, zSettingsBody } from '@/lib/services/crm/whatsapp/schemas';
import type { WhatsAppOrgSettings } from '@/lib/services/crm/whatsapp/types';

/**
 * GET  /api/crm/whatsapp/settings → { settings, channels, default_channel_id, can_edit, messaging_limit? }
 * PUT  /api/crm/whatsapp/settings (admin) → { default_channel_id?, optout_keywords?, optin_keywords?, allowed_hours?, daily_limit? }
 * Persistencia: provider_configs(category='whatsapp').settings (comm_settings no tiene esas columnas).
 */
export const GET = withWhatsAppRoute(async (ctx, req) => {
  const url = new URL(req.url);
  const [settings, channels] = await Promise.all([getOrgSettings(ctx.organizationId), listChannels(ctx.organizationId, ctx.supabase)]);
  let messagingLimit: { tier: string | null; limit: number | null; checked_at: string; error?: string } | null = null;
  if (url.searchParams.get('limit') === '1' && channels.default_channel_id) {
    try {
      const creds = await getChannelCredentials(ctx.organizationId, channels.default_channel_id);
      if (creds.provider === 'meta') {
        const r = await metaMessagingLimit(creds);
        messagingLimit = { tier: r.tier, limit: r.limit, checked_at: new Date().toISOString() };
        await saveOrgSettings(ctx.organizationId, { messaging_limit: { tier: r.tier, checked_at: messagingLimit.checked_at } });
      } else messagingLimit = { tier: null, limit: null, checked_at: new Date().toISOString(), error: 'Solo disponible para canales Meta Cloud' };
    } catch (err) {
      messagingLimit = { tier: null, limit: null, checked_at: new Date().toISOString(), error: err instanceof Error ? err.message : 'error' };
    }
  }
  return NextResponse.json({ settings, channels: channels.data, default_channel_id: channels.default_channel_id, can_edit: isOrgAdminContext(ctx), messaging_limit: messagingLimit });
});

export const PUT = withWhatsAppRoute(async (ctx, req) => {
  const b = parseWith(zSettingsBody, await readJson<unknown>(req)) as Partial<WhatsAppOrgSettings>;
  const patch: Partial<WhatsAppOrgSettings> = {};
  if (b.default_channel_id !== undefined) {
    if (b.default_channel_id) {
      const { data } = await ctx.supabase.from('channels').select('id').eq('id', b.default_channel_id).eq('organization_id', ctx.organizationId).eq('type', 'whatsapp').maybeSingle();
      if (!data) return NextResponse.json({ error: 'Canal no encontrado', code: 'NOT_FOUND' }, { status: 404 });
    }
    patch.default_channel_id = b.default_channel_id || null;
  }
  const words = (v: unknown) => (Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean).slice(0, 30) : undefined);
  if (b.optout_keywords !== undefined) patch.optout_keywords = words(b.optout_keywords) ?? [];
  if (b.optin_keywords !== undefined) patch.optin_keywords = words(b.optin_keywords) ?? [];
  if (b.allowed_hours !== undefined) {
    const h = b.allowed_hours;
    if (h && (!/^\d{2}:\d{2}$/.test(h.from) || !/^\d{2}:\d{2}$/.test(h.to))) return NextResponse.json({ error: 'allowed_hours.from/to deben ser HH:MM', code: 'VALIDATION' }, { status: 400 });
    patch.allowed_hours = h ? { tz: h.tz || 'America/Bogota', days: Array.isArray(h.days) ? h.days.map(Number).filter((d) => d >= 0 && d <= 6) : [1, 2, 3, 4, 5, 6], from: h.from, to: h.to } : null;
  }
  if (b.daily_limit !== undefined) patch.daily_limit = b.daily_limit === null || b.daily_limit === 0 ? null : Math.max(1, Number(b.daily_limit));
  const settings = await saveOrgSettings(ctx.organizationId, patch);
  return NextResponse.json({ success: true, settings });
}, { admin: true });
