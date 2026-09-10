/// <reference types="jest" />
/**
 * F7 · Suite adversarial del tester (ronda 1).
 *
 * Objetivo: romper el render de variables/bloques, la sanitización, el payload
 * de Resend y los límites. NO defiende la implementación: varios `expect`
 * documentan el comportamiento REAL observado; los que marcaban un defecto
 * llevaban el prefijo `[BUG]`.
 *
 * RONDA 2 (builder F7): los 6 `[BUG]` se han corregido en el código y sus tests
 * están INVERTIDOS — ahora llevan `[CORREGIDO r2]` y afirman el comportamiento
 * seguro, con casos extra alrededor de cada arreglo. El único que se mantiene
 * como estaba es `<style>` en el camino saliente, que pasa a ser una decisión
 * explícita (`[DECISIÓN r2]`) con su contrapartida en el entrante.
 */

// `svix` es ESM-only y `webhookService` lo arrastra vía webhookSignatures.
// Aquí sólo se usa `computeTransition` (pura); la firma REAL se prueba fuera de
// jest, con el paquete instalado (ver scratchpad/f7-tester-svix.mts).
jest.mock('svix', () => ({ Webhook: class { verify() { return undefined; } } }));

import { renderVariables, sampleContext, escapeHtml, getPath, type RenderContext } from '../variables';
import { renderEmail } from '../render';
import { sanitizeEmailHtml, sanitizeFragment, sanitizeInboundHtml, htmlToText } from '../sanitize';
import { parseBlockDocument, safeParseBlockDocument, BLOCK_TYPES, createBlock, type BlockDocumentInput } from '../blocks';
import { renderBlockDocument } from '../renderBlocks';
import { buildResendPayload } from '../sendService';
import { buildIdempotencyKey } from '../messageStore';
import { loadAttachments } from '../attachments';
import { signUnsubscribeToken, verifyUnsubscribeToken } from '../unsubscribe';
import { mapProviderStatus, dmarcRecord } from '../domainsService';
import { computeTransition } from '../webhookService';
import type { EmailMessage } from '../types';
import type { ResolvedSender } from '../domainsService';
import { fakeSupabase } from './fakeSupabase';

const ctx = (over: Partial<RenderContext> = {}) => sampleContext(over);

// ─── 1. Variables: rutas, defaults, filtros ──────────────────────────────────

