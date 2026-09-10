/// <reference types="jest" />
/**
 * FASE-16 · ronda 3 · F-12 — la auto-respuesta de IA enviaba a WhatsApp
 * SALTÁNDOSE los dos controles que sí aplica el envío normal
 * (`whatsappOutboundService`): el opt-out del destinatario (`fn_can_contact`,
 * Habeas Data / Ley 1581) y la ventana de servicio de 24 h de Meta.
 *
 * El INSERT en `messages` con direction='outbound' y role='ai' dispara
 * `trg_channel_dispatch` (verificado en la BD: AFTER INSERT ON messages, exige
 * direction='outbound' y role IN ('agent','ai') y canal whatsapp/facebook/
 * instagram), así que el mensaje SALE de verdad: no basta con que se guarde.
 *
 * Estas pruebas afirman el comportamiento correcto: con opt-out o con la
 * ventana cerrada NO se inserta nada en `messages` y no se cobra crédito.
 */

const generateAutoResponse = jest.fn(async () => ({
  content: 'Claro, te ayudo con eso.',
  model: 'gpt-4o-mini',
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
}));
const calculateCost = jest.fn(async () => 0.0001);
const consumeAICredits = jest.fn(async () => true);

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => ({ organizationId: 7, userId: 'user-1' }),
  OrgContextError: class OrgContextError extends Error { code = 'X'; statusCode = 401; },
}));
jest.mock('@/lib/services/openaiService', () => ({
  __esModule: true,
  default: class { generateAutoResponse = generateAutoResponse; calculateCost = calculateCost; },
}));
jest.mock('@/lib/services/aiCreditsService', () => ({ consumeAICredits: (...a: unknown[]) => consumeAICredits(...(a as [])) }));

let escenario: {
  channelType: string;
  lastInboundAt: string | null;
  canContact: boolean;
};
const insertadosEnMessages: Array<Record<string, unknown>> = [];

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const CHANNEL_ID = '55555555-5555-4555-8555-555555555555';
const CUSTOMER_ID = '66666666-6666-4666-8666-666666666666';

function fakeService() {
  const from = (table: string) => {
    const ops: Array<{ m: string; a: unknown[] }> = [];
    const proxy: unknown = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => void) => {
            resolve(resolver(table, ops));
            return Promise.resolve();
          };
        }
        if (prop === 'catch' || prop === 'finally') return undefined;
        return (...a: unknown[]) => { ops.push({ m: prop, a }); return proxy; };
      },
    });
    return proxy;
  };
  const rpc = async (fn: string) => (fn === 'fn_can_contact' ? { data: escenario.canContact, error: null } : { data: null, error: null });
  return { from, rpc } as never;
}

function resolver(table: string, ops: Array<{ m: string; a: unknown[] }>) {
  const isInsert = ops.some((o) => o.m === 'insert');
  switch (table) {
    case 'conversations':
      if (ops.some((o) => o.m === 'update')) return { data: null, error: null };
      return {
        data: {
          id: CONVERSATION_ID,
          channel_id: CHANNEL_ID,
          customer_id: CUSTOMER_ID,
          last_inbound_at: escenario.lastInboundAt,
          customer: { id: CUSTOMER_ID, full_name: 'Ana Gómez', first_name: 'Ana', last_name: 'Gómez', email: 'ana@ejemplo.co' },
          channel: { id: CHANNEL_ID, type: escenario.channelType, name: 'Ventas', ai_mode: 'auto' },
        },
        error: null,
      };
    case 'ai_settings':
      return { data: { organization_id: 7, is_active: true, credits_remaining: 100 }, error: null };
    case 'messages':
      if (isInsert) {
        insertadosEnMessages.push((ops.find((o) => o.m === 'insert')?.a[0] ?? {}) as Record<string, unknown>);
        return { data: { id: 'msg-ia-1' }, error: null };
      }
      return { data: [], error: null };
    case 'channels':
      return { data: { id: CHANNEL_ID, type: escenario.channelType, name: 'Ventas', status: 'active' }, error: null };
    case 'ai_jobs':
      return { data: null, error: null };
    default:
      return { data: null, error: null };
  }
}

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeService() }));

import { POST } from '../route';

const req = (body: unknown) => ({ json: async () => body }) as never;
const AHORA = Date.now();

beforeEach(() => {
  insertadosEnMessages.length = 0;
  generateAutoResponse.mockClear();
  consumeAICredits.mockClear();
  escenario = { channelType: 'whatsapp', lastInboundAt: new Date(AHORA - 3600_000).toISOString(), canContact: true };
});

describe('F16 r3 · F-12 · auto-respuesta de IA en WhatsApp', () => {
  it('camino feliz: ventana abierta y sin opt-out → responde', async () => {
    const res = await POST(req({ conversationId: CONVERSATION_ID }));
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(insertadosEnMessages).toHaveLength(1);
  });

  it('con OPT-OUT del destinatario no inserta ningún mensaje ni cobra crédito', async () => {
    escenario.canContact = false;
    const res = await POST(req({ conversationId: CONVERSATION_ID }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(String(json.reason ?? '')).toMatch(/opt|consent/i);
    expect(insertadosEnMessages).toHaveLength(0);
    expect(consumeAICredits).not.toHaveBeenCalled();
  });

  it('con la VENTANA DE 24 H cerrada no inserta ningún mensaje ni llama al proveedor', async () => {
    escenario.lastInboundAt = new Date(AHORA - 30 * 3600_000).toISOString();
    const res = await POST(req({ conversationId: CONVERSATION_ID }));
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(String(json.reason ?? '')).toMatch(/ventana|24/i);
    expect(insertadosEnMessages).toHaveLength(0);
    expect(generateAutoResponse).not.toHaveBeenCalled();
  });

  it('sin ningún inbound previo la ventana está cerrada: no responde', async () => {
    escenario.lastInboundAt = null;
    const res = await POST(req({ conversationId: CONVERSATION_ID }));
    expect((await res.json()).success).toBe(false);
    expect(insertadosEnMessages).toHaveLength(0);
  });

  it('el widget no está sujeto a la ventana de Meta y sigue respondiendo', async () => {
    escenario.channelType = 'widget';
    escenario.lastInboundAt = null;
    const res = await POST(req({ conversationId: CONVERSATION_ID }));
    expect((await res.json()).success).toBe(true);
    expect(insertadosEnMessages).toHaveLength(1);
  });
});
