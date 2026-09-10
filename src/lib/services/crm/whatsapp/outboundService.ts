/**
 * Envío individual de WhatsApp desde el CRM (FASE-16 §2.2, §4.2
 * `whatsappOutboundService`). Cierra C12 (botón del pipeline) y C20 (una sola
 * shape de `messages`).
 *
 * NO llama al proveedor: inserta en `messages` con la shape viva
 * (direction/role/channel_id/content/sender_member_id/payload) y deja que
 * `trg_channel_dispatch` → Edge Function `channel-dispatch` despache (texto,
 * template, media, Twilio). Crea UNA `activities` (activity_type 'whatsapp',
 * message_id, conversation_id). Devuelve {message_id, conversation_id, activity_id}.
 *
 * Orden: ownership → canal → identidad/teléfono → fn_can_contact → ventana 24 h
 * → plantilla APPROVED/render → horario permitido → límite diario →
 * deduct_comm_credits → find-or-create conversación → INSERT messages →
 * activity → comm_usage_logs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { buildContext, renderVariables } from '@/lib/services/crm/email/variables';
import { enqueueJob } from '@/lib/jobs/enqueue';
import { canContact } from './consent';
import { countryFromPhone, defaultCountryOf, getOrgSettings, resolveChannel, resolveRecipient } from './channelService';
import { requireHsm } from './templateService';
import { renderTemplateComponents, renderedToText, toTwilioContentVariables } from './templateRender';
import { getWindow } from './windowService';
import { isWithinAllowedHours, nextAllowedSlot } from './allowedHours';
import { WhatsAppError, type SendWhatsAppInput, type SendWhatsAppResult } from './types';

interface Target {
  customerId: string;
  opportunityId: string | null;
  customerName: string;
}

async function resolveTarget(input: SendWhatsAppInput, supabase: SupabaseClient): Promise<Target> {
  let customerId = input.customerId ?? null;
  const opportunityId = input.opportunityId ?? input.relatedOpportunityId ?? null;

  if (input.conversationId) {
    const { data: conv } = await supabase.from('conversations').select('id, customer_id, channel_id').eq('id', input.conversationId).eq('organization_id', input.orgId).maybeSingle();
    if (!conv) throw new WhatsAppError('NOT_FOUND', 'Conversación no encontrada en la organización', 404);
    customerId = customerId ?? (conv as { customer_id: string }).customer_id;
  }
  if (opportunityId) {
    const { data: opp } = await supabase.from('opportunities').select('id, customer_id').eq('id', opportunityId).eq('organization_id', input.orgId).maybeSingle();
    if (!opp) throw new WhatsAppError('NOT_FOUND', 'Oportunidad no encontrada en la organización', 404);
    customerId = customerId ?? ((opp as { customer_id: string | null }).customer_id ?? null);
  }
  if (!customerId) throw new WhatsAppError('VALIDATION', 'Se requiere customerId, opportunityId o conversationId', 400);
  const { data: c } = await supabase.from('customers').select('id, full_name, first_name, phone').eq('id', customerId).eq('organization_id', input.orgId).maybeSingle();
  if (!c) throw new WhatsAppError('NOT_FOUND', 'Cliente no encontrado en la organización', 404);
  const row = c as { id: string; full_name: string | null; first_name: string | null };
  return { customerId: row.id, opportunityId, customerName: row.full_name || row.first_name || 'cliente' };
}

async function findOrCreateConversation(orgId: number, customerId: string, channelId: string, memberId: number | null, opportunityId: string | null, supabase: SupabaseClient, preferred?: string | null): Promise<string> {
  if (preferred) {
    const { data } = await supabase.from('conversations').select('id, channel_id').eq('id', preferred).eq('organization_id', orgId).maybeSingle();
    if (data && (data as { channel_id: string }).channel_id === channelId) return (data as { id: string }).id;
  }
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('organization_id', orgId)
    .eq('channel_id', channelId)
    .eq('customer_id', customerId)
    .in('status', ['open', 'pending'])
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ organization_id: orgId, channel_id: channelId, customer_id: customerId, status: 'open', priority: 'normal', assigned_member_id: memberId, metadata: { source: 'crm', opportunity_id: opportunityId } })
    .select('id')
    .single();
  if (error || !created) throw new WhatsAppError('INTERNAL', `No se pudo crear la conversación: ${error?.message}`, 500);
  return (created as { id: string }).id;
}

export async function sendWhatsApp(input: SendWhatsAppInput, supabase: SupabaseClient, service: SupabaseClient = getServiceClient(), now: Date = new Date()): Promise<SendWhatsAppResult> {
  const orgId = input.orgId;
  const purpose = input.purpose ?? 'utility';
  const hasText = !!input.text?.trim();
  const hasTemplate = !!input.template?.templateId || !!input.rawTemplate;
  const media = input.media ?? (input.mediaUrl ? { url: input.mediaUrl, mime: guessMime(input.mediaUrl), caption: input.text ?? undefined } : null);
  if (!hasText && !hasTemplate && !media) throw new WhatsAppError('VALIDATION', 'Se requiere text, template o media', 400);

  const target = await resolveTarget(input, supabase);
  const channel = await resolveChannel(orgId, input.channelId ?? null, supabase, service);
  if (channel.status !== 'active') throw new WhatsAppError('NO_CHANNEL', `El canal "${channel.name}" no está activo`, 422);

  // Ajustes de la org: hacen falta ANTES de resolver el destinatario, porque el
  // indicativo con el que se completan los teléfonos nacionales sale de ahí.
  const settings = await getOrgSettings(orgId, service);
  const recipient = await resolveRecipient(orgId, target.customerId, channel.id, supabase, defaultCountryOf(settings));
  if (!recipient) throw new WhatsAppError('NO_PHONE', 'El cliente no tiene un número de WhatsApp válido', 422);

  if (!(await canContact(orgId, target.customerId, 'whatsapp', purpose, service))) {
    throw new WhatsAppError('OPTED_OUT', 'El contacto pidió no recibir WhatsApp (opt-out)', 422);
  }

  const window = await getWindow(orgId, target.customerId, channel.id, supabase, now);

  // Contenido según tipo
  let content = '';
  let contentType: 'text' | 'template' | 'image' | 'file' = 'text';
  let payload: Record<string, unknown> = {};
  let templateId: string | null = null;
  let category: string | null = null;

  if (hasTemplate) {
    if (!channel.capabilities.templates) throw new WhatsAppError('CHANNEL_NO_TEMPLATES', 'El canal QR no admite plantillas', 422);
    if (input.template?.templateId) {
      const t = await requireHsm(orgId, input.template.templateId, supabase);
      if (t.meta.status !== 'APPROVED') throw new WhatsAppError('TEMPLATE_NOT_APPROVED', `La plantilla "${t.name}" no está aprobada (${t.meta.status})`, 422);
      category = t.meta.category;
      if (category === 'marketing' && countryFromPhone(recipient) === 'us') throw new WhatsAppError('US_MARKETING_BLOCKED', 'Meta bloquea plantillas de marketing a números de EE.UU.', 422);
      const ctx = await buildContext(orgId, { customerId: target.customerId, opportunityId: target.opportunityId, userId: input.senderUserId ?? null, custom: (input.template.variables ?? {}) as Record<string, unknown> }, service);
      const r = renderTemplateComponents(t, ctx, input.template.variables ?? {});
      if (r.missing.length) throw new WhatsAppError('MISSING_VARIABLES', `Faltan variables: ${r.missing.join(', ')}`, 422, { missing: r.missing });
      content = renderedToText(r);
      contentType = 'template';
      templateId = t.id;
      payload = {
        template: r.payload,
        template_id: t.id,
        category,
        ...(channel.provider === 'twilio' && t.meta.twilio?.content_sid ? { twilio: { content_sid: t.meta.twilio.content_sid, variables: toTwilioContentVariables(r, t.meta.twilio.positional_map) } } : {}),
      };
    } else if (input.rawTemplate) {
      content = `[Plantilla ${input.rawTemplate.name}]`;
      contentType = 'template';
      payload = { template: input.rawTemplate };
    }
  } else if (media) {
    if (!channel.capabilities.media) throw new WhatsAppError('VALIDATION', 'El canal no admite adjuntos', 422);
    if (!window.is_open) throw new WhatsAppError('WINDOW_CLOSED', 'La ventana de 24 h está cerrada: usa una plantilla aprobada', 422, { window });
    const isImage = media.mime.startsWith('image/');
    content = media.caption?.trim() || (isImage ? '[Imagen]' : `[Documento ${media.filename ?? ''}]`.trim());
    contentType = isImage ? 'image' : 'file';
    payload = { media: { url: media.url, mime: media.mime, filename: media.filename ?? null, caption: media.caption ?? null } };
  } else {
    if (!window.is_open && channel.provider !== 'baileys') throw new WhatsAppError('WINDOW_CLOSED', 'La ventana de 24 h está cerrada: usa una plantilla aprobada', 422, { window });
    content = String(input.text).trim();
    // El texto libre también pasa por el motor de variables de F7: antes se
    // enviaba `{{contacto.nombre}}` literal al cliente (solo la rama de
    // plantilla interpolaba). Sin `{{` no hay coste de buildContext.
    if (content.includes('{{')) {
      const ctx = await buildContext(orgId, { customerId: target.customerId, opportunityId: target.opportunityId, userId: input.senderUserId ?? null, custom: (input.variables ?? {}) as Record<string, unknown> }, service);
      // `strictPaths`: en WhatsApp una llave que no es ruta válida ({{1}},
      // {{año}}, {{nombre cliente}}) NO puede salir literal al cliente; se
      // reporta como faltante y el envío para en 422 (tester r2, defecto (a)).
      const r = renderVariables(content, ctx, { escapeHtml: false, strictPaths: true });
      if (r.missing.length) throw new WhatsAppError('MISSING_VARIABLES', `Faltan variables: ${r.missing.join(', ')}`, 422, { missing: r.missing });
      content = r.out.trim();
    }
    payload = { text: { body: content, preview_url: false } };
  }
  if (content.length > 4096) throw new WhatsAppError('VALIDATION', 'El mensaje supera 4096 caracteres', 400);

  // Horario permitido y límite diario (ajustes por org, ya cargados arriba)
  if (settings.allowed_hours && !input.scheduledAt && !isWithinAllowedHours(settings.allowed_hours, now)) {
    if (!(input.force && purpose === 'utility')) {
      const next = nextAllowedSlot(settings.allowed_hours, now);
      throw new WhatsAppError('OUTSIDE_HOURS', 'Fuera del horario permitido de contacto', 422, { next_slot: next.toISOString() });
    }
  }
  if (settings.daily_limit && input.source !== 'campaign') {
    const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const { count } = await service.from('messages').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('channel_id', channel.id).eq('direction', 'outbound').gte('created_at', since);
    if ((count ?? 0) >= settings.daily_limit) throw new WhatsAppError('DAILY_LIMIT', `Se alcanzó el límite diario de ${settings.daily_limit} mensajes`, 422);
  }

  // Programado → cola (kind 'whatsapp')
  if (input.scheduledAt && new Date(input.scheduledAt).getTime() > now.getTime() + 60_000) {
    const jobId = await enqueueJob({
      organizationId: orgId,
      kind: 'whatsapp',
      payload: { message_request: { ...input, scheduledAt: null, force: true }, customer_id: target.customerId },
      runAt: input.scheduledAt,
      dedupeKey: input.clientRequestId ? `whatsapp:${input.clientRequestId}` : undefined,
      maxAttempts: 3,
      supabase: service,
    });
    return { message_id: '', conversation_id: window.conversation_id ?? '', activity_id: null, customer_id: target.customerId, channel_id: channel.id, scheduled: true, job_id: jobId };
  }

  // Idempotencia real por `clientRequestId` (tester F16 r3 · N-5). Antes la
  // clave se guardaba en `messages.metadata` y NADIE la consultaba, así que no
  // servía de nada: si el proceso moría entre el INSERT (que dispara el envío
  // por `trg_channel_dispatch`) y la marca de enviado, el reintento mandaba el
  // mensaje OTRA VEZ. Se comprueba ANTES de descontar créditos e insertar.
  if (input.clientRequestId) {
    const previo = await findByClientRequestId(orgId, input.clientRequestId, service, now);
    if (previo) {
      return { message_id: previo.id, conversation_id: previo.conversation_id, activity_id: null, customer_id: target.customerId, channel_id: channel.id, scheduled: false, duplicate: true };
    }
  }

  // Créditos (NULL = ilimitado)
  const { data: ok, error: credErr } = await service.rpc('deduct_comm_credits', { p_org_id: orgId, p_channel: 'whatsapp', p_amount: 1 });
  if (!credErr && ok === false) throw new WhatsAppError('NO_CREDITS', 'Sin créditos de WhatsApp', 402);

  const conversationId = await findOrCreateConversation(orgId, target.customerId, channel.id, input.senderMemberId ?? null, target.opportunityId, service, input.conversationId);
  const role = input.role ?? 'agent';
  const { data: msg, error: msgErr } = await service
    .from('messages')
    .insert({
      organization_id: orgId,
      conversation_id: conversationId,
      channel_id: channel.id,
      direction: 'outbound',
      role,
      sender_member_id: input.senderMemberId ?? null,
      content_type: contentType,
      content,
      payload,
      is_read: true,
      related_opportunity_id: target.opportunityId,
      metadata: {
        source: input.source ?? 'crm',
        to: recipient,
        template_id: templateId,
        category,
        campaign_id: input.campaignId ?? null,
        client_request_id: input.clientRequestId ?? null,
        sent_by_user_id: input.senderUserId ?? null,
        window_open: window.is_open,
        provider: channel.provider,
      },
    })
    .select('id, created_at')
    .single();
  if (msgErr || !msg) throw new WhatsAppError('INTERNAL', `Error guardando mensaje: ${msgErr?.message}`, 500);
  const messageId = (msg as { id: string }).id;

  const activityId = await createWhatsAppActivity({ orgId, messageId, conversationId, customerId: target.customerId, opportunityId: target.opportunityId, userId: input.senderUserId ?? null, content, contentType, customerName: target.customerName, campaignId: input.campaignId ?? null, templateId }, service);

  await service.from('comm_usage_logs').insert({
    organization_id: orgId,
    channel: 'whatsapp',
    credits_used: 1,
    recipient,
    status: 'queued',
    direction: 'outbound',
    module: input.source === 'campaign' ? 'campaign' : 'crm',
    metadata: { message_id: messageId, campaign_id: input.campaignId ?? null, category, template_id: templateId, provider: channel.provider },
  }).then(({ error }) => { if (error) console.warn('[whatsapp] comm_usage_logs:', error.message); });

  return { message_id: messageId, conversation_id: conversationId, activity_id: activityId, customer_id: target.customerId, channel_id: channel.id, scheduled: false };
}

/**
 * Ventana de búsqueda de la clave de idempotencia. El reintento más lejano que
 * puede producirse es el rescate de un testigo caducado de campaña
 * (`STALE_CLAIM_MS`, 15 min); 7 días son de sobra y permiten que la consulta
 * use `idx_messages_organization (organization_id, created_at DESC)` en vez de
 * recorrer las 255.709 filas de `messages`.
 */
