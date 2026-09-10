/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * providerRegistry / providerCatalog — F0 (REG r1)
 *  - Placeholders de .env.example NO cuentan como configurados.
 *  - Fallback env por categoría con provider por defecto y settings V4.
 *  - listProvidersSafe nunca expone credenciales.
 */

import {
  isPlaceholderCredential,
  pickConfiguredKeys,
  hasRequiredCredentials,
  SUPPORTED_PROVIDERS,
  CREDENTIAL_FIELDS,
  PROVIDER_CATEGORIES,
} from '@/lib/crm/providerCatalog';
import {
  resolveEnvFallback,
  hasPlatformCredentials,
  sanitizeCredentials,
  defaultSettings,
  listProvidersSafe,
  DEFAULT_PROVIDER,
} from '@/lib/services/providerRegistry';

const ENV_KEYS = [
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MASTER_ACCOUNT_SID', 'TWILIO_MASTER_AUTH_TOKEN',
  'TWILIO_API_KEY', 'TWILIO_API_SECRET', 'TWILIO_TWIML_APP_SID', 'TWILIO_PHONE_NUMBER',
  'ELEVENLABS_API_KEY', 'ELEVENLABS_SCRIBE_MODEL', 'ELEVENLABS_MODEL',
  'OPENAI_API_KEY', 'OPENAI_MODEL', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'GEMINI_ANALYSIS_MODEL',
  'RESEND_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'META_ACCESS_TOKEN', 'DEEPGRAM_API_KEY',
];

const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isPlaceholderCredential', () => {
  it.each([
    ['', true],
    ['   ', true],
    [undefined, true],
    [null, true],
    ['your-openai-key', true],
    ['sk-your-openai-key', true],
    ['ACyour-account-sid', true],
    ['SKyour-api-key', true],
    ['APyour-twiml-app-sid', true],
    ['re_your-resend-key', true],
    ['whsec_your-webhook-secret', true],
    ['SG.your-sendgrid-key', true],
    ['+57your-phone-number', true],
    // F6 r3: relleno `SKxxxx…`/`APxxxx…` del `.env.local` de desarrollo. Sin
    // esto, el softphone decía que solo faltaba el API Secret y la llamada
    // seguía muriendo con un 401 de Twilio sin explicar por qué.
    ['SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', true],
    ['APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', true],
    ['xxxxxxxxxxxxxxxx', true],
    ['00000000000000000000', true],
    // Una clave real que TERMINA en una racha de ceros no es un relleno.
    ['sk-proj-Abc123XYZ_realkey_0000000000000000000000', false],
    ['sk-proj-abc123def456ghi789jkl012mno345pqr678', false],
    ['ACa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4', false],
    ['re_123456789_abcdefghijklmnop', false],
    ['+573001234567', false],
  ])('%p → %p', (value, expected) => {
    expect(isPlaceholderCredential(value)).toBe(expected);
  });
});

