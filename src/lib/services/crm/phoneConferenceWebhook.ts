import { getTwilioClientForOrg } from './voiceContextService';
import { buildHangupTwiml, EMPTY_TWIML, xmlResponse, escapeXml } from './twimlBuilders';
import { phoneWebhookContext, verifyPhoneInvitationLeg, verifyPhoneConference, phoneWebhookError } from './phoneConferenceWebhookContext';
import { joinedPhoneParticipant, leftPhoneParticipant, finishPhoneConference } from './phoneConferenceEvents';
import { mutatePhonePack, readPhonePack, publicPhoneState, type PhonePack, type PhoneInvite } from './phoneConferenceRepository';
import { nativePhoneConference, setNativePhoneHold } from './phoneConferenceProvider';
import { phoneCallback, phoneHeldSeconds } from './phoneConferenceControl';
import { normalizedHoldMusicUrl } from './phoneMusicUrl';

export async function conferenceStatus(request: Request): Promise<Response> {
  try {
    const context = await phoneWebhookContext(request, false);
    await verifyPhoneConference(context);
    const { service, params } = context;
    let pack = context.pack;
    const event = params.StatusCallbackEvent;
    if (event === 'conference-end') {
      if (!pack.session.conference_sid) pack = await mutatePhonePack(service, pack, () => ({ session: { conference_sid: params.ConferenceSid } }));
      await finishPhoneConference(service, pack);
    } else if (event === 'participant-join') {
      const invite = pack.invites?.find((row) => row.id === params.ParticipantLabel && (!row.call_sid || row.call_sid === params.CallSid));
      if (!invite) throw new Error('El participante no tiene invitación');
      const { client } = await getTwilioClientForOrg(pack.session.organization_id);
      const actual = await client.conferences(params.ConferenceSid).participants(params.CallSid).fetch();
      if (actual.status !== 'connected' || actual.callSid !== params.CallSid || actual.conferenceSid !== params.ConferenceSid || actual.label !== invite.id) {
        throw new Error('La unión del participante no está confirmada');
      }
      await joinedPhoneParticipant(service, pack, invite.id, params.CallSid, params.ConferenceSid);
    } else if (event === 'participant-leave') {
      const invite = pack.invites?.find((row) => row.call_sid === params.CallSid);
      if (invite) await terminalPhoneInvitation(service, pack, invite, params.CallSid);
    } else if (event === 'conference-start' && !pack.session.conference_sid) {
      await mutatePhonePack(service, pack, () => ({ session: { conference_sid: params.ConferenceSid } }));
    }
    return xmlResponse(EMPTY_TWIML);
  } catch (error) { return phoneWebhookError(error); }
}

async function transferFailed(context: Awaited<ReturnType<typeof phoneWebhookContext>>): Promise<void> {
  let { pack } = context;
  const { service, invitation } = context;
  if (!invitation || pack.session.transfer_invite_id !== invitation.id || pack.session.transfer_status === 'confirmed') return;
  const native = await nativePhoneConference({ organizationId: pack.session.organization_id, callId: pack.call.id,
    conferenceSid: pack.session.conference_sid ?? '', customerSid: pack.session.customer_sid ?? '', agentSid: pack.session.agent_sid ?? '' });
  await setNativePhoneHold(native, pack.session.transfer_restore_held, phoneCallback('music', pack.call.id), pack.session.pre_hold_muted);
  pack = await readPhonePack(service, pack.session.organization_id, pack.call.id) ?? pack;
  await mutatePhonePack(service, pack, (fresh) => {
    if (fresh.session.transfer_invite_id !== invitation.id || fresh.session.transfer_status === 'confirmed' || fresh.call.ended_at) throw new Error('La transferencia cambió');
    const session = { phase: fresh.session.transfer_restore_held ? 'held' as const : 'active' as const,
      held_at: fresh.session.transfer_restore_held ? fresh.session.held_at : null,
      hold_seconds: fresh.session.transfer_restore_held ? fresh.session.hold_seconds : phoneHeldSeconds(fresh),
      transfer_status: 'failed' as const, active_operation_id: null };
    return { session, inviteId: invitation.id, invite: { state: 'failed' },
      ...(fresh.operation && fresh.session.active_operation_id ? { operationId: fresh.operation.id, operationState: 'failed' as const,
        result: publicPhoneState({ ...fresh, session: { ...fresh.session, ...session } }) } : {}) };
  });
}

