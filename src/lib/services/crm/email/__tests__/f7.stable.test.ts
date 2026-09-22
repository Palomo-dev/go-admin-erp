/// <reference types="jest" />
/**
 * F7 · Consolidación de las rondas (2026-09-21) — saneado, página pública,
 * payload de Resend, adjuntos, token de baja y máquina de estados.
 *
 * Casos únicos rescatados de: tester r1 (`adversarial.test.ts`), builder r2
 * (`roundTwo.test.ts`). Lo que ya afirmaban `sanitize`, `render`, `sendService`,
 * `unsubscribe` y `webhook` (.test.ts) se descartó como duplicado.
 * Sin BD real ni red: cliente Supabase falso y `svix` mockeado (ESM-only).
 */

jest.mock('svix', () => ({ Webhook: class { verify() { return undefined; } } }));

import { renderEmail } from '../render';
import { sampleContext, type RenderContext } from '../variables';
import { sanitizeEmailHtml, sanitizeInboundHtml, enforceSafeUrlAttributes, isSafeUrlValue } from '../sanitize';
import { contentSecurityPolicy, escapeHtmlText, publicPageHeaders, publicPageHtml } from '../publicPage';
import { buildResendPayload } from '../sendService';
import { loadAttachments } from '../attachments';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../unsubscribe';
import { computeTransition, handleEmailWebhook } from '../webhookService';
import type { EmailMessage } from '../types';
import type { ResolvedSender } from '../domainsService';
import { fakeSupabase } from './fakeSupabase';

const ctx = (over: Partial<RenderContext> = {}) => sampleContext(over);
const XSS = '<img src=x onerror=alert(document.domain)>';

// ─── Esquemas de URL por variable en el motor HTML crudo (tester r1 · CORREGIDO r2) ──

describe('renderEmail (html crudo) · javascript: por variable', () => {
  it('T1 · un valor `javascript:` en un href se neutraliza a href="#"', async () => {
    const r = await renderEmail({ html: '<a href="{{custom.link}}">click</a>' }, { ctx: ctx({ custom: { link: 'javascript:alert(document.domain)' } }), subject: 'x' });
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toContain('href="#"');
  });

  it('T1 · las variantes ofuscadas del esquema también caen (mayúsculas, tabs, espacio, vbscript, data:text/html)', async () => {
    for (const payload of ['JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html;base64,PHNjcmlwdD4=']) {
      const r = await renderEmail({ html: '<a href="{{custom.link}}">click</a>' }, { ctx: ctx({ custom: { link: payload } }), subject: 'x' });
      expect(r.html.toLowerCase()).not.toContain('javascript');
      expect(r.html.toLowerCase()).not.toContain('vbscript');
      expect(r.html).not.toContain('data:text/html');
      expect(r.html).toContain('href="#"');
    }
  });

  it('T1 · una URL http legítima por variable NO se toca (la & se escapa una vez)', async () => {
    const r = await renderEmail({ html: '<a href="{{custom.ok}}">ir</a>' }, { ctx: ctx({ custom: { ok: 'https://acme.co/a?b=1&c=2' } }), subject: 'x' });
    expect(r.html).toContain('https://acme.co/a?b=1&amp;c=2');
  });

  it('T1 · el <title> del shell escapa el asunto; el asunto devuelto NO se escapa (va en cabecera)', async () => {
    const r = await renderEmail({ html: '<p>hola</p>' }, { ctx: ctx({ custom: { x: 'A & B' } }), subject: '<b>Asunto</b> {{custom.x}}', preheader: 'Vista previa' });
    expect(r.html).toContain('<title>&lt;b&gt;Asunto&lt;/b&gt; A &amp; B</title>');
    expect(r.subject).toBe('<b>Asunto</b> A & B');
  });
});

