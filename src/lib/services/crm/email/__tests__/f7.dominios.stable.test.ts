/// <reference types="jest" />
/**
 * F7 · Consolidación de las rondas (2026-09-21) — dominios (DMARC, dominio
 * registrable, `orgOwnsDomain`), inbound dominio↔organización, esquemas zod de
 * las rutas y cifrado de las API keys en reposo (llavero con `kid`).
 *
 * Casos únicos rescatados de: tester r1 (`adversarial.test.ts`), builder r2
 * (`roundTwo.test.ts`), tester r2 (`adversarialR2.test.ts`), builder r3
 * (`roundThree.test.ts`). `domainsService.test.ts` ya cubre mapProviderStatus
 * básico, dmarc en dominio raíz, createDomain y resolveSender.
 * Sin BD real ni red: cliente Supabase falso.
 */

import { mapProviderStatus, dmarcRecord, orgOwnsDomain } from '../domainsService';
import { registrableDomain } from '../domainRules';
import { domainMatchesOrg, parseReplyAddress } from '../inboundService';
import { parseWith, zSendBody, zTemplateCreate, zTestSend, zMessagesQuery, zSettingsPatch, zUuid, queryObject } from '../schemas';
import { decryptSecret, decryptSecretDetailed, encryptSecret, listDomainKeyStates, __setDomainStoreClient } from '../domainStore';
import type { EmailMessage } from '../types';
import { fakeSupabase } from './fakeSupabase';

// ─── Helpers puros de dominio ───────────────────────────────────────────────────

describe('domainRules', () => {
  it('T8 · mapProviderStatus: un estado nuevo de Resend cae en pending', () => {
    expect(mapProviderStatus('estado_nuevo_de_resend')).toBe('pending');
  });

  it('T8 · dmarcRecord respeta los sufijos de segundo nivel (com.co, co.uk…)', () => {
    expect(dmarcRecord('crm.acme.com').name).toBe('_dmarc.acme.com');
    expect(dmarcRecord('crm.acme.com.co').name).toBe('_dmarc.acme.com.co');
    expect(dmarcRecord('mail.tienda.co.uk').name).toBe('_dmarc.tienda.co.uk');
    expect(dmarcRecord('acme.com.co').name).toBe('_dmarc.acme.com.co');
    expect(dmarcRecord('acme.co').name).toBe('_dmarc.acme.co');
    expect(dmarcRecord('crm.acme.com.co').value).toContain('rua=mailto:dmarc@acme.com.co');
  });

  it('B2 · registrableDomain resuelve sufijos de uno y dos niveles, en minúsculas, y los añadidos en r3 (com.pl, co.in, com.tr)', () => {
    expect(registrableDomain('crm.acme.com')).toBe('acme.com');
    expect(registrableDomain('a.b.c.acme.com')).toBe('acme.com');
    expect(registrableDomain('crm.acme.com.co')).toBe('acme.com.co');
    expect(registrableDomain('mail.crm.acme.co.uk')).toBe('acme.co.uk');
    expect(registrableDomain('acme.co')).toBe('acme.co');
    expect(registrableDomain('A.B.Acme.CO.UK')).toBe('acme.co.uk');
    expect(registrableDomain('crm.acme.com.pl')).toBe('acme.com.pl');
    expect(registrableDomain('crm.acme.co.in')).toBe('acme.co.in');
    expect(registrableDomain('crm.acme.com.tr')).toBe('acme.com.tr');
  });
});

// ─── orgOwnsDomain: acota el destinatario de test-send (builder r2 #8, r3 #5) ───