/** Una salida se aplica junto con la transición de sesión que la hace coherente. */
export async function terminalPhoneInvitation(service: Parameters<typeof readPhonePack>[0], initial: PhonePack, invite: PhoneInvite, sid: string): Promise<void> {
  let pack = await readPhonePack(service, initial.session.organization_id, initial.call.id) ?? initial;
  const main = invite.role === 'customer' || pack.session.agent_sid === sid;
  if (main) {
    await leftPhoneParticipant(service, pack, sid);
    pack = await readPhonePack(service, pack.session.organization_id, pack.call.id) ?? pack;
  } else if (invite.role === 'transfer' && pack.session.transfer_invite_id === invite.id && pack.session.phase !== 'ended') {
    if (pack.session.transfer_status === 'confirmed' && pack.session.transfer_mode === 'consult') {
      await mutatePhonePack(service, pack, (fresh) => {
        if (fresh.session.transfer_invite_id !== invite.id || fresh.session.transfer_status !== 'confirmed'
          || fresh.session.transfer_mode !== 'consult' || fresh.session.phase === 'ended') return { session: {} };
        return { session: { transfer_invite_id: null, transfer_mode: null, transfer_status: null, transfer_name: null },
          inviteId: invite.id, invite: { state: 'failed', call_sid: sid } };
      });
      return;
    }
    if (pack.session.transfer_status !== 'confirmed') {
      await transferFailed({ service, pack, invitation: invite } as Awaited<ReturnType<typeof phoneWebhookContext>>);
      return;
    }
  }
  pack = await mutatePhonePack(service, pack, (fresh) => {
    const saved = fresh.invites?.find((row) => row.id === invite.id);
    // La salida del agente anterior durante el traspaso se acredita después de
    // cambiar el propietario; nunca degrada la invitación de destino conectada.
    if (saved?.role === 'transfer' && fresh.session.transfer_invite_id === saved.id && fresh.session.transfer_status === 'connected'
      && fresh.session.phase !== 'ended') return { session: {} };
    return { session: {}, inviteId: invite.id, invite: { call_sid: sid, state: saved?.state === 'declined' ? 'declined' : 'failed' } };
  });
  if (pack.session.direction === 'inbound' && !pack.session.agent_sid && pack.session.phase !== 'ended') {
    const agents = pack.invites?.filter((row) => row.role === 'agent') ?? [];
    if (agents.length && agents.every((row) => ['declined', 'failed'].includes(row.state)) && pack.session.conference_sid) {
      const { client } = await getTwilioClientForOrg(pack.session.organization_id);
      await client.conferences(pack.session.conference_sid).update({ status: 'completed' });
      await finishPhoneConference(service, pack);
    }
  }
}

export async function conferenceLegStatus(request: Request): Promise<Response> {
  try {
    const context = await phoneWebhookContext(request, true);
    await verifyPhoneInvitationLeg(context);
    const { service, invitation, params } = context;
    if (!invitation) throw new Error('Invitación no encontrada');
    const terminal = ['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(params.CallStatus);
    if (terminal) {
      const { client } = await getTwilioClientForOrg(context.pack.session.organization_id);
      const actual = await client.calls(params.CallSid).fetch();
      if (['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(actual.status)) {
        await terminalPhoneInvitation(service, context.pack, invitation, params.CallSid);
      }
    } else {
      await mutatePhonePack(service, context.pack, (fresh) => {
        const current = fresh.invites?.find((row) => row.id === invitation.id);
        const state = current && ['joined', 'declined', 'failed'].includes(current.state) ? current.state : 'ringing';
        return { session: {}, inviteId: invitation.id, invite: { call_sid: params.CallSid, state } };
      });
    }
    return xmlResponse(EMPTY_TWIML);
  } catch (error) { return phoneWebhookError(error); }
}

export async function conferenceLeave(request: Request): Promise<Response> {
  try {
    const context = await phoneWebhookContext(request, true);
    await verifyPhoneInvitationLeg(context);
    if (context.invitation) await terminalPhoneInvitation(context.service, context.pack, context.invitation, context.params.CallSid);
    return xmlResponse(buildHangupTwiml());
  } catch (error) { return phoneWebhookError(error); }
}

export async function conferenceMusic(request: Request): Promise<Response> {
  try {
    const context = await phoneWebhookContext(request, false);
    const { data, error } = await context.service.from('comm_settings').select('voice_agent_config')
      .eq('organization_id', context.pack.session.organization_id).maybeSingle();
    if (error) throw error;
    const configured = (data?.voice_agent_config as Record<string, unknown> | undefined)?.hold_url;
    const url = normalizedHoldMusicUrl(configured) ?? 'https://twimlets.com/holdmusic?Bucket=com.twilio.music.classical';
    return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="GET">${escapeXml(url)}</Redirect></Response>`);
  } catch (error) { return phoneWebhookError(error); }
}

/** Adaptación de /voice/status heredado: su SID debe ser una pata privada actual. */
export async function handlePhoneLegacyLeg(client: Parameters<typeof readPhonePack>[0], org: number, callId: string,
  sid: string, status: string, accountSid: string): Promise<boolean> {
  const pack = await readPhonePack(client, org, callId);
  if (!pack) return false;
  const invitation = pack.invites?.find((row) => row.call_sid === sid);
  if (!invitation) throw new Error('El SID no está vinculado a la conferencia');
  const { client: provider, creds } = await getTwilioClientForOrg(org);
  const actual = await provider.calls(sid).fetch();
  if (actual.accountSid !== creds.accountSid || actual.accountSid !== accountSid) throw new Error('La pata no pertenece a la cuenta');
  if (['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(status)
    && ['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(actual.status)) await terminalPhoneInvitation(client, pack, invitation, sid);
  return true;
}
