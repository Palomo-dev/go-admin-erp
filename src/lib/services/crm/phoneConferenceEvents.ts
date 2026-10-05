import type { SupabaseClient } from '@supabase/supabase-js';
import { applyStatusEvent, isTerminalStatus, mergeTerminalOutcome } from './callStateMachine';
import { settleVoiceCall } from './callCreditsService';
import { getTwilioClientForOrg } from './voiceContextService';
import { phoneHeldSeconds, phoneCallback } from './phoneConferenceControl';
import { nativePhoneConference, setNativePhoneHold } from './phoneConferenceProvider';
import { mutatePhonePack, readPhonePack, publicPhoneState, type PhonePack, type PhoneInvite, type PhonePatch } from './phoneConferenceRepository';

function stateSnapshot(pack: PhonePack) {
  return { status: pack.call.status, answered_at: pack.call.answered_at, started_at: pack.call.started_at, metadata: pack.call.metadata ?? {} };
}
function invitation(pack: PhonePack, id: string): PhoneInvite {
  const invite = pack.invites?.find((row) => row.id === id);
  if (!invite) throw new Error('No pudimos localizar la invitación');
  return invite;
}

/** El cierre canónico viene de la conferencia, nunca de la salida del agente transferido. */
export async function finishPhoneConference(client: SupabaseClient, initial: PhonePack): Promise<PhonePack> {
  const { client: provider, creds } = await getTwilioClientForOrg(initial.session.organization_id);
  if (!initial.session.conference_sid) throw new Error('La conferencia no tiene SID confirmado');
  const actual = await provider.conferences(initial.session.conference_sid).fetch();
  if (actual.accountSid !== creds.accountSid || actual.status !== 'completed') throw new Error('La conferencia aún no terminó');
  const customer = initial.session.customer_sid ? await provider.calls(initial.session.customer_sid).fetch() : null;
  if (customer && customer.accountSid !== creds.accountSid) throw new Error('La pata del cliente pertenece a otra cuenta');
  let winner = false;
  const final = await mutatePhonePack(client, initial, (fresh) => {
    winner = fresh.session.phase !== 'ended';
    // La duración de la pata incluye el aviso y la espera. La conversación comienza
    // únicamente cuando ambas patas se unieron; una llamada no atendida conserva cero.
    const duration = fresh.call.answered_at ? Math.max(0, Math.floor((actual.dateUpdated.getTime() - Date.parse(fresh.call.answered_at)) / 1000)) : 0;
    const update = applyStatusEvent(stateSnapshot(fresh), { CallStatus: 'completed', CallDuration: duration }, 'child');
    const merged = mergeTerminalOutcome({ currentStatus: fresh.call.status, currentDuration: fresh.call.duration_seconds,
      currentAnsweredAt: fresh.call.answered_at, incomingStatus: fresh.call.answered_at ? 'completed' : 'canceled', incomingDuration: duration });
    const operation = fresh.operation;
    const session = { phase: 'ended' as const, held_at: null, hold_seconds: phoneHeldSeconds(fresh), active_operation_id: null,
      ...(fresh.session.recording_claim_state === 'pending' ? { recording_claim_state: 'unknown' as const } : {}) };
    return { session, call: { ...(update ?? {}), ...merged, ended_at: fresh.call.ended_at ?? actual.dateUpdated.toISOString(),
      metadata: { ...(update?.metadata ?? fresh.call.metadata ?? {}), hold_seconds: session.hold_seconds } },
      ...(operation && fresh.session.active_operation_id ? { operationId: operation.id, operationState: 'failed' as const,
        result: publicPhoneState({ ...fresh, session: { ...fresh.session, ...session } }) } : {}) };
  });
  if (winner && isTerminalStatus(final.call.status) && final.call.ended_at) {
    await settleVoiceCall(final.call, client);
  }
  return final;
}

