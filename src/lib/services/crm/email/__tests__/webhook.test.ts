/// <reference types="jest" />
/**
 * Webhook Resend: firma svix (fail-closed), idempotencia por svix-id,
 * máquina de estados monótona, contadores, opt-out por bounce/complaint.
 * svix es ESM-only: se mockea con el algoritmo Standard Webhooks real
 * (HMAC-SHA256 base64 de `${id}.${ts}.${body}` con el secreto whsec_ base64).
 * `svixReturnsVoid` reproduce svix ≥2.2, donde `Webhook.verify()` valida y
 * devuelve `undefined` en vez del payload parseado (1.x sí lo devolvía).
 */
import crypto from 'crypto';

const svixMode = { returnsVoid: false };

jest.mock('svix', () => {
  const c = jest.requireActual('crypto') as typeof import('crypto');
  return {
    Webhook: class {
      private key: Buffer;
      constructor(secret: string) { this.key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64'); }
      verify(payload: string, headers: Record<string, string>) {
        const expected = c.createHmac('sha256', this.key).update(`${headers['svix-id']}.${headers['svix-timestamp']}.${payload}`).digest('base64');
        const ok = String(headers['svix-signature'] ?? '').split(' ').some((s) => s.split(',')[1] === expected);
        if (!ok) throw new Error('No matching signature found');
        return svixMode.returnsVoid ? undefined : JSON.parse(payload);
      }
    },
  };
});
jest.mock('../domainsService', () => ({ refreshDomainByProviderId: jest.fn(async () => undefined) }));
jest.mock('../inboundService', () => ({ ingestReceivedEmail: jest.fn(async () => ({ email_message_id: 'in-1' })) }));

import { WebhookError } from '@/lib/security/webhookSignatures';
import { computeTransition, handleEmailWebhook } from '../webhookService';
import { ingestReceivedEmail } from '../inboundService';
import type { EmailMessage } from '../types';
import { fakeSupabase, type FakeCall } from './fakeSupabase';

const SECRET = 'whsec_' + Buffer.from('super-secret-key-for-tests').toString('base64');
const MSG_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function sign(body: string, id = 'msg_1', ts = String(Math.floor(Date.now() / 1000))) {
  const sig = crypto.createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
}

function message(over: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: MSG_ID, organization_id: 5, provider: 'resend', provider_message_id: 're_abc', template_id: null, to_email: 'c@x.co', to_customer_id: 'cust-1', cc: null, bcc: null,
    from_email: 'v@org.co', subject: 'S', body_html_snapshot: '', related_type: 'opportunity', related_id: 'opp-1', sequence_step_run_id: null, status: 'sent', scheduled_at: null,
    sent_at: '2026-09-08T10:00:00Z', delivered_at: null, first_opened_at: null, open_count: 0, first_clicked_at: null, click_count: 0, bounced_at: null, bounce_type: null,
    complained_at: null, unsubscribed_at: null, idempotency_key: `email/${MSG_ID}`, cost_amount: null, metadata: { kind: 'marketing', campaign_id: 'camp-1' }, created_at: '', updated_at: '', ...over,
  };
}

/** BD en memoria mínima: un mensaje, eventos con UNIQUE(provider_event_id). */
function db(initial: EmailMessage) {
  const state = { msg: initial, events: new Set<string>(), consents: [] as unknown[], activities: [] as unknown[], rpc: [] as string[] };
  const handler = (c: FakeCall) => {
    if (c.table === 'email_messages') {
      if (c.op === 'select') {
        const byProvider = c.filters.find((f) => f[0] === 'eq' && f[1] === 'provider_message_id')?.[2];
        const byId = c.filters.find((f) => f[0] === 'eq' && f[1] === 'id')?.[2];
        if ((byProvider && byProvider === state.msg.provider_message_id) || (byId && byId === state.msg.id)) return { data: state.msg, error: null };
        return { data: null, error: null };
      }
      if (c.op === 'update') {
        const guardStatus = c.filters.find((f) => f[0] === 'eq' && f[1] === 'status')?.[2];
        if (guardStatus && guardStatus !== state.msg.status) return { data: [], error: null };
        state.msg = { ...state.msg, ...(c.args[0] as Partial<EmailMessage>) };
        return { data: [{ status: state.msg.status }], error: null };
      }
    }
    if (c.table === 'email_events' && c.op === 'insert') {
      const row = c.args[0] as { provider_event_id: string };
      if (state.events.has(row.provider_event_id)) return { data: null, error: { code: '23505', message: 'duplicate' } };
      state.events.add(row.provider_event_id);
      return { data: { id: `ev-${state.events.size}` }, error: null };
    }
    if (c.table === 'contact_consents') { state.consents.push(c.args[0]); return { data: null, error: null }; }
    if (c.table === 'customers') return c.op === 'select' ? { data: { metadata: {} }, error: null } : { data: null, error: null };
    if (c.table === 'activities') { if (c.op === 'select') return { data: { id: 'act-1', metadata: {} }, error: null }; state.activities.push(c.args[0]); return { data: null, error: null }; }
    return { data: null, error: null };
  };
  const { client } = fakeSupabase(handler, async (fn) => { state.rpc.push(fn); return { data: null, error: null }; });
  return { client, state };
}

