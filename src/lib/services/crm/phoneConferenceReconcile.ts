import type { SupabaseClient } from '@supabase/supabase-js';
import { readPhonePack, mutatePhonePack, publicPhoneState, type PhonePack } from './phoneConferenceRepository';
import { getTwilioClientForOrg } from './voiceContextService';
import { phoneConferenceName } from './phoneConferenceTwiml';
import { finishPhoneConference, joinedPhoneParticipant } from './phoneConferenceEvents';
import { terminalPhoneInvitation } from './phoneConferenceWebhook';
import { nativePhoneConference, setNativePhoneHold } from './phoneConferenceProvider';
import { phoneCallback } from './phoneConferenceControl';
import { phoneHeldSeconds } from './phoneConferenceControl';

/** Sólo observa intenciones durables: no vuelve a marcar ni genera cobros nuevos. */
export async function reconcilePhonePack(service: SupabaseClient, initial: PhonePack): Promise<PhonePack> {
  if (!initial.session.conference_sid) return initial;
  const { client, creds } = await getTwilioClientForOrg(initial.session.organization_id);
  const conference = await client.conferences(initial.session.conference_sid).fetch();
  if (conference.accountSid !== creds.accountSid || conference.friendlyName !== phoneConferenceName(initial.session.organization_id, initial.call.id)) {
    throw new Error('La conferencia observada no corresponde a esta organización');
  }
  if (conference.status === 'completed' && initial.session.phase !== 'ended') return finishPhoneConference(service, initial);
  let pack = initial;
  const transfer = pack.invites?.find((row) => row.id === pack.session.transfer_invite_id);
  if (transfer?.call_sid && pack.session.transfer_status !== 'confirmed' && pack.session.phase !== 'ended') {
    const actual = await client.calls(transfer.call_sid).fetch();
    if (actual.accountSid !== creds.accountSid) throw new Error('La invitación no corresponde a esta cuenta');
    if (['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(actual.status)) {
      await terminalPhoneInvitation(service, pack, transfer, transfer.call_sid);
      pack = await readPhonePack(service, pack.session.organization_id, pack.call.id) ?? pack;
    } else {
      const participants = await client.conferences(conference.sid).participants.list({ limit: 100 });
      if (participants.some((row) => row.callSid === transfer.call_sid && row.label === transfer.id && row.status === 'connected')) {
        pack = await joinedPhoneParticipant(service, pack, transfer.id, transfer.call_sid, conference.sid);
      }
    }
  }
  const operation = pack.operation;
  if (operation?.state === 'unknown' && operation.payload.action === 'hold' && pack.session.agent_sid && pack.session.customer_sid && pack.session.phase !== 'ended') {
    const [customer, agent] = await Promise.all([
      client.conferences(conference.sid).participants(pack.session.customer_sid).fetch(),
      client.conferences(conference.sid).participants(pack.session.agent_sid).fetch(),
    ]);
    const desired = operation.payload.held;
    if (customer.status === 'connected' && agent.status === 'connected' && customer.hold === desired
      && agent.muted === (desired || pack.session.pre_hold_muted)) {
      pack = await mutatePhonePack(service, pack, (fresh) => {
        if (fresh.operation?.id !== operation.id || fresh.operation.state !== 'unknown') return { session: {} };
        const session = { ...fresh.session, phase: desired ? 'held' as const : 'active' as const,
          held_at: desired ? fresh.session.held_at ?? operation.dispatched_at : null,
          hold_seconds: desired ? fresh.session.hold_seconds : phoneHeldSeconds(fresh), active_operation_id: null };
        return { session: { phase: session.phase, held_at: session.held_at, hold_seconds: session.hold_seconds, active_operation_id: null }, operationId: operation.id, operationState: 'succeeded', result: publicPhoneState({ ...fresh, session }) };
      });
    }
  }
  if (pack.operation?.state === 'unknown' && pack.operation.payload.action === 'hold' && pack.session.phase === 'error') {
    const pending = pack.operation;
    try {
      const previousHeld = Boolean(pack.session.held_at);
      const native = await nativePhoneConference({ organizationId: pack.session.organization_id, callId: pack.call.id,
        conferenceSid: pack.session.conference_sid ?? '', customerSid: pack.session.customer_sid ?? '', agentSid: pack.session.agent_sid ?? '' });
      // Un fallo parcial vuelve al audio anterior sólo tras confirmación nativa.
      // La lease sigue bloqueada si tampoco puede acreditarse esa restitución.
      await setNativePhoneHold(native, previousHeld, phoneCallback('music', pack.call.id), pack.session.pre_hold_muted);
      pack = await mutatePhonePack(service, pack, (fresh) => {
        if (fresh.operation?.id !== pending.id || fresh.operation.state !== 'unknown' || fresh.session.phase === 'ended') return { session: {} };
        const session = { ...fresh.session, phase: previousHeld ? 'held' as const : 'active' as const, active_operation_id: null };
        return { session: { phase: session.phase, active_operation_id: null }, operationId: pending.id,
          operationState: 'failed', result: publicPhoneState({ ...fresh, session }) };
      });
    } catch { /* Un audio no confirmado conserva error/unknown; no libera la operación. */ }
  }
  // La expiración sola nunca prueba ausencia. Tras el fin y una lectura nativa
  // sin grabaciones puede liberarse la autorización que quedó incierta.
  if (pack.session.phase === 'ended' && ['pending', 'unknown'].includes(pack.session.recording_claim_state)
    && pack.session.customer_sid && Date.now() > Date.parse(pack.call.ended_at ?? '') + 120000) {
    const recordings = await client.calls(pack.session.customer_sid).recordings.list({ limit: 1 });
    if (!recordings.length) pack = await mutatePhonePack(service, pack, () => ({ session: { recording_claim_state: 'absent', recording_claim_until: null } }));
  }
  return pack;
}