describe('pickConfiguredKeys / hasRequiredCredentials', () => {
  it('descarta placeholders y vacíos', () => {
    expect(pickConfiguredKeys({ A: 'your-a', B: '', C: 'real-value-123' })).toEqual(['C']);
  });
  it('twilio requiere SID y token reales', () => {
    expect(hasRequiredCredentials('twilio', { TWILIO_ACCOUNT_SID: 'ACyour-account-sid', TWILIO_AUTH_TOKEN: 'tok' })).toBe(false);
    expect(hasRequiredCredentials('twilio', { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok123' })).toBe(true);
  });
  it('openai requiere OPENAI_API_KEY', () => {
    expect(hasRequiredCredentials('openai', {})).toBe(false);
    expect(hasRequiredCredentials('openai', { OPENAI_API_KEY: 'sk-proj-realkey' })).toBe(true);
  });
});

describe('resolveEnvFallback', () => {
  it('sin env → provider none / inactivo', () => {
    const cfg = resolveEnvFallback('llm');
    expect(cfg.provider).toBe('none');
    expect(cfg.isActive).toBe(false);
    expect(cfg.credentials).toEqual({});
  });

  it('placeholders de .env.example NO activan el proveedor', () => {
    process.env.OPENAI_API_KEY = 'sk-your-openai-key';
    process.env.TWILIO_ACCOUNT_SID = 'ACyour-account-sid';
    process.env.TWILIO_AUTH_TOKEN = 'your-twilio-auth-token';
    expect(resolveEnvFallback('llm').isActive).toBe(false);
    expect(resolveEnvFallback('voice').isActive).toBe(false);
    expect(hasPlatformCredentials('llm', 'openai')).toBe(false);
  });

  it('llm → openai con modelo por defecto gpt-5.6-luna', () => {
    process.env.OPENAI_API_KEY = 'sk-proj-realkey123';
    const cfg = resolveEnvFallback('llm');
    expect(cfg.provider).toBe('openai');
    expect(cfg.isActive).toBe(true);
    expect(cfg.source).toBe('env');
    expect(cfg.settings.model).toBe('gpt-5.6-luna');
    expect(cfg.credentials.OPENAI_API_KEY).toBe('sk-proj-realkey123');
  });

  it('stt → elevenlabs (scribe_v2) por defecto aunque exista Deepgram', () => {
    process.env.DEEPGRAM_API_KEY = 'dg-realkey';
    process.env.ELEVENLABS_API_KEY = 'el-realkey';
    const cfg = resolveEnvFallback('stt');
    expect(cfg.provider).toBe('elevenlabs');
    expect(cfg.settings.model_id).toBe('scribe_v2');
  });

  it('stt cae a deepgram si solo hay Deepgram (legacy hasta F4)', () => {
    process.env.DEEPGRAM_API_KEY = 'dg-realkey';
    expect(resolveEnvFallback('stt').provider).toBe('deepgram');
  });

  it('tts → elevenlabs eleven_flash_v2_5; ELEVENLABS_MODEL lo sobreescribe', () => {
    process.env.ELEVENLABS_API_KEY = 'el-realkey';
    expect(resolveEnvFallback('tts').settings.model_id).toBe('eleven_flash_v2_5');
    process.env.ELEVENLABS_MODEL = 'eleven_multilingual_v2';
    expect(resolveEnvFallback('tts').settings.model_id).toBe('eleven_multilingual_v2');
  });

  it('analysis → google con GOOGLE_AI_API_KEY o GEMINI_API_KEY y gemini-3.8-flash', () => {
    process.env.GEMINI_API_KEY = 'gm-realkey';
    const cfg = resolveEnvFallback('analysis');
    expect(cfg.provider).toBe('google');
    expect(cfg.credentials.GOOGLE_AI_API_KEY).toBe('gm-realkey');
    expect(cfg.settings.model).toBe('gemini-3.8-flash');
  });

  it('voice incluye API key/secret/TwiML app/número; usa *_MASTER_* como alias', () => {
    process.env.TWILIO_MASTER_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_MASTER_AUTH_TOKEN = 'tok123';
    process.env.TWILIO_API_KEY = 'SK123';
    process.env.TWILIO_API_SECRET = 'sec123';
    process.env.TWILIO_TWIML_APP_SID = 'AP123';
    process.env.TWILIO_PHONE_NUMBER = '+573001234567';
    const cfg = resolveEnvFallback('voice');
    expect(cfg.provider).toBe('twilio');
    expect(cfg.credentials).toMatchObject({
      TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok123', TWILIO_API_KEY: 'SK123',
      TWILIO_API_SECRET: 'sec123', TWILIO_TWIML_APP_SID: 'AP123', TWILIO_PHONE_NUMBER: '+573001234567',
    });
  });

  it('email → resend; whatsapp → meta; sms → twilio', () => {
    process.env.RESEND_API_KEY = 're_123_realkey';
    process.env.WHATSAPP_ACCESS_TOKEN = 'EAAB-real-token';
    process.env.TWILIO_ACCOUNT_SID = 'AC123';
    process.env.TWILIO_AUTH_TOKEN = 'tok123';
    expect(resolveEnvFallback('email').provider).toBe('resend');
    expect(resolveEnvFallback('whatsapp').provider).toBe('meta');
    expect(resolveEnvFallback('sms').provider).toBe('twilio');
  });

  it('con provider explícito devuelve ese proveedor aunque no tenga credenciales', () => {
    const cfg = resolveEnvFallback('llm', 'google');
    expect(cfg.provider).toBe('google');
    expect(cfg.isActive).toBe(false);
    expect(cfg.settings.model).toBe('gemini-3.8-flash');
  });
});

describe('catálogo', () => {
  it('cada DEFAULT_PROVIDER está en SUPPORTED_PROVIDERS y tiene CREDENTIAL_FIELDS', () => {
    for (const cat of PROVIDER_CATEGORIES) {
      const p = DEFAULT_PROVIDER[cat];
      expect(SUPPORTED_PROVIDERS[cat]).toContain(p);
      expect(CREDENTIAL_FIELDS[p]).toBeDefined();
    }
  });
  it('sanitizeCredentials elimina placeholders', () => {
    expect(sanitizeCredentials({ OPENAI_API_KEY: 'sk-your-openai-key', X: 'real' })).toEqual({ X: 'real' });
  });
  it('defaultSettings llm:openai incluye modelos conversación/tareas', () => {
    expect(defaultSettings('llm', 'openai')).toMatchObject({ model: 'gpt-5.6-luna', conversation_model: 'gpt-5.6-terra' });
  });
});

describe('listProvidersSafe', () => {
  function fakeClient(rows: any[], failView = false) {
    const make = (table: string) => {
      const q: any = {
        select: () => q, eq: () => q,
        order: () => q,
        then: (res: any) => res(table === 'v_provider_configs_safe' && failView ? { data: null, error: { message: 'no view' } } : { data: rows, error: null }),
      };
      return q;
    };
    return { from: (t: string) => make(t) };
  }

  it('nunca incluye credentials y marca platform_available', async () => {
    process.env.OPENAI_API_KEY = 'sk-proj-realkey';
    const rows = [{ id: '1', category: 'llm', provider: 'openai', settings: { model: 'x' }, is_active: true, priority: 10, credentials: { OPENAI_API_KEY: 'LEAK' } }];
    const items = await listProvidersSafe(7, fakeClient(rows) as any);
    expect(items).toHaveLength(1);
    expect(JSON.stringify(items)).not.toContain('LEAK');
    expect(items[0].platform_available).toBe(true);
    expect(items[0].credential_keys).toEqual([]);
  });

  it('cae a provider_configs si la vista no existe', async () => {
    const rows = [{ id: '1', category: 'email', provider: 'resend', settings: {}, is_active: true, priority: 10 }];
    const items = await listProvidersSafe(7, fakeClient(rows, true) as any);
    expect(items[0].provider).toBe('resend');
  });
});