beforeEach(() => { process.env.RESEND_WEBHOOK_SECRET = SECRET; svixMode.returnsVoid = false; });

describe('computeTransition (máquina de estados monótona)', () => {
  it('sube de rango y nunca baja', () => {
    expect(computeTransition('pending', 'email.sent')).toMatchObject({ status: 'sent', changed: true });
    expect(computeTransition('sent', 'email.delivered')).toMatchObject({ status: 'delivered', changed: true });
    expect(computeTransition('delivered', 'email.opened')).toMatchObject({ status: 'opened', changed: true, countOpen: true });
    expect(computeTransition('opened', 'email.clicked')).toMatchObject({ status: 'clicked', changed: true, countClick: true });
    expect(computeTransition('clicked', 'email.opened')).toMatchObject({ status: 'clicked', changed: false, countOpen: true });
    expect(computeTransition('opened', 'email.sent')).toMatchObject({ status: 'opened', changed: false });
    expect(computeTransition('opened', 'email.delivered')).toMatchObject({ status: 'opened', changed: false });
  });
  it('bounce temporal no cambia estado; permanente es terminal con opt-out; complaint terminal', () => {
    expect(computeTransition('delivered', 'email.bounced', 'Temporary')).toMatchObject({ status: 'delivered', changed: false, softBounce: true, optOut: null });
    expect(computeTransition('delivered', 'email.bounced', 'Permanent')).toMatchObject({ status: 'bounced', changed: true, optOut: 'hard_bounce' });
    expect(computeTransition('clicked', 'email.complained')).toMatchObject({ status: 'complained', changed: true, optOut: 'complaint' });
    expect(computeTransition('bounced', 'email.delivered')).toMatchObject({ status: 'bounced', changed: false });
    expect(computeTransition('complained', 'email.clicked')).toMatchObject({ status: 'complained', changed: false });
    expect(computeTransition('unsubscribed', 'email.opened')).toMatchObject({ status: 'unsubscribed', changed: false, countOpen: true });
  });
  it('eventos informativos y desconocidos no cambian nada', () => {
    expect(computeTransition('sent', 'email.delivery_delayed')).toMatchObject({ status: 'sent', changed: false });
    expect(computeTransition('sent', 'email.scheduled')).toMatchObject({ changed: false });
    expect(computeTransition('sent', 'contact.created')).toMatchObject({ changed: false });
  });
});