describe('orgOwnsDomain', () => {
  const db = (domains: string[]) => fakeSupabase((c) => (c.table === 'email_domains' ? { data: domains.map((d) => ({ domain: d })), error: null } : { data: null, error: null }));

  it('B8 · acepta el dominio exacto y sus subdominios', async () => {
    expect(await orgOwnsDomain(1, 'crm.acme.co', db(['crm.acme.co']).client)).toBe(true);
    expect(await orgOwnsDomain(1, 'boletin.crm.acme.co', db(['crm.acme.co']).client)).toBe(true);
  });

  /**
   * r3 (tester r2 #5): la ronda 2 aceptaba también el dominio PADRE. Con eso,
   * registrar `crm.gmail.com` —que Resend acepta y nunca se podrá verificar—
   * autorizaba el test-send a cualquier `@gmail.com` saltándose `fn_can_contact`.
   */
  it('B8 · YA NO acepta el dominio padre de uno registrado', async () => {
    expect(await orgOwnsDomain(1, 'acme.co', db(['crm.acme.co']).client)).toBe(false);
    expect(await orgOwnsDomain(1, 'gmail.com', db(['crm.gmail.com']).client)).toBe(false);
  });

  it('B8 · solo mira dominios VERIFICADOS de ESA organización', async () => {
    const { client, calls } = db(['crm.acme.co']);
    await orgOwnsDomain(1, 'crm.acme.co', client);
    const q = calls.find((c) => c.table === 'email_domains');
    expect(q?.filters).toContainEqual(['eq', 'status', 'verified']);
    expect(q?.filters).toContainEqual(['eq', 'organization_id', 1]);
  });

  it('B8 · rechaza dominio ajeno o parecido, vacío, y una org sin dominios no autoriza a nadie', async () => {
    expect(await orgOwnsDomain(1, 'acme.co.evil.com', db(['crm.acme.co']).client)).toBe(false);
    expect(await orgOwnsDomain(1, 'gmail.com', db(['crm.acme.co']).client)).toBe(false);
    expect(await orgOwnsDomain(1, '', db(['crm.acme.co']).client)).toBe(false);
    expect(await orgOwnsDomain(1, 'acme.co', db([]).client)).toBe(false);
  });
});

// ─── Inbound: dominio de crm+{uuid}@… vs organización del mensaje (builder r2 #5) ─

describe('inboundService · domainMatchesOrg', () => {
  const MSG = 'aaaaaaaa-0000-4000-8000-000000000001';
  const msg = (meta: Record<string, unknown>) => ({ id: MSG, organization_id: 7, metadata: meta }) as unknown as EmailMessage;
  const dbWith = (domains: string[]) => fakeSupabase((c) => (c.table === 'email_domains' ? { data: domains.map((d) => ({ id: 'd1', domain: d })), error: null } : { data: null, error: null })).client;

  it('B5 · parseReplyAddress extrae uuid y dominio; una dirección normal da null', () => {
    expect(parseReplyAddress(`crm+${MSG}@crm.acme.co`)).toEqual({ email_message_id: MSG, domain: 'crm.acme.co' });
    expect(parseReplyAddress('soporte@acme.co')).toBeNull();
  });

  it('B5 · acepta el dominio del reply_to que emitió el propio servidor y RECHAZA uno ajeno (crm.acme.co.evil.com)', async () => {
    expect(await domainMatchesOrg('crm.acme.co', msg({ reply_to: `crm+${MSG}@crm.acme.co` }), dbWith([]))).toBe(true);
    expect(await domainMatchesOrg('crm.acme.co.evil.com', msg({ reply_to: `crm+${MSG}@crm.acme.co` }), dbWith([]))).toBe(false);
  });

  it('B5 · sin reply_to registrado cae en email_domains de ESA org', async () => {
    expect(await domainMatchesOrg('crm.acme.co', msg({}), dbWith(['crm.acme.co']))).toBe(true);
    expect(await domainMatchesOrg('crm.acme.co.evil.com', msg({}), dbWith([]))).toBe(false);
  });

  it('B5 · sin reply_to acepta el dominio global de GoAdmin (fallback de remitente)', async () => {
    const OLD = process.env.EMAIL_GLOBAL_DOMAIN;
    process.env.EMAIL_GLOBAL_DOMAIN = 'crm.goadmin.io';
    expect(await domainMatchesOrg('crm.goadmin.io', msg({}), dbWith([]))).toBe(true);
    process.env.EMAIL_GLOBAL_DOMAIN = OLD;
  });
});

// ─── zod en las rutas (builder r2 #9, r3 #8) ────────────────────────────────────

