import type { SupabaseClient } from '@supabase/supabase-js';
import { mutatePhonePack, publicPhoneState, claimPhoneOperation, readPhonePack } from '../phoneConferenceRepository';
import { phonePack, CALL_ID } from './fixtures/phonePack';
it('CAS20 relee nota, consentimiento y duración sin perder el cambio concurrente', async () => {
  const initial = phonePack();
  const fresh = phonePack(); fresh.session.revision = 2; fresh.call.metadata = { note: 'Nota concurrente' }; fresh.call.consent_given = false;
  fresh.call.recording_enabled = false; fresh.call.cost_amount = 125; fresh.call.ring_seconds = 33;
  const rpc = jest.fn().mockResolvedValueOnce({ data: { ...fresh, stale: true }, error: null }).mockImplementationOnce(async (_name, params) => ({
    data: { ...fresh, call: { ...fresh.call, ...params.p_call_patch }, session: { ...fresh.session, ...params.p_session_patch }, stale: false }, error: null,
  }));
  const result = await mutatePhonePack({ rpc } as unknown as SupabaseClient, initial, (pack) => ({
    session: { phase: 'held', held_at: '2026-10-02T10:02:00Z' }, call: { metadata: { ...pack.call.metadata, hold_seconds: 1 } },
  }));
  expect(result.call.metadata).toEqual({ note: 'Nota concurrente', hold_seconds: 1 });
  const params = rpc.mock.calls[1][1];
  expect(Object.keys(params.p_call_expected)).toHaveLength(20);
  expect(params.p_call_expected).toMatchObject({ consent_given: false, recording_enabled: false, cost_amount: 125, ring_seconds: 33 });
  expect(params.p_revision).toBe(2);
});
it('no ejecuta productor de autorización vieja después de retiro concurrente', async () => {
  const initial = phonePack(); const retired = phonePack(); retired.call.consent_given = false; retired.call.recording_enabled = false;
  const rpc = jest.fn().mockResolvedValue({ data: { ...retired, stale: true }, error: null });
  await expect(mutatePhonePack({ rpc } as unknown as SupabaseClient, initial, (fresh) => {
    if (!fresh.call.consent_given) throw new Error('consentimiento retirado');
    return { session: { recording_claim_state: 'pending' } };
  })).rejects.toThrow('consentimiento retirado');
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('rechaza payload privado leído de otra organización', async () => {
  const other = phonePack(); other.session.organization_id = 8;
  await expect(readPhonePack({ rpc: jest.fn(async () => ({ data: other, error: null })) } as unknown as SupabaseClient, 7, CALL_ID)).rejects.toMatchObject({ code: 'conferencia_incierta' });
});
it('ACK autenticado sólo requiere operación/revisión/replay y errores se propagan', async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: { operation_id: 'op', revision: 4, replay: false }, error: null })
    .mockResolvedValueOnce({ data: null, error: { code: '42501' } });
  const client = { rpc } as unknown as SupabaseClient;
  expect(await claimPhoneOperation(client, 7, CALL_ID, 'key', { action: 'hold', held: true })).toEqual({ operation_id: 'op', revision: 4, replay: false });
  await expect(claimPhoneOperation(client, 8, CALL_ID, 'key', { action: 'hold', held: true })).rejects.toMatchObject({ code: '42501' });
});
it('DTO no expone cliente, notas, SID, actor ni operación', () => {
  const pack = phonePack(); pack.call.metadata = { note: 'Privada' }; pack.session.active_operation_id = 'op';
  expect(publicPhoneState(pack)).toEqual({ supported: true, phase: 'ready', held: false, heldAt: null, holdSeconds: 0, transfer: null, busy: true, error: null });
});
