import type { SupabaseClient } from '@supabase/supabase-js';
import { getTwilioClientForOrg, getTelephonySettings, pickCallerId, orgOwnsCallerId } from './voiceContextService';
import { getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { buildPhoneConferenceTwiml } from './phoneConferenceTwiml';
import { buildVoiceIdentity } from './voiceTokenService';
import { phoneCallback } from './phoneConferenceControl';
import { preparePhonePack, readPhonePack, mutatePhonePack, phoneRpc, type PhoneInvite, type PhonePack } from './phoneConferenceRepository';
import { emitInboundCallContext } from './inboundCallPushService';
import { CrmHttpError } from './crmErrors';
import { claimPhoneCustomerRecording } from './phoneConferenceJoin';

class InvitationAlreadyDispatched extends Error {}
interface Target { user_id: string; name: string; destination: string }

async function invite(client: SupabaseClient, pack: PhonePack, role: PhoneInvite['role'], destination: string, user: string | null, name: string): Promise<PhoneInvite> {
  const { invite: created } = await phoneRpc<{ invite: PhoneInvite }>(client, 'fn_phone_invite', {
    p_org: pack.session.organization_id, p_call: pack.call.id, p_operation: null,
    p_payload: { role, user_id: user, destination, display_name: name },
  });
  return created;
}

/** Una invitación se despacha una vez. Un timeout queda incierto hasta su callback firmado. */
async function dispatchInitial(client: SupabaseClient, pack: PhonePack, invitation: PhoneInvite, callerId: string, timeout: number): Promise<void> {
  if (invitation.state !== 'reserved') return;
  let fresh = await readPhonePack(client, pack.session.organization_id, pack.call.id);
  if (!fresh) throw new Error('No existe la conferencia');
  try {
    fresh = await mutatePhonePack(client, fresh, (current) => {
      const saved = current.invites?.find((row) => row.id === invitation.id);
      if (!saved || saved.state !== 'reserved') throw new InvitationAlreadyDispatched();
      return { session: {}, inviteId: invitation.id, invite: { state: 'dispatched' } };
    });
  } catch (error) { if (error instanceof InvitationAlreadyDispatched) return; throw error; }
  const { client: twilio, creds } = await getTwilioClientForOrg(pack.session.organization_id);
  try {
    const created = await twilio.calls.create({ from: callerId, to: invitation.destination,
      url: phoneCallback('join', pack.call.id, invitation.id), method: 'POST', record: false,
      timeout, statusCallback: phoneCallback('leg-status', pack.call.id, invitation.id), statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'] });
    if (!/^CA[0-9a-f]{32}$/i.test(created.sid) || created.accountSid !== creds.accountSid) throw new Error('Respuesta de invitación incierta');
    await mutatePhonePack(client, fresh, (current) => {
      const saved = current.invites?.find((row) => row.id === invitation.id);
      if (saved?.call_sid && saved.call_sid !== created.sid) throw new Error('La invitación cambió de pata');
      return { session: {}, inviteId: invitation.id,
        invite: { call_sid: created.sid, state: saved && ['joined', 'declined', 'failed'].includes(saved.state) ? saved.state : 'ringing' } };
    });
  } catch (error) {
    const current = await readPhonePack(client, pack.session.organization_id, pack.call.id);
    if (current && current.invites?.find((row) => row.id === invitation.id)?.state === 'dispatched') {
      await mutatePhonePack(client, current, () => ({ session: {}, inviteId: invitation.id, invite: { state: 'unknown' } }));
    }
    throw error;
  }
}

export async function startOutboundPhoneConference(client: SupabaseClient, org: number, callId: string): Promise<string> {
  const pack = await preparePhonePack(client, org, callId);
  if (!pack.call.user_id || !pack.call.provider_call_sid || !pack.call.to_number || !pack.call.from_number) throw new Error('Falta la pata del agente');
  const agent = pack.invites?.find((row) => row.role === 'agent' && row.call_sid === pack.call.provider_call_sid)
    ?? await invite(client, pack, 'agent', `client:${buildVoiceIdentity(pack.call.user_id, org)}`, pack.call.user_id, '');
  const customer = pack.invites?.find((row) => row.role === 'customer')
    ?? await invite(client, pack, 'customer', pack.call.to_number, null, '');
  const settings = await getTelephonySettings(org, client);
  await dispatchInitial(client, pack, customer, pack.call.from_number, settings.voice_ring_timeout_seconds);
  return buildPhoneConferenceTwiml({ origin: getTwilioWebhookOrigin(), organizationId: org, callId,
    role: 'agent', inviteId: agent.id, muted: false, announcement: pack.call.recording_enabled ? settings.voice_consent_message : null });
}

export async function startInboundPhoneConference(client: SupabaseClient, org: number, callId: string, users: string[]): Promise<string> {
  const pack = await preparePhonePack(client, org, callId);
  const customer = pack.invites?.find((row) => row.role === 'customer')
    ?? await invite(client, pack, 'customer', pack.call.from_number, null, '');
  const settings = await getTelephonySettings(org, client);
  const caller = await pickCallerId(org, settings, client);
  if (!caller.e164 || !(await orgOwnsCallerId(org, caller.e164, settings, client))) throw new CrmHttpError(409, 'sin_numero_propio', 'La organización no tiene un número de atención');
  const targets = (await Promise.all(users.slice(0, 10).map((user) => phoneRpc<Target | null>(client, 'fn_phone_target', { p_org: org, p_user: user })))).filter((value): value is Target => value !== null);
  if (!targets.length) throw new CrmHttpError(409, 'sin_agentes_disponibles', 'No hay agentes disponibles para atender');
  const dispatches = await Promise.allSettled(targets.map(async (target) => {
    const agent = await invite(client, pack, 'agent', target.destination, target.user_id, target.name);
    await dispatchInitial(client, pack, agent, caller.e164!, settings.voice_ring_timeout_seconds);
  }));
  if (dispatches.every((result) => result.status === 'rejected')) throw new Error('No pudimos confirmar ninguna invitación de atención');
  try { await emitInboundCallContext({ id: callId, organization_id: org }, targets.map((target) => target.user_id), client); }
  catch (error) { console.warn('[phone] contexto push no entregado', { org, error: error instanceof Error ? error.message : 'error' }); }
  const fresh = await readPhonePack(client, org, callId);
  if (!fresh) throw new Error('La conferencia dejó de existir');
  const recording = await claimPhoneCustomerRecording(client, fresh);
  return buildPhoneConferenceTwiml({ origin: getTwilioWebhookOrigin(), organizationId: org, callId,
    role: 'customer', inviteId: customer.id, muted: false, recording });
}
