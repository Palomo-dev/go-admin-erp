import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UUID_RE, exigirUuid } from './crmErrors';

export const INBOUND_PUSH_TYPE = 'crm_inbound_call';
/** Clave estable por llamada y destinatario: reintentar no duplica el push. */
export function inboundNotificationId(callId: string, userId: string, organizationId: number): string {
  exigirUuid(callId); exigirUuid(userId);
  if (!Number.isSafeInteger(organizationId) || organizationId < 1) throw new Error('organizacion_invalida');
  const bytes = createHash('sha256').update(`crm-inbound:${organizationId}:${callId.toLowerCase()}:${userId.toLowerCase()}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Solo lo llama el webhook ya autenticado; nunca acepta destinatarios del navegador. */
export async function emitInboundCallContext(
  call: { id: string; organization_id: number }, recipients: string[], client: SupabaseClient,
): Promise<{ notifiedUserIds: string[] }> {
  exigirUuid(call.id);
  if (!Number.isSafeInteger(call.organization_id) || call.organization_id < 1) throw new Error('organizacion_invalida');
  const userIds = [...new Set(recipients.filter(id => UUID_RE.test(id)).map(id => id.toLowerCase()))];
  if (userIds.length > 100) throw new Error('demasiados_destinatarios');
  if (!userIds.length) return { notifiedUserIds: [] };
  const fresh = await client.from('calls').select('id, direction, status')
    .eq('id', call.id).eq('organization_id', call.organization_id).maybeSingle();
  if (fresh.error) throw fresh.error;
  if (!fresh.data || fresh.data.direction !== 'inbound' || !['dialing', 'ringing'].includes(fresh.data.status)) return { notifiedUserIds: [] };
  const members = await client.from('organization_members').select('user_id')
    .eq('organization_id', call.organization_id).eq('is_active', true).in('user_id', userIds);
  if (members.error) throw members.error;
  const active = new Set((members.data ?? []).map(member => member.user_id as string));
  const valid = userIds.filter(id => active.has(id));
  if (!valid.length) return { notifiedUserIds: [] };
  const notifications = valid.map(userId => ({
    id: inboundNotificationId(call.id, userId, call.organization_id), organization_id: call.organization_id,
    recipient_user_id: userId, channel: 'push', status: 'pending',
    // La pantalla bloqueada no recibe nombres ni números. El contexto se vuelve a autorizar en servidor.
    payload: { type: INBOUND_PUSH_TYPE, title: 'GO Admin', body: '📞',
      data: { type: INBOUND_PUSH_TYPE, call_id: call.id, organization_id: String(call.organization_id),
        url: `/app/crm/llamadas?incoming=${call.id}` } },
  }));
  const result = await client.from('notifications').upsert(notifications, { onConflict: 'id', ignoreDuplicates: true });
  if (result.error) throw result.error;
  return { notifiedUserIds: valid };
}
