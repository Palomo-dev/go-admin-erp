/// <reference types="jest" />
/**
 * Dominios: Resend domains.create en camelCase, apiKeys.create con
 * `domain_id` (tester-ANEXO-B #4, SDK 6.26), mapeo de estados, DMARC,
 * resolución del remitente y política de fallback.
 */
const domainsCreate = jest.fn(async () => ({ data: { id: 'dom_res_1', name: 'crm.acme.co', status: 'not_started', records: [{ record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', ttl: 'Auto', status: 'not_started' }] }, error: null }));
const apiKeysCreate = jest.fn(async () => ({ data: { id: 'key_1', token: 're_domain_token' }, error: null }));
jest.mock('../resendClient', () => ({
  getMasterResend: () => ({ domains: { create: domainsCreate, verify: jest.fn(async () => ({ error: null })), get: jest.fn(async () => ({ data: { id: 'dom_res_1', status: 'verified', records: [] }, error: null })), update: jest.fn(async () => ({ error: null })) }, apiKeys: { create: apiKeysCreate } }),
  getMasterResendKey: () => 're_master',
  getResendClient: () => ({}),
}));
const store: { settings: Record<string, unknown>; keys: Record<string, string>; policy: string; tracking: boolean } = { settings: {}, keys: {}, policy: 'global_with_notice', tracking: false };
jest.mock('../domainStore', () => ({
  getEmailOrgSettings: async () => ({ email_fallback_policy: store.policy, email_tracking_transactional: store.tracking, email_domains: store.settings }),
  setDomainExtras: async (_o: number, id: string, extras: Record<string, unknown>) => { store.settings[id] = { ...(store.settings[id] as object ?? {}), ...extras }; },
  getDomainExtras: async (_o: number, id: string) => store.settings[id] ?? {},
  removeDomainExtras: async () => undefined,
  storeDomainApiKey: async (_o: number, id: string, token: string) => { store.keys[id] = token; },
  getDomainApiKey: async (_o: number, id: string) => store.keys[id] ?? null,
  listDomainKeyIds: async () => new Set(Object.keys(store.keys)),
  // r3: `withExtras` distingue credencial legible de ilegible (tester r2 #4).
  listDomainKeyStates: async () => new Map(Object.keys(store.keys).map((k) => [k, 'ok' as const])),
  getOrgResendKey: async () => null,
}));

import { createDomain, dmarcRecord, mapProviderStatus, resolveSender } from '../domainsService';
import type { EmailDomain } from '../types';
import { fakeSupabase } from './fakeSupabase';

beforeEach(() => { domainsCreate.mockClear(); apiKeysCreate.mockClear(); store.settings = {}; store.keys = {}; store.policy = 'global_with_notice'; delete process.env.EMAIL_GLOBAL_DOMAIN; delete process.env.EMAIL_FROM_ADDRESS; });

describe('mapProviderStatus / dmarcRecord', () => {
  it('mapea los estados de Resend al CHECK de email_domains', () => {
    expect(mapProviderStatus('verified')).toBe('verified');
    expect(mapProviderStatus('failed')).toBe('failed');
    expect(mapProviderStatus('partially_failed')).toBe('failed');
    expect(mapProviderStatus('pending')).toBe('pending');
    expect(mapProviderStatus('pending', true)).toBe('verifying');
    expect(mapProviderStatus('temporary_failure', true)).toBe('verifying');
    expect(mapProviderStatus(undefined)).toBe('pending');
  });
  it('sugiere DMARC en el dominio raíz', () => {
    expect(dmarcRecord('crm.acme.co')).toMatchObject({ record: 'DMARC', name: '_dmarc.acme.co', type: 'TXT', recommended: true });
    expect(dmarcRecord('crm.acme.co').value).toContain('v=DMARC1; p=none');
  });
});

describe('createDomain', () => {
  it('llama a domains.create (camelCase) y apiKeys.create con domain_id (snake_case, SDK 6.26); guarda token y extras', async () => {
    const inserted: Record<string, unknown>[] = [];
    const { client } = fakeSupabase((c) => {
      if (c.table === 'email_domains' && c.op === 'select') {
        const byId = c.filters.find((f) => f[0] === 'eq' && f[1] === 'id');
        if (byId) return { data: inserted.find((r) => r.id === byId[2]) ?? null, error: null };
        return { data: [], error: null };
      }
      if (c.table === 'email_domains' && c.op === 'insert') { const row = { id: 'dom-local-1', dmarc_configured: false, verified_at: null, created_at: 'x', updated_at: 'x', ...(c.args[0] as object) }; inserted.push(row); return { data: row, error: null }; }
      return { data: null, error: null };
    });
    const d = await createDomain(5, { domain: 'CRM.Acme.co', from_name: 'ACME Ventas', from_email_local: 'ventas', open_tracking: true }, client);
    expect(domainsCreate).toHaveBeenCalledWith({ name: 'crm.acme.co', region: 'us-east-1', customReturnPath: 'send', openTracking: true, clickTracking: false, trackingSubdomain: 'links', capabilities: { sending: 'enabled', receiving: 'enabled' } });
    const keyArgs = (apiKeysCreate.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(keyArgs).toEqual({ name: 'org-5-crm.acme.co', permission: 'sending_access', domain_id: 'dom_res_1' });
    expect(keyArgs).not.toHaveProperty('domainId');
    expect(store.keys['dom-local-1']).toBe('re_domain_token');
    expect(d).toMatchObject({ domain: 'crm.acme.co', from_email: 'ventas@crm.acme.co', provider_domain_id: 'dom_res_1', status: 'pending', is_default: true, has_api_key: true, open_tracking: true, api_key_id: 'key_1', region: 'us-east-1' });
    expect(d.dns_records.map((r) => r.record)).toEqual(['SPF', 'DMARC']);
  });

  it('rechaza dominios inválidos y duplicados sin llamar a Resend', async () => {
    const { client } = fakeSupabase((c) => (c.table === 'email_domains' ? { data: { id: 'x' }, error: null } : { data: null, error: null }));
    await expect(createDomain(5, { domain: 'no valido', from_name: 'A' }, client)).rejects.toMatchObject({ code: 'INVALID_DOMAIN' });
    await expect(createDomain(5, { domain: 'crm.acme.co', from_name: 'A' }, client)).rejects.toMatchObject({ code: 'DOMAIN_EXISTS', status: 409 });
    expect(domainsCreate).not.toHaveBeenCalled();
  });
});

describe('resolveSender', () => {
  const verified = (over: Partial<EmailDomain> = {}) => ({ id: 'd1', organization_id: 5, domain: 'crm.acme.co', provider: 'resend', provider_domain_id: 'r', credential_id: null, status: 'verified', dns_records: [], dmarc_configured: true, from_name: 'ACME', from_email: 'ventas@crm.acme.co', reply_to: null, is_default: true, verified_at: 'x', created_at: '', updated_at: '', ...over });
  const dbWith = (rows: unknown[]) => fakeSupabase((c) => (c.table === 'email_domains' ? { data: rows, error: null } : { data: null, error: null })).client;

  it('dominio verificado por defecto con su API key; reply_to del usuario si el dominio no fija uno', async () => {
    store.keys.d1 = 're_dom_key';
    store.settings.d1 = { receiving_enabled: true, open_tracking: true };
    const s = await resolveSender(5, { kind: 'marketing', userEmail: 'ana@acme.co' }, dbWith([verified()]));
    expect(s).toMatchObject({ mode: 'org', from: 'ACME <ventas@crm.acme.co>', apiKey: 're_dom_key', replyTo: 'ana@acme.co', receivingDomain: 'crm.acme.co', tracking: true, notice: null });
  });

  it('ignora dominios no verificados y aplica la política: bloquear → NO_SENDER 422', async () => {
    store.policy = 'block';
    await expect(resolveSender(5, { kind: 'transactional' }, dbWith([verified({ status: 'pending' })]))).rejects.toMatchObject({ code: 'NO_SENDER', status: 422 });
  });

  it('fallback global con aviso usa EMAIL_GLOBAL_DOMAIN y el nombre de la org', async () => {
    process.env.EMAIL_GLOBAL_DOMAIN = 'mail.goadmin.io';
    const s = await resolveSender(5, { kind: 'transactional', orgName: 'ACME', userEmail: 'ana@acme.co' }, dbWith([]));
    expect(s).toMatchObject({ mode: 'global', fromEmail: 'noreply@mail.goadmin.io', from: 'ACME vía GoAdmin <noreply@mail.goadmin.io>', replyTo: 'ana@acme.co', receivingDomain: 'mail.goadmin.io', apiKey: 're_master' });
    expect(s.notice).toContain('en nombre de ACME');
    store.policy = 'global_silent';
    expect((await resolveSender(5, { kind: 'transactional' }, dbWith([]))).notice).toBeNull();
  });

  it('sin dominio verificado ni remitente global → NO_SENDER', async () => {
    await expect(resolveSender(5, { kind: 'transactional' }, dbWith([]))).rejects.toMatchObject({ code: 'NO_SENDER' });
  });
});
