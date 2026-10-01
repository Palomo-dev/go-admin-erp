import { applyInboundConsent, listConsents, setConsent } from '../consent';
import { makeSupabase } from './mockSupabase';

test('la baja pasa org/canal/evidencia a una RPC, sin lecturas y escrituras parciales', async () => {
  const { sb, calls, rpcCalls } = makeSupabase({}, () => ({ data: { status: 'opted_out', skipped: 240 } }));
  await setConsent(120, 'fixture-customer', 'whatsapp', 'opted_out', 'inbound_keyword', { message_id: 'fixture-message' }, sb);
  expect(calls).toHaveLength(0);
  expect(rpcCalls).toEqual([{ fn: 'crm_set_contact_consent', args: { p_org: 120, p_customer: 'fixture-customer',
    p_channel: 'whatsapp', p_status: 'opted_out', p_source: 'inbound_keyword', p_evidence: { message_id: 'fixture-message' } } }]);
});
test('un fallo de registro se propaga: no aparenta que la baja se aplicó', async () => {
  const { sb } = makeSupabase({}, () => ({ error: { message: 'fixture' } }));
  await expect(setConsent(120, 'fixture', 'email', 'opted_out', 'fixture', {}, sb)).rejects.toMatchObject({ message: 'fixture' });
});
test.each(['none', 'opted_out', 'opted_in'])('inbound %s se resuelve desde el mensaje persistido', async action => {
  const { sb, calls, rpcCalls } = makeSupabase({}, () => ({ data: action }));
  expect(await applyInboundConsent({ orgId: 120, customerId: 'fixture', messageId: 'fixture-message' }, sb)).toBe(action);
  expect(calls).toHaveLength(0);
  expect(rpcCalls[0]).toEqual({ fn: 'crm_apply_inbound_contact_consent', args: { p_org: 120, p_message: 'fixture-message' } });
});
test.each([null, 'implicit_opt_in', true])('una respuesta desconocida %s no se interpreta como consentimiento', async value => {
  const { sb } = makeSupabase({}, () => ({ data: value }));
  await expect(applyInboundConsent({ orgId: 120, customerId: 'fixture', messageId: 'fixture' }, sb)).rejects.toThrow('Respuesta de consentimiento inválida');
});
test('fallos de lectura o postprocesado no se convierten en lista vacía o acción none', async () => {
  const { sb } = makeSupabase({ contact_consents: () => ({ error: { message: 'fixture' } }) }, () => ({ error: { message: 'fixture' } }));
  await expect(listConsents(120, 'fixture', sb)).rejects.toMatchObject({ message: 'fixture' });
  await expect(applyInboundConsent({ orgId: 120, customerId: 'fixture', messageId: 'fixture' }, sb)).rejects.toMatchObject({ message: 'fixture' });
});