describe('variables · rutas y filtros', () => {
  it('resuelve dot-paths anidados', () => {
    expect(renderVariables('{{contact.first_name}} de {{org.name}}', ctx()).out).toBe('Carlos de ACME S.A.S');
  });

  it('usa el default {{x|y}} cuando el valor está vacío y NO lo reporta como faltante', () => {
    const r = renderVariables('{{contact.nope|Cliente}}', ctx());
    expect(r.out).toBe('Cliente');
    expect(r.missing).toEqual([]);
  });

  it('reporta la variable faltante y la sustituye por cadena vacía', () => {
    const r = renderVariables('Hola {{contact.nope}}!', ctx());
    expect(r.out).toBe('Hola !');
    expect(r.missing).toContain('contact.nope');
  });

  it('filtro money usa la moneda de la oportunidad', () => {
    const out = renderVariables('{{opportunity.amount|money}}', ctx()).out;
    expect(out).toMatch(/1\.200\.000/);
  });

  it('filtro date y date:short', () => {
    const long = renderVariables('{{opportunity.expected_close_date|date}}', ctx()).out;
    const short = renderVariables('{{opportunity.expected_close_date|date:short}}', ctx()).out;
    expect(long).toMatch(/octubre/i);
    expect(short).toBe('01/10/2026');
  });

  it('date de una columna DATE no se desplaza un día por la zona horaria', () => {
    const r = renderVariables('{{quote.valid_until|date:short}}', ctx());
    expect(r.out).toBe('15/10/2026');
  });

  it('upper/lower', () => {
    expect(renderVariables('{{contact.first_name|upper}}', ctx()).out).toBe('CARLOS');
    expect(renderVariables('{{contact.first_name|lower}}', ctx()).out).toBe('carlos');
  });

  it('bloquea __proto__/constructor/prototype en la ruta', () => {
    expect(getPath(ctx(), 'contact.__proto__')).toBeUndefined();
    expect(getPath(ctx(), 'constructor.name')).toBeUndefined();
    expect(renderVariables('{{contact.constructor}}', ctx()).out).toBe('');
  });

  it('{{{raw}}} se elimina y se reporta como raw:<path>', () => {
    const r = renderVariables('a{{{custom.summary}}}b', ctx());
    expect(r.out).toBe('ab');
    expect(r.missing).toContain('raw:custom.summary');
  });

  it('una expresión con ruta inválida se deja literal (no revienta)', () => {
    expect(renderVariables('{{ 1 + 1 }}', ctx()).out).toBe('{{ 1 + 1 }}');
  });

  it('escapa HTML en el valor por defecto (XSS por variable)', () => {
    const c = ctx({ custom: { evil: '<script>alert(1)</script>' } });
    const r = renderVariables('<p>{{custom.evil}}</p>', c);
    expect(r.out).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(r.out).not.toContain('<script>');
  });

  it('escapa también el fallback literal', () => {
    const r = renderVariables('{{custom.nope|<img src=x onerror=alert(1)>}}', ctx());
    expect(r.out).not.toContain('<img');
  });

  it('[CORREGIDO r2] un valor `javascript:` en un href SÍ se neutraliza en el motor HTML crudo', async () => {
    const c = ctx({ custom: { link: 'javascript:alert(document.domain)' } });
    const r = await renderEmail({ html: '<a href="{{custom.link}}">click</a>' }, { ctx: c, subject: 'x' });
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toContain('href="#"');
  });

  it('[CORREGIDO r2] las variantes ofuscadas del esquema también caen (entidades, tabs, mayúsculas)', async () => {
    for (const payload of ['JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html;base64,PHNjcmlwdD4=']) {
      const r = await renderEmail({ html: '<a href="{{custom.link}}">click</a>' }, { ctx: ctx({ custom: { link: payload } }), subject: 'x' });
      expect(r.html.toLowerCase()).not.toContain('javascript');
      expect(r.html.toLowerCase()).not.toContain('vbscript');
      expect(r.html).not.toContain('data:text/html');
      expect(r.html).toContain('href="#"');
    }
  });

  it('[CORREGIDO r2] una URL http/mailto legítima por variable NO se toca', async () => {
    const r = await renderEmail({ html: '<a href="{{custom.ok}}">ir</a>' }, { ctx: ctx({ custom: { ok: 'https://acme.co/a?b=1&c=2' } }), subject: 'x' });
    expect(r.html).toContain('https://acme.co/a?b=1&amp;c=2');
  });

  it('el mismo caso SÍ se neutraliza en el motor de bloques (safeUrl)', async () => {
    const c = ctx({ custom: { link: 'javascript:alert(1)' } });
    const doc: BlockDocumentInput = {
      version: 1,
      settings: {},
      blocks: [{ id: 'b1', type: 'button', props: { label: 'ir', href: '{{custom.link}}' } }],
    };
    const r = await renderEmail({ blocks: doc }, { ctx: c, subject: 'x' });
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toContain('href="#"');
  });
});

// ─── 2. Sanitización ─────────────────────────────────────────────────────────

