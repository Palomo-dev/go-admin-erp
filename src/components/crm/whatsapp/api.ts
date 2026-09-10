/**
 * Cliente (browser) de `/api/crm/whatsapp/*` y `/api/crm/campaigns/*`
 * (FASE-16). Sin react-query; nunca recibe credenciales.
 */
import type { Campaign, CampaignAudience, CampaignContact, ChannelSummary, HsmCategory, HsmComponent, WhatsAppOrgSettings, WhatsAppTemplate, WindowState, CampaignCounts } from '@/lib/services/crm/whatsapp/types';

export type { Campaign, CampaignAudience, CampaignContact, ChannelSummary, WhatsAppTemplate, WindowState, WhatsAppOrgSettings, CampaignCounts };

export class ApiError extends Error {
  code: string;
  status: number;
  details: unknown;
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, ...init });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: `Respuesta inválida (${res.status})` }; }
  if (!res.ok) throw new ApiError(String(json.error ?? `Error ${res.status}`), String(json.code ?? 'ERROR'), res.status, json.details);
  return json as T;
}

export const post = <T>(url: string, body?: unknown) => call<T>(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const get = <T>(url: string) => call<T>(url, { method: 'GET', cache: 'no-store' });

export interface WindowInfo extends WindowState {
  label: string;
  channel: { id: string; name: string; status: string; provider: ChannelSummary['provider']; capabilities: ChannelSummary['capabilities'] };
  recipient: string | null;
  can_contact: boolean;
  can_contact_marketing: boolean;
}

export interface PreviewResult {
  header: string | null;
  body: string;
  footer: string | null;
  buttons: Array<{ type: string; text: string; url?: string }>;
  values: Record<string, string>;
  missing: string[];
  category: HsmCategory;
  status: string;
  variable_map: Record<string, string>;
  estimated_cost: { unit_cost_usd: number | null; label: string; free: boolean; priced: boolean } | null;
}

export interface SendPayload {
  customerId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  channelId?: string | null;
  text?: string | null;
  template?: { templateId: string; variables?: Record<string, unknown> } | null;
  media?: { url: string; mime: string; filename?: string; caption?: string } | null;
  scheduledAt?: string | null;
  force?: boolean;
  clientRequestId?: string | null;
  purpose?: 'utility' | 'marketing';
}

export interface SendResult { message_id: string; conversation_id: string; activity_id: string | null; customer_id: string; channel_id: string; scheduled: boolean; job_id?: string | null }

export const waApi = {
  channels: () => get<{ data: ChannelSummary[]; default_channel_id: string | null; can_manage: boolean }>('/api/crm/whatsapp/channels'),
  window: (customerId: string, channelId?: string | null) => get<WindowInfo>(`/api/crm/whatsapp/window/${customerId}${channelId ? `?channelId=${channelId}` : ''}`),
  templates: (q: { status?: string; category?: string; q?: string; channelId?: string | null; includeInactive?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.category) p.set('category', q.category);
    if (q.q) p.set('q', q.q);
    if (q.channelId) p.set('channelId', q.channelId);
    if (q.includeInactive) p.set('includeInactive', '1');
    return get<{ data: WhatsAppTemplate[] }>(`/api/crm/whatsapp/templates?${p.toString()}`);
  },
  template: (id: string) => get<{ data: WhatsAppTemplate }>(`/api/crm/whatsapp/templates/${id}`),
  createTemplate: (input: { name: string; category: HsmCategory; language?: string; description?: string; components: HsmComponent[]; variable_map?: Record<string, string>; examples?: Record<string, string>; channel_id?: string | null }) => post<{ data: WhatsAppTemplate }>('/api/crm/whatsapp/templates', input),
  updateTemplate: (id: string, input: Record<string, unknown>) => call<{ data: WhatsAppTemplate }>(`/api/crm/whatsapp/templates/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteTemplate: (id: string) => call<{ success: boolean; deleted: boolean; deactivated: boolean }>(`/api/crm/whatsapp/templates/${id}`, { method: 'DELETE' }),
  submitTemplate: (id: string, channelId?: string | null) => post<{ data: WhatsAppTemplate }>(`/api/crm/whatsapp/templates/${id}/submit`, { channelId }),
  syncTemplates: (channelId?: string | null) => post<{ created: number; updated: number; total: number }>('/api/crm/whatsapp/templates/sync', { channelId }),
  preview: (id: string, body: { context?: { customerId?: string | null; opportunityId?: string | null; custom?: Record<string, unknown> }; variables?: Record<string, unknown>; channelId?: string | null }) => post<PreviewResult>(`/api/crm/whatsapp/templates/${id}/preview`, body),
  send: (body: SendPayload) => post<SendResult & { success: boolean }>('/api/crm/whatsapp/send', body),
  reply: (body: { conversationId: string; text: string; opportunityId?: string | null }) => post<SendResult & { success: boolean }>('/api/crm/whatsapp/reply', body),
  settings: (withLimit = false) => get<{ settings: WhatsAppOrgSettings; channels: ChannelSummary[]; default_channel_id: string | null; can_edit: boolean; messaging_limit: { tier: string | null; limit: number | null; checked_at: string; error?: string } | null }>(`/api/crm/whatsapp/settings${withLimit ? '?limit=1' : ''}`),
  saveSettings: (patch: Partial<WhatsAppOrgSettings>) => call<{ success: boolean; settings: WhatsAppOrgSettings }>('/api/crm/whatsapp/settings', { method: 'PUT', body: JSON.stringify(patch) }),
};

export interface CreateCampaignBody {
  name: string;
  channel: 'whatsapp' | 'email';
  channel_id?: string | null;
  template_id?: string | null;
  content?: string | null;
  audience: CampaignAudience;
  scheduled_at?: string | null;
  throttle_mps?: number;
  respect_allowed_hours?: boolean;
  default_variables?: Record<string, unknown>;
  purpose?: 'utility' | 'marketing';
  description?: string | null;
}

export interface MaterializeResult { total: number; pending: number; skipped: number; skipped_by_reason: Record<string, number>; estimated_cost: number | null }
export interface CampaignStatsResult { counts: CampaignCounts; by_error_code: Record<string, number>; by_skip_reason: Record<string, number>; timeline: Array<{ minute: string; sent: number; delivered: number; read: number; failed: number }>; estimated_cost: number | null; actual_cost: number }

export const campaignsApi = {
  list: (q: { status?: string; channel?: string; q?: string } = {}) => get<{ data: Campaign[]; can_manage: boolean }>(`/api/crm/campaigns?${new URLSearchParams(Object.entries(q).filter(([, v]) => !!v) as [string, string][]).toString()}`),
  get: (id: string) => get<{ data: Campaign; can_manage: boolean }>(`/api/crm/campaigns/${id}`),
  create: (body: CreateCampaignBody) => post<{ data: Campaign }>('/api/crm/campaigns', body),
  update: (id: string, body: Partial<CreateCampaignBody>) => call<{ data: Campaign }>(`/api/crm/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => call<{ success: boolean }>(`/api/crm/campaigns/${id}`, { method: 'DELETE' }),
  materialize: (id: string) => post<MaterializeResult & { success: boolean }>(`/api/crm/campaigns/${id}/materialize`),
  launch: (id: string, body: { scheduled_at?: string | null; force?: boolean } = {}) => post<{ data: Campaign }>(`/api/crm/campaigns/${id}/launch`, body),
  pause: (id: string) => post<{ data: Campaign }>(`/api/crm/campaigns/${id}/pause`),
  resume: (id: string) => post<{ data: Campaign }>(`/api/crm/campaigns/${id}/resume`),
  cancel: (id: string) => post<{ data: Campaign }>(`/api/crm/campaigns/${id}/cancel`),
  stats: (id: string, sync = false) => get<CampaignStatsResult>(`/api/crm/campaigns/${id}/stats${sync ? '?sync=1' : ''}`),
  contacts: (id: string, q: { state?: string; q?: string; page?: number; pageSize?: number } = {}) => get<{ data: CampaignContact[]; total: number }>(`/api/crm/campaigns/${id}/contacts?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])).toString()}`),
  csvUrl: (id: string, state?: string) => `/api/crm/campaigns/${id}/contacts?export=csv${state ? `&state=${state}` : ''}`,
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  opted_out: 'Pidió no recibir WhatsApp',
  no_phone: 'Sin teléfono',
  invalid_number: 'Número inválido',
  no_email: 'Sin email',
  us_marketing: 'Marketing a EE.UU. (bloqueado por Meta)',
  window_required: 'Fuera de la ventana de 24 h (requiere plantilla)',
  duplicate_recent: 'Misma plantilla en los últimos 7 días',
  canceled: 'Campaña cancelada',
  rate_limited_24h: 'Límite de marketing por usuario (24 h)',
  missing_variables: 'Faltan variables',
};

export const ERROR_CODE_LABELS: Record<string, string> = {
  '131049': 'Límite de marketing por usuario: se omitió 24 h',
  '131048': 'Límite de envíos del WABA alcanzado',
  '131056': 'Demasiados mensajes al mismo usuario (reencolado)',
  '130429': 'Límite de throughput (reencolado)',
  '131026': 'El número no usa WhatsApp',
  '131047': 'Han pasado más de 24 h sin respuesta (re-engagement)',
  '131051': 'Tipo de mensaje no soportado',
  '132000': 'Parámetros de la plantilla no coinciden',
  '132001': 'La plantilla no existe o no está aprobada',
  '63016': 'Twilio: fuera de ventana sin plantilla',
  '21610': 'Twilio: el contacto se dio de baja',
  NO_CREDENTIALS: 'El canal no tiene credenciales',
  NO_RECIPIENT: 'Sin destinatario',
  CHANNEL_NO_TEMPLATES: 'El canal QR no admite plantillas',
};
