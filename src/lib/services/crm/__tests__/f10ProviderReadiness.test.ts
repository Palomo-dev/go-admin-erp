/// <reference types="jest" />
/**
 * F10 — «¿está configurado el proveedor?» sin fingir: placeholders no cuentan,
 * `provider='none'` no cuenta, y el mensaje para la organización cliente no
 * nombra variables de entorno (es plataforma).
 */
import { resolveEsignReadiness, resolveStripeReadiness, type ProviderConfigRow } from '@/lib/services/crm/providerReadiness';

const cfg = (over: Partial<ProviderConfigRow> = {}): ProviderConfigRow => ({
  provider: 'documenso',
  is_active: true,
  credentials: { DOCUMENSO_API_KEY: 'api_real_key_abcdefghijklmnopqrstuvwxyz' },
  settings: {},
  ...over,
});

describe('F10 providerReadiness — firma electrónica', () => {
  it('organización con Documenso activo y clave real → configurado desde la organización', () => {
    const r = resolveEsignReadiness({ orgConfigs: [cfg()], env: {} });
    expect(r).toMatchObject({ configured: true, provider: 'documenso', source: 'organization' });
    expect(r.apiKey).toBe('api_real_key_abcdefghijklmnopqrstuvwxyz');
  });

  it('`provider=none` (lo que hay hoy en las 64 filas) → no configurado, sin nombrar variables', () => {
    const r = resolveEsignReadiness({ orgConfigs: [cfg({ provider: 'none', credentials: {} })], env: {} });
    expect(r.configured).toBe(false);
    expect(r.missing.join(' ')).not.toMatch(/DOCUMENSO_API_KEY|process\.env/);
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it('config inactiva o con placeholder → no configurado', () => {
    expect(resolveEsignReadiness({ orgConfigs: [cfg({ is_active: false })], env: {} }).configured).toBe(false);
    expect(resolveEsignReadiness({ orgConfigs: [cfg({ credentials: { DOCUMENSO_API_KEY: 'your-documenso-api-key' } })], env: {} }).configured).toBe(false);
  });

  it('respaldo de plataforma: clave real en el entorno → configurado desde la plataforma; placeholder del .env.example → no', () => {
    const real = resolveEsignReadiness({ orgConfigs: [], env: { DOCUMENSO_API_KEY: 'api_platform_key_abcdefghijklmnopqrstu' } });
    expect(real).toMatchObject({ configured: true, source: 'platform' });
    const ph = resolveEsignReadiness({ orgConfigs: [], env: { DOCUMENSO_API_KEY: 'your-documenso-api-key' } });
    expect(ph.configured).toBe(false);
  });

  it('la organización tiene prioridad sobre la plataforma', () => {
    const r = resolveEsignReadiness({ orgConfigs: [cfg()], env: { DOCUMENSO_API_KEY: 'api_platform_key_abcdefghijklmnopqrstu' } });
    expect(r.source).toBe('organization');
  });

  it('el secreto de webhook se resuelve por separado y también rechaza placeholders', () => {
    const r = resolveEsignReadiness({ orgConfigs: [cfg({ credentials: { DOCUMENSO_API_KEY: 'api_real_key_abcdefghijklmnopqrstuvwxyz', DOCUMENSO_WEBHOOK_SECRET: 'whsec_real_0123456789abcdef' } })], env: {} });
    expect(r.webhookSecret).toBe('whsec_real_0123456789abcdef');
    const r2 = resolveEsignReadiness({ orgConfigs: [cfg()], env: { DOCUMENSO_WEBHOOK_SECRET: 'your-secret' } });
    expect(r2.webhookSecret).toBeNull();
  });
});

describe('F10 providerReadiness — Stripe', () => {
  it('credenciales de la organización (integration_credentials) reales → modo organización', () => {
    const r = resolveStripeReadiness({ orgCredentials: { secretKey: ['sk_test_', '51abcdefghijklmnopqrstuvwxyz'].join(''), webhookSecret: 'whsec_abcdefghijklmnop' }, env: {} });
    expect(r).toMatchObject({ configured: true, source: 'organization', secretKey: ['sk_test_', '51abcdefghijklmnopqrstuvwxyz'].join('') });
  });

  it('clave con prefijo incorrecto o placeholder → no configurado', () => {
    expect(resolveStripeReadiness({ orgCredentials: { secretKey: 'pk_test_123456789012345678901234' }, env: {} }).configured).toBe(false);
    expect(resolveStripeReadiness({ orgCredentials: null, env: { STRIPE_SECRET_KEY: 'sk_live_your-secret-key' } }).configured).toBe(false);
  });

  it('plataforma con clave real → configurado desde la plataforma (la organización viajará en metadata)', () => {
    const r = resolveStripeReadiness({ orgCredentials: null, env: { STRIPE_SECRET_KEY: ['sk_test_', '51abcdefghijklmnopqrstuvwxyz'].join(''), STRIPE_CRM_WEBHOOK_SECRET: 'whsec_platform_abcdefghijk' } });
    expect(r).toMatchObject({ configured: true, source: 'platform', webhookSecret: 'whsec_platform_abcdefghijk' });
  });

  it('no configurado → `missing` en lenguaje de usuario, sin nombres de variables', () => {
    const r = resolveStripeReadiness({ orgCredentials: null, env: {} });
    expect(r.configured).toBe(false);
    expect(r.missing.join(' ')).not.toMatch(/STRIPE_SECRET_KEY|process\.env/);
  });
});
