/**
 * Lotes (campañas F16): ≤100 correos por `resend.batch.send`, SIN adjuntos.
 * Cada correo tiene su fila email_messages (render individual con contexto
 * real) y `fn_can_contact` se comprueba por destinatario.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { EmailError, type EmailMessage } from './types';
import { resolveSender } from './domainsService';
import { getResendClient, getResendRateLimiter } from './resendClient';
import { buildResendPayload, canContact, deliver } from './sendService';
import { markFailed, mergeMeta } from './messageStore';
import { campaignDispatch, checkDeliveryBudget, isCampaignBridgeMessage, type DeliveryBudget } from './campaignDispatch';

export interface BatchResult {
  sent: string[];
  /**
   * `retryable: true` = la fila sigue en `pending` y se volverá a intentar (el
   * grupo lanzó antes de llegar al proveedor: `resolveSender`, cliente, BD…).
   * Sin `retryable`, la fila ya quedó `failed` y no se reintenta sola.
   */
  failed: Array<{ email_message_id: string; error: string; retryable?: boolean }>;
  skipped: Array<{ email_message_id: string; reason: string }>;
}

/**
 * Envía filas `email_messages` ya creadas (status pending, sin adjuntos) en un
 * solo `batch.send`. Ids con adjuntos → skipped (deben ir por `email`).
 */