describe('enforceSafeUrlAttributes / isSafeUrlValue (builder r2 #2-3)', () => {
  it('B2 · acepta http, https, mailto, tel, cid, relativas, ancla y vacío', () => {
    for (const u of ['https://a.co', 'http://a.co', 'mailto:a@b.co', 'tel:+57300', 'cid:logo', '/rel', '#ancla', '']) expect(isSafeUrlValue(u, 'href')).toBe(true);
  });

  it('B2 · rechaza javascript, vbscript, file y data:text/html; data:image vale en src pero no en href', () => {
    for (const u of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'vbscript:x', 'file:///etc/passwd', 'data:text/html,<script>']) expect(isSafeUrlValue(u, 'href')).toBe(false);
    expect(isSafeUrlValue('data:image/png;base64,AAA', 'src')).toBe(true);
    expect(isSafeUrlValue('data:image/png;base64,AAA', 'href')).toBe(false);
  });

  it('B2 · sustituye href por # y vacía src con comillas simples, dobles y sin comillas; no toca lo legítimo', () => {
    expect(enforceSafeUrlAttributes(`<a href="javascript:a()">x</a>`)).toContain('href="#"');
    expect(enforceSafeUrlAttributes(`<a href='javascript:a()'>x</a>`)).toContain('href="#"');
    expect(enforceSafeUrlAttributes(`<a href=javascript:a()>x</a>`)).toContain('href="#"');
    expect(enforceSafeUrlAttributes(`<img src="javascript:a()"/>`)).toContain('src=""');
    const html = '<a href="https://acme.co/x?a=1">x</a><img src="cid:logo"/>';
    expect(enforceSafeUrlAttributes(html)).toBe(html);
  });
});

// ─── Saneado: decisión <style> saliente vs entrante (tester r1 · DECISIÓN r2) ────

describe('sanitize · saliente vs entrante', () => {
  it('T2 · sanitizeEmailHtml CONSERVA <style> en el camino saliente (lo escribe un usuario de la org)', () => {
    expect(sanitizeEmailHtml('<style>body{background:red}</style><p>x</p>')).toContain('<style>');
  });

  it('T2 · sanitizeInboundHtml descarta <style> del remitente externo y neutraliza javascript: conservando relativas', () => {
    const clean = sanitizeInboundHtml('<style>body{background:red}</style><p>x</p><a href="{{x}}">y</a><a href="javascript:alert(1)">z</a><a href="/rel">ok</a>');
    expect(clean).not.toContain('<style>');
    expect(clean).toContain('<p>x</p>');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('href="/rel"');
  });
});

// ─── Página pública /u/[token] (builder r2 #1 · XSS almacenada) ─────────────────

describe('publicPage (/u/[token])', () => {
  it('B1 · escapa el nombre de la organización en el cuerpo (payload <img onerror>)', () => {
    const html = publicPageHtml({ title: 'Cancelar suscripción', body: `¿Deseas dejar de recibir correos de ${XSS}?`, button: 'Sí, darme de baja' });
    expect(html).not.toContain('<img');
    expect(html).not.toMatch(/<[^>]*onerror/i);
    expect(html).toContain('&lt;img src=x onerror=alert(document.domain)&gt;');
  });

  it('B1 · escapa también el título (title + h1) y la etiqueta del botón', () => {
    const html = publicPageHtml({ title: `T${XSS}`, body: 'b', button: `</button><script>alert(1)</script>` });
    expect(html).not.toMatch(/<script/i);
    expect(html.match(/&lt;img/g)?.length).toBe(2);
  });

  it('B1 · escapeHtmlText cubre & < > " \' y tolera null/undefined; sin botón no hay <form>', () => {
    expect(escapeHtmlText(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtmlText(null)).toBe('');
    expect(escapeHtmlText(undefined)).toBe('');
    expect(publicPageHtml({ title: 'Enlace no válido', body: 'x' })).not.toContain('<form');
  });

  it('B1 · cabeceras: CSP restrictiva con hash sha256 estable para el <style>, nosniff, DENY, no-referrer, no-store', () => {
    const h = publicPageHeaders();
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('no-referrer');
    expect(h['Cache-Control']).toBe('no-store');
    const csp = h['Content-Security-Policy'];
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(/style-src '(sha256-[^']+)'/.exec(contentSecurityPolicy())?.[1]).toBeTruthy();
    expect(contentSecurityPolicy()).toBe(contentSecurityPolicy());
  });
});

