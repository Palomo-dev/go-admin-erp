import type { SupabaseClient } from '@supabase/supabase-js';
import type { CallRecord } from './callManagementService';
import { callMutationExpected } from './callMutationService';
import { CrmHttpError } from './crmErrors';
import { phoneControlDto, type PhoneControlCommand, type PhoneControlState } from './phoneConferenceTypes';

export interface PhoneSession {
  call_id: string;
  organization_id: number;
  revision: number;
  direction: 'inbound' | 'outbound';
  conference_name: string;
  conference_sid: string | null;
  customer_sid: string | null;
  agent_sid: string | null;
  current_agent_user_id: string | null;
  phase: 'connecting' | 'active' | 'held' | 'consulting' | 'transferring' | 'ended' | 'error';
  held_at: string | null;
  hold_seconds: number;
  pre_hold_muted: boolean;
  transfer_invite_id: string | null;
  transfer_mode: 'direct' | 'consult' | null;
  transfer_status: 'dialing' | 'connected' | 'confirmed' | 'failed' | null;
  transfer_name: string | null;
  transfer_restore_held: boolean;
  active_operation_id: string | null;
  recording_claim_state: 'none' | 'pending' | 'confirmed' | 'absent' | 'unknown';
  recording_claim_until: string | null;
}

export interface PhoneInvite {
  id: string;
  organization_id: number;
  call_id: string;
  operation_id: string | null;
  role: 'customer' | 'agent' | 'transfer';
  user_id: string | null;
  destination: string;
  display_name: string;
  call_sid: string | null;
  state: 'reserved' | 'dispatched' | 'ringing' | 'joined' | 'declined' | 'failed' | 'unknown';
  recording_announced_at: string | null;
}

export interface PhoneOperation {
  id: string;
  state: 'reserved' | 'dispatched' | 'succeeded' | 'failed' | 'unknown';
  payload: PhoneControlCommand;
  dispatched_at: string | null;
  result: PhoneControlState | null;
}

export interface PhonePack {
  session: PhoneSession;
  call: CallRecord;
  invites?: PhoneInvite[];
  invite?: PhoneInvite;
  operation?: PhoneOperation | null;
  stale?: boolean;
  replay?: boolean;
  response?: PhoneControlState;
}

export function phoneConferenceEnabled(): boolean {
  return process.env.CRM_PHONE_CONFERENCE_ENABLED !== 'false';
}

export async function phoneRpc<T>(client: SupabaseClient, name: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(name, params);
  if (error) throw error;
  return data as T;
}

function requirePack(value: PhonePack | null, org: number, call: string): PhonePack {
  if (!value?.session || !value.call || value.call.id !== call || value.call.organization_id !== org
    || value.session.call_id !== call || value.session.organization_id !== org || !Number.isSafeInteger(value.session.revision)) {
    throw new CrmHttpError(503, 'conferencia_incierta', 'No pudimos confirmar la conferencia');
  }
  return value;
}

export async function readPhonePack(client: SupabaseClient, org: number, call: string): Promise<PhonePack | null> {
  const value = await phoneRpc<PhonePack | null>(client, 'fn_phone_get', { p_org: org, p_call: call });
  return value === null ? null : requirePack(value, org, call);
}

export async function preparePhonePack(client: SupabaseClient, org: number, call: string): Promise<PhonePack> {
  return requirePack(await phoneRpc(client, 'fn_phone_prepare', { p_org: org, p_call: call }), org, call);
}

export interface PhoneOperationAck { operation_id: string; revision: number; replay: boolean; response?: PhoneControlState }
export async function claimPhoneOperation(client: SupabaseClient, org: number, call: string, key: string, payload: PhoneControlCommand): Promise<PhoneOperationAck> {
  const ack = await phoneRpc<PhoneOperationAck>(client,
    'fn_phone_claim', { p_org: org, p_call: call, p_key: key, p_payload: payload });
  if (!ack || typeof ack.operation_id !== 'string' || !Number.isSafeInteger(ack.revision) || typeof ack.replay !== 'boolean') {
    throw new CrmHttpError(503, 'operacion_incierta', 'No pudimos confirmar la operación');
  }
  // Sólo el ACK seguro sale de la RPC autenticada. Las filas privadas las leerá el servidor.
  return ack;
}

export interface PhonePatch {
  session: Partial<PhoneSession>;
  call?: Record<string, unknown>;
  inviteId?: string;
  invite?: Partial<PhoneInvite>;
  operationId?: string;
  operationState?: PhoneOperation['state'];
  result?: PhoneControlState;
}

/** El productor se recalcula sobre revisión y CAS20 frescos; la RPC aplica ambas filas y su historial. */
export async function mutatePhonePack(client: SupabaseClient, initial: PhonePack, producer: (fresh: PhonePack) => PhonePatch): Promise<PhonePack> {
  let current = initial;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const patch = producer(current);
    const { organization_id: org, call_id: call } = initial.session;
    const next = requirePack(await phoneRpc(client, 'fn_phone_apply', {
      p_org: org, p_call: call, p_revision: current.session.revision,
      p_session_patch: patch.session, p_call_expected: callMutationExpected(current.call), p_call_patch: patch.call ?? {},
      p_invite: patch.inviteId ?? null, p_invite_patch: patch.invite ?? {},
      p_operation: patch.operationId ?? null, p_operation_state: patch.operationState ?? null,
      p_result: patch.result ?? null,
    }), org, call);
    if (next.stale === false) return next;
    if (next.stale !== true) throw new CrmHttpError(503, 'conferencia_incierta', 'No pudimos confirmar el guardado');
    current = next;
  }
  throw new CrmHttpError(409, 'conferencia_cambio', 'La llamada cambió. Vuelve a comprobar sus controles');
}

export function publicPhoneState(pack: PhonePack): PhoneControlState {
  const { session } = pack;
  return phoneControlDto({
    supported: true,
    phase: session.phase === 'active' || session.phase === 'connecting' ? 'ready' : session.phase,
    held: session.held_at !== null,
    heldAt: session.held_at ? Date.parse(session.held_at) : null,
    holdSeconds: session.hold_seconds,
    transfer: session.transfer_mode && session.transfer_status
      ? { mode: session.transfer_mode, status: session.transfer_status, toName: session.transfer_name ?? '' } : null,
    busy: Boolean(session.active_operation_id), error: session.phase === 'error' ? 'control_incierto' : null,
  }) ?? (() => { throw new Error('Estado público de conferencia inválido'); })();
}
