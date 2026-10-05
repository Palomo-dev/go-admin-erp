/** Handler WebSocket real, sin proveedor: prueba apertura antes del modelo y cierre único. */
import { EventEmitter } from 'events';
const SID = `CA${'3'.repeat(32)}`;
const VAC = '20000000-0000-4000-8000-000000000031';
const RESERVA = '20000000-0000-4000-8000-000000000032';
const rpc = jest.fn();
const reads: Array<{ table: string; filters: Record<string, unknown> }> = [];
const openModel = jest.fn();
let balance: number | null = 30;
let claims = { orgId: 7, agentId: 'agent-1', callId: VAC as string | null, callSid: SID, jti: 'nonce-1' };
let runtimeFailure = false;
let setupDelay: Promise<void> = Promise.resolve();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  rpc,
  from(table: string) {
    const filters: Record<string, unknown> = {};
    const q = {
      select: () => q, eq: (key: string, value: unknown) => { filters[key] = value; return q; },
      maybeSingle: async () => {
        reads.push({ table, filters });
        if (table !== 'comm_settings') throw new Error('Lectura financiera antigua');
        return { error: null, data: { voice_agent_enabled: true, is_active: true, voice_minutes_remaining: balance, voice_agent_config: {} } };
      },
    };
    return q;
  },
}) }));
jest.mock('@/lib/security/wsSessionToken', () => ({ verifyWsSessionToken: () => claims, consumeWsSessionJti: () => true }));
jest.mock('@/lib/services/crm/voiceAgent/agentRuntime', () => ({
  buildRuntimeConfig: jest.fn(async () => {
    await setupDelay;
    if (runtimeFailure) throw new Error('Agente no disponible');
    return {
      orgId: 7, voiceAgentCallId: claims.callId, systemPrompt: 'SYS', greeting: 'Hola',
      agent: { id: 'agent-1', name: 'Agente de prueba' }, stage: null, model: 'modelo-prueba',
      maxTurns: 20, maxDurationSeconds: 600, voice: {},
    };
  }),
  persistConversation: jest.fn(async () => undefined),
}));
jest.mock('@/lib/ai/agent/openaiAdapter', () => ({ openModelStream: (...args: unknown[]) => openModel(...args) }));
import { handleConversationRelayConnection } from '@/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler';
import { persistConversation } from '@/lib/services/crm/voiceAgent/agentRuntime';
import type { WsSessionClaims } from '@/lib/security/wsSessionToken';

const sockets: FakeWs[] = [];
class FakeWs extends EventEmitter {
  readyState = 1;
  sent: Array<Record<string, unknown>> = [];
  constructor() { super(); sockets.push(this); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  close() { this.readyState = 3; this.emit('close'); }
}
async function deliver(ws: FakeWs, msg: Record<string, unknown>) {
  for (const listener of ws.listeners('message') as Array<(data: Buffer) => Promise<void>>) await listener(Buffer.from(JSON.stringify(msg)));
}
const message = (sid = SID) => ({ type: 'setup', callSid: sid, from: '+12025550199', to: '+12025550198', customParameters: { token: 'token' } });
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function connect(upgrade?: WsSessionClaims) {
  const ws = new FakeWs();
  handleConversationRelayConnection(ws as unknown as Parameters<typeof handleConversationRelayConnection>[0], upgrade);
  return ws;
}
const originalEnv = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';
});
afterAll(() => {
  if (originalEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
  if (originalEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = originalEnv.key;
});
beforeEach(() => {
  balance = 30; claims = { orgId: 7, agentId: 'agent-1', callId: VAC, callSid: SID, jti: 'nonce-1' };
  runtimeFailure = false; setupDelay = Promise.resolve(); reads.length = 0; rpc.mockReset(); openModel.mockReset();
  jest.mocked(persistConversation).mockClear();
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'crm_voice_session_open'
    ? RESERVA : { settled: true, applied: true, minutes_charged: 1, minutes_due: 0 } }));
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close();
  await flush(); jest.restoreAllMocks();
});