describe('sanitize', () => {
  it('elimina script, iframe, form y manejadores on*', () => {
    const dirty = `<p onclick="alert(1)">hola</p><script>alert(2)</script><iframe src="https://evil"></iframe><form action="/x"><input name="a"></form><img src=x onerror="alert(3)">`;
    const clean = sanitizeEmailHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/<iframe/i);
    expect(clean).not.toMatch(/<form/i);
    expect(clean).not.toMatch(/onclick|onerror/i);
    expect(clean).toContain('hola');
  });

  it('elimina href javascript: y datos no-imagen', () => {
    const clean = sanitizeEmailHtml('<a href="javascript:alert(1)">x</a><img src="data:text/html;base64,AAA">');
    expect(clean).not.toContain('javascript:');
    expect(clean).not.toContain('data:text/html');
  });

  it('conserva tablas y estilos inline (compatibilidad email)', () => {
    const clean = sanitizeEmailHtml('<table cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:8px;color:#111">x</td></tr></table>');
    expect(clean).toContain('<table');
    expect(clean).toContain('cellpadding="0"');
    expect(clean).toContain('padding:8px');
  });

  it('conserva las variables {{...}} intactas al sanitizar', () => {
    expect(sanitizeEmailHtml('<p>Hola {{contact.first_name|amigo}}</p>')).toContain('{{contact.first_name|amigo}}');
  });

  it('[DECISIÓN r2] sanitizeEmailHtml conserva <style> en el camino SALIENTE (lo escribe un usuario de la org)', () => {
    const clean = sanitizeEmailHtml('<style>body{background:red}</style><p>x</p>');
    expect(clean).toContain('<style>');
  });

  it('[CORREGIDO r2] sanitizeInboundHtml descarta <style> del remitente externo y neutraliza esquemas', () => {
    const clean = sanitizeInboundHtml('<style>body{background:red}</style><p>x</p><a href="{{x}}">y</a>');
    expect(clean).not.toContain('<style>');
    expect(clean).toContain('<p>x</p>');
    // La variable protegida vuelve como token sin esquema y no se rompe.
    expect(clean).not.toContain('javascript:');
  });

  it('[CORREGIDO r2] sanitizeInboundHtml neutraliza un javascript: colado por un {{}} del remitente', () => {
    const clean = sanitizeInboundHtml('<a href="javascript:alert(1)">x</a><a href="/rel">ok</a>');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('href="/rel"');
  });

  it('sanitizeFragment sí descarta <style>/<html>', () => {
    const clean = sanitizeFragment('<style>body{background:red}</style><p>x</p>');
    expect(clean).not.toContain('<style>');
  });

  it('htmlToText convierte enlaces y saltos', () => {
    expect(htmlToText('<p>Hola</p><a href="https://x.co">sitio</a>')).toBe('Hola\nsitio (https://x.co)');
  });

  it('escapeHtml cubre & < > " \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});

// ─── 3. Bloques: los 13 tipos del schema ─────────────────────────────────────

describe('bloques', () => {
  it('el catálogo BLOCK_TYPES cubre exactamente la unión discriminada del schema', () => {
    expect(BLOCK_TYPES).toHaveLength(13);
    for (const t of BLOCK_TYPES) expect(() => createBlock(t)).not.toThrow();
  });

  it('renderiza los 13 tipos sin lanzar y sin <script>', () => {
    const blocks = BLOCK_TYPES.map((t, i) => ({ ...createBlock(t), id: `b${i}` }));
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks });
    const r = renderBlockDocument(doc, ctx());
    expect(r.html).not.toMatch(/<script/i);
    expect(r.html).toMatch(/^<table role="presentation"/);
    // tablas + estilos inline (compatibilidad con clientes de correo)
    expect(r.html).toContain('cellpadding="0"');
    expect(r.html).toContain('style="');
  });

  it('rechaza un bloque de tipo desconocido y un documento con >60 bloques', () => {
    expect(safeParseBlockDocument({ blocks: [{ id: 'x', type: 'evil', props: {} }] }).ok).toBe(false);
    const many = Array.from({ length: 61 }, (_, i) => ({ id: `b${i}`, type: 'divider', props: {} }));
    expect(safeParseBlockDocument({ blocks: many }).ok).toBe(false);
  });

  it('rechaza href con esquema no permitido en el schema', () => {
    expect(safeParseBlockDocument({ blocks: [{ id: 'b', type: 'button', props: { href: 'javascript:alert(1)' } }] }).ok).toBe(false);
  });

  it('[CORREGIDO r2] settings.font se valida contra una allow-list y no puede romper el atributo style', () => {
    const doc = parseBlockDocument({
      version: 1,
      settings: { font: 'Arial" onmouseover="alert(1)' },
      blocks: [{ id: 'b1', type: 'text', props: { html: '<p>x</p>' } }],
    });
    // zod normaliza el valor fuera de la allow-list al stack por defecto.
    expect(doc.settings.font).toBe('Inter, Arial, sans-serif');
    const r = renderBlockDocument(doc, ctx());
    expect(r.html).not.toContain('onmouseover');
    expect(r.html).toContain('font-family:Inter, Arial, sans-serif');
  });

  it('[CORREGIDO r2] una fuente legítima (con comillas simples y acentos) sí se conserva', () => {
    const doc = parseBlockDocument({ version: 1, settings: { font: "'Helvetica Neue', Arial, sans-serif" }, blocks: [] });
    expect(doc.settings.font).toBe("'Helvetica Neue', Arial, sans-serif");
  });

  it('[CORREGIDO r2] el render revalida font/color aunque el documento venga construido a mano', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'b1', type: 'text', props: { html: '<p>x</p>' } }] });
    const forged = { ...doc, settings: { ...doc.settings, font: 'x";onload="y', bg: 'red";onload="y' } };
    const r = renderBlockDocument(forged as typeof doc, ctx());
    expect(r.html).not.toContain('onload');
    expect(r.html).toContain('background:#f4f5f7');
  });

  it('[CORREGIDO r2] un javascript: dentro del HTML de un bloque `text` (por variable) se neutraliza', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 't', type: 'text', props: { html: '<p><a href="{{custom.link}}">x</a></p>' } }] });
    const r = renderBlockDocument(doc, ctx({ custom: { link: 'javascript:alert(1)' } }));
    expect(r.html).not.toContain('javascript:');
    expect(r.html).toContain('href="#"');
  });

  it('quote_summary sin cotización avisa y añade `quote` a missing', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'q', type: 'quote_summary', props: {} }] });
    const r = renderBlockDocument(doc, { ...ctx(), quote: undefined });
    expect(r.missing).toContain('quote');
    expect(r.html).toContain('Sin cotización asociada');
  });

  it('footer_legal con unsubscribe pero sin URL reporta unsubscribe_url', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'f', type: 'footer_legal', props: { unsubscribe: true } }] });
    const r = renderBlockDocument(doc, ctx());
    expect(r.missing).toContain('unsubscribe_url');
  });

  it('el bloque text sanitiza el HTML del usuario', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 't', type: 'text', props: { html: '<p onclick="x">a</p><script>b</script>' } }] });
    const r = renderBlockDocument(doc, ctx());
    expect(r.html).not.toMatch(/onclick|<script/i);
  });

  it('[CORREGIDO r2] el bloque quote_summary ya NO contamina `used` con la variable interna custom.__amt', () => {
    const doc = parseBlockDocument({ version: 1, settings: {}, blocks: [{ id: 'q', type: 'quote_summary', props: {} }] });
    const r = renderBlockDocument(doc, ctx());
    expect(r.used).not.toContain('custom.__amt');
    expect(r.used).toContain('quote.number');
    // y el total sigue formateándose con la moneda de la cotización
    expect(r.html).toMatch(/1\.200\.000/);
  });
});

