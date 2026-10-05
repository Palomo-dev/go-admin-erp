import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from './crmErrors';
import { getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { getTelephonySettings, orgOwnsCallerId, pickCallerId } from './voiceContextService';
import { buildCallbackUrl } from './twimlBuilders';
import { signBridgeToken } from './bridgeTokens';
import { requireHumanCallCompliance } from './humanCallCompliance';
import { nativePhoneConference, setNativePhoneHold, dialNativePhoneTransfer, type NativePhoneConference } from './phoneConferenceProvider';
import { claimPhoneOperation, mutatePhonePack, phoneRpc, publicPhoneState, readPhonePack, type PhonePack, type PhoneInvite, type PhonePatch } from './phoneConferenceRepository';
import { phoneControlDto, type PhoneControlCommand, type PhoneControlState } from './phoneConferenceTypes';

interface PhoneTarget { user_id: string | null; name: string; destination: string; mode: 'browser' | 'mobile' }
export function phoneCallback(path: string, call: string, invite?: string): string {
  return buildCallbackUrl(getTwilioWebhookOrigin(), `/api/voice/conference/${path}`, {
    callId: call, ...(invite ? { inviteId: invite, token: signBridgeToken(`phone-invite:${invite}`) }
      : { token: signBridgeToken(`phone-call:${call}`) }),
  });
}

export function phoneHeldSeconds(pack: PhonePack, now = Date.now()): number {
  return pack.session.hold_seconds + (pack.session.held_at
    ? Math.max(0, Math.floor((now - Date.parse(pack.session.held_at)) / 1000)) : 0);
}

function boundNative(pack: PhonePack): Promise<NativePhoneConference> {
  return nativePhoneConference({ organizationId: pack.session.organization_id, callId: pack.call.id,
    conferenceSid: pack.session.conference_sid ?? '', customerSid: pack.session.customer_sid ?? '', agentSid: pack.session.agent_sid ?? '' });
}

async function transferTarget(client: SupabaseClient, org: number, payload: Extract<PhoneControlCommand, { action: 'transfer' }>): Promise<PhoneTarget> {
  if ('userId' in payload.target) {
    const target = await phoneRpc<PhoneTarget | null>(client, 'fn_phone_target', { p_org: org, p_user: payload.target.userId });
    if (!target) throw new CrmHttpError(409, 'destinatario_no_disponible', 'El compañero no está disponible');
    return target;
  }
  const number = await requireHumanCallCompliance(client, org, payload.target.number);
  return { user_id: null, name: number, destination: number, mode: 'mobile' };
}

function resultPatch(pack: PhonePack, patch: PhonePatch, operation: string, state: 'succeeded' | 'failed'): PhonePatch {
  const session = { ...pack.session, ...patch.session, active_operation_id: null };
  return { ...patch, session: { ...patch.session, active_operation_id: null }, operationId: operation, operationState: state,
    result: publicPhoneState({ ...pack, session }) };
}

async function completeControl(client: SupabaseClient, pack: PhonePack, operation: string, patch: (fresh: PhonePack) => PhonePatch): Promise<PhonePack> {
  return mutatePhonePack(client, pack, (fresh) => {
    if (fresh.session.active_operation_id !== operation || fresh.call.ended_at || fresh.session.phase === 'ended') {
      throw new CrmHttpError(409, 'operacion_obsoleta', 'La llamada cambió durante la operación');
    }
    return resultPatch(fresh, patch(fresh), operation, 'succeeded');
  });
}

export async function runPhoneControl(auth: SupabaseClient, service: SupabaseClient, org: number, callId: string,
  key: string, command: PhoneControlCommand): Promise<PhoneControlState> {
  const ack = await claimPhoneOperation(auth, org, callId, key, command);
  if (ack.replay) {
    const original = phoneControlDto(ack.response);
    if (!original) throw new CrmHttpError(503, 'resultado_incierto', 'No pudimos recuperar el resultado');
    return original;
  }
  let pack = await readPhonePack(service, org, callId);
  if (!pack || pack.operation?.id !== ack.operation_id || pack.session.active_operation_id !== ack.operation_id) {
    throw new CrmHttpError(409, 'operacion_cambio', 'La operación cambió antes de ejecutarse');
  }
  // dispatched/unknown jamás vuelve a marcar: los callbacks reconciliarán su efecto real.
  if (pack.operation.state !== 'reserved') throw new CrmHttpError(409, 'operacion_pendiente', 'La acción anterior sigue pendiente de confirmar');
  let target: PhoneTarget | null = null;
  let callerId: string | null = null;
  let timeout = 30;
  try {
    if (command.action === 'transfer') {
      target = await transferTarget(service, org, command);
      const settings = await getTelephonySettings(org, service);
      const picked = await pickCallerId(org, settings, service);
      if (!picked.e164 || !(await orgOwnsCallerId(org, picked.e164, settings, service))) {
        throw new CrmHttpError(403, 'numero_origen_invalido', 'El número de origen no pertenece a la organización');
      }
      callerId = picked.e164;
      timeout = settings.voice_ring_timeout_seconds;
    }
  } catch (error) {
    await mutatePhonePack(service, pack, (fresh) => resultPatch(fresh, { session: {} }, ack.operation_id, 'failed'));
    throw error;
  }
  pack = await phoneRpc<PhonePack>(service, 'fn_phone_dispatch', {
    p_org: org, p_call: callId, p_operation: ack.operation_id, p_revision: pack.session.revision,
  });
  if (pack.stale || pack.operation?.id !== ack.operation_id || pack.operation.state !== 'dispatched') {
    throw new CrmHttpError(409, 'operacion_cambio', 'La llamada cambió antes de ejecutarse');
  }
  try {
    const native = await boundNative(pack);
    const music = phoneCallback('music', callId);
    if (command.action === 'hold') {
      const audio = await setNativePhoneHold(native, command.held, music, command.held ? false : pack.session.pre_hold_muted);
      const completed = await completeControl(service, pack, ack.operation_id, (fresh) => ({ session: command.held
        ? { phase: 'held', held_at: fresh.session.held_at ?? new Date().toISOString(), pre_hold_muted: fresh.session.held_at ? fresh.session.pre_hold_muted : audio.previousAgentMuted }
        : { phase: 'active', held_at: null, hold_seconds: phoneHeldSeconds(fresh) } }));
      return publicPhoneState(completed);
    }
    if (command.action === 'transfer' && target) {
      const audio = await setNativePhoneHold(native, true, music);
      if (command.mode === 'consult') {
        const agent = native.client.conferences(native.binding.conferenceSid).participants(native.binding.agentSid);
        await agent.update({ muted: false });
        const observed = await agent.fetch();
        if (observed.status !== 'connected' || observed.muted !== false) throw new Error('No pudimos confirmar el audio de consulta');
      }
      const { invite } = await phoneRpc<{ invite: PhoneInvite }>(service, 'fn_phone_invite', { p_org: org, p_call: callId,
        p_operation: ack.operation_id, p_payload: { role: 'transfer', user_id: target.user_id, destination: target.destination, display_name: target.name } });
      const fresh = await readPhonePack(service, org, callId);
      if (!fresh) throw new Error('Conferencia perdida');
      pack = await mutatePhonePack(service, fresh, (current) => ({ session: { phase: 'transferring', transfer_invite_id: invite.id,
        transfer_mode: command.mode, transfer_status: 'dialing', transfer_name: target.name,
        transfer_restore_held: Boolean(current.session.held_at), held_at: current.session.held_at ?? new Date().toISOString(),
        pre_hold_muted: current.session.held_at ? current.session.pre_hold_muted : audio.previousAgentMuted },
        inviteId: invite.id, invite: { state: 'dispatched' } }));
      const dial = await dialNativePhoneTransfer(native, { destination: target.destination, callerId: callerId!,
        joinUrl: phoneCallback('join', callId, invite.id), callbackUrl: phoneCallback('leg-status', callId, invite.id), timeout });
      pack = await mutatePhonePack(service, pack, (current) => {
        const saved = current.invites?.find((row) => row.id === invite.id);
        if (!saved || (saved.call_sid && saved.call_sid !== dial.sid)) throw new Error('La invitación cambió de pata');
        return { session: {}, inviteId: invite.id, invite: { call_sid: dial.sid,
          state: ['joined', 'declined', 'failed'].includes(saved.state) ? saved.state : 'ringing' } };
      });
      return publicPhoneState(pack); // accepted/ringing; callback confirma la conexión real.
    }
    if (command.action === 'confirm_transfer' || command.action === 'cancel_transfer') {
      const transferId = pack.session.transfer_invite_id;
      const invite = pack.invites?.find((row) => row.id === transferId);
      if (!invite?.call_sid) throw new CrmHttpError(409, 'transferencia_pendiente', 'El destino aún no está conectado');
      if (command.action === 'confirm_transfer') {
        const participant = await native.client.conferences(native.binding.conferenceSid).participants(invite.call_sid).fetch();
        if (participant.status !== 'connected' || participant.conferenceSid !== native.binding.conferenceSid) {
          throw new CrmHttpError(409, 'transferencia_pendiente', 'El destino aún no está conectado');
        }
        await setNativePhoneHold(native, false, music, pack.session.pre_hold_muted);
        const completed = await completeControl(service, pack, ack.operation_id, (fresh) => ({ session: { phase: 'active', held_at: null,
          hold_seconds: phoneHeldSeconds(fresh), transfer_status: 'confirmed' }, call: { metadata: { ...(fresh.call.metadata ?? {}),
          transfer: { to_user_id: invite.user_id, type: 'consult' } } } }));
        return publicPhoneState(completed);
      }
      await native.client.calls(invite.call_sid).update({ status: 'completed' });
      const ended = await native.client.calls(invite.call_sid).fetch();
      if (!['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(ended.status)) throw new Error('No pudimos confirmar la cancelación');
      await setNativePhoneHold(native, pack.session.transfer_restore_held, music, pack.session.pre_hold_muted);
      const completed = await completeControl(service, pack, ack.operation_id, (fresh) => ({ session: {
        phase: fresh.session.transfer_restore_held ? 'held' : 'active',
        held_at: fresh.session.transfer_restore_held ? fresh.session.held_at : null,
        hold_seconds: fresh.session.transfer_restore_held ? fresh.session.hold_seconds : phoneHeldSeconds(fresh),
        transfer_invite_id: null, transfer_mode: null, transfer_status: null, transfer_name: null,
      }, inviteId: invite.id, invite: { state: 'declined' } }));
      return publicPhoneState(completed);
    }
    if (command.action === 'hangup') {
      await native.client.conferences(native.binding.conferenceSid).update({ status: 'completed' });
      const observed = await native.client.conferences(native.binding.conferenceSid).fetch();
      if (observed.status !== 'completed') throw new Error('No pudimos confirmar el cierre');
      // El callback de fin acredita duración y liquidación; esta respuesta no las inventa.
      return publicPhoneState(pack);
    }
    throw new CrmHttpError(400, 'accion_invalida', 'La acción no es válida');
  } catch (error) {
    const latest = await readPhonePack(service, org, callId);
    if (latest && latest.session.active_operation_id === ack.operation_id && latest.session.phase !== 'ended') {
      await mutatePhonePack(service, latest, (fresh) => error instanceof CrmHttpError && error.code === 'control_audio_revertido'
        ? resultPatch(fresh, { session: {} }, ack.operation_id, 'failed')
        : { session: { phase: 'error' }, operationId: ack.operation_id, operationState: 'unknown' });
    }
    throw error;
  }
}