export async function joinedPhoneParticipant(client: SupabaseClient, initial: PhonePack, id: string, sid: string, conferenceSid: string): Promise<PhonePack> {
  let loser = false;
  let final = await mutatePhonePack(client, initial, (fresh) => {
    const invite = invitation(fresh, id);
    if (fresh.call.ended_at || fresh.session.phase === 'ended' || ['declined', 'failed'].includes(invite.state)) throw new Error('La invitación terminó');
    const session: PhonePatch['session'] = { conference_sid: conferenceSid };
    if (invite.role === 'customer') session.customer_sid = sid;
    if (invite.role === 'agent') {
      loser = Boolean(fresh.session.agent_sid && fresh.session.agent_sid !== sid);
      if (loser) return { session: {}, inviteId: id, invite: { state: 'declined', call_sid: sid } };
      session.agent_sid = sid;
      session.current_agent_user_id = invite.user_id;
    }
    if (invite.role === 'transfer') {
      if (fresh.session.transfer_invite_id !== id) throw new Error('La transferencia ya cambió');
      if (fresh.session.transfer_status !== 'confirmed') {
        session.transfer_status = 'connected';
        session.phase = fresh.session.transfer_mode === 'consult' ? 'consulting' : 'transferring';
      }
    }
    const effective = { ...fresh.session, ...session };
    const joined = fresh.invites?.map((row) => row.id === id ? { ...row, state: 'joined' } : row) ?? [];
    const connected = joined.some((row) => row.role === 'customer' && row.state === 'joined')
      && joined.some((row) => row.role === 'agent' && row.call_sid === effective.agent_sid && row.state === 'joined');
    const call: Record<string, unknown> = connected && !fresh.call.answered_at ? { ...applyStatusEvent(stateSnapshot(fresh), { CallStatus: 'in-progress' }, 'child') } : {};
    if (typeof call.answered_at === 'string' && fresh.call.started_at) {
      Object.assign(call, { ring_seconds: Math.max(0, Math.floor((Date.parse(call.answered_at) - Date.parse(fresh.call.started_at)) / 1000)) });
    }
    if (connected && invite.role !== 'transfer' && !fresh.session.held_at && !fresh.session.transfer_invite_id) session.phase = 'active';
    const operation = fresh.operation;
    const consultReady = invite.role === 'transfer' && effective.transfer_mode === 'consult' && fresh.session.transfer_status !== 'confirmed' && operation && fresh.session.active_operation_id;
    if (consultReady) session.active_operation_id = null;
    return { session, call: { ...call, ...(invite.role === 'customer' ? { customer_leg_sid: sid } : invite.role === 'agent' ? { agent_leg_sid: sid } : {}) },
      inviteId: id, invite: { state: 'joined', call_sid: sid },
      ...(consultReady ? { operationId: operation.id, operationState: 'succeeded' as const,
        result: publicPhoneState({ ...fresh, session: { ...effective, ...session } }) } : {}) };
  });
  const currentInvite = invitation(final, id);
  const { client: provider } = await getTwilioClientForOrg(final.session.organization_id);
  if (loser) { await provider.calls(sid).update({ status: 'completed' }); return final; }
  if (currentInvite.role === 'agent') {
    // Las otras invitaciones dejan de timbrar; cortar estas patas nunca corta al cliente.
    const others = final.invites?.filter((row) => row.role === 'agent' && row.id !== id && row.call_sid && ['ringing', 'dispatched'].includes(row.state)) ?? [];
    const cancellations = await Promise.allSettled(others.map((row) => provider.calls(row.call_sid!).update({ status: 'completed' })));
    if (cancellations.some((result) => result.status === 'rejected')) console.warn('[phone] invitación competidora pendiente de cierre', { org: final.session.organization_id });
  }
  if (currentInvite.role === 'transfer' && final.session.transfer_mode === 'direct' && final.session.transfer_status !== 'confirmed') {
    const native = await nativePhoneConference({ organizationId: final.session.organization_id, callId: final.call.id,
      conferenceSid, customerSid: final.session.customer_sid ?? '', agentSid: final.session.agent_sid ?? '' });
    const participants = provider.conferences(conferenceSid).participants;
    const before = await participants.list({ limit: 100 });
    const oldAgent = before.find((row) => row.callSid === native.binding.agentSid && row.status === 'connected');
    if (oldAgent) {
      await setNativePhoneHold(native, false, phoneCallback('music', final.call.id), final.session.pre_hold_muted);
      await participants(native.binding.agentSid).remove();
    }
    // Un reintento después de perder el ACK del proveedor acredita el mismo efecto.
    const after = await participants.list({ limit: 100 });
    if (after.some((row) => row.callSid === native.binding.agentSid && row.status === 'connected')
      || !after.some((row) => row.callSid === sid && row.status === 'connected')
      || !after.some((row) => row.callSid === native.binding.customerSid && row.status === 'connected' && !row.hold)) {
      throw new Error('La transferencia directa aún no está confirmada');
    }
    const fresh = await readPhonePack(client, final.session.organization_id, final.call.id);
    if (!fresh) throw new Error('No existe la conferencia');
    final = await mutatePhonePack(client, fresh, (current) => {
      const target = invitation(current, id);
      if (current.session.transfer_invite_id !== id || target.state !== 'joined' || target.call_sid !== sid || current.call.ended_at) throw new Error('La transferencia cambió');
      const session = { phase: 'active' as const, agent_sid: sid, current_agent_user_id: target.user_id, held_at: null,
        hold_seconds: phoneHeldSeconds(current), transfer_status: 'confirmed' as const, active_operation_id: null };
      return { session, inviteId: id, invite: { state: 'joined', call_sid: sid }, call: { agent_leg_sid: sid, metadata: { ...(current.call.metadata ?? {}), hold_seconds: session.hold_seconds,
        transfer: { to_user_id: target.user_id, type: 'direct' } } },
        ...(current.operation && current.session.active_operation_id ? { operationId: current.operation.id, operationState: 'succeeded' as const,
          result: publicPhoneState({ ...current, session: { ...current.session, ...session } }) } : {}) };
    });
  }
  return final;
}

