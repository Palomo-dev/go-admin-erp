/// <reference types="jest" />
/**
 * F7 · Ronda 2 — tests de los arreglos pedidos por el informe del tester.
 *
 * Uno por hallazgo: XSS de `/u/[token]`, `settings.font`, `javascript:` por
 * variable, dominio↔org del inbound, lotes con dominios mixtos, CAS agotado,
 * `test-send` acotado, zod en las rutas y cifrado de las API keys.
 * Ninguno toca la BD real ni la red (cliente Supabase falso).
 */

jest.mock('svix', () => ({ Webhook: class { verify() { return undefined; } } }));

import { contentSecurityPolicy, escapeHtmlText, publicPageHeaders, publicPageHtml } from '../publicPage';
import { enforceSafeUrlAttributes, isSafeUrlValue } from '../sanitize';
import { groupBySender, senderGroupKey } from '../batchService';
import { domainMatchesOrg, parseReplyAddress } from '../inboundService';
import { handleEmailWebhook } from '../webhookService';
import { decryptSecret, encryptSecret } from '../domainStore';
import { orgOwnsDomain } from '../domainsService';
import { registrableDomain } from '../domainRules';
import { parseWith, zSendBody, zTemplateCreate, zTestSend, zMessagesQuery, zSettingsPatch, queryObject } from '../schemas';
import type { EmailMessage } from '../types';
import { fakeSupabase } from './fakeSupabase';

const XSS = '<img src=x onerror=alert(document.domain)>';

// ─── 1. CRÍTICO · XSS almacenada en /u/[token] ───────────────────────────────

describe('publicPage (/u/[token])', () => {
  it('escapa el nombre de la organización en el cuerpo (payload <img onerror>)', () => {
    const html = publicPageHtml({
      title: 'Cancelar suscripción',
      body: `¿Deseas dejar de recibir correos de ${XSS}? Podrás volver a suscribirte contactando directamente con ellos.`,
      button: 'Sí, darme de baja',
    });
    expect(html).not.toContain('<img');
    // el texto "onerror=" solo puede aparecer como texto inerte, nunca dentro de una etiqueta
    expect(html).not.toMatch(/<[^>]*onerror/i);
    expect(html).toContain('&lt;img src=x onerror=alert(document.domain)&gt;');
  });

  it('escapa también el título y la etiqueta del botón', () => {
    const html = publicPageHtml({ title: `T${XSS}`, body: 'b', button: `</button><script>alert(1)</script>` });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('<img');
    // el <title> y el <h1> comparten el mismo valor escapado
    expect(html.match(/&lt;img/g)?.length).toBe(2);
  });

  it('escapeHtmlText cubre & < > " y comilla simple, y tolera null/undefined', () => {
    expect(escapeHtmlText(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
    expect(escapeHtmlText(null)).toBe('');
    expect(escapeHtmlText(undefined)).toBe('');
  });

  it('la respuesta lleva CSP restrictiva y nosniff', () => {
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
  });

  it('la CSP autoriza el <style> de la página por su hash sha256', () => {
    const hash = /style-src '(sha256-[^']+)'/.exec(contentSecurityPolicy())?.[1];
    expect(hash).toBeTruthy();
    // el mismo hash en dos llamadas (constante, no cambia entre respuestas)
    expect(contentSecurityPolicy()).toBe(contentSecurityPolicy());
  });

  it('sin botón no se emite el formulario', () => {
    expect(publicPageHtml({ title: 'Enlace no válido', body: 'x' })).not.toContain('<form');
  });
});

// ─── 2 y 3. Esquemas de URL en el motor HTML crudo ───────────────────────────