test('reserva saliente del último minuto: saldo cero abre únicamente con prueba privada', async () => {
  balance = 0; const ws = connect(); await deliver(ws, message());
  expect(rpc).toHaveBeenCalledWith('crm_voice_session_open', { p_org: 7, p_sid: SID, p_vac: VAC, p_started_at: expect.any(String), p_recipient: '+12025550199' });
  expect(ws.sent.some(x => x.type === 'end')).toBe(false);
  expect(reads).toEqual([{ table: 'comm_settings', filters: { organization_id: 7 } }]);
});

test('entrante sin reserva y saldo cero no abre sesión ni llama al modelo', async () => {
  claims.callId = null; balance = 0; const ws = connect(); await deliver(ws, message());
  expect(rpc).not.toHaveBeenCalled(); expect(openModel).not.toHaveBeenCalled();
  expect(ws.sent.some(x => x.type === 'end')).toBe(true);
});

test.each([30, null])('entrante autorizada con saldo %p abre sin inventar VAC', async value => {
  claims.callId = null; balance = value; await deliver(connect(), message());
  expect(rpc).toHaveBeenCalledWith('crm_voice_session_open', expect.objectContaining({ p_vac: null, p_org: 7 }));
});

test('apertura rechazada cuelga antes de aceptar turnos', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'reserva_no_encontrada' } });
  const ws = connect(); await deliver(ws, message()); await deliver(ws, { type: 'prompt', text: 'Hola' });
  expect(ws.sent.some(x => x.type === 'end')).toBe(true); expect(openModel).not.toHaveBeenCalled();
  ws.close(); await flush(); expect(rpc).toHaveBeenCalledTimes(1);
});

test('sin configuración del agente no se cambia de cerebro ni se abre un uso', async () => {
  runtimeFailure = true; const ws = connect(); await deliver(ws, message());
  expect(ws.sent.some(x => x.type === 'end')).toBe(true); expect(rpc).not.toHaveBeenCalled();
});

test('SID de setup distinto al firmado se rechaza antes de consultar', async () => {
  const ws = connect(); await deliver(ws, message(`CA${'4'.repeat(32)}`));
  expect(ws.readyState).toBe(3); expect(reads).toEqual([]); expect(rpc).not.toHaveBeenCalled();
});

test('token distinto al del upgrade, incluso en la misma org, se rechaza antes de consultar', async () => {
  const ws = connect({ ...claims, jti: 'otro', exp: 2 }); await deliver(ws, message());
  expect(ws.readyState).toBe(3); expect(reads).toEqual([]); expect(rpc).not.toHaveBeenCalled();
});

test('error seguido de close concilia una vez y guarda transcript con el SID esperado', async () => {
  const ws = connect(); await deliver(ws, message()); ws.emit('error', new Error('conexión perdida')); ws.close(); await flush();
  expect(rpc.mock.calls.map(c => c[0])).toEqual(['crm_voice_session_open', 'crm_voice_session_settle']);
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_org: 7, p_sid: SID, p_message_count: 2 });
  expect(persistConversation).toHaveBeenCalledWith(expect.anything(), 7, VAC, expect.any(Array), expect.any(Object), SID);
});

test('saldo insuficiente al cierre conserva pendiente; no hay débito o sello separado', async () => {
  rpc.mockImplementation(async (name: string) => ({ error: null, data: name === 'crm_voice_session_open'
    ? RESERVA : { settled: false, applied: true, minutes_charged: 1, minutes_due: 2 } }));
  const ws = connect(); await deliver(ws, message()); ws.close(); await flush();
  expect(rpc.mock.calls.map(c => c[0])).toEqual(['crm_voice_session_open', 'crm_voice_session_settle']);
  expect(console.warn).toHaveBeenCalledWith('[CR] Voz pendiente de conciliación:', { org: 7, minutosPendientes: 2 });
  expect(persistConversation).toHaveBeenCalledTimes(1);
});

test('close durante setup cierra también la sesión que termine de abrir después', async () => {
  let release!: () => void; setupDelay = new Promise<void>(resolve => { release = resolve; });
  const ws = connect(); const pending = deliver(ws, message()); await flush(); ws.close(); release(); await pending;
  expect(rpc.mock.calls.map(c => c[0])).toEqual(['crm_voice_session_open', 'crm_voice_session_settle']);
});