// ─── 4. renderEmail (shell y preheader) ──────────────────────────────────────

describe('renderEmail', () => {
  it('el shell escapa el asunto y oculta el preheader', async () => {
    const r = await renderEmail({ html: '<p>hola</p>' }, { ctx: ctx(), subject: '<b>Asunto</b>', preheader: 'Vista previa' });
    expect(r.html).toContain('<title>&lt;b&gt;Asunto&lt;/b&gt;</title>');
    expect(r.html).toContain('display:none');
    expect(r.subject).toBe('<b>Asunto</b>');
  });

  it('el asunto NO se escapa (va en la cabecera, no en HTML)', async () => {
    const c = ctx({ custom: { x: 'A & B' } });
    const r = await renderEmail({ html: '<p>x</p>' }, { ctx: c, subject: 'Sobre {{custom.x}}' });
    expect(r.subject).toBe('Sobre A & B');
  });

  it('plantilla engine=react → 422 UNSUPPORTED_ENGINE', async () => {
    await expect(
      renderEmail({ template: { engine: 'react', body_html: '', blocks_json: null, subject: 's' } as never }, { ctx: ctx() }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_ENGINE', status: 422 });
  });

  it('blocks_json inválido → 422 INVALID_BLOCKS', async () => {
    await expect(renderEmail({ blocks: { blocks: [{ id: 'a', type: 'nope' }] } }, { ctx: ctx(), subject: 's' })).rejects.toMatchObject({ code: 'INVALID_BLOCKS' });
  });
});

// ─── 5. Payload de Resend ────────────────────────────────────────────────────

function msg(over: Partial<EmailMessage> = {}): EmailMessage {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000009', organization_id: 7, provider: 'resend', provider_message_id: null, template_id: null,
    to_email: 'c@x.co', to_customer_id: null, cc: null, bcc: null, from_email: 'v@org.co', subject: 'S', body_html_snapshot: '<p>x</p>',
    related_type: null, related_id: null, sequence_step_run_id: null, status: 'pending', scheduled_at: null, sent_at: null, delivered_at: null,
    first_opened_at: null, open_count: 0, first_clicked_at: null, click_count: 0, bounced_at: null, bounce_type: null, complained_at: null,
    unsubscribed_at: null, idempotency_key: 'email/aaaaaaaa-0000-4000-8000-000000000009', cost_amount: null,
    metadata: { kind: 'transactional', reply_to: 'crm+aaaaaaaa-0000-4000-8000-000000000009@crm.acme.co' }, created_at: '', updated_at: '', ...over,
  };
}

const sender: ResolvedSender = {
  mode: 'org', domain: null, from: 'ACME <v@org.co>', fromEmail: 'v@org.co', replyTo: null,
  apiKey: 're_test', notice: null, receivingDomain: 'crm.acme.co', tracking: false,
};

describe('buildResendPayload', () => {
  it('usa los nombres camelCase del SDK 6.x (replyTo, scheduledAt, contentType)', () => {
    const p = buildResendPayload(msg(), sender, [{ filename: 'a.pdf', content_type: 'application/pdf', bytes: 10, base64: 'AAA' }], '2026-10-01T10:00:00Z');
    expect(Object.keys(p)).toContain('replyTo');
    expect(Object.keys(p)).toContain('scheduledAt');
    expect(Object.keys(p)).not.toContain('reply_to');
    expect(Object.keys(p)).not.toContain('scheduled_at');
    expect(p.attachments?.[0]).toHaveProperty('contentType', 'application/pdf');
    expect(p.replyTo).toBe('crm+aaaaaaaa-0000-4000-8000-000000000009@crm.acme.co');
  });

  it('List-Unsubscribe SOLO en marketing/sequence', () => {
    const token = 'tok';
    const trans = buildResendPayload(msg({ metadata: { kind: 'transactional', list_unsubscribe_token: token } }), sender, []);
    expect(trans.headers['List-Unsubscribe']).toBeUndefined();
    for (const kind of ['marketing', 'sequence'] as const) {
      const p = buildResendPayload(msg({ metadata: { kind, list_unsubscribe_token: token } }), sender, []);
      expect(p.headers['List-Unsubscribe']).toContain(`/u/${token}`);
      expect(p.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }
  });

  it('marketing SIN token no emite List-Unsubscribe (riesgo de spam, se documenta)', () => {
    const p = buildResendPayload(msg({ metadata: { kind: 'marketing' } }), sender, []);
    expect(p.headers['List-Unsubscribe']).toBeUndefined();
  });

  it('siempre etiqueta tenant_id y email_message_id', () => {
    const p = buildResendPayload(msg(), sender, []);
    expect(p.tags).toEqual(expect.arrayContaining([
      { name: 'tenant_id', value: '7' },
      { name: 'email_message_id', value: msg().id },
    ]));
  });

  it('la Idempotency-Key es determinista `email/{id}` (nunca Date.now)', () => {
    expect(buildIdempotencyKey('abc')).toBe('email/abc');
    expect(buildIdempotencyKey('abc')).toBe(buildIdempotencyKey('abc'));
  });

  it('sin adjuntos, la clave `attachments` va undefined (no [] vacío)', () => {
    expect(buildResendPayload(msg(), sender, []).attachments).toBeUndefined();
  });
});

// ─── 6. Adjuntos ─────────────────────────────────────────────────────────────

describe('adjuntos', () => {
  it('>40 MB → ATTACHMENTS_TOO_LARGE con mensaje claro', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: null }));
    // Base64 VÁLIDO (múltiplo de 4) de ~41 MB: desde r2 el contenido inline se
    // valida, así que la cadena de prueba tiene que serlo de verdad.
    const big = 'A'.repeat(Math.ceil((41 * 1024 * 1024) / 3) * 4);
    await expect(
      loadAttachments(1, [{ filename: 'big.bin', content_base64: big, content_type: 'application/octet-stream' }], 0, client),
    ).rejects.toMatchObject({ code: 'ATTACHMENTS_TOO_LARGE', status: 422 });
  });

  it('el HTML cuenta para el límite de 40 MB', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: null }));
    await expect(loadAttachments(1, [], 41 * 1024 * 1024, client)).rejects.toMatchObject({ code: 'ATTACHMENTS_TOO_LARGE' });
  });

  it('adjunto inline incompleto → VALIDATION 400', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: null }));
    await expect(loadAttachments(1, [{ filename: 'a', content_base64: '', content_type: 'x' } as never], 0, client)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('[CORREGIDO r2] el base64 inline se valida: una cadena que no es base64 → VALIDATION 400', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: null }));
    await expect(
      loadAttachments(1, [{ filename: 'a.txt', content_base64: 'no-es-base64-!!!', content_type: 'text/plain' }], 0, client),
    ).rejects.toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('[CORREGIDO r2] un base64 válido pasa y su tamaño es el REAL (no la estimación length*0.75)', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: null }));
    const contenido = Buffer.from('hola mundo, esto es un adjunto', 'utf8');
    const out = await loadAttachments(1, [{ filename: 'a.txt', content_base64: contenido.toString('base64'), content_type: 'text/plain' }], 0, client);
    expect(out[0].bytes).toBe(contenido.length);
  });

  it('[CORREGIDO r2] un único adjunto de 26 MB se rechaza aunque el total no llegue a 40 MB', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: null }));
    const big = 'A'.repeat(Math.ceil((26 * 1024 * 1024) / 3) * 4);
    await expect(
      loadAttachments(1, [{ filename: 'big.bin', content_base64: big, content_type: 'application/octet-stream' }], 0, client),
    ).rejects.toMatchObject({ code: 'ATTACHMENTS_TOO_LARGE', status: 422 });
  });
});

