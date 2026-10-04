import type { SupabaseClient } from '@supabase/supabase-js';
import { applyDisposition, dispositionSchema, type CallRowForDisposition } from '../callDispositionService';

const call = {
  id: '20000000-0000-4000-8000-000000000001', organization_id: 120,
  user_id: '20000000-0000-4000-8000-000000000002', customer_id: null,
  metadata: {},
} as CallRowForDisposition;

describe('baja humana al cerrar una llamada', () => {
  const previous = process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
    else process.env.CRM_CALL_ATOMIC_RPC_ENABLED = previous;
  });

  it('rechaza una baja que además programe un contacto y conserva el contrato anterior', () => {
    expect(dispositionSchema.safeParse({ outcome: 'answered', do_not_call: true, next_action: { type: 'call' } }).success).toBe(false);
    expect(dispositionSchema.safeParse({ outcome: 'answered', do_not_call: 'true' }).success).toBe(false);
    expect(dispositionSchema.safeParse({ outcome: 'answered', do_not_call: true, next_action: null }).success).toBe(true);
    expect(dispositionSchema.safeParse({ outcome: 'callback_requested', next_action: { type: 'task' } }).success).toBe(true);
  });

  it('transporta resultado y baja en una sola RPC con la misma clave de intención', async () => {
    delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
    const saved = { ...call, metadata: { disposition_do_not_call: true } };
    const rpc = jest.fn().mockResolvedValue({ data: { call: saved, task_id: null, activity_id: null }, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    const result = await applyDisposition(call, call.user_id!, { outcome: 'answered', do_not_call: true }, client, { sessionClient: client, clientKey: 'same-intent' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fn_crm_disponer_llamada', { p_org: 120, p_call: call.id, p_key: 'same-intent', p_payload: { disposition: { outcome: 'answered', do_not_call: true } } });
    expect(result.call.metadata?.disposition_do_not_call).toBe(true);
  });

  it('propaga un rechazo y no representa una baja parcialmente guardada como éxito', async () => {
    delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
    const error = { code: '42501', message: 'sin_permiso' };
    const rpc = jest.fn().mockResolvedValue({ data: null, error });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(applyDisposition(call, call.user_id!, { outcome: 'answered', do_not_call: true }, client, { sessionClient: client, clientKey: 'rejected' })).rejects.toEqual(error);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('rechaza un servidor anterior que responde sin confirmar la exclusión', async () => {
    delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
    const rpc = jest.fn().mockResolvedValue({ data: { call, task_id: null, activity_id: null }, error: null });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(applyDisposition(call, call.user_id!, { outcome: 'answered', do_not_call: true }, client, { sessionClient: client, clientKey: 'old-server' })).rejects.toThrow('no confirma la exclusión');
  });

  it('rechaza una baja en el modo antiguo antes de escribir ninguna fila', async () => {
    process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false';
    const from = jest.fn();
    const client = { from } as unknown as SupabaseClient;
    await expect(applyDisposition(call, call.user_id!, { outcome: 'answered', do_not_call: true }, client)).rejects.toThrow('guardado atómico');
    expect(from).not.toHaveBeenCalled();
  });
});
