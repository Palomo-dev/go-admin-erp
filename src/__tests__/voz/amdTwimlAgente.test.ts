/**
 * Contestadora (AMD síncrono de Twilio) en `/api/voice/twiml/ai-agent`.
 *
 * Con `AnsweredBy` de máquina el TwiML cuelga SIN abrir el ConversationRelay
 * (no hay sesión con el modelo que cobrar), la fila queda `voicemail` con
 * desenlace `buzon` y la reserva de minutos se devuelve. Con una persona (o
 * `unknown`) sigue el flujo normal.
 */

const sb = { updates: [] as Array<{ table: string; patch: Record<string, unknown> }>, rpcs: [] as Array<{ name: string; args: unknown }> };

function fakeClient() {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: { id: 'vac-1', started_at: null, provider_call_sid: null, call_id: 'call-1', customer_id: 'c1', credits_reserved: 1, credits_settled_at: null },
          error: null,
        }),
        update: (patch: Record<string, unknown>) => {
          sb.updates.push({ table, patch });
          const u: Record<string, unknown> = { eq: () => u, then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok) };
          return u;
        },
      };
      return q;
    },
    rpc: async (name: string, args: unknown) => {
      sb.rpcs.push({ name, args });
      return { data: true, error: null };
    },
  };
}

let answeredBy: string | undefined;
jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyTwilioWebhook: jest.fn(async () => ({ params: { CallSid: 'CA1', ...(answeredBy ? { AnsweredBy: answeredBy } : {}) }, accountSid: 'AC1' })),
  WebhookError: class extends Error {},
  getTwilioWebhookOrigin: () => 'https://app.example.com',
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeClient() }));
jest.mock('@/lib/security/wsSessionToken', () => ({ readWsSessionSecret: () => 'x'.repeat(40), issueWsSessionToken: () => 'tok' }));
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  AgentRuntimeError: class extends Error {},
  twilioLanguage: () => 'es-MX',
  buildRuntimeConfig: jest.fn(async () => ({
    orgId: 7,
    recordingEnabled: false,
    consentMessage: '',
    greeting: 'Hola',
    agent: { language: 'es-CO', stt_provider: 'google' },
    voice: { ttsProvider: 'Google', voice: null },
  })),
}));
jest.mock('@/lib/services/crm/voiceContextService', () => ({ accountSidMatchesOrg: jest.fn(async () => true) }));
jest.mock('@/lib/services/crm/bridgeTokens', () => ({ isBridgeSigningConfigured: () => false, signConsentToken: () => 't', verifyConsentToken: () => false }));
jest.mock('@/lib/services/crm/consentService', () => ({ recordConsent: jest.fn(), recordingEnabledForCall: jest.fn(async () => false), voidConsentWithoutRecording: jest.fn() }));
const updateCall = jest.fn(async () => null);
jest.mock('@/lib/services/crm/callManagementService', () => ({ updateCall: (...a: unknown[]) => updateCall(...(a as [])) }));

import { POST } from '@/app/api/voice/twiml/ai-agent/route';

const req = () =>
  new Request('https://app.example.com/api/voice/twiml/ai-agent?agentId=agent-1&callId=vac-1', { method: 'POST', body: 'x' });

beforeEach(() => {
  sb.updates = [];
  sb.rpcs = [];
  updateCall.mockClear();
});

describe('AMD en el TwiML del agente', () => {
  test.each(['machine_start', 'machine_end_beep'])('%s → cuelga, registra buzón y devuelve la reserva', async (valor) => {
    answeredBy = valor;
    const res = await POST(req());
    const xml = await res.text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('ConversationRelay');
    const vac = sb.updates.find((u) => u.table === 'voice_agent_calls')!.patch;
    expect(vac).toMatchObject({ status: 'voicemail', outcome: 'buzon', credits_reserved: 0 });
    expect(sb.rpcs).toEqual([{ name: 'deduct_comm_credits', args: { p_org_id: 7, p_channel: 'voice', p_amount: -1 } }]);
    expect(updateCall).toHaveBeenCalledWith('call-1', 7, expect.objectContaining({ status: 'voicemail', answered_by: 'machine' }), expect.anything());
  });

  test('fax → cuelga y queda no_answer/fax', async () => {
    answeredBy = 'fax';
    const xml = await (await POST(req())).text();
    expect(xml).toContain('<Hangup/>');
    expect(sb.updates.find((u) => u.table === 'voice_agent_calls')!.patch).toMatchObject({ status: 'no_answer', outcome: 'fax' });
  });

  test.each(['human', 'unknown', undefined])('%s → abre el ConversationRelay y no devuelve nada', async (valor) => {
    answeredBy = valor;
    const xml = await (await POST(req())).text();
    expect(xml).toContain('<ConversationRelay');
    expect(sb.rpcs).toEqual([]);
    expect(sb.updates.find((u) => u.table === 'voice_agent_calls')?.patch.status).toBe('in_progress');
  });
});