// ─── 7. Token de baja ────────────────────────────────────────────────────────

describe('unsubscribe token', () => {
  const OLD = process.env.EMAIL_UNSUBSCRIBE_SECRET;
  beforeAll(() => { process.env.EMAIL_UNSUBSCRIBE_SECRET = 'secreto-de-pruebas-de-al-menos-16'; });
  afterAll(() => { process.env.EMAIL_UNSUBSCRIBE_SECRET = OLD; });

  const id = 'aaaaaaaa-0000-4000-8000-000000000001';

  it('firma y verifica ida y vuelta', () => {
    const t = signUnsubscribeToken(id, 'cust-1');
    expect(verifyUnsubscribeToken(t)).toEqual({ email_message_id: id, customer_id: 'cust-1' });
  });

  it('rechaza firma alterada, payload alterado y token vacío', () => {
    const t = signUnsubscribeToken(id, null);
    const [p, s] = [t.slice(0, t.lastIndexOf('.')), t.slice(t.lastIndexOf('.') + 1)];
    expect(verifyUnsubscribeToken(`${p}.${s.replace(/.$/, s.endsWith('a') ? 'b' : 'a')}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${p}x.${s}`)).toBeNull();
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('a'.repeat(600))).toBeNull();
  });

  it('un token firmado con otro secreto no verifica', () => {
    const t = signUnsubscribeToken(id, null);
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'otro-secreto-distinto-16plus';
    expect(verifyUnsubscribeToken(t)).toBeNull();
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'secreto-de-pruebas-de-al-menos-16';
  });

  it('rechaza un email_message_id que no es UUID', () => {
    const forged = signUnsubscribeToken('not-a-uuid', null);
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });
});