describe('enforceSafeUrlAttributes', () => {
  it('acepta http, https, mailto, tel, cid y relativas', () => {
    for (const u of ['https://a.co', 'http://a.co', 'mailto:a@b.co', 'tel:+57300', 'cid:logo', '/rel', '#ancla', '']) {
      expect(isSafeUrlValue(u, 'href')).toBe(true);
    }
  });

  it('rechaza javascript, vbscript, file y data:text/html', () => {
    for (const u of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'vbscript:x', 'file:///etc/passwd', 'data:text/html,<script>']) {
      expect(isSafeUrlValue(u, 'href')).toBe(false);
    }
  });

  it('data:image sí vale en src pero no en href', () => {
    expect(isSafeUrlValue('data:image/png;base64,AAA', 'src')).toBe(true);
    expect(isSafeUrlValue('data:image/png;base64,AAA', 'href')).toBe(false);
  });

  it('sustituye href por # y vacía src, con comillas simples, dobles y sin comillas', () => {
    expect(enforceSafeUrlAttributes(`<a href="javascript:a()">x</a>`)).toContain('href="#"');
    expect(enforceSafeUrlAttributes(`<a href='javascript:a()'>x</a>`)).toContain('href="#"');
    expect(enforceSafeUrlAttributes(`<a href=javascript:a()>x</a>`)).toContain('href="#"');
    expect(enforceSafeUrlAttributes(`<img src="javascript:a()"/>`)).toContain('src=""');
  });

  it('no toca las URL legítimas', () => {
    const html = '<a href="https://acme.co/x?a=1">x</a><img src="cid:logo"/>';
    expect(enforceSafeUrlAttributes(html)).toBe(html);
  });
});

// ─── 5. Inbound: dominio ↔ organización ──────────────────────────────────────

describe('inbound · dominio de crm+{uuid}@… vs organización del mensaje', () => {
  const MSG = 'aaaaaaaa-0000-4000-8000-000000000001';

  it('parseReplyAddress sigue extrayendo uuid y dominio', () => {
    expect(parseReplyAddress(`crm+${MSG}@crm.acme.co`)).toEqual({ email_message_id: MSG, domain: 'crm.acme.co' });
    expect(parseReplyAddress('soporte@acme.co')).toBeNull();
  });

  const msg = (meta: Record<string, unknown>) => ({ id: MSG, organization_id: 7, metadata: meta } as unknown as EmailMessage);
  const dbWith = (domains: string[]) =>
    fakeSupabase((c) => (c.table === 'email_domains' ? { data: domains.map((d) => ({ id: 'd1', domain: d })), error: null } : { data: null, error: null })).client;

  it('acepta el dominio del reply_to que emitió el propio servidor', async () => {
    const ok = await domainMatchesOrg('crm.acme.co', msg({ reply_to: `crm+${MSG}@crm.acme.co` }), dbWith([]));
    expect(ok).toBe(true);
  });

  it('RECHAZA un dominio ajeno (crm.acme.co.evil.com) aunque el uuid del mensaje sea correcto', async () => {
    const ok = await domainMatchesOrg('crm.acme.co.evil.com', msg({ reply_to: `crm+${MSG}@crm.acme.co` }), dbWith([]));
    expect(ok).toBe(false);
  });

  it('sin reply_to registrado cae en email_domains de ESA org', async () => {
    expect(await domainMatchesOrg('crm.acme.co', msg({}), dbWith(['crm.acme.co']))).toBe(true);
    expect(await domainMatchesOrg('crm.acme.co.evil.com', msg({}), dbWith([]))).toBe(false);
  });

  it('sin reply_to acepta el dominio global de GoAdmin (fallback de remitente)', async () => {
    const OLD = process.env.EMAIL_GLOBAL_DOMAIN;
    process.env.EMAIL_GLOBAL_DOMAIN = 'crm.goadmin.io';
    expect(await domainMatchesOrg('crm.goadmin.io', msg({}), dbWith([]))).toBe(true);
    process.env.EMAIL_GLOBAL_DOMAIN = OLD;
  });
});

// ─── 6. Lotes con dominios mixtos ────────────────────────────────────────────