describe('schemas zod de las rutas de email', () => {
  const okSend = { to: ['c@x.co'], subject: 'S', content: { html: '<p>x</p>' } };

  it('B9 · acepta un body válido y normaliza el correo a minúsculas', () => {
    expect(parseWith(zSendBody, { ...okSend, to: ['C@X.CO'] }).to).toEqual(['c@x.co']);
  });

  it('B9 · rechaza correos inválidos, uuid mal formados y claves desconocidas', () => {
    expect(() => parseWith(zSendBody, { ...okSend, to: ['no-es-correo'] })).toThrow(/VALIDATION|inválido/i);
    expect(() => parseWith(zSendBody, { ...okSend, to_customer_id: 'abc' })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, sorpresa: 1 })).toThrow();
  });

  it('B9 · rechaza metadata con claves reservadas del servidor', () => {
    expect(() => parseWith(zSendBody, { ...okSend, metadata: { kind: 'transactional' } })).toThrow(/reservadas/);
    expect(() => parseWith(zSendBody, { ...okSend, metadata: { list_unsubscribe_token: 'x' } })).toThrow();
    expect(parseWith(zSendBody, { ...okSend, metadata: { campaign_note: 'ok' } }).metadata).toEqual({ campaign_note: 'ok' });
  });

  it('B9 · rechaza scheduled_at inválido o a más de 30 días', () => {
    expect(() => parseWith(zSendBody, { ...okSend, scheduled_at: 'mañana' })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, scheduled_at: new Date(Date.now() + 40 * 86400000).toISOString() })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, scheduled_at: new Date(Date.now() + 3600_000).toISOString() })).not.toThrow();
  });

  it('B9 · rechaza más de 50 destinatarios y adjuntos que no son base64', () => {
    expect(() => parseWith(zSendBody, { ...okSend, to: Array.from({ length: 51 }, (_, i) => `a${i}@x.co`) })).toThrow();
    expect(() => parseWith(zSendBody, { ...okSend, attachments: [{ filename: 'a', content_base64: '!!!', content_type: 'text/plain' }] })).toThrow(/base64/);
  });

  it('B9 · plantilla sin engine "react" ni kind inventado; test-send con correo válido y context_ids uuid; fallback policy de 3 valores', () => {
    expect(() => parseWith(zTemplateCreate, { name: 'x', engine: 'react' })).toThrow();
    expect(() => parseWith(zTemplateCreate, { name: 'x', kind: 'lo-que-sea' })).toThrow();
    expect(parseWith(zTemplateCreate, { name: 'x', engine: 'html' }).engine).toBe('html');
    expect(() => parseWith(zTestSend, { to: 'no' })).toThrow();
    expect(() => parseWith(zTestSend, { context_ids: { customer_id: 'x' } })).toThrow();
    expect(parseWith(zTestSend, {}).to).toBeUndefined();
    expect(() => parseWith(zSettingsPatch, { email_fallback_policy: 'lo-que-sea' })).toThrow();
    expect(parseWith(zSettingsPatch, { email_fallback_policy: 'block' }).email_fallback_policy).toBe('block');
  });

  it('B9 · la paginación de /messages cae en los valores por defecto ante basura', () => {
    const q = parseWith(zMessagesQuery, queryObject(new URLSearchParams('limit=abc&offset=-5'), ['limit', 'offset']));
    expect(q.limit).toBe(50);
    expect(q.offset).toBe(0);
    expect(parseWith(zMessagesQuery, queryObject(new URLSearchParams('limit=10000'), ['limit'])).limit).toBe(50);
  });

  it('B3.8 · un id de ruta basura da 400 VALIDATION en vez de un 500 de Postgres; un uuid válido pasa', () => {
    expect(() => parseWith(zUuid, 'no-es-uuid', 'id')).toThrow(/VALIDATION|inválido|uuid/i);
    try {
      parseWith(zUuid, '../../etc/passwd', 'id');
      throw new Error('no lanzó');
    } catch (e) {
      expect((e as { status?: number }).status).toBe(400);
    }
    expect(parseWith(zUuid, '3f1c8c1e-0000-4000-8000-000000000001', 'id')).toBe('3f1c8c1e-0000-4000-8000-000000000001');
  });
});

// ─── API keys de Resend cifradas en reposo (builder r2, tester r2, builder r3 #4) ─

