/** Twilio usa el consentimiento canónico privado; no escribe banderas y preferencias por separado. */
import { makeSupabase, has } from '@/lib/services/crm/whatsapp/__tests__/mockSupabase';
import { fakeTable } from '@/lib/services/crm/whatsapp/__tests__/fakeTable';
const ctx: { sb: unknown } = { sb: null };
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => ctx.sb }));
import { isOptOutMessage, isOptInMessage, recordConsentChange } from '../twilioWebhook';

function setup(error?: string) {
  const customers = fakeTable([{ id: 'c1', organization_id: 105, phone: '+57 300 111 2233' }]);
  const h = makeSupabase({ provider_configs: () => ({ data: null }), customers: customers.resolver }, (_fn, args) => error
    ? { error: { message: error } } : { data: { updated: (args.p_targets as unknown[]).length, already_applied: false } });
  ctx.sb = h.sb;
  return h;
}

describe('isOptOutMessage / isOptInMessage', () => {
  test.each(['STOP', 'stop', ' Stop. ', 'BAJA', 'baja!', 'CANCELAR', 'Cancelar', 'NO MAS', 'No más', 'NO MÁS', 'nomás', 'UNSUBSCRIBE', 'salir', 'DETENER', 'Detener.'])(
    'opt-out: %j',
    (body) => expect(isOptOutMessage(body)).toBe(true)
  );

  test.each(['no cancelar la cita', 'quiero cancelar mi pedido', 'STOP calling me', 'hola', '', 'baja la persiana', 'no', 'SI'])(
    'NO es opt-out (falso positivo): %j',
    (body) => expect(isOptOutMessage(body)).toBe(false)
  );

  test.each(['START', 'start', 'ALTA', 'iniciar', 'Sí quiero', 'ACEPTO'])('opt-in: %j', (body) => expect(isOptInMessage(body)).toBe(true));

  test('STOP no es opt-in y START no es opt-out', () => {
    expect(isOptInMessage('STOP')).toBe(false);
    expect(isOptOutMessage('START')).toBe(false);
  });
});

describe('recordConsentChange', () => {
  it.each(['whatsapp', 'sms'] as const)('baja por %s transmite organización, destinos y evidencia en una sola RPC', async (channel) => {
    const h = setup();
    await recordConsentChange({ orgId: 105, phone: '+573001112233', channel, status: 'opted_out', messageSid: 'SM1', body: 'STOP' });
    expect(h.rpcCalls).toEqual([{ fn: 'crm_record_twilio_contact_consent', args: { p_org: 105, p_channel: channel, p_status: 'opted_out',
      p_targets: [{ customer_id: 'c1', expected_phone: '+57 300 111 2233' }], p_evidence: { phone: '+573001112233', message_sid: 'SM1', message_id: 'twilio:SM1', body: 'STOP' } } }]);
    expect(h.calls.some((c) => has(c.ops, 'insert') || has(c.ops, 'update') || has(c.ops, 'upsert'))).toBe(false);
  });

  test('teléfono sin cliente propio no escribe', async () => {
    const h = setup();
    await recordConsentChange({ orgId: 105, phone: '+15550000000', channel: 'sms', status: 'opted_out' });
    expect(h.rpcCalls).toHaveLength(0);
  });

  test('START tras STOP usa la misma operación canónica con evidencia distinta', async () => {
    const h = setup();
    for (const [status, messageSid, body] of [['opted_out', 'SM1', 'STOP'], ['opted_in', 'SM2', 'START']] as const)
      await recordConsentChange({ orgId: 105, phone: '+573001112233', channel: 'whatsapp', status, messageSid, body });
    expect(h.rpcCalls.map((c) => c.args.p_status)).toEqual(['opted_out', 'opted_in']);
    expect(h.rpcCalls.map((c) => (c.args.p_evidence as Record<string, unknown>).message_id)).toEqual(['twilio:SM1', 'twilio:SM2']);
  });

  test('fallo de consentimiento se propaga al webhook para su reintento', async () => {
    setup('timeout de consentimiento');
    await expect(recordConsentChange({ orgId: 105, phone: '+573001112233', channel: 'whatsapp', status: 'opted_out' })).rejects.toMatchObject({ message: 'timeout de consentimiento' });
  });
});
