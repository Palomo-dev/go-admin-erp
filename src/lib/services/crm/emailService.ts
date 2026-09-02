/**
 * Servicio CRM — Email y Plantillas (Fase 7).
 *
 * Envía emails vía Resend (o SendGrid fallback), registra mensajes en
 * `email_messages`, eventos en `email_events`, dominios en `email_domains`
 * y procesa webhooks de Resend con verificación Svix.
 *
 * Tablas:
 *   email_domains, email_messages, email_events, activities, customers
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { Webhook } from 'svix';
import { getActiveProvider } from '@/lib/services/providerRegistry';
import { createActivity } from '@/lib/services/activityService';
import { ActivityType } from '@/types/activity';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EmailMessageStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
  | 'failed';

export type EmailDomainStatus =
  | 'pending'
  | 'verifying'
  | 'verified'
  | 'failed';

export interface EmailDomain {
  id: string;
  organization_id: number;
  domain: string;
  provider: string;
  provider_domain_id: string | null;
  credential_id: string | null;
  status: EmailDomainStatus;
  dns_records: Record<string, unknown>[];
  dmarc_configured: boolean;
  from_name: string | null;
  from_email: string;
  reply_to: string | null;
  is_default: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  organization_id: number;
  provider: string;
  provider_message_id: string | null;
  template_id: string | null;
  to_email: string;
  to_customer_id: string | null;
  cc: string[] | null;
  bcc: string[] | null;
  from_email: string;
  subject: string;
  body_html_snapshot: string | null;
  related_type: string | null;
  related_id: string | null;
  sequence_step_run_id: string | null;
  status: EmailMessageStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  first_opened_at: string | null;
  open_count: number;
  first_clicked_at: string | null;
  click_count: number;
  bounced_at: string | null;
  bounce_type: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  idempotency_key: string;
  cost_amount: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EmailEvent {
  id: string;
  organization_id: number;
  email_message_id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown> | null;
  provider_event_id: string;
}

export interface SendEmailInput {
  to: string;
  to_customer_id?: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  template_id?: string;
  template_variables?: Record<string, string | number>;
  related_type?: string;
  related_id?: string;
  sequence_step_run_id?: string;
  scheduled_at?: string;
  idempotency_key?: string;
  metadata?: Record<string, unknown>;
}

export interface EmailMessageFilters {
  status?: EmailMessageStatus;
  to_customer_id?: string;
  related_type?: string;
  related_id?: string;
  limit?: number;
  offset?: number;
}

export interface CreateEmailDomainInput {
  domain: string;
  provider?: string;
  provider_domain_id?: string;
  credential_id?: string;
  from_name?: string;
  from_email: string;
  reply_to?: string;
  is_default?: boolean;
}

export interface UpdateEmailDomainInput {
  provider?: string;
  provider_domain_id?: string;
  credential_id?: string;
  status?: EmailDomainStatus;
  dns_records?: Record<string, unknown>[];
  dmarc_configured?: boolean;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  is_default?: boolean;
  verified_at?: string | null;
}

// ─── Helpers internos ────────────────────────────────────────────────────────

/**
 * Crea un cliente Supabase con service role para operaciones que requieren
 * bypass de RLS (inserción de email_messages desde el servidor, webhooks, etc.).
 */
function getServiceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * Genera una idempotency key única si no se proporciona una.
 */
function generateIdempotencyKey(orgId: number, to: string, subject: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 10);
  return `org-${orgId}-${ts}-${rand}-${Buffer.from(`${to}:${subject}`).toString('base64').slice(0, 16)}`;
}

/**
 * Renderiza un template HTML simple reemplazando {{variables}}.
 * Si no hay template, devuelve el html tal cual.
 */
function renderTemplate(
  html: string,
  variables: Record<string, string | number> = {},
): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = variables[key];
    return val !== undefined ? String(val) : '';
  });
}

/**
 * Resuelve el dominio de email verificado por defecto de la organización.
 */
