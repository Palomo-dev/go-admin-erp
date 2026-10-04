import type { PhonePack, PhoneInvite } from '../../phoneConferenceRepository';
export const CALL_ID = '11111111-1111-4111-8111-111111111111';
export const CUSTOMER_SID = `CA${'1'.repeat(32)}`;
export const AGENT_SID = `CA${'2'.repeat(32)}`;
export const TARGET_SID = `CA${'3'.repeat(32)}`;
export const CONFERENCE_SID = `CF${'4'.repeat(32)}`;
export const ACCOUNT_SID = `AC${'5'.repeat(32)}`;
export function phonePack(): PhonePack {
  return {
    call: { id: CALL_ID, organization_id: 7, user_id: '11111111-1111-4111-8111-111111111112', status: 'in_progress',
      started_at: '2026-10-02T10:00:00Z', answered_at: '2026-10-02T10:01:00Z', ended_at: null, duration_seconds: null,
      answered_by: 'human', metadata: {}, customer_id: null, opportunity_id: null, provider_call_sid: AGENT_SID,
      customer_leg_sid: CUSTOMER_SID, agent_leg_sid: AGENT_SID, recording_enabled: true, consent_given: true,
      bridge_mode: null, ring_seconds: 60, duration_source: 'provider', cost_amount: null, cost_currency: 'COP',
      direction: 'outbound', mode: 'browser', provider: 'twilio', from_number: '+573001234567', to_number: '+573001234568',
    } as PhonePack['call'],
    session: { call_id: CALL_ID, organization_id: 7, revision: 1, direction: 'outbound', conference_name: `go_7_${CALL_ID}`,
      conference_sid: CONFERENCE_SID, customer_sid: CUSTOMER_SID, agent_sid: AGENT_SID,
      current_agent_user_id: '11111111-1111-4111-8111-111111111112', phase: 'active', held_at: null, hold_seconds: 0,
      pre_hold_muted: false, transfer_invite_id: null, transfer_mode: null, transfer_status: null, transfer_name: null,
      transfer_restore_held: false, active_operation_id: null, recording_claim_state: 'none', recording_claim_until: null },
    invites: [phoneInvite('customer', CUSTOMER_SID), phoneInvite('agent', AGENT_SID)], operation: null,
  };
}
export function phoneInvite(role: PhoneInvite['role'], sid: string): PhoneInvite {
  return { id: `11111111-1111-4111-8111-${role === 'customer' ? '111111111113' : role === 'agent' ? '111111111114' : '111111111115'}`,
    organization_id: 7, call_id: CALL_ID, operation_id: null, role, user_id: role === 'customer' ? null : '11111111-1111-4111-8111-111111111112',
    destination: '+573001234568', display_name: 'Agente', call_sid: sid, state: 'joined', recording_announced_at: null };
}