// ─── 8. Dominios (helpers puros) ─────────────────────────────────────────────

describe('dominios', () => {
  it('mapProviderStatus cubre todos los estados de Resend', () => {
    expect(mapProviderStatus('verified')).toBe('verified');
    expect(mapProviderStatus('failed')).toBe('failed');
    expect(mapProviderStatus('partially_failed')).toBe('failed');
    expect(mapProviderStatus('pending')).toBe('pending');
    expect(mapProviderStatus('pending', true)).toBe('verifying');
    expect(mapProviderStatus('temporary_failure', true)).toBe('verifying');
    expect(mapProviderStatus(undefined)).toBe('pending');
    expect(mapProviderStatus('estado_nuevo_de_resend')).toBe('pending');
  });

  it('[CORREGIDO r2] dmarcRecord respeta los sufijos de segundo nivel (com.co, co.uk…)', () => {
    expect(dmarcRecord('crm.acme.com').name).toBe('_dmarc.acme.com');
    expect(dmarcRecord('crm.acme.com.co').name).toBe('_dmarc.acme.com.co');
    expect(dmarcRecord('mail.tienda.co.uk').name).toBe('_dmarc.tienda.co.uk');
    expect(dmarcRecord('acme.com.co').name).toBe('_dmarc.acme.com.co');
    expect(dmarcRecord('acme.co').name).toBe('_dmarc.acme.co');
    expect(dmarcRecord('crm.acme.com.co').value).toContain('rua=mailto:dmarc@acme.com.co');
  });
});