export const CLIENT_REQUEST_ID_WINDOW_MS = 7 * 24 * 3600 * 1000;

/** ¿Ya existe un saliente con esta clave de idempotencia en la organización? */
export async function findByClientRequestId(orgId: number, clientRequestId: string, service: SupabaseClient, now: Date = new Date()): Promise<{ id: string; conversation_id: string } | null> {
  const since = new Date(now.getTime() - CLIENT_REQUEST_ID_WINDOW_MS).toISOString();
  const { data } = await service
    .from('messages')
    .select('id, conversation_id')
    .eq('organization_id', orgId)
    .eq('direction', 'outbound')
    .gte('created_at', since)
    .eq('metadata->>client_request_id', clientRequestId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const row = data as { id: string; conversation_id: string } | null;
  return row?.id ? { id: row.id, conversation_id: row.conversation_id } : null;
}

export async function createWhatsAppActivity(
  p: { orgId: number; messageId: string; conversationId: string; customerId: string; opportunityId: string | null; userId: string | null; content: string; contentType: string; customerName: string; direction?: 'inbound' | 'outbound'; campaignId?: string | null; templateId?: string | null },
  service: SupabaseClient,
): Promise<string | null> {
  const direction = p.direction ?? 'outbound';
  const { data: existing } = await service.from('activities').select('id').eq('message_id', p.messageId).limit(1).maybeSingle();
  if (existing) return (existing as { id: string }).id;
  const { data, error } = await service
    .from('activities')
    .insert({
      organization_id: p.orgId,
      activity_type: 'whatsapp',
      channel: 'whatsapp',
      outcome: direction === 'inbound' ? 'received' : 'sent',
      user_id: p.userId,
      notes: direction === 'inbound' ? `WhatsApp de ${p.customerName}: ${p.content.slice(0, 500)}` : `WhatsApp a ${p.customerName}: ${p.content.slice(0, 500)}`,
      related_type: p.opportunityId ? 'opportunity' : 'customer',
      related_id: p.opportunityId ?? p.customerId,
      occurred_at: new Date().toISOString(),
      message_id: p.messageId,
      conversation_id: p.conversationId,
      metadata: { direction, content_type: p.contentType, customer_id: p.customerId, campaign_id: p.campaignId ?? null, template_id: p.templateId ?? null, message_id: p.messageId },
    })
    .select('id')
    .single();
  if (error) {
    console.warn('[whatsapp] No se pudo crear la activity:', error.message);
    return null;
  }
  return (data as { id: string }).id;
}

function guessMime(url: string): string {
  const u = url.toLowerCase().split('?')[0];
  if (/\.(png)$/.test(u)) return 'image/png';
  if (/\.(jpe?g)$/.test(u)) return 'image/jpeg';
  if (/\.(webp)$/.test(u)) return 'image/webp';
  if (/\.(pdf)$/.test(u)) return 'application/pdf';
  return 'application/octet-stream';
}
