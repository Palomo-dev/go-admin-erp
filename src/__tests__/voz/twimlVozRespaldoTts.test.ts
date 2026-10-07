/**
 * TwiML del agente de voz: formato de la voz de ElevenLabs y voz de respaldo.
 *
 * El 2026-09-30 Twilio respondió 64111 al sintetizar el saludo con la voz
 * ElevenLabs del agente (org 125). Ante eso el TwiML declara un
 * `<Language>` de respaldo (Google, español) y le pasa su código al ws-server
 * en un `<Parameter>`, para que cambie de voz sin dejar la llamada muda.
 */

import {
  resolveTtsFallback,
  isTtsError,
  twilioErrorCode,
  TtsFallbackTracker,
  DEFAULT_TTS_FALLBACK,
} from '@/lib/services/crm/voiceAgent/ttsFallback';
import { crVoiceModelSuffix, twilioLanguage } from '@/lib/services/crm/voiceAgent/agentRuntime';

const ELEVEN = { ttsProvider: 'ElevenLabs' as const, voice: 'O00tZiHVGzUDE9eqys2a-flash_v2_5' };

describe('formato de voz y de idioma hacia ConversationRelay', () => {
  test('ElevenLabs: `{voiceId}-{modelo sin eleven_}`', () => {
    expect(crVoiceModelSuffix('eleven_flash_v2_5')).toBe('flash_v2_5');
    expect(crVoiceModelSuffix(null)).toBe('flash_v2_5');
    // Un modelo que ConversationRelay no admite cae al default documentado.
    expect(crVoiceModelSuffix('eleven_multilingual_v2')).toBe('flash_v2_5');
  });

  test('es-CO no existe en Twilio: se envía es-MX', () => {
    expect(twilioLanguage('es-CO')).toBe('es-MX');
    expect(twilioLanguage('es-US')).toBe('es-US');
  });
});

describe('resolveTtsFallback', () => {
  test('por defecto: Google es-US con la voz documentada', () => {
    expect(resolveTtsFallback(ELEVEN, 'es-MX', {})).toEqual(DEFAULT_TTS_FALLBACK);
  });

  test('sale de configuración cuando está definida', () => {
    expect(
      resolveTtsFallback(ELEVEN, 'es-MX', {
        VOICE_AGENT_TTS_FALLBACK_PROVIDER: 'amazon',
        VOICE_AGENT_TTS_FALLBACK_VOICE: 'Lupe-Neural',
        VOICE_AGENT_TTS_FALLBACK_LANGUAGE: 'es-US',
      })
    ).toEqual({ code: 'es-US', ttsProvider: 'Amazon', voice: 'Lupe-Neural' });
  });

  test('otro proveedor sin voz explícita: la voz por defecto del proveedor (no la de Google)', () => {
    expect(resolveTtsFallback(ELEVEN, 'es-MX', { VOICE_AGENT_TTS_FALLBACK_PROVIDER: 'amazon' })).toEqual({
      code: 'es-US',
      ttsProvider: 'Amazon',
      voice: null,
    });
  });

  test('variables vacías (copiadas de .env.example) = defaults', () => {
    expect(
      resolveTtsFallback(ELEVEN, 'es-MX', {
        VOICE_AGENT_TTS_FALLBACK_PROVIDER: '',
        VOICE_AGENT_TTS_FALLBACK_VOICE: '',
        VOICE_AGENT_TTS_FALLBACK_LANGUAGE: '',
      })
    ).toEqual(DEFAULT_TTS_FALLBACK);
  });

  test('`off` lo desactiva', () => {
    expect(resolveTtsFallback(ELEVEN, 'es-MX', { VOICE_AGENT_TTS_FALLBACK_PROVIDER: 'off' })).toBeNull();
  });

  test('mismo código que el idioma principal: no hay respaldo (lo sustituiría)', () => {
    expect(resolveTtsFallback(ELEVEN, 'es-US', {})).toBeNull();
  });

  test('respaldo idéntico a la voz principal: no aporta nada', () => {
    expect(resolveTtsFallback({ ttsProvider: 'Google', voice: 'es-US-Journey-D' }, 'es-MX', {})).toBeNull();
  });
});

describe('detección del error de TTS', () => {
  test('64111 y 64112 son de TTS; otros códigos no', () => {
    expect(isTtsError('Error converting tokens to speech, code: 64111, error: , tokens: Hola')).toBe(true);
    expect(isTtsError('TTS conversion error, code: 64112')).toBe(true);
    expect(isTtsError('Invalid message received, code: 64105')).toBe(false);
    expect(isTtsError(undefined)).toBe(false);
    expect(twilioErrorCode('Error converting tokens to speech, code: 64111, error: ')).toBe('64111');
  });

  test('una frase a medias se reenvía abierta; una completa, cerrada', () => {
    const t = new TtsFallbackTracker('es-US');
    t.recordSent('Claro, ', false);
    expect(t.onTtsError()).toEqual({ switchMessage: { type: 'language', ttsLanguage: 'es-US' }, resend: 'Claro, ', resendIsComplete: false });

    const u = new TtsFallbackTracker('es-US');
    u.recordSent('Claro, ', false);
    u.recordSent('con gusto.', true);
    expect(u.onTtsError()?.resend).toBe('Claro, con gusto.');
    expect(u.onTtsError()).toBeNull();
  });
});

// ─── La ruta real del TwiML ──────────────────────────────────────────────────

