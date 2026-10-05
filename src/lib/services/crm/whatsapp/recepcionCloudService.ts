import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppWebhookContact, WhatsAppWebhookMessage } from '@/lib/services/integrations/whatsapp/whatsappCloudTypes';
import { getServiceClient } from '@/lib/supabase/server-service';
import { defaultCountryOf, findCustomerIdByPhone, getOrgSettings, normalizePhoneDigits } from './channelService';
import { errorWhatsAppDb } from './erroresDbLogica';
import { extractInboundText, inboundContentType, type InboundResult } from './inboundService';
import { WhatsAppError } from './types';

interface CustomerProof {
  id: string;
  phone: string | null;
  status: string;
  resolved_id: string;
  resolved_phone: string | null;
  phone_matches: boolean;
}

export interface CloudInboundResult extends InboundResult {
  message_id: string;
  customer_id: string;
  conversation_id: string;
  duplicate: boolean;
}

/** Lecturas propias para CAS; ninguna escritura parcial desde el adaptador. */
async function customerProof(orgId: number, channelId: string, digits: string, service: SupabaseClient): Promise<CustomerProof | null> {
  const settings = await getOrgSettings(orgId, service);
  const defaultCountry = defaultCountryOf(settings);
  const identity = await service.from('customer_channel_identities').select('customer_id')
    .eq('organization_id', orgId).eq('channel_id', channelId)
    .eq('identity_type', 'whatsapp_phone').eq('identity_value', digits).maybeSingle();
  if (identity.error) throw errorWhatsAppDb(identity.error);
  const id = identity.data?.customer_id ?? await findCustomerIdByPhone(orgId, digits, service, { defaultCountry });
  if (!id) return null;
  const source = await service.from('customers').select('id, phone, status')
    .eq('organization_id', orgId).eq('id', id).maybeSingle();
  if (source.error) throw errorWhatsAppDb(source.error);
  if (!source.data) throw new WhatsAppError('NOT_FOUND', 'El cliente de la identidad no está disponible', 404);
  let resolved = source.data;
  if (source.data.status === 'merged') {
    // La fusión canónica impide cadenas mientras exista una restauración pendiente.
    const merge = await service.from('customer_merges').select('primary_customer_id')
      .eq('organization_id', orgId).eq('secondary_customer_id', id).is('undone_at', null).maybeSingle();
    if (merge.error) throw errorWhatsAppDb(merge.error);
    if (!merge.data?.primary_customer_id) throw new WhatsAppError('NOT_EDITABLE', 'La fusión del cliente cambió', 409);
    const primary = await service.from('customers').select('id, phone, status')
      .eq('organization_id', orgId).eq('id', merge.data.primary_customer_id).maybeSingle();
    if (primary.error) throw errorWhatsAppDb(primary.error);
    if (!primary.data || primary.data.status === 'merged') throw new WhatsAppError('NOT_EDITABLE', 'El cliente principal cambió', 409);
    resolved = primary.data;
  }
  return {
    id: source.data.id, phone: source.data.phone, status: source.data.status,
    resolved_id: resolved.id, resolved_phone: resolved.phone,
    phone_matches: normalizePhoneDigits(resolved.phone, defaultCountry) === digits,
  };
}

/** Firma, canal y organización deben estar autorizados por el consumidor del webhook. */
export async function receiveWhatsAppCloud(
  orgId: number, channelId: string, message: WhatsAppWebhookMessage,
  contacts: WhatsAppWebhookContact[] | undefined, payload: Record<string, unknown>,
  service: SupabaseClient = getServiceClient(),
): Promise<CloudInboundResult> {
  const digits = normalizePhoneDigits(message.from);
  if (!digits || digits !== message.from || !message.id) throw new WhatsAppError('VALIDATION', 'Remitente Cloud inválido', 400);
  const contact = contacts?.find((item) => normalizePhoneDigits(item.wa_id) === digits);
  // El replay lo decide la evidencia privada en SQL, incluso tras una fusión o edición del mensaje.
  const receipt = await service.from('crm_inbound_message_receipts').select('message_id')
    .eq('organization_id', orgId).eq('channel_id', channelId).eq('provider_external_id', message.id).maybeSingle();
  if (receipt.error) throw errorWhatsAppDb(receipt.error);
  const proof = receipt.data ? null : await customerProof(orgId, channelId, digits, service);
  const { data, error } = await service.rpc('crm_receive_whatsapp_cloud', {
    p_org: orgId, p_channel: channelId, p_request: {
      external_id: message.id, phone_digits: digits, raw: message,
      content: extractInboundText(message) || '[mensaje]', content_type: inboundContentType(message.type),
      payload, profile_name: contact?.profile?.name || digits, customer_proof: proof,
    },
  });
  if (error) throw errorWhatsAppDb(error);
  const result = data as Partial<CloudInboundResult> | null;
  if (!result || typeof result.duplicate !== 'boolean' || !['none', 'opted_in', 'opted_out'].includes(String(result.consent))
    || !['message_id', 'customer_id', 'conversation_id', 'activity_id'].every((key) => typeof (result as Record<string, unknown>)[key] === 'string')
    || !['campaign_id', 'opportunity_id', 'notified_user_id'].every((key) => {
      const value = (result as Record<string, unknown>)[key]; return value === null || typeof value === 'string';
    })) throw new WhatsAppError('INTERNAL', 'Respuesta inválida de la recepción Cloud', 500);
  return result as CloudInboundResult;
}
