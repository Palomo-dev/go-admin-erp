/// <reference types="jest" />
/**
 * Envío: payload Resend en camelCase (tester-ANEXO-B #4), Idempotency-Key
 * `email/{id}`, List-Unsubscribe solo marketing/sequence, orden fila →
 * proveedor, consentimiento fail-closed, programación >1 h → outbound_jobs.
 */
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn(async () => 'job-1') }));
jest.mock('../attachments', () => ({
  loadAttachments: jest.fn(async () => []), toRefs: (l: unknown[]) => l, refsToInputs: () => [],
}));
const sendMock = jest.fn(async () => ({ data: { id: 're_new' }, error: null }));
jest.mock('../resendClient', () => ({
  getResendClient: () => ({ emails: { send: sendMock, cancel: jest.fn(async () => ({ error: null })) } }),
  getResendRateLimiter: () => ({ wait: async () => undefined }),
  getMasterResendKey: () => 're_master', getMasterResend: () => ({}),
}));
const resolveSenderMock = jest.fn(async (..._args: unknown[]) => ({
  mode: 'org', domain: { id: 'dom-1', domain: 'crm.acme.co' }, from: 'ACME <ventas@crm.acme.co>', fromEmail: 'ventas@crm.acme.co', replyTo: null, apiKey: 're_dom', notice: null, receivingDomain: 'crm.acme.co', tracking: false,
}));
jest.mock('../domainsService', () => ({ resolveSender: (...a: unknown[]) => resolveSenderMock(...a) }));

import { enqueueJob } from '@/lib/jobs/enqueue';
import { buildIdempotencyKey } from '../messageStore';
import { buildResendPayload, sendEmail } from '../sendService';
import type { EmailMessage } from '../types';
import { signUnsubscribeToken } from '../unsubscribe';
import { fakeSupabase, type FakeCall } from './fakeSupabase';

beforeAll(() => { process.env.EMAIL_UNSUBSCRIBE_SECRET = 'test-secret-with-16-plus-chars'; process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'; });
beforeEach(() => { sendMock.mockClear(); (enqueueJob as jest.Mock).mockClear(); });

const sender = { mode: 'org' as const, domain: null, from: 'ACME <v@crm.acme.co>', fromEmail: 'v@crm.acme.co', replyTo: 'ana@acme.co', apiKey: 'k', notice: null, receivingDomain: 'crm.acme.co', tracking: false };
const base = (): EmailMessage => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000009', organization_id: 5, provider: 'resend', provider_message_id: null, template_id: null, to_email: 'c@x.co', to_customer_id: 'cust-1', cc: ['cc@x.co'], bcc: null,
  from_email: 'v@crm.acme.co', subject: 'Hola', body_html_snapshot: '<p>hi</p>', related_type: 'opportunity', related_id: 'opp-1', sequence_step_run_id: null, status: 'pending', scheduled_at: null,
  sent_at: null, delivered_at: null, first_opened_at: null, open_count: 0, first_clicked_at: null, click_count: 0, bounced_at: null, bounce_type: null, complained_at: null, unsubscribed_at: null,
  idempotency_key: 'email/aaaaaaaa-0000-4000-8000-000000000009', cost_amount: null, metadata: { kind: 'transactional', reply_to: 'crm+aaaaaaaa-0000-4000-8000-000000000009@crm.acme.co', body_text_snapshot: 'hi' }, created_at: '', updated_at: '',
});