// ─── Payload de Resend: casos que sendService.test no afirma (tester r1) ────────

function msg(over: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000009', organization_id: 7, provider: 'resend', provider_message_id: null, template_id: null,
    to_email: 'c@x.co', to_customer_id: null, cc: null, bcc: null, from_email: 'v@org.co', subject: 'S', body_html_snapshot: '<p>x</p>',
    related_type: null, related_id: null, sequence_step_run_id: null, status: 'pending', scheduled_at: null, sent_at: null, delivered_at: null,
    first_opened_at: null, open_count: 0, first_clicked_at: null, click_count: 0, bounced_at: null, bounce_type: null, complained_at: null,
    unsubscribed_at: null, idempotency_key: 'email/aaaaaaaa-0000-4000-8000-000000000009', cost_amount: null,
    metadata: { kind: 'transactional' }, created_at: '', updated_at: '', ...over,
  };
}
const sender: ResolvedSender = { mode: 'org', domain: null, from: 'ACME <v@org.co>', fromEmail: 'v@org.co', replyTo: null, apiKey: 're_test', notice: null, receivingDomain: 'crm.acme.co', tracking: false };

describe('buildResendPayload · List-Unsubscribe', () => {
  it('T5 · con token: SOLO en marketing y sequence (transactional nunca)', () => {
    expect(buildResendPayload(msg({ metadata: { kind: 'transactional', list_unsubscribe_token: 'tok' } }), sender, []).headers['List-Unsubscribe']).toBeUndefined();
    for (const kind of ['marketing', 'sequence'] as const) {
      const p = buildResendPayload(msg({ metadata: { kind, list_unsubscribe_token: 'tok' } }), sender, []);
      expect(p.headers['List-Unsubscribe']).toContain('/u/tok');
      expect(p.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }
  });

  it('T5 · marketing SIN token no emite List-Unsubscribe (riesgo de spam, documentado)', () => {
    expect(buildResendPayload(msg({ metadata: { kind: 'marketing' } }), sender, []).headers['List-Unsubscribe']).toBeUndefined();
  });
});

// ─── Adjuntos: límites y base64 real (tester r1 · CORREGIDO r2) ─────────────────

describe('loadAttachments', () => {
  const client = () => fakeSupabase(() => ({ data: null, error: null })).client;
  const b64 = (mb: number) => 'A'.repeat(Math.ceil((mb * 1024 * 1024) / 3) * 4); // múltiplo de 4: base64 válido

  it('T6 · >40 MB inline → ATTACHMENTS_TOO_LARGE 422; el HTML cuenta para el límite', async () => {
    await expect(loadAttachments(1, [{ filename: 'big.bin', content_base64: b64(41), content_type: 'application/octet-stream' }], 0, client())).rejects.toMatchObject({ code: 'ATTACHMENTS_TOO_LARGE', status: 422 });
    await expect(loadAttachments(1, [], 41 * 1024 * 1024, client())).rejects.toMatchObject({ code: 'ATTACHMENTS_TOO_LARGE' });
  });

  it('T6 · un único adjunto de 26 MB se rechaza aunque el total no llegue a 40 MB', async () => {
    await expect(loadAttachments(1, [{ filename: 'big.bin', content_base64: b64(26), content_type: 'application/octet-stream' }], 0, client())).rejects.toMatchObject({ code: 'ATTACHMENTS_TOO_LARGE', status: 422 });
  });

  it('T6 · inline incompleto o que no es base64 → VALIDATION 400', async () => {
    await expect(loadAttachments(1, [{ filename: 'a', content_base64: '', content_type: 'x' } as never], 0, client())).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(loadAttachments(1, [{ filename: 'a.txt', content_base64: 'no-es-base64-!!!', content_type: 'text/plain' }], 0, client())).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('T6 · un base64 válido pasa y `bytes` es el tamaño REAL (no la estimación length*0.75)', async () => {
    const contenido = Buffer.from('hola mundo, esto es un adjunto', 'utf8');
    const out = await loadAttachments(1, [{ filename: 'a.txt', content_base64: contenido.toString('base64'), content_type: 'text/plain' }], 0, client());
    expect(out[0].bytes).toBe(contenido.length);
  });
});

// ─── Token de baja: id que no es UUID (tester r1) ───────────────────────────────

describe('unsubscribe token', () => {
  const OLD = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  beforeAll(() => { process.env.EMAIL_UNSUBSCRIBE_SECRET = 'secreto-de-pruebas-de-al-menos-16'; });
  afterAll(() => { process.env.EMAIL_UNSUBSCRIBE_SECRET = OLD; });

  it('T7 · un token bien firmado cuyo email_message_id no es UUID no verifica', () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken('not-a-uuid', null))).toBeNull();
  });
});

