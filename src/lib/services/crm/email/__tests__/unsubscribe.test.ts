/// <reference types="jest" />
import { applyUnsubscribe, signUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from '../unsubscribe';
import { fakeSupabase, eqValue } from './fakeSupabase';

const MSG = '11111111-2222-4333-8444-555555555555';
const CUST = '99999999-2222-4333-8444-555555555555';

beforeAll(() => {
  process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-with-16-plus-chars';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test/';
});

describe('token de baja', () => {
  it('firma y verifica (roundtrip) y construye la URL pública', () => {
    const t = signUnsubscribeToken(MSG, CUST);
    expect(verifyUnsubscribeToken(t)).toEqual({ email_message_id: MSG, customer_id: CUST });
    expect(unsubscribeUrl(t)).toBe(`https://app.test/u/${t}`);
    expect(t).toMatch(/^[A-Za-z0-9_-]+\.[a-f0-9]{32}$/);
  });

  it('rechaza firma alterada, payload alterado, formato inválido y tokens largos', () => {
    const t = signUnsubscribeToken(MSG, null);
    const [payload, sig] = t.split('.');
    expect(verifyUnsubscribeToken(`${payload}.${sig.replace(/^./, sig[0] === 'a' ? 'b' : 'a')}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${payload}x.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken('sin-punto')).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('a'.repeat(600))).toBeNull();
  });

  it('cambia con el secreto', () => {
    const t = signUnsubscribeToken(MSG, CUST);
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'otro-secreto-de-16-o-mas';
    expect(verifyUnsubscribeToken(t)).toBeNull();
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-with-16-plus-chars';
  });
});

describe('applyUnsubscribe', () => {
  it('token inválido → ok:false sin tocar la BD', async () => {
    const { client, calls } = fakeSupabase(() => ({ data: null, error: null }));
    expect(await applyUnsubscribe('bad.token', 'page', client)).toEqual({ ok: false });
    expect(calls).toHaveLength(0);
  });

  it('marca el mensaje unsubscribed, opted_out en contact_consents y do_not_email en customers', async () => {
    const { client, calls } = fakeSupabase((c) => {
      if (c.table === 'email_messages' && c.op === 'select') return { data: { id: MSG, organization_id: 7, to_customer_id: CUST, to_email: 'a@b.co', status: 'delivered', unsubscribed_at: null }, error: null };
      if (c.table === 'customers' && c.op === 'select') return { data: { metadata: { foo: 1 } }, error: null };
      if (c.table === 'organizations') return { data: { name: 'ACME' }, error: null };
      return { data: null, error: null };
    });
    const r = await applyUnsubscribe(signUnsubscribeToken(MSG, CUST), 'one_click', client);
    expect(r).toEqual({ ok: true, org_name: 'ACME' });
    const upd = calls.find((c) => c.table === 'email_messages' && c.op === 'update');
    expect((upd?.args[0] as Record<string, unknown>).status).toBe('unsubscribed');
    const consent = calls.find((c) => c.table === 'contact_consents' && c.op === 'upsert');
    expect(consent?.args[0]).toMatchObject({ organization_id: 7, customer_id: CUST, channel: 'email', status: 'opted_out', source: 'one_click' });
    expect(consent?.args[1]).toEqual({ onConflict: 'organization_id,customer_id,channel' });
    const cust = calls.find((c) => c.table === 'customers' && c.op === 'update');
    expect((cust?.args[0] as { metadata: Record<string, unknown> }).metadata).toMatchObject({ foo: 1, do_not_email: true, email_suppressed_reason: 'one_click' });
    expect(eqValue(cust!, 'organization_id')).toBe(7);
  });

  it('es idempotente: un mensaje ya dado de baja responde ok igual', async () => {
    const { client } = fakeSupabase((c) => {
      if (c.table === 'email_messages' && c.op === 'select') return { data: { id: MSG, organization_id: 7, to_customer_id: null, to_email: 'a@b.co', status: 'unsubscribed', unsubscribed_at: '2026-01-01' }, error: null };
      if (c.table === 'organizations') return { data: null, error: null };
      return { data: null, error: null };
    });
    expect(await applyUnsubscribe(signUnsubscribeToken(MSG, null), 'page', client)).toEqual({ ok: true, org_name: undefined });
  });
});