describe('handleEmailWebhook', () => {
  const body = (type: string, extra: Record<string, unknown> = {}) => JSON.stringify({ type, created_at: '2026-09-08T11:00:00Z', data: { email_id: 're_abc', tags: { tenant_id: '5', email_message_id: MSG_ID }, ...extra } });

  it('fail-closed: sin secreto → 401; firma inválida → 401; sin insertar nada', async () => {
    const { client, state } = db(message());
    const raw = body('email.delivered');
    delete process.env.RESEND_WEBHOOK_SECRET;
    await expect(handleEmailWebhook(raw, sign(raw), client)).rejects.toMatchObject({ statusCode: 401, code: 'resend_webhook_secret_missing' });
    process.env.RESEND_WEBHOOK_SECRET = SECRET;
    const bad = { ...sign(raw), 'svix-signature': 'v1,AAAA' };
    await expect(handleEmailWebhook(raw, bad, client)).rejects.toBeInstanceOf(WebhookError);
    await expect(handleEmailWebhook(raw + ' ', sign(raw), client)).rejects.toBeInstanceOf(WebhookError);
    expect(state.events.size).toBe(0);
    expect(state.msg.status).toBe('sent');
  });

  it('svix ≥2 (verify devuelve void): parsea el body ya verificado; JSON inválido → 400', async () => {
    svixMode.returnsVoid = true;
    const { client, state } = db(message());
    const d = body('email.delivered');
    expect(await handleEmailWebhook(d, sign(d, 'v2-1'), client)).toMatchObject({ processed: true, status: 'delivered' });
    expect(state.msg.status).toBe('delivered');
    const notJson = 'no-soy-json';
    await expect(handleEmailWebhook(notJson, sign(notJson, 'v2-2'), client)).rejects.toMatchObject({ statusCode: 400, code: 'invalid_json' });
    const noType = JSON.stringify({ data: {} });
    await expect(handleEmailWebhook(noType, sign(noType, 'v2-3'), client)).rejects.toMatchObject({ statusCode: 400, code: 'invalid_payload' });
  });

  it('procesa delivered → opened ×2 → clicked con contadores y evento único por svix-id', async () => {
    const { client, state } = db(message());
    const d = body('email.delivered');
    expect(await handleEmailWebhook(d, sign(d, 'id-1'), client)).toMatchObject({ processed: true, status: 'delivered' });
    expect(state.msg.delivered_at).toBe('2026-09-08T11:00:00Z');
    const o = body('email.opened');
    await handleEmailWebhook(o, sign(o, 'id-2'), client);
    expect(await handleEmailWebhook(o, sign(o, 'id-2'), client)).toMatchObject({ processed: false, duplicate: true });
    await handleEmailWebhook(o, sign(o, 'id-3'), client);
    expect(state.msg.status).toBe('opened');
    expect(state.msg.open_count).toBe(2);
    expect(state.msg.first_opened_at).toBe('2026-09-08T11:00:00Z');
    const c = body('email.clicked', { click: { link: 'https://x.co/p' } });
    await handleEmailWebhook(c, sign(c, 'id-4'), client);
    expect(state.msg.status).toBe('clicked');
    expect(state.msg.click_count).toBe(1);
    expect(state.msg.metadata.last_click_link).toBe('https://x.co/p');
    // evento tardío "sent" no degrada
    const s = body('email.sent');
    await handleEmailWebhook(s, sign(s, 'id-5'), client);
    expect(state.msg.status).toBe('clicked');
    expect(state.events.size).toBe(5);
    expect(state.rpc).toEqual(expect.arrayContaining(['fn_campaign_mark_sent', 'fn_campaign_mark_opened', 'fn_campaign_mark_clicked']));
  });

  it('bounce permanente → bounced + contact_consents opted_out (hard_bounce); temporal solo cuenta', async () => {
    const { client, state } = db(message({ status: 'delivered' }));
    const soft = body('email.bounced', { bounce: { type: 'Temporary', message: 'mailbox full' } });
    await handleEmailWebhook(soft, sign(soft, 'b-1'), client);
    expect(state.msg.status).toBe('delivered');
    expect(state.msg.metadata.soft_bounces).toBe(1);
    expect(state.consents).toHaveLength(0);
    const hard = body('email.bounced', { bounce: { type: 'Permanent', message: 'no such user' } });
    await handleEmailWebhook(hard, sign(hard, 'b-2'), client);
    expect(state.msg.status).toBe('bounced');
    expect(state.msg.bounce_type).toBe('hard');
    expect(state.consents[0]).toMatchObject({ customer_id: 'cust-1', channel: 'email', status: 'opted_out', source: 'hard_bounce' });
  });

  it('complaint → complained + opt-out; mensaje desconocido → not_found; tags como array también enrutan', async () => {
    const { client, state } = db(message({ provider_message_id: 'otro' }));
    const arr = JSON.stringify({ type: 'email.complained', data: { email_id: 'no-existe', tags: [{ name: 'email_message_id', value: MSG_ID }] } });
    expect(await handleEmailWebhook(arr, sign(arr, 'c-1'), client)).toMatchObject({ processed: true, status: 'complained' });
    expect(state.consents[0]).toMatchObject({ source: 'complaint' });
    const unknown = JSON.stringify({ type: 'email.opened', data: { email_id: 'zzz' } });
    expect(await handleEmailWebhook(unknown, sign(unknown, 'c-2'), client)).toMatchObject({ processed: false, reason: 'message_not_found' });
  });

  it('email.received delega en inbound y domain.* refresca el dominio', async () => {
    const { client } = db(message());
    const rec = JSON.stringify({ type: 'email.received', data: { email_id: 'in_1', to: ['crm+x@org.co'] } });
    expect(await handleEmailWebhook(rec, sign(rec, 'r-1'), client)).toMatchObject({ processed: true });
    expect(ingestReceivedEmail).toHaveBeenCalledWith('in_1', ['crm+x@org.co'], client, 'r-1');
    const dom = JSON.stringify({ type: 'domain.updated', data: { id: 'dom_1' } });
    expect(await handleEmailWebhook(dom, sign(dom, 'd-1'), client)).toMatchObject({ processed: true, reason: 'domain.updated' });
  });
});