describe('domainStore · cifrado de credenciales', () => {
  const saved = { c: process.env.EMAIL_CREDENTIALS_SECRET, u: process.env.EMAIL_UNSUBSCRIBE_SECRET, s: process.env.SUPABASE_SERVICE_ROLE_KEY };
  const restore = (k: 'EMAIL_CREDENTIALS_SECRET' | 'EMAIL_UNSUBSCRIBE_SECRET' | 'SUPABASE_SERVICE_ROLE_KEY', v: string | undefined) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  afterAll(() => { restore('EMAIL_CREDENTIALS_SECRET', saved.c); restore('EMAIL_UNSUBSCRIBE_SECRET', saved.u); restore('SUPABASE_SERVICE_ROLE_KEY', saved.s); __setDomainStoreClient(null); });
  const silencio = () => jest.spyOn(console, 'error').mockImplementation(() => undefined);

  it('B2 · formato encv2:<kid>.<iv>.<tag>.<ct>: ida y vuelta, el texto guardado no contiene el token, IV distinto y kid compartido', () => {
    process.env.EMAIL_CREDENTIALS_SECRET = 'secreto-de-credenciales-de-pruebas';
    const token = 're_test_1234567890';
    const a = encryptSecret(token);
    const b = encryptSecret(token);
    expect(a.startsWith('encv2:')).toBe(true);
    expect(a.slice('encv2:'.length).split('.')).toHaveLength(4);
    expect(a).not.toContain(token);
    expect(decryptSecret(a)).toBe(token);
    expect(a).not.toBe(b);
    expect(a.slice('encv2:'.length).split('.')[0]).toBe(b.slice('encv2:'.length).split('.')[0]); // kid
    expect(a.slice('encv2:'.length).split('.')[1]).not.toBe(b.slice('encv2:'.length).split('.')[1]); // iv
  });

  it('B2 · un valor manipulado no descifra (GCM autenticado) y un valor antiguo en claro se sigue leyendo', () => {
    process.env.EMAIL_CREDENTIALS_SECRET = 'secreto-de-credenciales-de-pruebas';
    const enc = encryptSecret('re_test_1234567890');
    const [kid, iv] = enc.slice('encv2:'.length).split('.');
    const err = silencio();
    expect(decryptSecret(`encv2:${kid}.${iv}.${Buffer.from('otro').toString('base64')}.${Buffer.from('x').toString('base64')}`)).toBeNull();
    err.mockRestore();
    expect(decryptSecret('re_en_claro_antiguo')).toBe('re_en_claro_antiguo');
  });

  it('T2 · añadir EMAIL_CREDENTIALS_SECRET DESPUÉS (flujo de .env.example) NO invalida lo cifrado con la clave derivada y lo marca needsRewrite', () => {
    delete process.env.EMAIL_CREDENTIALS_SECRET;
    process.env.EMAIL_UNSUBSCRIBE_SECRET = 'secreto-de-bajas-de-16-o-mas';
    const guardado = encryptSecret('re_token_2');
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-nueva-de-32-bytes-abcdefgh';
    expect(decryptSecret(guardado)).toBe('re_token_2');
    expect(decryptSecretDetailed(guardado).needsRewrite).toBe(true);
  });

  it('B3.4 · rotar la service-role key (fallback) NO invalida lo cifrado con el secreto propio ni pide reescritura', () => {
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-vieja';
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-principal-de-32-bytes-abcd';
    const guardado = encryptSecret('re_token_rot');
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-NUEVA-tras-rotar';
    expect(decryptSecretDetailed(guardado)).toMatchObject({ plain: 're_token_rot', needsRewrite: false });
  });

  it('B3.4 · perder TODAS las claves devuelve null (no un token falso) y conserva el formato', () => {
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-que-luego-se-pierde-12345';
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const guardado = encryptSecret('re_token_perdido');
    process.env.EMAIL_CREDENTIALS_SECRET = 'una-clave-completamente-distinta';
    const err = silencio();
    const r = decryptSecretDetailed(guardado);
    err.mockRestore();
    expect(r.plain).toBeNull();
    expect(r.format).toBe('encv2');
  });

  /** La UI decía `has_api_key: true` sobre una credencial inservible (C11). */
  it('B3.4 · listDomainKeyStates marca `unreadable` lo que ninguna clave descifra', async () => {
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-A-para-el-estado-de-la-ui';
    delete process.env.EMAIL_UNSUBSCRIBE_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const legible = encryptSecret('re_legible');
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-B-distinta-de-la-anterior';
    const ilegible = encryptSecret('re_ilegible');
    process.env.EMAIL_CREDENTIALS_SECRET = 'clave-A-para-el-estado-de-la-ui';
    __setDomainStoreClient(fakeSupabase(() => ({ data: { id: 'row-1', credentials: { RESEND_API_KEY_dom_ok: legible, RESEND_API_KEY_dom_ko: ilegible }, settings: {} }, error: null })).client);
    const err = silencio();
    const states = await listDomainKeyStates(9);
    err.mockRestore();
    __setDomainStoreClient(null);
    expect(states.get('dom_ok')).toBe('ok');
    expect(states.get('dom_ko')).toBe('unreadable');
  });
});