// ─── Máquina de estados: terminales absorbentes entre sí (tester r1) ────────────

describe('computeTransition · terminales', () => {
  it('T9 · bounced/failed son absorbentes entre sí; la queja posterior a un rebote va al opt-out, no al status', () => {
    expect(computeTransition('bounced', 'email.failed').status).toBe('bounced');
    expect(computeTransition('failed', 'email.bounced', 'Permanent').status).toBe('failed');
    expect(computeTransition('bounced', 'email.complained')).toMatchObject({ status: 'bounced', changed: false, optOut: 'complaint' });
    expect(computeTransition('bounced', 'email.opened')).toMatchObject({ status: 'bounced', changed: false, countOpen: true });
  });

  it('T9 · un tipo de evento desconocido con prefijo email. no rompe ni degrada', () => {
    expect(computeTransition('delivered', 'email.inventado')).toMatchObject({ status: 'delivered', changed: false });
  });
});

// ─── Webhook: CAS agotado (builder r2 #7) ───────────────────────────────────────

describe('handleEmailWebhook · CAS agotado', () => {
  const EVT = JSON.stringify({ type: 'email.opened', created_at: '2026-09-08T10:00:00Z', data: { email_id: 're_1' } });
  const headers = { 'svix-id': 'msg_cas_1', 'svix-timestamp': '1', 'svix-signature': 'v1,x' };
  const OLD = process.env.RESEND_WEBHOOK_SECRET;
  beforeAll(() => { process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdC1zZWNyZXQtcGFyYS1qZXN0'; });
  afterAll(() => { process.env.RESEND_WEBHOOK_SECRET = OLD; });

  function db(alwaysConflict: boolean) {
    const deleted: unknown[] = [];
    const row = { id: 'aaaaaaaa-0000-4000-8000-0000000000ff', organization_id: 5, status: 'sent', open_count: 0, click_count: 0, metadata: {}, to_customer_id: null, provider_message_id: 're_1' };
    const { client } = fakeSupabase((c) => {
      if (c.table === 'email_messages' && c.op === 'select') return { data: row, error: null };
      if (c.table === 'email_messages' && c.op === 'update') return { data: alwaysConflict ? [] : [{ status: 'opened' }], error: null };
      if (c.table === 'email_events' && c.op === 'insert') return { data: { id: 'ev-1' }, error: null };
      if (c.table === 'email_events' && c.op === 'delete') { deleted.push(c.filters); return { data: null, error: null }; }
      return { data: null, error: null };
    });
    return { client, deleted };
  }

  it('B7 · con 3 conflictos lanza 503 transition_conflict y borra el evento insertado (ya no 200 en silencio)', async () => {
    const { client, deleted } = db(true);
    await expect(handleEmailWebhook(EVT, headers, client)).rejects.toMatchObject({ statusCode: 503, code: 'transition_conflict' });
    expect(deleted).toHaveLength(1);
  });

  it('B7 · sin conflicto responde processed y NO borra nada', async () => {
    const { client, deleted } = db(false);
    expect((await handleEmailWebhook(EVT, headers, client)).processed).toBe(true);
    expect(deleted).toHaveLength(0);
  });
});