describe('batchService · agrupación por remitente', () => {
  const m = (id: string, domainId: string | null, kind = 'marketing') =>
    ({ id, metadata: { email_domain_id: domainId, kind } } as unknown as EmailMessage);

  it('la clave de grupo combina dominio y kind', () => {
    expect(senderGroupKey(m('a', 'dom-a'))).toBe('dom-a::marketing');
    expect(senderGroupKey(m('b', null))).toBe('default::marketing');
    expect(senderGroupKey(m('c', 'dom-a', 'sequence'))).toBe('dom-a::sequence');
  });

  it('dos dominios distintos producen DOS grupos (antes salía uno solo con el from del primero)', () => {
    const groups = groupBySender([m('1', 'dom-a'), m('2', 'dom-b'), m('3', 'dom-a')]);
    expect(groups.size).toBe(2);
    expect(groups.get('dom-a::marketing')?.map((x) => x.id)).toEqual(['1', '3']);
    expect(groups.get('dom-b::marketing')?.map((x) => x.id)).toEqual(['2']);
  });

  it('un lote homogéneo sigue siendo un único grupo (una sola llamada a batch.send)', () => {
    expect(groupBySender([m('1', 'dom-a'), m('2', 'dom-a')]).size).toBe(1);
  });
});

// ─── 7. CAS agotado en applyTransition ───────────────────────────────────────

describe('webhook · el CAS agotado ya no devuelve 200 en silencio', () => {
  const EVT = JSON.stringify({ type: 'email.opened', created_at: '2026-09-08T10:00:00Z', data: { email_id: 're_1' } });
  const headers = { 'svix-id': 'msg_cas_1', 'svix-timestamp': '1', 'svix-signature': 'v1,x' };
  const OLD = process.env.RESEND_WEBHOOK_SECRET;
  beforeAll(() => { process.env.RESEND_WEBHOOK_SECRET = 'whsec_dGVzdC1zZWNyZXQtcGFyYS1qZXN0'; });
  afterAll(() => { process.env.RESEND_WEBHOOK_SECRET = OLD; });

  function db(alwaysConflict: boolean) {
    const deleted: unknown[] = [];
    const msg = { id: 'aaaaaaaa-0000-4000-8000-0000000000ff', organization_id: 5, status: 'sent', open_count: 0, click_count: 0, metadata: {}, to_customer_id: null, provider_message_id: 're_1' };
    const { client } = fakeSupabase((c) => {
      if (c.table === 'email_messages' && c.op === 'select') return { data: msg, error: null };
      if (c.table === 'email_messages' && c.op === 'update') return { data: alwaysConflict ? [] : [{ status: 'opened' }], error: null };
      if (c.table === 'email_events' && c.op === 'insert') return { data: { id: 'ev-1' }, error: null };
      if (c.table === 'email_events' && c.op === 'delete') { deleted.push(c.filters); return { data: null, error: null }; }
      return { data: null, error: null };
    });
    return { client, deleted };
  }

  it('con 3 conflictos lanza 503 transition_conflict y borra el evento insertado', async () => {
    const { client, deleted } = db(true);
    await expect(handleEmailWebhook(EVT, headers, client)).rejects.toMatchObject({ statusCode: 503, code: 'transition_conflict' });
    expect(deleted).toHaveLength(1);
  });

  it('sin conflicto responde processed y NO borra nada', async () => {
    const { client, deleted } = db(false);
    const r = await handleEmailWebhook(EVT, headers, client);
    expect(r.processed).toBe(true);
    expect(deleted).toHaveLength(0);
  });
});

// ─── 8. test-send acotado ────────────────────────────────────────────────────

