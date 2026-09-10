/**
 * Fachada del módulo de email (FASE-07). La implementación vive en
 * `src/lib/services/crm/email/*`; este archivo re-exporta y mantiene la firma
 * legacy `sendEmail(orgId, input, supabase)` usada por sequenceService.ts:575
 * y automationService.ts:557 (sin activity duplicada, con fn_can_contact y
 * variables reales).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail as sendEmailV2, type SendEmailRequest, type SendContent } from './email/sendService';
import type { EmailMessage } from './email/types';
import { listMessages, listEvents, type EmailMessageFilters } from './email/messagesService';
import { getMessage } from './email/messageStore';
import { listDomains, createDomain, updateDomain, type CreateDomainInput, type UpdateDomainInput } from './email/domainsService';

export type { EmailMessage, EmailEvent, EmailDomain, EmailMessageStatus, EmailDomainStatus, EmailKind, Template, TemplateSummary } from './email/types';
export { EmailError } from './email/types';
export type { SendEmailRequest, SendEmailResult, SendContent } from './email/sendService';
export { sendEmail as sendEmailV2, replyToEmail, cancelScheduledEmail, dispatchScheduledEmail } from './email/sendService';
export { buildIdempotencyKey } from './email/messageStore';
export { handleEmailWebhook } from './email/webhookService';
export { listMessages, listEvents, getMessageDetail } from './email/messagesService';
export { listDomains, createDomain, updateDomain, verifyDomain, setDefaultDomain, deleteDomain, resolveSender } from './email/domainsService';
export { renderEmail } from './email/render';
export { buildContext, renderVariables, VARIABLE_CATALOG } from './email/variables';

/** Entrada legacy (secuencias / automatizaciones). */
export interface SendEmailInput {
  to: string;
  to_customer_id?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  template_id?: string;
  template_variables?: Record<string, string | number | unknown>;
  related_type?: string;
  related_id?: string;
  sequence_step_run_id?: string;
  scheduled_at?: string;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
  kind?: 'transactional' | 'marketing' | 'sequence' | 'system';
  from_user_id?: string | null;
}

/**
 * Adaptador legacy → v2. `template_id` se renderiza desde `templates` (cierra
 * C13); si no hay plantilla, `html` con variables `{{...}}`.
 */
export async function sendEmail(orgId: number, data: SendEmailInput, supabase: SupabaseClient): Promise<EmailMessage> {
  const variables = (data.template_variables ?? {}) as Record<string, unknown>;
  let content: SendContent;
  if (data.template_id) content = { template_id: data.template_id, variables };
  else if (data.html || data.text) content = { html: data.html ?? `<p>${data.text ?? ''}</p>`, text: data.text, variables };
  else throw new Error('Se requiere html, text o template_id para enviar el email');

  const req: SendEmailRequest = {
    to: [data.to],
    cc: data.cc,
    bcc: data.bcc,
    to_customer_id: data.to_customer_id ?? null,
    subject: data.subject,
    content,
    related_type: data.related_type,
    related_id: data.related_id,
    sequence_step_run_id: data.sequence_step_run_id ?? null,
    scheduled_at: data.scheduled_at ?? null,
    client_request_id: data.idempotency_key ?? null,
    kind: data.kind ?? (data.sequence_step_run_id ? 'sequence' : 'transactional'),
    strict_variables: false,
    metadata: data.metadata,
    from_user_id: data.from_user_id ?? null,
  };
  const r = await sendEmailV2(orgId, { userId: data.from_user_id ?? null }, req, supabase);
  return r.message;
}

export async function getEmails(orgId: number, supabase: SupabaseClient, filters?: EmailMessageFilters): Promise<{ data: EmailMessage[]; count: number }> {
  return listMessages(orgId, filters ?? {}, supabase);
}

export async function getEmail(id: string, orgId: number, supabase: SupabaseClient): Promise<EmailMessage | null> {
  return getMessage(orgId, id, supabase);
}

export async function getEmailEvents(messageId: string, orgId: number, supabase: SupabaseClient) {
  return listEvents(orgId, messageId, supabase);
}

export async function getEmailDomains(orgId: number, supabase: SupabaseClient) {
  return listDomains(orgId, supabase);
}

export async function createEmailDomain(orgId: number, input: CreateDomainInput, supabase: SupabaseClient) {
  return createDomain(orgId, input, supabase);
}

export async function updateEmailDomain(id: string, orgId: number, patch: UpdateDomainInput, supabase: SupabaseClient) {
  return updateDomain(orgId, id, patch, supabase);
}