describe('buildResendPayload', () => {
  it('usa nombres camelCase del SDK (replyTo, scheduledAt, contentType) y tags tenant_id/related', () => {
    const p = buildResendPayload(base(), sender, [{ filename: 'a.pdf', content_type: 'application/pdf', bytes: 3, base64: 'QUJD' }], '2026-09-09T10:00:00.000Z');
    expect(p.replyTo).toBe('crm+aaaaaaaa-0000-4000-8000-000000000009@crm.acme.co');
    expect(p.scheduledAt).toBe('2026-09-09T10:00:00.000Z');
    expect(p).not.toHaveProperty('reply_to');
    expect(p).not.toHaveProperty('scheduled_at');
    expect(p.attachments?.[0]).toEqual({ filename: 'a.pdf', content: 'QUJD', contentType: 'application/pdf' });
    expect(p.tags).toEqual(expect.arrayContaining([{ name: 'tenant_id', value: '5' }, { name: 'email_message_id', value: base().id }, { name: 'related', value: 'opportunity_opp-1' }]));
    expect(p.headers['Message-ID']).toBe('<aaaaaaaa-0000-4000-8000-000000000009@crm.acme.co>');
    expect(p.headers).not.toHaveProperty('List-Unsubscribe');
    expect(p.cc).toEqual(['cc@x.co']);
  });

  it('List-Unsubscribe (+ One-Click) solo con kind marketing/sequence y token; In-Reply-To en hilos', () => {
    const tok = signUnsubscribeToken(base().id, 'cust-1');
    const m = base();
    m.metadata = { ...m.metadata, kind: 'marketing', list_unsubscribe_token: tok, in_reply_to: 'bbbbbbbb-0000-4000-8000-000000000001', thread_id: 'bbbbbbbb-0000-4000-8000-000000000001' };
    const p = buildResendPayload(m, sender, []);
    expect(p.headers['List-Unsubscribe']).toContain(`<https://app.test/u/${tok}>`);
    expect(p.headers['List-Unsubscribe']).toContain('mailto:unsubscribe@crm.acme.co');
    expect(p.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(p.headers['In-Reply-To']).toBe('<bbbbbbbb-0000-4000-8000-000000000001@crm.acme.co>');
    expect(p.scheduledAt).toBeUndefined();
    expect(p.attachments).toBeUndefined();
  });

  it('buildIdempotencyKey sigue el formato recomendado <event>/<entity-id>', () => {
    expect(buildIdempotencyKey('abc')).toBe('email/abc');
  });
});

function sendDb(opts: { canContact?: boolean } = {}) {
  const rows: Record<string, unknown>[] = [];
  const inserted: Record<string, unknown>[] = [];
  const activities: unknown[] = [];
  const handler = (c: FakeCall) => {
    if (c.table === 'customers') return { data: { id: 'cust-1', first_name: 'Carlos', last_name: 'Pérez', full_name: 'Carlos Pérez', email: 'c@x.co', phone: '', company_name: 'X' }, error: null };
    if (c.table === 'organizations') return { data: { id: 5, name: 'ACME' }, error: null };
    if (c.table === 'email_messages' && c.op === 'insert') { const r = { ...(c.args[0] as Record<string, unknown>), created_at: 'x', updated_at: 'x' }; inserted.push({ ...r }); rows.push(r); return { data: r, error: null }; }
    if (c.table === 'email_messages' && c.op === 'update') { const r = rows[0]; Object.assign(r, c.args[0]); return { data: r, error: null }; }
    if (c.table === 'activities' && c.op === 'insert') { activities.push(c.args[0]); return { data: { id: 'act-1' }, error: null }; }
    if (c.table === 'activities') return { data: null, error: null };
    if (c.table === 'templates') return { data: null, error: null };
    return { data: null, error: null };
  };
  const { client, calls } = fakeSupabase(handler, async (fn) => ({ data: fn === 'fn_can_contact' ? opts.canContact !== false : null, error: null }));
  return { client, calls, rows, inserted, activities };
}

describe('sendEmail', () => {
  const actor = { userId: 'user-1', userEmail: 'ana@acme.co', orgName: 'ACME' };

  it('inserta la fila (pending, idempotency email/{id}) y UNA activity antes de llamar a Resend con idempotencyKey', async () => {
    const { client, calls, rows, inserted, activities } = sendDb();
    const r = await sendEmail(5, actor, { to: ['C@x.co'], subject: 'Hola {{contact.first_name|hola}}', content: { html: '<p>Hola {{contact.first_name|amigo}}</p>' }, related_type: 'opportunity', related_id: 'aaaaaaaa-0000-4000-8000-00000000000a' }, client);
    expect(r.message.status).toBe('sent');
    expect(r.message.provider_message_id).toBe('re_new');
    // La fila se inserta en `pending` ANTES de llamar al proveedor y luego pasa a `sent`.
    expect(inserted[0]).toMatchObject({ status: 'pending', to_email: 'c@x.co', idempotency_key: `email/${rows[0].id}`, organization_id: 5, provider: 'resend' });
    expect(rows[0].status).toBe('sent');
    const order = calls.map((c) => `${c.table}:${c.op}`);
    expect(order.indexOf('email_messages:insert')).toBeLessThan(order.indexOf('activities:insert'));
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ activity_type: 'email', channel: 'email', email_message_id: rows[0].id, organization_id: 5 });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const [payload, opts] = sendMock.mock.calls[0] as unknown as [Record<string, unknown>, { idempotencyKey: string }];
    expect(opts.idempotencyKey).toBe(`email/${rows[0].id}`);
    expect(payload.subject).toBe('Hola Carlos');
    expect(String(payload.html)).toContain('Hola Carlos');
    expect(payload.from).toBe('ACME <ventas@crm.acme.co>');
  });

  it('bloquea por consentimiento (403 CONTACT_OPTED_OUT) sin crear fila ni llamar al proveedor', async () => {
    const { client, rows } = sendDb({ canContact: false });
    await expect(sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' } }, client)).rejects.toMatchObject({ code: 'CONTACT_OPTED_OUT', status: 403 });
    expect(rows).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('variables faltantes → 422 MISSING_VARIABLES (strict) y valida destinatarios/asunto', async () => {
    const { client } = sendDb();
    await expect(sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>{{custom.nope}}</p>' } }, client)).rejects.toMatchObject({ code: 'MISSING_VARIABLES', status: 422 });
    await expect(sendEmail(5, actor, { to: [], subject: 'S', content: { html: '<p>x</p>' } }, client)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(sendEmail(5, actor, { to: ['no-es-email'], subject: 'S', content: { html: '<p>x</p>' } }, client)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(sendEmail(5, actor, { to: Array.from({ length: 51 }, (_, i) => `u${i}@x.co`), subject: 'S', content: { html: '<p>x</p>' } }, client)).rejects.toMatchObject({ code: 'TOO_MANY_RECIPIENTS' });
    await expect(sendEmail(5, actor, { to: ['c@x.co'], subject: '', content: { html: '<p>x</p>' } }, client)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('programado >1 h → outbound_jobs (kind email, dedupe email/{id}) sin llamar a Resend; ≤1 h → scheduledAt', async () => {
    const { client, rows } = sendDb();
    const far = new Date(Date.now() + 5 * 3600_000).toISOString();
    const r = await sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' }, scheduled_at: far }, client);
    expect(r.scheduled).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    expect(enqueueJob).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 5, kind: 'email', runAt: far, dedupeKey: `email/${rows[0].id}`, payload: { email_message_id: rows[0].id } }));
    expect(r.message.metadata.scheduled_job_id).toBe('job-1');

    const near = new Date(Date.now() + 20 * 60_000).toISOString();
    const r2 = await sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' } , scheduled_at: near }, client);
    expect(r2.scheduled).toBe(true);
    const payload = (sendMock.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(payload.scheduledAt).toBe(near);
    const tooFar = new Date(Date.now() + 31 * 86400_000).toISOString();
    await expect(sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' }, scheduled_at: tooFar }, client)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  // Ronda 2 (tester r1 #8): el envío de prueba sigue saltándose `fn_can_contact`
  // (el destinatario lo acota la ruta test-send) pero YA NO es invisible: deja
  // exactamente una activity marcada como prueba.
  it('marketing: genera token de baja y lo pone en List-Unsubscribe; test: sin consentimiento pero CON activity de prueba', async () => {
    const { client, activities } = sendDb({ canContact: false });
    const r = await sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' }, kind: 'marketing', test: true }, client);
    expect(activities).toHaveLength(1);
    const act = activities[0] as { notes?: unknown; metadata?: Record<string, unknown> };
    expect(act.metadata?.test).toBe(true);
    expect(String(act.notes)).toContain('Prueba de plantilla');
    expect(r.message.metadata.test).toBe(true);
    const { client: c2 } = sendDb();
    const r2 = await sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>x {{contact.first_name}}</p>' }, kind: 'marketing' }, c2);
    expect(r2.message.metadata.list_unsubscribe_token).toBeTruthy();
    const payload = (sendMock.mock.calls[1] as unknown as [{ headers: Record<string, string> }])[0];
    expect(payload.headers['List-Unsubscribe']).toContain('/u/');
  });

  it('client_request_id repetido devuelve el mensaje existente sin reenviar', async () => {
    const { client } = fakeSupabase((c) => (c.table === 'email_messages' && c.op === 'select' ? { data: { ...base(), metadata: { client_request_id: 'req-1' } }, error: null } : { data: null, error: null }));
    const r = await sendEmail(5, actor, { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' }, client_request_id: 'req-1' }, client);
    expect(r.warnings).toContain('duplicate_client_request');
    expect(sendMock).not.toHaveBeenCalled();
  });
});
