import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyTwilioWebhook, WebhookError } from '@/lib/security/webhookSignatures';
import { verifyBridgeToken } from './bridgeTokens';
import { exigirUuid } from './crmErrors';
import { getTwilioClientForOrg, accountSidMatchesOrg } from './voiceContextService';
import { phoneConferenceName } from './phoneConferenceTwiml';
import { readPhonePack, phoneRpc, type PhonePack, type PhoneInvite } from './phoneConferenceRepository';

export interface PhoneWebhookContext { service: SupabaseClient; pack: PhonePack; params: Record<string, string>; accountSid: string; invitation: PhoneInvite | null }

export async function phoneWebhookContext(request: Request, inviteRequired: boolean): Promise<PhoneWebhookContext> {
  const { params, accountSid } = await verifyTwilioWebhook(request);
  const query = new URL(request.url).searchParams;
  const callId = exigirUuid(query.get('callId') ?? '');
  const inviteId = query.get('inviteId');
  const resource = inviteRequired ? `phone-invite:${exigirUuid(inviteId ?? '')}` : `phone-call:${callId}`;
  if (!verifyBridgeToken(resource, query.get('token'))) throw new WebhookError(403, 'PHONE_TOKEN_INVALID', 'Token de conferencia inválido');
  const service = getServiceClient();
  let pack: PhonePack | null;
  let invitation: PhoneInvite | null = null;
  if (inviteRequired) {
    const result = await phoneRpc<PhonePack | null>(service, 'fn_phone_get_invite', { p_invite: inviteId });
    pack = result;
    invitation = result?.invite ?? null;
  } else {
    const { data, error } = await service.from('calls').select('organization_id').eq('id', callId).maybeSingle();
    if (error) throw error;
    pack = data ? await readPhonePack(service, data.organization_id, callId) : null;
  }
  if (!pack || pack.call.id !== callId || pack.session.call_id !== callId || pack.call.organization_id !== pack.session.organization_id
    || (inviteRequired && (!invitation || invitation.call_id !== callId || invitation.organization_id !== pack.session.organization_id))) {
    throw new WebhookError(404, 'PHONE_NOT_FOUND', 'Conferencia no encontrada');
  }
  if (!(await accountSidMatchesOrg(pack.session.organization_id, accountSid, service))) throw new WebhookError(403, 'PHONE_ACCOUNT_INVALID', 'Cuenta ajena');
  return { service, pack, params, accountSid, invitation };
}

/** La firma del transporte no sustituye la vinculación del SID con el destino privado. */
export async function verifyPhoneInvitationLeg(context: PhoneWebhookContext): Promise<void> {
  const { pack, invitation, params, accountSid } = context;
  if (!invitation || !/^CA[0-9a-f]{32}$/i.test(params.CallSid ?? '')) throw new WebhookError(403, 'PHONE_LEG_INVALID', 'Pata inválida');
  if (invitation.call_sid && invitation.call_sid !== params.CallSid) throw new WebhookError(403, 'PHONE_LEG_INVALID', 'Pata ajena');
  const { client, creds } = await getTwilioClientForOrg(pack.session.organization_id);
  const actual = await client.calls(params.CallSid).fetch();
  if (actual.sid !== params.CallSid || actual.accountSid !== creds.accountSid || actual.accountSid !== accountSid) {
    throw new WebhookError(403, 'PHONE_LEG_INVALID', 'Cuenta de pata ajena');
  }
  // Las patas iniciales conocidas se acreditaron al crear calls desde el webhook autenticado.
  const knownInitial = invitation.call_sid === pack.call.provider_call_sid;
  if (!knownInitial && actual.to !== invitation.destination) throw new WebhookError(403, 'PHONE_LEG_INVALID', 'Destino de pata ajeno');
}

export async function verifyPhoneConference(context: PhoneWebhookContext): Promise<void> {
  const { pack, params, accountSid } = context;
  if (!/^CF[0-9a-f]{32}$/i.test(params.ConferenceSid ?? '')
    || (pack.session.conference_sid && pack.session.conference_sid !== params.ConferenceSid)) {
    throw new WebhookError(403, 'PHONE_CONFERENCE_INVALID', 'Conferencia ajena');
  }
  const { client, creds } = await getTwilioClientForOrg(pack.session.organization_id);
  const actual = await client.conferences(params.ConferenceSid).fetch();
  if (actual.accountSid !== accountSid || actual.accountSid !== creds.accountSid
    || actual.friendlyName !== phoneConferenceName(pack.session.organization_id, pack.call.id)) {
    throw new WebhookError(403, 'PHONE_CONFERENCE_INVALID', 'Conferencia ajena');
  }
}

export function phoneWebhookError(error: unknown): Response {
  if (error instanceof WebhookError) return new Response('Forbidden', { status: error.statusCode });
  console.error('[phone] callback no confirmado', error instanceof Error ? error.message : 'error');
  return new Response('Callback pending', { status: 500 });
}