async function resolveDefaultDomain(
  orgId: number,
  supabase: SupabaseClient,
): Promise<EmailDomain | null> {
  const { data, error } = await supabase
    .from('email_domains')
    .select('*')
    .eq('organization_id', orgId)
    .eq('status', 'verified')
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as EmailDomain;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Envía un email vía Resend (o SendGrid fallback).
 *
 * 1. Resuelve dominio + proveedor via getActiveProvider(orgId, 'email')
 * 2. Renderiza plantilla con variables
 * 3. Genera/valida Idempotency-Key
 * 4. INSERT email_messages (status=pending)
 * 5. INSERT activities (activity_type='email')
 * 6. Llama a Resend API
 * 7. UPDATE email_messages con provider_message_id y status=sent
 */
export async function sendEmail(
  orgId: number,
  data: SendEmailInput,
  supabase: SupabaseClient,
): Promise<EmailMessage> {
  // 1. Resolver proveedor de email
  const providerConfig = await getActiveProvider(orgId, 'email', supabase);

  if (!providerConfig.isActive || providerConfig.provider === 'none') {
    throw new Error('No hay proveedor de email configurado para la organización');
  }

  // 2. Resolver dominio verificado
  const domain = await resolveDefaultDomain(orgId, supabase);
  const fromName = domain?.from_name || process.env.EMAIL_FROM_NAME || '';
  const fromEmail = domain?.from_email || data.metadata?.from_email as string || process.env.EMAIL_FROM_ADDRESS || '';
  const replyTo = domain?.reply_to || undefined;

  if (!fromEmail) {
    throw new Error('No hay dirección from_email configurada (ni dominio verificado ni env var)');
  }

  const fromAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  // 3. Renderizar contenido
  const htmlContent = data.html
    ? renderTemplate(data.html, data.template_variables)
    : '';
  const textContent = data.text
    ? renderTemplate(data.text, data.template_variables)
    : undefined;

  if (!htmlContent && !textContent && !data.template_id) {
    throw new Error('Se requiere html, text o template_id para enviar el email');
  }

  // 4. Idempotency key
  const idempotencyKey = data.idempotency_key || generateIdempotencyKey(orgId, data.to, data.subject);

  // 5. Verificar idempotencia — si ya existe un mensaje con esta key, retornarlo
  const { data: existing } = await supabase
    .from('email_messages')
    .select('*')
    .eq('organization_id', orgId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    return existing as EmailMessage;
  }

  // 6. INSERT email_messages (status=pending)
  const messageRow = {
    organization_id: orgId,
    provider: providerConfig.provider,
    template_id: data.template_id || null,
    to_email: data.to,
    to_customer_id: data.to_customer_id || null,
    cc: data.cc || null,
    bcc: data.bcc || null,
    from_email: fromEmail,
    subject: data.subject,
    body_html_snapshot: htmlContent || null,
    related_type: data.related_type || null,
    related_id: data.related_id || null,
    sequence_step_run_id: data.sequence_step_run_id || null,
    status: 'pending' as EmailMessageStatus,
    scheduled_at: data.scheduled_at || null,
    idempotency_key: idempotencyKey,
    metadata: data.metadata || {},
  };

  const { data: insertedMessage, error: insertError } = await supabase
    .from('email_messages')
    .insert(messageRow)
    .select()
    .single();

  if (insertError || !insertedMessage) {
    throw new Error(`Error insertando email_message: ${insertError?.message || 'unknown'}`);
  }

  const message = insertedMessage as EmailMessage;

  // 7. INSERT activity
  try {
    await createActivity(
      {
        activity_type: ActivityType.EMAIL,
        notes: `Email enviado a ${data.to}: "${data.subject}"`,
        related_type: data.related_type || undefined,
        related_id: data.related_id || undefined,
        occurred_at: new Date().toISOString(),
        metadata: {
          email_message_id: message.id,
          email_to: data.to,
          email_subject: data.subject,
          email_provider: providerConfig.provider,
        },
      },
      orgId,
      supabase,
    );
  } catch (actErr) {
    console.warn('[emailService] No se pudo crear actividad:', actErr);
  }

  // 8. Enviar vía Resend
  try {
    if (providerConfig.provider === 'resend') {
      const apiKey = providerConfig.credentials.RESEND_API_KEY || process.env.RESEND_API_KEY;
      if (!apiKey) {
        throw new Error('RESEND_API_KEY no configurada');
      }

      const resend = new Resend(apiKey);

      const sendPayload: Record<string, unknown> = {
        from: fromAddress,
        to: data.to,
        subject: data.subject,
        cc: data.cc,
        bcc: data.bcc,
        replyTo: replyTo,
        headers: { 'X-Email-Message-Id': message.id },
      };

      if (data.template_id) {
        sendPayload.template = {
          id: data.template_id,
          variables: data.template_variables,
        };
      } else if (htmlContent) {
        sendPayload.html = htmlContent;
        if (textContent) sendPayload.text = textContent;
      } else if (textContent) {
        sendPayload.text = textContent;
      }

      const { data: resendData, error: resendError } = await resend.emails.send(
        sendPayload as unknown as Parameters<typeof resend.emails.send>[0],
        { idempotencyKey },
      );

      if (resendError || !resendData) {
        // Marcar como failed
        await supabase
          .from('email_messages')
          .update({
            status: 'failed',
            metadata: { ...message.metadata, error: resendError?.message || 'Resend error' },
            updated_at: new Date().toISOString(),
          })
          .eq('id', message.id);

        throw new Error(`Resend error: ${resendError?.message || 'unknown'}`);
      }

      // 9. UPDATE email_messages con provider_message_id y status=sent
      const { data: updated, error: updateError } = await supabase
        .from('email_messages')
        .update({
          provider_message_id: resendData.id,
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', message.id)
        .select()
        .single();

      if (updateError) {
        console.warn('[emailService] Error actualizando mensaje tras envío:', updateError.message);
        return message;
      }

      return updated as EmailMessage;
    }

    // Fallback SendGrid — delegar a twilioEmailService en el futuro
    throw new Error(`Provider de email no soportado: ${providerConfig.provider}`);
  } catch (sendErr) {
    const errMsg = sendErr instanceof Error ? sendErr.message : String(sendErr);
    console.error('[emailService] Error enviando email:', errMsg);

    await supabase
      .from('email_messages')
      .update({
        status: 'failed',
        metadata: { ...message.metadata, error: errMsg },
        updated_at: new Date().toISOString(),
      })
      .eq('id', message.id);

    throw sendErr;
  }
}

/**
 * Lista emails enviados con filtros opcionales.
 */
export async function getEmails(
  orgId: number,
  supabase: SupabaseClient,
  filters?: EmailMessageFilters,
): Promise<{ data: EmailMessage[]; count: number }> {
  let query = supabase
    .from('email_messages')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.to_customer_id) {
    query = query.eq('to_customer_id', filters.to_customer_id);
  }
  if (filters?.related_type) {
    query = query.eq('related_type', filters.related_type);
  }
  if (filters?.related_id) {
    query = query.eq('related_id', filters.related_id);
  }

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.warn('[emailService] Error en getEmails:', error.message);
    return { data: [], count: 0 };
  }

  return { data: (data || []) as EmailMessage[], count: count || 0 };
}

/**
 * Obtiene un email por ID.
 */
export async function getEmail(
  id: string,
  orgId: number,
  supabase: SupabaseClient,
): Promise<EmailMessage | null> {
  const { data, error } = await supabase
    .from('email_messages')
    .select('*')
    .eq('id', id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data) return null;
  return data as EmailMessage;
}

/**
 * Lista los eventos de un email.
 */
export async function getEmailEvents(
  messageId: string,
  orgId: number,
  supabase: SupabaseClient,
): Promise<EmailEvent[]> {
  const { data, error } = await supabase
    .from('email_events')
    .select('*')
    .eq('email_message_id', messageId)
    .eq('organization_id', orgId)
    .order('occurred_at', { ascending: true });

  if (error) {
    console.warn('[emailService] Error en getEmailEvents:', error.message);
    return [];
  }

  return (data || []) as EmailEvent[];
}

/**
 * Lista los dominios de email de la organización.
 */
export async function getEmailDomains(
  orgId: number,
  supabase: SupabaseClient,
): Promise<EmailDomain[]> {
  const { data, error } = await supabase
    .from('email_domains')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[emailService] Error en getEmailDomains:', error.message);
    return [];
  }

  return (data || []) as EmailDomain[];
}