describe('orgOwnsDomain (acota el destinatario de test-send)', () => {
  const db = (domains: string[]) => fakeSupabase((c) => (c.table === 'email_domains' ? { data: domains.map((d) => ({ domain: d })), error: null } : { data: null, error: null }));

  it('acepta el dominio exacto y sus subdominios', async () => {
    expect(await orgOwnsDomain(1, 'crm.acme.co', db(['crm.acme.co']).client)).toBe(true);
    expect(await orgOwnsDomain(1, 'boletin.crm.acme.co', db(['crm.acme.co']).client)).toBe(true);
  });

  /**
   * Ronda 3 (tester r2, fallo nuevo #5): la ronda 2 aceptaba también el dominio
   * PADRE (`own.endsWith('.' + d)`). Con eso, registrar `crm.gmail.com` — que
   * `resend.domains.create` acepta y nunca se podrá verificar — autorizaba el
   * `test-send` a cualquier `@gmail.com` saltándose `fn_can_contact`.
   */
  it('YA NO acepta el dominio padre de uno registrado (r2 #5)', async () => {
    expect(await orgOwnsDomain(1, 'acme.co', db(['crm.acme.co']).client)).toBe(false);
    expect(await orgOwnsDomain(1, 'gmail.com', db(['crm.gmail.com']).client)).toBe(false);
  });

  it('solo mira dominios VERIFICADOS (r2 #5)', async () => {
    const { client, calls } = db(['crm.acme.co']);
    await orgOwnsDomain(1, 'crm.acme.co', client);
    const q = calls.find((c) => c.table === 'email_domains');
    expect(q?.filters).toContainEqual(['eq', 'status', 'verified']);
    expect(q?.filters).toContainEqual(['eq', 'organization_id', 1]);
  });

  it('rechaza un dominio ajeno o parecido', async () => {
    expect(await orgOwnsDomain(1, 'acme.co.evil.com', db(['crm.acme.co']).client)).toBe(false);
    expect(await orgOwnsDomain(1, 'gmail.com', db(['crm.acme.co']).client)).toBe(false);
    expect(await orgOwnsDomain(1, '', db(['crm.acme.co']).client)).toBe(false);
  });

  it('una org sin dominios no autoriza a nadie', async () => {
    expect(await orgOwnsDomain(1, 'acme.co', db([]).client)).toBe(false);
  });
});

// ─── 9. zod en las rutas ─────────────────────────────────────────────────────

describe('schemas zod de las rutas de email', () => {
  const okSend = { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' } };

  it('acepta un body válido y normaliza el correo a minúsculas', () => {
    expect(parseWith(zSendBody, { ...okSend, to: ['C@X.CO'] }).to).toEqual(['c@x.co']);
  });

  it('rechaza correos inválidos, uuid mal formados y claves desconocidas', () => {
    expect(() => parseWith(zSendBody, { ...okSend, to: ['no-es-correo'] })).toThrow(/VALIDATION|inválido/i);
    expect(() => parseWith(zSendBody, { ...okSend, to_customer_id: 'abc' })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, sorpresa: 1 })).toThrow();
  });

  it('rechaza metadata con claves reservadas del servidor', () => {
    expect(() => parseWith(zSendBody, { ...okSend, metadata: { kind: 'transactional' } })).toThrow(/reservadas/);
    expect(() => parseWith(zSendBody, { ...okSend, metadata: { list_unsubscribe_token: 'x' } })).toThrow();
    expect(parseWith(zSendBody, { ...okSend, metadata: { campaign_note: 'ok' } }).metadata).toEqual({ campaign_note: 'ok' });
  });

  it('rechaza scheduled_at inválido o a más de 30 días', () => {
    expect(() => parseWith(zSendBody, { ...okSend, scheduled_at: 'mañana' })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, scheduled_at: new Date(Date.now() + 40 * 86400000).toISOString() })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, scheduled_at: new Date(Date.now() + 3600_000).toISOString() })).not.toThrow();
  });

  it('rechaza más de 50 destinatarios y adjuntos que no son base64', () => {
    const many = Array.from({ length: 51 }, (_, i) => `a${i}@x.co`);
    expect(() => parseWith(zSendBody, { ...okSend, to: many })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, attachments: [{ filename: 'a', content_base64: '!!!', content_type: 'text/plain' }] })).toThrow(/base64/);
  });

  it('la plantilla no admite engine "react" ni kind inventado', () => {
    expect(() => parseWith(zTemplateCreate, { name: 'x', engine: 'react' })).toThrow();
    expect(() => parseWith(zTemplateCreate, { name: 'x', kind: 'lo-que-sea' })).toThrow();
    expect(parseWith(zTemplateCreate, { name: 'x', engine: 'html' }).engine).toBe('html');
  });

  it('test-send solo acepta un correo válido y context_ids con uuid', () => {
    expect(() => parseWith(zTestSend, { to: 'no' })).toThrow();
    expect(() => parseWith(zTestSend, { context_ids: { customer_id: 'x' } })).toThrow();
    expect(parseWith(zTestSend, {}).to).toBeUndefined();
  });

  it('la política de fallback solo admite los tres valores válidos', () => {
    expect(() => parseWith(zSettingsPatch, { email_fallback_policy: 'lo-que-sea' })).toThrow();
    expect(parseWith(zSettingsPatch, { email_fallback_policy: 'block' }).email_fallback_policy).toBe('block');
  });

  it('la paginación de /messages cae en los valores por defecto ante basura', () => {
    const q = parseWith(zMessagesQuery, queryObject(new URLSearchParams('limit=abc&offset=-5'), ['limit', 'offset']));
    expect(q.limit).toBe(50);
    expect(q.offset).toBe(0);
    expect(parseWith(zMessagesQuery, queryObject(new URLSearchParams('limit=10000'), ['limit'])).limit).toBe(50);
  });
});