// ─── 9. Máquina de estados (fuera de orden) ──────────────────────────────────

describe('computeTransition', () => {
  it('no degrada: delivered después de clicked mantiene clicked', () => {
    const t = computeTransition('clicked', 'email.delivered');
    expect(t.status).toBe('clicked');
    expect(t.changed).toBe(false);
  });

  it('no degrada: sent después de opened mantiene opened', () => {
    expect(computeTransition('opened', 'email.sent').status).toBe('opened');
  });

  it('bounced/complained son terminales y ganan aunque el rango sea menor', () => {
    expect(computeTransition('clicked', 'email.bounced', 'Permanent').status).toBe('bounced');
    expect(computeTransition('clicked', 'email.complained').status).toBe('complained');
  });

  it('desde un estado terminal no se sube a delivered/opened', () => {
    expect(computeTransition('bounced', 'email.delivered').status).toBe('bounced');
    expect(computeTransition('complained', 'email.opened').status).toBe('complained');
  });

  it('soft bounce (Transient) no cambia estado ni provoca opt-out', () => {
    const t = computeTransition('delivered', 'email.bounced', 'Transient');
    expect(t.softBounce).toBe(true);
    expect(t.optOut).toBeNull();
    expect(t.status).toBe('delivered');
  });

  it('hard bounce y queja marcan opt-out', () => {
    expect(computeTransition('sent', 'email.bounced', 'Permanent').optOut).toBe('hard_bounce');
    expect(computeTransition('sent', 'email.complained').optOut).toBe('complaint');
  });

  it('opened/clicked cuentan aunque el mensaje ya esté en estado terminal', () => {
    const t = computeTransition('bounced', 'email.opened');
    expect(t.countOpen).toBe(true);
    expect(t.changed).toBe(false);
  });

  it('eventos sin estado (delivery_delayed, scheduled) no cambian nada', () => {
    expect(computeTransition('sent', 'email.delivery_delayed').changed).toBe(false);
    expect(computeTransition('sent', 'email.scheduled').changed).toBe(false);
  });

  it('un tipo de evento desconocido no rompe ni degrada', () => {
    expect(computeTransition('delivered', 'email.inventado').status).toBe('delivered');
  });

  it('los estados terminales son absorbentes entre sí (bounced no pasa a complained)', () => {
    expect(computeTransition('bounced', 'email.failed').status).toBe('bounced');
    expect(computeTransition('failed', 'email.bounced', 'Permanent').status).toBe('failed');
    // Consecuencia: una queja posterior a un rebote no se refleja en `status`
    // (sí en el opt-out, que se calcula aparte).
    expect(computeTransition('bounced', 'email.complained').status).toBe('bounced');
    expect(computeTransition('bounced', 'email.complained').optOut).toBe('complaint');
  });
});
