/**
 * Llamadas a proveedores para plantillas HSM (FASE-16 §4.5, docs-meta / docs-twilio):
 *  - Meta: GET/POST /{WABA_ID}/message_templates (Graph v26.0)
 *  - Twilio: POST https://content.twilio.com/v1/Content + /ApprovalRequests/whatsapp
 *  - Meta: GET /{WABA_ID}?fields=whatsapp_business_manager_messaging_limit
 * Sin SDK: `fetch` puro (Edge/Node). Los tokens vienen de `getChannelCredentials`.
 */

import type { ChannelCredentials } from './channelService';
import { WhatsAppError, type HsmCategory, type HsmStatus } from './types';

export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v26.0';
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface MetaTemplateRow {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: unknown[];
  quality_score?: { score?: string } | string | null;
  parameter_format?: string;
  rejected_reason?: string | null;
}

async function graphJson(res: Response): Promise<Record<string, unknown>> {
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data.error ?? {}) as Record<string, unknown>;
    throw new WhatsAppError('PROVIDER', String(err.error_user_msg ?? err.message ?? `Graph API ${res.status}`), 502, { code: err.code, subcode: err.error_subcode });
  }
  return data;
}

function requireMeta(creds: ChannelCredentials): { waba: string; token: string } {
  const waba = String(creds.business_account_id ?? creds.waba_id ?? '');
  const token = String(creds.access_token ?? '');
  if (!waba || !token) throw new WhatsAppError('PROVIDER', 'El canal no tiene business_account_id/access_token', 422);
  return { waba, token };
}

export async function metaListTemplates(creds: ChannelCredentials, fetchImpl: typeof fetch = fetch): Promise<MetaTemplateRow[]> {
  const { waba, token } = requireMeta(creds);
  const out: MetaTemplateRow[] = [];
  let url: string | null = `${GRAPH_BASE}/${waba}/message_templates?fields=id,name,language,status,category,components,quality_score,parameter_format,rejected_reason&limit=100`;
  let guard = 0;
  while (url && guard < 10) {
    const data = await graphJson(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } }));
    out.push(...((data.data as MetaTemplateRow[]) ?? []));
    url = ((data.paging as { next?: string } | undefined)?.next) ?? null;
    guard += 1;
  }
  return out;
}

export async function metaCreateTemplate(
  creds: ChannelCredentials,
  body: { name: string; category: HsmCategory; language: string; components: unknown[] },
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; status: string; category: string }> {
  const { waba, token } = requireMeta(creds);
  const data = await graphJson(
    await fetchImpl(`${GRAPH_BASE}/${waba}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name, category: body.category.toUpperCase(), language: body.language, parameter_format: 'named', components: body.components }),
    }),
  );
  return { id: String(data.id), status: String(data.status ?? 'PENDING'), category: String(data.category ?? body.category).toLowerCase() };
}

export async function metaDeleteTemplate(creds: ChannelCredentials, name: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const { waba, token } = requireMeta(creds);
  await graphJson(await fetchImpl(`${GRAPH_BASE}/${waba}/message_templates?name=${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }));
}

export interface MessagingLimitInfo {
  tier: string | null;
  /** Usuarios únicos/24 h según el tier (null si desconocido/ilimitado). */
  limit: number | null;
  raw?: unknown;
}

const TIER_LIMITS: Record<string, number | null> = {
  TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: null,
};

export function tierToLimit(tier: string | null | undefined): number | null {
  if (!tier) return null;
  return TIER_LIMITS[tier] ?? null;
}

export async function metaMessagingLimit(creds: ChannelCredentials, fetchImpl: typeof fetch = fetch): Promise<MessagingLimitInfo> {
  const { waba, token } = requireMeta(creds);
  const data = await graphJson(await fetchImpl(`${GRAPH_BASE}/${waba}?fields=whatsapp_business_manager_messaging_limit`, { headers: { Authorization: `Bearer ${token}` } }));
  const tier = (data.whatsapp_business_manager_messaging_limit as string | undefined) ?? null;
  return { tier, limit: tierToLimit(tier), raw: data };
}

// ─── Twilio Content API ─────────────────────────────────────────────────────

function requireTwilio(creds: ChannelCredentials): { sid: string; token: string; auth: string } {
  const sid = String(creds.account_sid ?? process.env.TWILIO_MASTER_ACCOUNT_SID ?? process.env.TWILIO_ACCOUNT_SID ?? '');
  const token = String(creds.auth_token ?? process.env.TWILIO_MASTER_AUTH_TOKEN ?? process.env.TWILIO_AUTH_TOKEN ?? '');
  if (!sid || !token) throw new WhatsAppError('PROVIDER', 'Credenciales Twilio incompletas', 422);
  return { sid, token, auth: Buffer.from(`${sid}:${token}`).toString('base64') };
}

/** Crea el Content y pide aprobación WhatsApp. Devuelve content_sid + estado. */
export async function twilioCreateContent(
  creds: ChannelCredentials,
  body: { name: string; language: string; category: HsmCategory; bodyText: string; variables: Record<string, string> },
  fetchImpl: typeof fetch = fetch,
): Promise<{ content_sid: string; approval_status: string }> {
  const { auth } = requireTwilio(creds);
  const res = await fetchImpl('https://content.twilio.com/v1/Content', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ friendly_name: body.name, language: body.language, variables: body.variables, types: { 'twilio/text': { body: body.bodyText } } }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new WhatsAppError('PROVIDER', String(data.message ?? `Twilio Content ${res.status}`), 502, data);
  const sid = String(data.sid);
  const ap = await fetchImpl(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests/whatsapp`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: body.name, category: body.category.toUpperCase() }),
  });
  const apData = (await ap.json().catch(() => ({}))) as Record<string, unknown>;
  if (!ap.ok) throw new WhatsAppError('PROVIDER', String(apData.message ?? `Twilio ApprovalRequests ${ap.status}`), 502, apData);
  return { content_sid: sid, approval_status: String(apData.status ?? 'received') };
}

export async function twilioApprovalStatus(creds: ChannelCredentials, contentSid: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { auth } = requireTwilio(creds);
  const res = await fetchImpl(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, { headers: { Authorization: `Basic ${auth}` } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const wa = (data.whatsapp as Record<string, unknown> | undefined) ?? {};
  return String(wa.status ?? 'unknown');
}

export function twilioStatusToHsm(status: string): HsmStatus {
  const s = status.toLowerCase();
  if (s === 'approved') return 'APPROVED';
  if (s === 'rejected') return 'REJECTED';
  if (s === 'paused') return 'PAUSED';
  if (s === 'disabled') return 'DISABLED';
  return 'PENDING';
}

/** Body `Hola {{nombre}}` → `Hola {{1}}` + mapa posicional. */
export function toPositionalBody(text: string): { body: string; positional_map: string[] } {
  const map: string[] = [];
  const body = text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, p: string) => {
    let i = map.indexOf(p);
    if (i === -1) {
      map.push(p);
      i = map.length - 1;
    }
    return `{{${i + 1}}}`;
  });
  return { body, positional_map: map };
}
