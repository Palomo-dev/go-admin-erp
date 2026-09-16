/**
 * F10 — cliente de las rutas de propuesta/ROI/contrato/pago/demo. Sin lógica
 * de negocio: solo `fetch` con errores en lenguaje humano. La organización
 * nunca viaja en el body (sale de la sesión en el servidor).
 */

import type { ProposalSections } from '@/lib/services/crm/proposalNarrative';
import type { ProposalContextData, ProposalRecord } from '@/lib/services/crm/proposalServerService';

export interface ProposalDetail extends ProposalRecord {
  customerName?: string | null;
  customerEmail?: string | null;
  organizationName?: string;
  isNew?: boolean;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  configured?: boolean;
  missing?: string[];
  contract_id?: string;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly payload?: ApiEnvelope<unknown>) {
    super(message);
    this.name = 'ApiError';
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!res.ok || json.success === false) {
    throw new ApiError(json.error || `Error ${res.status}`, res.status, json);
  }
  return json.data as T;
}

export const proposalApi = {
  load: (opportunityId: string) =>
    call<{ context: ProposalContextData; proposal: ProposalRecord | null }>(`/api/crm/proposals?opportunity_id=${encodeURIComponent(opportunityId)}`),
  generate: (opportunityId: string, roi?: { summary: string; outputs: Record<string, number> } | null, force = false) =>
    call<ProposalDetail>('/api/crm/proposals', { method: 'POST', body: JSON.stringify({ opportunity_id: opportunityId, roi: roi ?? undefined, force: force || undefined }) }),
  get: (id: string) => call<ProposalDetail>(`/api/crm/proposals/${encodeURIComponent(id)}`),
  saveSections: (id: string, sections: Partial<ProposalSections>) =>
    call<ProposalRecord>(`/api/crm/proposals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ sections }) }),
  markSent: (id: string, emailMessageId?: string) =>
    call<{ next_contact_at: string }>(`/api/crm/proposals/${encodeURIComponent(id)}/sent`, { method: 'POST', body: JSON.stringify({ email_message_id: emailMessageId }) }),
};

export interface RoiTemplateOption {
  id: string | null;
  slug: string | null;
  name: string;
  inputs: Array<{ key: string; label: string; type: string; default?: number | string; required?: boolean }>;
  outputs: Array<{ key: string; label: string; type: string }>;
}

export const roiApi = {
  templates: () => call<Array<{ id: string; name: string; inputs: RoiTemplateOption['inputs']; outputs: RoiTemplateOption['outputs']; vertical_id: string | null }>>('/api/crm/roi/templates'),
  calculate: (body: { calculator_id?: string; template?: string; inputs: Record<string, number> }) =>
    call<{ outputs: Record<string, number>; errors: Record<string, string>; output_defs?: RoiTemplateOption['outputs'] }>('/api/crm/roi', { method: 'POST', body: JSON.stringify(body) }),
};

export interface EsignStatus { configured: boolean; provider: string | null; source: string | null; missing: string[] }
export interface ContractRow { id: string; status: string; provider_document_id: string | null; signers: Array<{ name: string; email: string; status?: string }>; sent_at: string | null; signed_at: string | null; created_at: string }

export const contractApi = {
  status: () => call<EsignStatus>('/api/crm/contracts/status'),
  list: (opportunityId: string) => call<ContractRow[]>(`/api/crm/contracts?opportunity_id=${encodeURIComponent(opportunityId)}`),
  create: (body: { opportunity_id: string; quotation_id?: string | null; signers: Array<{ name: string; email: string }>; document_html?: string; document_title?: string }) =>
    call<ContractRow>('/api/crm/contracts', { method: 'POST', body: JSON.stringify(body) }),
};

export interface PaymentStatus { configured: boolean; source: string | null; missing: string[]; payment_link_url: string | null; invoice: { id: string; number: string; balance: number; status: string; currency: string } | null }

export const paymentApi = {
  status: (quotationId: string) => call<PaymentStatus>(`/api/crm/payments/link?quotation_id=${encodeURIComponent(quotationId)}`),
  createLink: (quotationId: string) => call<{ url: string; reused: boolean; amount: number; currency: string }>('/api/crm/payments/link', { method: 'POST', body: JSON.stringify({ quotation_id: quotationId }) }),
};

export interface DemoRow { id: string; scheduled_at: string; duration_minutes: number; attendees: Array<{ name: string; email?: string }>; status: string; checklist: Array<{ label: string; done: boolean }>; notes: string | null; video_url: string | null }

export const demoApi = {
  list: (opportunityId: string) => call<DemoRow[]>(`/api/crm/demos?opportunity_id=${encodeURIComponent(opportunityId)}`),
  create: (body: { opportunity_id: string; scheduled_at: string; duration_minutes: number; attendees: Array<{ name: string; email?: string }>; checklist: Array<{ label: string; done: boolean }>; notes?: string | null }) =>
    call<DemoRow>('/api/crm/demos', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) => call<DemoRow>(`/api/crm/demos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
};