// ─── Extras: dominio registrable y cifrado de credenciales ───────────────────

describe('registrableDomain', () => {
  it('resuelve sufijos de uno y dos niveles', () => {
    expect(registrableDomain('crm.acme.com')).toBe('acme.com');
    expect(registrableDomain('crm.acme.com.co')).toBe('acme.com.co');
    expect(registrableDomain('acme.co')).toBe('acme.co');
    expect(registrableDomain('A.B.Acme.CO.UK')).toBe('acme.co.uk');
  });
});

describe('API keys de Resend cifradas en reposo', () => {
  const OLD = process.env.EMAIL_CREDENTIALS_SECRET;
  beforeAll(() => { process.env.EMAIL_CREDENTIALS_SECRET = 'secreto-de-credenciales-de-pruebas'; });
  afterAll(() => { process.env.EMAIL_CREDENTIALS_SECRET = OLD; });

  /**
   * Ronda 3 (tester r2, fallo nuevo #4): el formato pasó de `encv1:<iv>.<tag>.<ct>`
   * a `encv2:<kid>.<iv>.<tag>.<ct>`. El `kid` identifica la clave que cifró, de
   * modo que añadir `EMAIL_CREDENTIALS_SECRET` después ya no invalida lo
   * guardado con el fallback. `encv1:` se sigue LEYENDO (ver decryptSecretDetailed).
   */
  it('cifra y descifra ida y vuelta, y el texto guardado no contiene el token', () => {
    const token = 're_test_1234567890';
    const enc = encryptSecret(token);
    expect(enc.startsWith('encv2:')).toBe(true);
    expect(enc.slice('encv2:'.length).split('.')).toHaveLength(4); // kid.iv.tag.ct
    expect(enc).not.toContain(token);
    expect(decryptSecret(enc)).toBe(token);
  });

  it('dos cifrados del mismo token son distintos (IV aleatorio) pero comparten kid', () => {
    const a = encryptSecret('re_x');
    const b = encryptSecret('re_x');
    expect(a).not.toBe(b);
    expect(a.slice('encv2:'.length).split('.')[0]).toBe(b.slice('encv2:'.length).split('.')[0]);
  });

  it('un valor manipulado no descifra (GCM autenticado)', () => {
    const enc = encryptSecret('re_test_1234567890');
    const [kid, iv] = enc.slice('encv2:'.length).split('.');
    const tampered = `encv2:${kid}.${iv}.${Buffer.from('otro').toString('base64')}.${Buffer.from('x').toString('base64')}`;
    expect(decryptSecret(tampered)).toBeNull();
  });

  it('un valor antiguo en claro se sigue leyendo (compatibilidad hacia atrás)', () => {
    expect(decryptSecret('re_en_claro')).toBe('re_en_claro');
  });
});
