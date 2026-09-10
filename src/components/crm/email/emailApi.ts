'use client';

/**
 * Cliente fetch tipado para /api/email/* y /api/crm/ia/draft-email (solo
 * navegador). Respuestas `{success, data, ...extra}`; errores → Error con
 * `code` y `status`.
 */

import type { BlockDocument } from '@/lib/services/crm/email/blocks';
import type { EmailDomain, EmailMessage, Template, TemplateSummary } from '@/lib/services/crm/email/types';
import type { RenderContext, VariableDef } from '@/lib/services/crm/email/variables';

export class EmailApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'EmailApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface Envelope<T> { success: boolean; data: T; error?: string; code?: string; details?: unknown; [k: string]: unknown }

export async function emailFetch<T, E extends Record<string, unknown> = Record<string, unknown>>(url: string, init: RequestInit = {}): Promise<{ data: T } & E> {
  const res = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
  });
  const json = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!res.ok || !json || json.success === false) {
    throw new EmailApiError(json?.error ?? `Error ${res.status}`, json?.code ?? 'HTTP', res.status, json?.details);
  }
  return json as unknown as { data: T } & E;
}

const j = (body: unknown) => JSON.stringify(body);

// ─── Plantillas ──────────────────────────────────────────────────────────────

export interface TemplateListParams { channel?: 'email' | 'whatsapp' | 'sms'; kind?: string; q?: string; active?: boolean; page?: number; pageSize?: number }

export function listTemplates(params: TemplateListParams = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  return emailFetch<TemplateSummary[], { total: number }>(`/api/email/templates?${p.toString()}`);
}
export function getTemplate(id: string, stats = false) {
  return emailFetch<Template, { stats?: { sent: number; opened: number; clicked: number; bounced: number } }>(`/api/email/templates/${id}${stats ? '?stats=1' : ''}`);
}
export function createTemplate(body: Record<string, unknown>) {
  return emailFetch<Template>('/api/email/templates', { method: 'POST', body: j(body) });
}
export function updateTemplate(id: string, body: Record<string, unknown>) {
  return emailFetch<Template>(`/api/email/templates/${id}`, { method: 'PATCH', body: j(body) });
}
export function duplicateTemplate(id: string, name?: string) {
  return emailFetch<Template>(`/api/email/templates/${id}/duplicate`, { method: 'POST', body: j({ name }) });
}
export function deleteTemplate(id: string) {
  return emailFetch<{ deleted: boolean; deactivated: boolean }>(`/api/email/templates/${id}`, { method: 'DELETE' });
}

export interface PreviewResult { html: string; text: string; subject: string; preheader: string; missing_variables: string[]; used_variables: string[] }
export interface PreviewBody { template_id?: string; blocks?: BlockDocument; html?: string; subject?: string; preheader?: string; context_ids?: { customer_id?: string; opportunity_id?: string; quote_id?: string }; custom?: Record<string, unknown> }
export function previewEmail(body: PreviewBody) {
  return emailFetch<PreviewResult>('/api/email/templates/preview', { method: 'POST', body: j(body) });
}
export function testSendTemplate(id: string, body: { to?: string; context_ids?: { opportunity_id?: string; customer_id?: string }; variables?: Record<string, unknown> }) {
  return emailFetch<EmailMessage, { warnings: string[]; missing: string[] }>(`/api/email/templates/${id}/test-send`, { method: 'POST', body: j(body) });
}

// ─── Variables ───────────────────────────────────────────────────────────────

export function getVariables(ids: { opportunity_id?: string; customer_id?: string; quote_id?: string } = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(ids)) if (v) p.set(k, v);
  return emailFetch<{ catalog: VariableDef[]; values: RenderContext; sample: boolean }>(`/api/email/variables?${p.toString()}`);
}

// ─── Envío / mensajes ────────────────────────────────────────────────────────

export function sendEmail(body: Record<string, unknown>) {
  return emailFetch<EmailMessage, { scheduled: boolean; warnings: string[]; missing: string[] }>('/api/email/send', { method: 'POST', body: j(body) });
}
export function draftEmailWithAi(body: Record<string, unknown>) {
  return emailFetch<{ subject: string; preheader: string; blocks: BlockDocument; plain_text: string; credits_used: number; model: string }>('/api/crm/ia/draft-email', { method: 'POST', body: j(body) });
}

// ─── Dominios / ajustes ──────────────────────────────────────────────────────

export function listDomains() {
  return emailFetch<EmailDomain[]>('/api/email/domains');
}
export function createDomain(body: Record<string, unknown>) {
  return emailFetch<EmailDomain>('/api/email/domains', { method: 'POST', body: j(body) });
}
export function updateDomain(id: string, body: Record<string, unknown>) {
  return emailFetch<EmailDomain>(`/api/email/domains/${id}`, { method: 'PATCH', body: j(body) });
}
export function verifyDomain(id: string) {
  return emailFetch<EmailDomain>(`/api/email/domains/${id}/verify`, { method: 'POST' });
}
export function setDefaultDomain(id: string) {
  return emailFetch<EmailDomain>(`/api/email/domains/${id}/default`, { method: 'POST' });
}
export function deleteDomain(id: string) {
  return emailFetch<{ deleted: boolean }>(`/api/email/domains/${id}`, { method: 'DELETE' });
}

export interface EmailSettings {
  email_fallback_policy: 'global_with_notice' | 'global_silent' | 'block';
  email_tracking_transactional: boolean;
  global_sender: { domain: string; from_name: string } | null;
  signature_html: string;
  is_admin: boolean;
}
export function getEmailSettings() {
  return emailFetch<EmailSettings>('/api/email/settings');
}
export function patchEmailSettings(body: Partial<Pick<EmailSettings, 'email_fallback_policy' | 'email_tracking_transactional' | 'signature_html'>>) {
  return emailFetch<{ updated: boolean }>('/api/email/settings', { method: 'PATCH', body: j(body) });
}

// ─── Documentos (adjuntos) ───────────────────────────────────────────────────

export interface DocumentOption { id: string; name: string; file_size: number | null; mime_type: string | null; related_type: string; related_id: string }
export async function listDocumentsFor(relatedType: string, relatedId: string): Promise<DocumentOption[]> {
  const p = new URLSearchParams({ related_type: relatedType, related_id: relatedId, limit: '50' });
  const r = await emailFetch<DocumentOption[]>(`/api/crm/documents?${p.toString()}`);
  return r.data ?? [];
}
