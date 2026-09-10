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
import { normalizePhoneDigits, phoneSearchSuffix, resolveDefaultCountry } from '@/lib/services/crm/phoneNormalize';
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
    // Indicativo del país para completar los teléfonos NACIONALES que la
    // organización guardó sin indicativo (antes estaba cableado a '57').
    default_country_code: typeof s.default_country_code === 'string' && s.default_country_code.trim() ? String(s.default_country_code).replace(/\D/g, '') : null,
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

/**
 * Teléfono E.164 (solo dígitos) del cliente para el canal: identidad del canal
 * → customers.phone.
 *
 * `defaultCountry` es el indicativo con el que se completan los teléfonos que
 * la organización guardó en formato nacional, y tiene TRES valores distintos a
 * propósito:
 *
 *  - **omitido** → se resuelve solo, de los ajustes de la organización. Es lo
 *    que quiere casi todo el mundo.
 *  - `null` → no se completa nada (el número ya viene cualificado).
 *  - una cadena → se usa esa (quien ya cargó los ajustes se ahorra la consulta).
 *
 * El valor por defecto era `null`, y dos llamadores —la ventana de 24 h y la
 * previsualización de plantillas— se quedaron sin pasarlo: como el 92 % de los
 * teléfonos de la base están guardados como nacional de 10 dígitos, esos dos
 * endpoints decían «este cliente no tiene número» de la mayoría de los
 * clientes a los que `sendWhatsApp` sí escribía. Un parámetro que se olvida en
 * silencio es un mal parámetro: ahora omitirlo hace lo correcto.
 */
export async function resolveRecipient(orgId: number, customerId: string, channelId: string, supabase: SupabaseClient, defaultCountry?: string | null): Promise<string | null> {
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
  // La identidad del canal la escribe el proveedor (wa_id): ya viene
  // cualificada y NO se le completa indicativo.
  if (fromIdentity) return normalizePhoneDigits(fromIdentity);
  const { data: c } = await supabase.from('customers').select('phone').eq('id', customerId).eq('organization_id', orgId).maybeSingle();
  const phone = (c as { phone?: string | null } | null)?.phone;
  if (!phone) return null;
  // Solo se consultan los ajustes si de verdad hacen falta: un teléfono ya
  // cualificado no se toca, así que no se paga la consulta por él.
  const cc = defaultCountry === undefined ? defaultCountryOf(await getOrgSettings(orgId, supabase)) : defaultCountry;
  return normalizePhoneDigits(phone, cc);
}

/**
 * Normalización de teléfonos: la regla vive en `@/lib/services/crm/phoneNormalize`
 * porque la comparte la barra de acciones rápidas del navegador (que no puede
 * importar este módulo: arrastra el cliente de servicio). Se reexporta para no
 * romper a quien ya la importaba de aquí.
 */
export { normalizePhoneDigits, phoneSearchSuffix, countryFromPhone, LAST_RESORT_COUNTRY_CODE, NATIONAL_PATTERNS } from '@/lib/services/crm/phoneNormalize';

/**
 * Indicativo por defecto EFECTIVO de la organización: ajuste de la org →
 * variable de entorno → último recurso.
 */
export function defaultCountryOf(settings: Pick<WhatsAppOrgSettings, 'default_country_code'>): string {
  return resolveDefaultCountry(settings.default_country_code);
}

/**
 * Busca el cliente de la organización cuyo teléfono ES este número, sin
 * importar cómo esté escrito en la base. Devuelve null si no hay ninguno.
 *
 * ⚠️ Es una búsqueda en dos pasos (igualdad exacta primero, `ilike` por los
 * últimos 4 dígitos después) porque `customers.phone` es texto libre y no hay
 * columna normalizada.
 *
 * **Orden estable obligatorio** (tester F16 r3 · N-4): hay 263 grupos de
 * clientes reales (532 filas) que comparten identificador normalizado dentro
 * de la MISMA organización. Sin `ORDER BY` el cliente al que se engancha un
 * entrante depende del plan de Postgres, así que dos mensajes del mismo número
 * pueden acabar en fichas distintas. Se elige SIEMPRE el más antiguo
 * (`created_at`), que es el que acumula el historial.
 */
export async function findCustomerIdByPhone(
  orgId: number,
  digits: string,
  supabase: SupabaseClient,
  opts: { defaultCountry?: string | null } = {},
): Promise<string | null> {
  // 1) Camino rápido: los dos formatos canónicos, con igualdad indexable.
  const { data: exacto } = await supabase
    .from('customers')
    .select('id, phone')
    .eq('organization_id', orgId)
    .in('phone', [digits, `+${digits}`])
    .order('created_at', { ascending: true })
    .limit(1);
  const hit = ((exacto ?? []) as Array<{ id: string }>)[0];
  if (hit) return hit.id;

  // 2) Cualquier otro formato: prefiltro por los últimos 4 dígitos y
  //    comparación fina en memoria. `customers.phone` es texto libre de la
  //    organización, así que aquí SÍ se completa el indicativo por defecto.
  const { data: candidatos } = await supabase
    .from('customers')
    .select('id, phone')
    .eq('organization_id', orgId)
    .ilike('phone', `%${phoneSearchSuffix(digits)}`)
    .order('created_at', { ascending: true })
    .limit(200);
  for (const c of (candidatos ?? []) as Array<{ id: string; phone: string | null }>) {
    if (c.phone && normalizePhoneDigits(c.phone, opts.defaultCountry ?? null) === digits) return c.id;
  }
  return null;
}