export async function sendPendingBatch(orgId: number, emailMessageIds: string[], service: SupabaseClient, budget: DeliveryBudget = {}): Promise<BatchResult> {
  if (emailMessageIds.length === 0) return { sent: [], failed: [], skipped: [] };
  if (emailMessageIds.length > 100) throw new EmailError('VALIDATION', 'Máximo 100 correos por lote', 400);
  checkDeliveryBudget(budget);
  const { data, error } = await service.from('email_messages').select('*').eq('organization_id', orgId).in('id', emailMessageIds);
  if (error) throw new EmailError('DB', `Lote de correo: ${error.message}`, 503);
  const rows = (data ?? []) as EmailMessage[];
  const result: BatchResult = { sent: [], failed: [], skipped: [] };
  const ready: EmailMessage[] = [];
  for (const m of rows) {
    if (m.organization_id !== orgId) throw new EmailError('DB', 'Correo de otra organización en el lote', 503);
    if (m.status !== 'pending' || m.provider_message_id) { result.skipped.push({ email_message_id: m.id, reason: `status_${m.status}` }); continue; }
    if ((m.metadata?.attachments ?? []).length > 0) { result.skipped.push({ email_message_id: m.id, reason: 'has_attachments' }); continue; }
    if (!isCampaignBridgeMessage(m) && m.to_customer_id && !(await canContact(orgId, m.to_customer_id, service, m.metadata?.kind ?? 'marketing'))) {
      await markFailed(m, 'CONTACT_OPTED_OUT', service);
      result.skipped.push({ email_message_id: m.id, reason: 'opted_out' });
      continue;
    }
    ready.push(m);
  }
  if (ready.length === 0) return result;

  // Un lote puede mezclar dominios/kind (campañas de F16 con varios remitentes).
  // Antes se resolvía UN solo remitente con `ready[0]` y todos los correos
  // salían con ese `from`/`Reply-To` (tester r1 #6): se agrupa y se envía un
  // `batch.send` por grupo.
  //
  // Cada grupo se aísla (tester r2, fallo nuevo #3 — regresión de la ronda 2):
  // sin try/catch, un grupo que lanzaba dejaba al anterior YA enviado, al
  // siguiente sin intentar y perdía el `BatchResult` con la excepción; encima
  // el handler de jobs convertía el `EmailError` en `JobFatalError`, así que
  // esos correos se quedaban en `pending` para siempre.
  //
  // Ahora: el fallo de un grupo no impide intentar los demás, el resultado
  // parcial SIEMPRE se devuelve (esta función no lanza una vez empezó el envío)
  // y las filas del grupo que falló se dejan en `pending` (marcadas
  // `retryable`) para que el reintento del job las recoja. El reintento es
  // idempotente: lo ya enviado sale por `status_sent` en `skipped`.
  for (const [key, group] of groupBySender(ready)) {
    try {
      checkDeliveryBudget(budget);
      const regular = group.filter(m => !isCampaignBridgeMessage(m));
      if (regular.length) await sendOneGroup(orgId, regular, service, result);
      // La clave de un lote cambia al reintentar sólo parte de él. Una campaña usa
      // deliver individual nativo (email/{id}) para recuperar timeouts sin duplicar.
      for (const message of group.filter(isCampaignBridgeMessage)) {
        try {
          checkDeliveryBudget(budget);
          const sender = await resolveSender(orgId, { domainId: message.metadata?.email_domain_id ?? null, userId: message.metadata?.from_user_id ?? null, kind: message.metadata?.kind ?? 'marketing' }, service);
          const delivered = await deliver(message, sender, [], service, undefined, budget);
          if (!delivered.provider_message_id) throw new EmailError('DB', 'Entrega de correo sin recibo de proveedor', 503);
          result.sent.push(message.id);
        } catch (err) {
          if (err instanceof EmailError && err.code === 'NO_SENDER') {
            await campaignDispatch(message, 'blocked', service, undefined, undefined, 'email_sender_unavailable');
            result.skipped.push({ email_message_id: message.id, reason: 'email_sender_unavailable' });
          }
          else if (err instanceof EmailError && err.code === 'CAMPAIGN_NOT_READY') result.skipped.push({ email_message_id: message.id, reason: err.message });
          else result.failed.push({ email_message_id: message.id, error: err instanceof Error ? err.message : String(err), retryable: !(err instanceof EmailError && err.code === 'PROVIDER') });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[emailBatch] grupo fallido, se reintentará', { orgId, group: key, ids: group.map((m) => m.id), error: message });
      for (const m of group) {
        if (!result.sent.includes(m.id) && !result.skipped.some(r => r.email_message_id === m.id) && !result.failed.some(r => r.email_message_id === m.id)) result.failed.push({ email_message_id: m.id, error: message, retryable: true });
      }
    }
  }
  return result;
}

/** Clave de agrupación: dominio de envío + tipo (marketing/sequence/…). */
export function senderGroupKey(m: EmailMessage): string {
  return `${m.metadata?.email_domain_id ?? 'default'}::${m.metadata?.kind ?? 'marketing'}`;
}

export function groupBySender(rows: EmailMessage[]): Map<string, EmailMessage[]> {
  const groups = new Map<string, EmailMessage[]>();
  for (const m of rows) {
    const key = senderGroupKey(m);
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }
  return groups;
}

async function sendOneGroup(orgId: number, group: EmailMessage[], service: SupabaseClient, result: BatchResult): Promise<void> {
  const kind = group[0].metadata?.kind ?? 'marketing';
  const sender = await resolveSender(orgId, { domainId: group[0].metadata?.email_domain_id ?? null, kind }, service);
  const resend = getResendClient(sender.apiKey);
  await getResendRateLimiter().wait();
  const payloads = group.map((m) => buildResendPayload(m, sender, []));
  const { data: res, error } = await resend.batch.send(payloads as Parameters<typeof resend.batch.send>[0], { idempotencyKey: `email_batch/${group.map((m) => m.id).join(',').slice(0, 200)}` });
  if (error || !res) {
    for (const m of group) {
      await markFailed(m, `Resend batch: ${error?.message ?? 'sin respuesta'}`, service);
      result.failed.push({ email_message_id: m.id, error: error?.message ?? 'batch_failed' });
    }
    return;
  }
  const ids = (res as { data?: Array<{ id: string }> }).data ?? [];
  const now = new Date().toISOString();
  for (let i = 0; i < group.length; i++) {
    const providerId = ids[i]?.id;
    if (providerId) {
      await mergeMeta(group[i], {}, { provider_message_id: providerId, status: 'sent', sent_at: now }, service);
      result.sent.push(group[i].id);
    } else {
      result.failed.push({ email_message_id: group[i].id, error: 'no_id_in_batch_response' });
    }
  }
}