/**
 * Registra un nuevo dominio de email.
 */
export async function createEmailDomain(
  orgId: number,
  data: CreateEmailDomainInput,
  supabase: SupabaseClient,
): Promise<EmailDomain> {
  // Si is_default=true, quitar el flag de los otros dominios
  if (data.is_default) {
    await supabase
      .from('email_domains')
      .update({ is_default: false })
      .eq('organization_id', orgId)
      .eq('is_default', true);
  }

  const { data: domain, error } = await supabase
    .from('email_domains')
    .insert({
      organization_id: orgId,
      domain: data.domain,
      provider: data.provider || 'resend',
      provider_domain_id: data.provider_domain_id || null,
      credential_id: data.credential_id || null,
      status: 'pending',
      from_name: data.from_name || null,
      from_email: data.from_email,
      reply_to: data.reply_to || null,
      is_default: data.is_default ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return domain as EmailDomain;
}

/**
 * Actualiza un dominio de email existente.
 */
export async function updateEmailDomain(
  id: string,
  orgId: number,
  data: UpdateEmailDomainInput,
  supabase: SupabaseClient,
): Promise<EmailDomain | null> {
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.provider !== undefined) updateData.provider = data.provider;
  if (data.provider_domain_id !== undefined) updateData.provider_domain_id = data.provider_domain_id;
  if (data.credential_id !== undefined) updateData.credential_id = data.credential_id;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.dns_records !== undefined) updateData.dns_records = data.dns_records;
  if (data.dmarc_configured !== undefined) updateData.dmarc_configured = data.dmarc_configured;
  if (data.from_name !== undefined) updateData.from_name = data.from_name;
  if (data.from_email !== undefined) updateData.from_email = data.from_email;
  if (data.reply_to !== undefined) updateData.reply_to = data.reply_to;
  if (data.verified_at !== undefined) updateData.verified_at = data.verified_at;

  // Si is_default=true, quitar el flag de los otros dominios primero
  if (data.is_default) {
    await supabase
      .from('email_domains')
      .update({ is_default: false })
      .eq('organization_id', orgId)
      .eq('is_default', true)
      .neq('id', id);
    updateData.is_default = true;
  }

  const { data: result, error } = await supabase
    .from('email_domains')
    .update(updateData)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return result as EmailDomain | null;
}

