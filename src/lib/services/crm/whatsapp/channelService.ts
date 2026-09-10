/**
 * Canales de WhatsApp de una organización + ajustes por org (FASE-16 §4.2
 * `resolveChannel`, §6 capacidades por tipo de canal).
 *
 * - Nunca devuelve credenciales al cliente: `ChannelSummary` solo lleva
 *   `provider` y `capabilities`. Las credenciales se leen con service role
 *   (`getChannelCredentials`) únicamente en servidor.
 * - Ajustes por org en `provider_configs(category='whatsapp').settings`
 *   (desviación documentada: `comm_settings` no tiene esas columnas).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  DEFAULT_OPTIN_KEYWORDS,
  DEFAULT_OPTOUT_KEYWORDS,
  WhatsAppError,
  type ChannelCapabilities,
  type ChannelSummary,
  type WhatsAppOrgSettings,
  type WhatsAppProvider,
} from './types';

export function capabilitiesFor(provider: WhatsAppProvider): ChannelCapabilities {
  switch (provider) {
    case 'meta':
      return { templates: true, media: true, free_text: true };
    case 'twilio':
      return { templates: true, media: true, free_text: true };
    default:
      return { templates: false, media: false, free_text: true };
  }
}

function normalizeProvider(p: string | null | undefined): WhatsAppProvider {
  if (p === 'twilio') return 'twilio';
  if (p === 'baileys' || p === 'evolution') return 'baileys';
  return 'meta';
}

export async function getOrgSettings(orgId: number, service: SupabaseClient = getServiceClient()): Promise<WhatsAppOrgSettings> {
  const { data } = await service
    .from('provider_configs')
    .select('settings')
    .eq('organization_id', orgId)
    .eq('category', 'whatsapp')
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle();
  const s = ((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  return {
    default_channel_id: (s.default_channel_id as string) ?? null,
    optout_keywords: Array.isArray(s.optout_keywords) && s.optout_keywords.length ? (s.optout_keywords as string[]) : DEFAULT_OPTOUT_KEYWORDS,
    optin_keywords: Array.isArray(s.optin_keywords) && s.optin_keywords.length ? (s.optin_keywords as string[]) : DEFAULT_OPTIN_KEYWORDS,
    allowed_hours: (s.allowed_hours as WhatsAppOrgSettings['allowed_hours']) ?? null,
    daily_limit: typeof s.daily_limit === 'number' ? s.daily_limit : null,
    messaging_limit: (s.messaging_limit as WhatsAppOrgSettings['messaging_limit']) ?? null,
  };
}

export async function saveOrgSettings(orgId: number, patch: Partial<WhatsAppOrgSettings>, service: SupabaseClient = getServiceClient()): Promise<WhatsAppOrgSettings> {
  const { data: existing } = await service
    .from('provider_configs')
    .select('id, settings, provider')
    .eq('organization_id', orgId)
    .eq('category', 'whatsapp')
    .order('priority', { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = existing as { id: string; settings: Record<string, unknown> | null } | null;
  const merged = { ...(row?.settings ?? {}), ...patch };
  if (row) {
    const { error } = await service.from('provider_configs').update({ settings: merged, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  } else {
    const { error } = await service.from('provider_configs').insert({
      organization_id: orgId,
      category: 'whatsapp',
      provider: 'meta',
      credentials: {},
      settings: merged,
      is_active: true,
      priority: 1,
    });
    if (error) throw new WhatsAppError('INTERNAL', error.message, 500);
  }
  return getOrgSettings(orgId, service);
}

/** Canales WhatsApp de la org (todos los estados salvo eliminados) con proveedor y capacidades. */
export async function listChannels(orgId: number, supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<{ data: ChannelSummary[]; default_channel_id: string | null }> {
  const { data: channels } = await supabase
    .from('channels')
    .select('id, name, status')
    .eq('organization_id', orgId)
    .eq('type', 'whatsapp')
    .order('name');
  const list = (channels ?? []) as Array<{ id: string; name: string; status: string }>;
  if (list.length === 0) return { data: [], default_channel_id: null };

  const { data: creds } = await service
    .from('channel_credentials')
    .select('channel_id, provider')
    .in('channel_id', list.map((c) => c.id));
  const providerByChannel = new Map<string, string | null>();
  for (const r of (creds ?? []) as Array<{ channel_id: string; provider: string | null }>) providerByChannel.set(r.channel_id, r.provider);

  const settings = await getOrgSettings(orgId, service);
  const defaultId = resolveDefaultId(list, settings.default_channel_id);

  const data = list.map((c) => {
    const provider = normalizeProvider(providerByChannel.get(c.id));
    return { id: c.id, name: c.name, status: c.status, provider, capabilities: capabilitiesFor(provider), is_default: c.id === defaultId };
  });
  return { data, default_channel_id: defaultId };
}

function resolveDefaultId(list: Array<{ id: string; status: string }>, preferred: string | null): string | null {
  if (preferred && list.some((c) => c.id === preferred && c.status === 'active')) return preferred;
  return list.find((c) => c.status === 'active')?.id ?? null;
}

export interface ResolvedChannel {
  id: string;
  name: string;
  status: string;
  provider: WhatsAppProvider;
  capabilities: ChannelCapabilities;
}

/**
 * Resuelve el canal a usar: el indicado (debe ser de la org) o el por defecto
 * (provider_configs.settings.default_channel_id → primer canal activo).
 */
export async function resolveChannel(orgId: number, channelId: string | null | undefined, supabase: SupabaseClient, service: SupabaseClient = getServiceClient()): Promise<ResolvedChannel> {
  if (channelId) {
    const { data } = await supabase.from('channels').select('id, name, status, type').eq('id', channelId).eq('organization_id', orgId).maybeSingle();
    const ch = data as { id: string; name: string; status: string; type: string } | null;
    if (!ch || ch.type !== 'whatsapp') throw new WhatsAppError('NOT_FOUND', 'Canal de WhatsApp no encontrado en la organización', 404);
    const provider = await getChannelProvider(ch.id, service);
    return { id: ch.id, name: ch.name, status: ch.status, provider, capabilities: capabilitiesFor(provider) };
  }
  const { data, default_channel_id } = await listChannels(orgId, supabase, service);
  const def = data.find((c) => c.id === default_channel_id);
  if (!def) throw new WhatsAppError('NO_CHANNEL', 'La organización no tiene un canal de WhatsApp activo', 422);
  return { id: def.id, name: def.name, status: def.status, provider: def.provider, capabilities: def.capabilities };
}

export async function getChannelProvider(channelId: string, service: SupabaseClient = getServiceClient()): Promise<WhatsAppProvider> {
  const { data } = await service.from('channel_credentials').select('provider').eq('channel_id', channelId).limit(1).maybeSingle();
  return normalizeProvider((data as { provider?: string | null } | null)?.provider);
}

export interface ChannelCredentials {
  provider: WhatsAppProvider;
  phone_number_id?: string;
  business_account_id?: string;
  access_token?: string;
  app_secret?: string;
  account_sid?: string;
  auth_token?: string;
  from?: string;
  messaging_service_sid?: string;
  [key: string]: unknown;
}

/** SOLO servidor: credenciales del canal (service role). */
export async function getChannelCredentials(orgId: number, channelId: string, service: SupabaseClient = getServiceClient()): Promise<ChannelCredentials> {
  const { data } = await service
    .from('channel_credentials')
    .select('provider, credentials, channels!inner(organization_id)')
    .eq('channel_id', channelId)
    .eq('channels.organization_id', orgId)
    .limit(1)
    .maybeSingle();
  const row = data as { provider: string | null; credentials: Record<string, unknown> | null } | null;
  if (!row) throw new WhatsAppError('NOT_FOUND', 'El canal no tiene credenciales configuradas', 422);
  return { ...(row.credentials ?? {}), provider: normalizeProvider(row.provider) } as ChannelCredentials;
}

/** Teléfono E.164 (solo dígitos) del cliente para el canal: identidad del canal → customers.phone. */
export async function resolveRecipient(orgId: number, customerId: string, channelId: string, supabase: SupabaseClient): Promise<string | null> {
  const { data: ident } = await supabase
    .from('customer_channel_identities')
    .select('identity_value')
    .eq('channel_id', channelId)
    .eq('customer_id', customerId)
    .eq('identity_type', 'whatsapp_phone')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const fromIdentity = (ident as { identity_value?: string } | null)?.identity_value;
  if (fromIdentity) return normalizePhoneDigits(fromIdentity);
  const { data: c } = await supabase.from('customers').select('phone').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
  const phone = (c as { phone?: string | null } | null)?.phone;
  return phone ? normalizePhoneDigits(phone) : null;
}

export function normalizePhoneDigits(phone: string): string | null {
  const digits = String(phone).replace(/@(s\.whatsapp\.net|lid)$/, '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/** País (ISO-2 minúsculas) por prefijo E.164; solo los que tienen precio en provider_pricing. */
export function countryFromPhone(digits: string): 'co' | 'mx' | 'us' | 'other' {
  if (digits.startsWith('57')) return 'co';
  if (digits.startsWith('52')) return 'mx';
  if (digits.startsWith('1')) return 'us';
  return 'other';
}