export async function leftPhoneParticipant(client: SupabaseClient, pack: PhonePack, sid: string): Promise<void> {
  if (pack.session.phase === 'ended') return;
  const actualAgent = pack.session.agent_sid === sid;
  const actualCustomer = pack.session.customer_sid === sid || Boolean(pack.invites?.some((row) => row.role === 'customer' && row.call_sid === sid));
  // El agente anterior sale durante una transferencia directa; la conversación continúa.
  if (actualAgent && pack.session.transfer_mode === 'direct' && ['transferring', 'active'].includes(pack.session.phase) && pack.session.transfer_status === 'connected') return;
  if (!actualAgent && !actualCustomer) return;
  const { client: provider } = await getTwilioClientForOrg(pack.session.organization_id);
  if (!pack.session.conference_sid) {
    const actual = await provider.calls(sid).fetch();
    if (!['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(actual.status)) throw new Error('La pata aún no terminó');
    let winner = false;
    const final = await mutatePhonePack(client, pack, (fresh) => {
      winner = fresh.session.phase !== 'ended';
      const session = { phase: 'ended' as const, held_at: null, active_operation_id: null,
        ...(fresh.session.recording_claim_state === 'pending' ? { recording_claim_state: 'unknown' as const } : {}) };
      const merged = mergeTerminalOutcome({ currentStatus: fresh.call.status, currentDuration: fresh.call.duration_seconds,
        currentAnsweredAt: fresh.call.answered_at, incomingStatus: 'canceled', incomingDuration: 0 });
      return { session, call: { ...merged, ended_at: fresh.call.ended_at ?? actual.dateUpdated.toISOString() },
        ...(fresh.operation && fresh.session.active_operation_id ? { operationId: fresh.operation.id, operationState: 'failed' as const,
          result: publicPhoneState({ ...fresh, session: { ...fresh.session, ...session } }) } : {}) };
    });
    if (winner && isTerminalStatus(final.call.status) && final.call.ended_at) await settleVoiceCall(final.call, client);
    return;
  }
  await provider.conferences(pack.session.conference_sid).update({ status: 'completed' });
  await finishPhoneConference(client, pack);
}