// ─── Webhook de Resend (Svix) ────────────────────────────────────────────────

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    tags?: { name: string; value: string }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Mapea eventos de Resend a estados de email_messages.
 */
function mapResendEventToStatus(
  eventType: string,
): { status: EmailMessageStatus | null; bounceType?: string } {
  switch (eventType) {
    case 'email.sent':
      return { status: 'sent' };
    case 'email.delivered':
      return { status: 'delivered' };
    case 'email.opened':
      return { status: 'opened' };
    case 'email.clicked':
      return { status: 'clicked' };
    case 'email.bounced':
      return { status: 'bounced', bounceType: 'hard' };
    case 'email.complained':
      return { status: 'complained' };
    case 'email.failed':
      return { status: 'failed' };
    default:
      return { status: null };
  }
}

/**
 * Procesa un webhook de Resend.
 *
 * 1. Verifica firma con Svix
 * 2. Idempotente por provider_event_id
 * 3. Mapea eventos a email_messages + email_events
 * 4. Bounce duro → suppression (customers.metadata.do_not_email = true)
 * 5. Queja → do_not_email
 */
export async function handleEmailWebhook(
  payload: string,
  headers: Record<string, string>,
  supabase: SupabaseClient,
): Promise<{ processed: boolean; event_id?: string }> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('RESEND_WEBHOOK_SECRET no configurado');
  }

  // 1. Verificar firma con Svix
  const wh = new Webhook(webhookSecret);

  let verifiedPayload: ResendWebhookPayload;
  try {
    const verified = wh.verify(payload, headers);
    verifiedPayload = verified as unknown as ResendWebhookPayload;
  } catch (err) {
    throw new Error(`Firma de webhook inválida: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  const eventType = verifiedPayload.type;
  const emailId = verifiedPayload.data?.email_id;
  const createdAt = verifiedPayload.created_at || new Date().toISOString();

  if (!emailId) {
    console.warn('[emailWebhook] Webhook sin email_id, ignorando');
    return { processed: false };
  }

  // 2. Generar provider_event_id único
  const providerEventId = `${eventType}-${emailId}-${createdAt}`;

  // 3. Idempotencia — verificar si ya procesamos este evento
  const serviceClient = getServiceClient();
  const { data: existingEvent } = await serviceClient
    .from('email_events')
    .select('id')
    .eq('provider_event_id', providerEventId)
    .maybeSingle();

  if (existingEvent) {
    return { processed: false, event_id: existingEvent.id };
  }

  // 4. Buscar el email_message por provider_message_id
  const { data: message } = await serviceClient
    .from('email_messages')
    .select('*')
    .eq('provider_message_id', emailId)
    .maybeSingle();

  if (!message) {
    console.warn(`[emailWebhook] No se encontró email_message con provider_message_id=${emailId}`);
    return { processed: false };
  }

  const msg = message as EmailMessage;

  // 5. INSERT email_event
  const { data: eventRecord, error: eventError } = await serviceClient
    .from('email_events')
    .insert({
      organization_id: msg.organization_id,
      email_message_id: msg.id,
      event_type: eventType,
      occurred_at: createdAt,
      payload: verifiedPayload as unknown as Record<string, unknown>,
      provider_event_id: providerEventId,
    })
    .select()
    .single();

  if (eventError) {
    console.error('[emailWebhook] Error insertando email_event:', eventError.message);
    return { processed: false };
  }

  // 6. Mapear evento a estado y actualizar email_message
  const { status: newStatus, bounceType } = mapResendEventToStatus(eventType);

  if (newStatus) {
    const updateData: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    switch (newStatus) {
      case 'delivered':
        if (!msg.delivered_at) updateData.delivered_at = createdAt;
        break;
      case 'opened':
        if (!msg.first_opened_at) updateData.first_opened_at = createdAt;
        updateData.open_count = (msg.open_count || 0) + 1;
        break;
      case 'clicked':
        if (!msg.first_clicked_at) updateData.first_clicked_at = createdAt;
        updateData.click_count = (msg.click_count || 0) + 1;
        break;
      case 'bounced':
        updateData.bounced_at = createdAt;
        updateData.bounce_type = bounceType || 'hard';
        break;
      case 'complained':
        updateData.complained_at = createdAt;
        break;
      case 'unsubscribed':
        updateData.unsubscribed_at = createdAt;
        break;
    }

    await serviceClient
      .from('email_messages')
      .update(updateData)
      .eq('id', msg.id);

    // 7. Bounce duro → suppression; Queja → do_not_email
    if ((newStatus === 'bounced' && bounceType === 'hard') || newStatus === 'complained') {
      if (msg.to_customer_id) {
        try {
          // Actualizar customers.metadata con flag de supresión
          const { data: customer } = await serviceClient
            .from('customers')
            .select('metadata')
            .eq('id', msg.to_customer_id)
            .eq('organization_id', msg.organization_id)
            .maybeSingle();

          if (customer) {
            const existingMeta = (customer.metadata as Record<string, unknown>) || {};
            await serviceClient
              .from('customers')
              .update({
                metadata: {
                  ...existingMeta,
                  do_not_email: true,
                  email_suppressed_reason: newStatus === 'complained' ? 'complained' : 'hard_bounce',
                  email_suppressed_at: createdAt,
                },
              })
              .eq('id', msg.to_customer_id)
              .eq('organization_id', msg.organization_id);
          }
        } catch (supErr) {
          console.warn('[emailWebhook] Error marcando supresión en customer:', supErr);
        }
      }
    }
  }

  return { processed: true, event_id: (eventRecord as EmailEvent).id };
}