function fakeClient() {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({
      data: { id: 'vac-1', started_at: null, provider_call_sid: null, call_id: null, customer_id: 'c1', credits_reserved: 1, credits_settled_at: null },
      error: null,
    }),
    update: () => q,
    in: () => q,
    is: () => q,
    then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'vac-1' }], error: null }).then(ok),
  });
  return { from: () => q, rpc: async () => ({ data: true, error: null }) };
}

jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyTwilioWebhook: jest.fn(async () => ({ params: { CallSid: 'CA1', AnsweredBy: 'human' }, accountSid: 'AC1' })),
  WebhookError: class extends Error {},
  getTwilioWebhookOrigin: () => 'https://app.example.com',
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeClient() }));
jest.mock('@/lib/security/wsSessionToken', () => ({ readWsSessionSecret: () => 'x'.repeat(40), issueWsSessionToken: () => 'tok' }));
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => {
  const real = jest.requireActual('@/lib/services/crm/voiceAgent/agentRuntime');
  return {
    ...real,
    buildRuntimeConfig: jest.fn(async () => ({
      orgId: 125,
      recordingEnabled: false,
      consentMessage: '',
      greeting: 'Hola. Le habla Pedro.',
      agent: { language: 'es-CO', stt_provider: 'deepgram' },
      voice: { ttsProvider: 'ElevenLabs', voice: 'O00tZiHVGzUDE9eqys2a-flash_v2_5' },
    })),
  };
});
jest.mock('@/lib/services/crm/voiceContextService', () => ({ accountSidMatchesOrg: jest.fn(async () => true) }));
jest.mock('@/lib/services/crm/bridgeTokens', () => ({ isBridgeSigningConfigured: () => false, signConsentToken: () => 't', verifyConsentToken: () => false }));
jest.mock('@/lib/services/crm/consentService', () => ({ recordConsent: jest.fn(), recordingEnabledForCall: jest.fn(async () => false), voidConsentWithoutRecording: jest.fn() }));
jest.mock('@/lib/services/crm/callManagementService', () => ({ updateCall: jest.fn(async () => null) }));

import { POST } from '@/app/api/voice/twiml/ai-agent/route';

const req = () => new Request('https://app.example.com/api/voice/twiml/ai-agent?agentId=agent-1&callId=vac-1', { method: 'POST', body: 'x' });

describe('POST /api/voice/twiml/ai-agent', () => {
  const envAntes = { ...process.env };
  afterEach(() => {
    process.env = { ...envAntes };
  });

  test('ElevenLabs con es-MX, Deepgram, y el <Language> de respaldo + su <Parameter>', async () => {
    delete process.env.VOICE_AGENT_TTS_FALLBACK_PROVIDER;
    delete process.env.VOICE_AGENT_TTS_FALLBACK_VOICE;
    delete process.env.VOICE_AGENT_TTS_FALLBACK_LANGUAGE;
    const xml = await (await POST(req())).text();

    expect(xml).toContain('ttsProvider="ElevenLabs"');
    expect(xml).toContain('voice="O00tZiHVGzUDE9eqys2a-flash_v2_5"');
    expect(xml).toContain('language="es-MX"');
    expect(xml).toContain('ttsLanguage="es-MX"');
    expect(xml).not.toContain('es-CO');
    expect(xml).toContain('transcriptionProvider="Deepgram"');
    expect(xml).toMatch(/<Language\s+code="es-US"\s+ttsProvider="Google"\s+voice="es-US-Journey-D"\s*\/>/);
    expect(xml).toContain('<Parameter name="ttsFallbackLanguage" value="es-US" />');
    // El <Language> va DENTRO del <ConversationRelay>.
    expect(xml.indexOf('<Language')).toBeGreaterThan(xml.indexOf('<ConversationRelay'));
    expect(xml.indexOf('<Language')).toBeLessThan(xml.indexOf('</ConversationRelay>'));
  });

  test('fin de turno por defecto: nova-3 como antes, sin atributos de Flux', async () => {
    delete process.env.VOICE_FIN_DE_TURNO;
    const xml = await (await POST(req())).text();
    expect(xml).toContain('speechModel="nova-3-general"');
    expect(xml).toContain('transcriptionLanguage="es-MX"');
    expect(xml).not.toContain('eotThreshold');
    expect(xml).not.toContain('speechTimeout');
  });

  test('VOICE_FIN_DE_TURNO=flux: Flux multilingüe con umbral; la voz sigue en es-MX', async () => {
    process.env.VOICE_FIN_DE_TURNO = 'flux';
    process.env.VOICE_SPEECH_TIMEOUT_MS = '1500';
    const xml = await (await POST(req())).text();
    expect(xml).toContain('transcriptionProvider="Deepgram"');
    expect(xml).toContain('speechModel="flux"');
    expect(xml).toContain('transcriptionLanguage="multi"');
    expect(xml).toContain('eotThreshold="0.7"');
    expect(xml).toContain('speechTimeout="1500"');
    expect(xml).toContain('ttsLanguage="es-MX"');
  });

  test('con el respaldo desactivado no hay <Language> ni <Parameter> de respaldo', async () => {
    process.env.VOICE_AGENT_TTS_FALLBACK_PROVIDER = 'off';
    const xml = await (await POST(req())).text();
    expect(xml).toContain('<ConversationRelay');
    expect(xml).not.toContain('<Language');
    expect(xml).not.toContain('ttsFallbackLanguage');
  });
});
