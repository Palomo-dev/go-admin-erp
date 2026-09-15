/**
 * F3 ronda 7 · F-6 — `POST /api/voice/call` cerrado por `VOICE_LEGACY_REST_OUTBOUND`.
 *
 * Hasta esta ronda cualquier miembro autenticado creaba una llamada REAL en
 * Twilio cuyo TwiML (`twiml/outbound`, rama REST cerrada por N-5) respondía
 * `<Hangup/>`: llamada fantasma con coste. Misma bandera, misma semántica
 * (solo el literal `true`). Doble de Twilio: CERO llamadas reales.
 */
import { FakeDb, type Row } from './fixtures/fakeSupabase';

const ORG = 137;
const USER = '77777777-7777-4777-8777-777777777777';

let fake: FakeDb;

jest.mock('svix', () => ({ Webhook: class {} }));
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: jest.fn(() => fake.client()),
  assertServerOnly: jest.fn(),
}));

const orgContext = { userId: USER, userEmail: null, organizationId: ORG, organizationName: 'Org', roleId: 1, roleName: 'Admin', isSuperAdmin: false, memberId: 1, supabase: null as unknown };
class OrgContextError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 400, code = 'ORG_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}
jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: jest.fn(async () => ({ ...orgContext, supabase: fake.client() })),
  OrgContextError,
}));

const getActiveProvider = jest.fn(async () => ({
  isActive: true,
  provider: 'twilio',
  credentials: { TWILIO_ACCOUNT_SID: 'ACmaster0000000000000000000000000', TWILIO_AUTH_TOKEN: 'tok' },
}));
jest.mock('@/lib/services/providerRegistry', () => ({ getActiveProvider: (...a: unknown[]) => getActiveProvider(...(a as [])) }));

jest.mock('@/lib/services/integrations/twilio/twilioSubaccounts', () => ({
  getCommSettings: jest.fn(async () => fake.rows('comm_settings').find((r) => r.organization_id === ORG) ?? null),
}));

const twilioCreate = jest.fn(async () => ({ sid: 'CAr7gate01' }));
jest.mock('twilio', () => {
  const factory = () => ({ calls: { create: (...a: unknown[]) => twilioCreate(...(a as [])) } });
  return { __esModule: true, default: factory };
});

import { POST as voiceCallPOST } from '@/app/api/voice/call/route';

function req(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/voice/call', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

function seed(): FakeDb {
  const comm: Row = { organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: false, twilio_subaccount_sid: null };
  return new FakeDb({ tables: { comm_settings: [comm], customers: [], opportunities: [], phone_numbers: [], calls: [] } });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_WEBHOOK_BASE_URL = 'https://webhooks.test';
  delete process.env.VOICE_LEGACY_REST_OUTBOUND;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.VOICE_LEGACY_REST_OUTBOUND;
});

describe('F-6 · POST /api/voice/call detrás de VOICE_LEGACY_REST_OUTBOUND', () => {
  it('F-6.1 · sin la bandera: 410 con motivo, sin tocar Twilio, sin proveedor ni fila `calls`', async () => {
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233' }) as never);
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, code: 'LEGACY_REST_OUTBOUND_DISABLED' });
    expect(String(body.error)).toContain('VOICE_LEGACY_REST_OUTBOUND');
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(getActiveProvider).not.toHaveBeenCalled();
    expect(fake.rows('calls')).toHaveLength(0);
  });

  it.each(['TRUE', '1', 'yes', ' true', 'false'])('F-6.2 · con el valor %p sigue cerrada (solo el literal true, como N-5)', async (v) => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = v;
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233' }) as never);
    expect(res.status).toBe(410);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  it('F-6.3 · con `true` la rama heredada sigue funcionando (contraprueba: 201 y una sola `calls.create`)', async () => {
    process.env.VOICE_LEGACY_REST_OUTBOUND = 'true';
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233' }) as never);
    expect(res.status).toBe(201);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(fake.rows('calls')).toHaveLength(1);
  });
});
