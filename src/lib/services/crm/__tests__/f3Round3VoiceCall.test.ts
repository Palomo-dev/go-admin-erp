/**
 * F3 · ronda 3 — `/api/voice/call` (N-1) y el caller id del agente IA (N-3).
 *
 * Gemelos de A2 (`filterOrgOwnedRefs`), M2 (`pickCallerId`) y B1 (E.164) que la
 * ronda 2 dejó abiertos porque solo se corrigieron en `twiml/outbound`.
 *
 * CERO llamadas reales: el cliente de Twilio está doblado y se afirma
 * explícitamente que `calls.create` NO se invoca en los casos de rechazo.
 */
import { FakeDb, type Row } from './fixtures/fakeSupabase';

const ORG = 134;
const OTHER_ORG = 135;
const CUSTOMER_OWN = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ALIEN = '22222222-2222-4222-8222-222222222222';
const OPP_ALIEN = '44444444-4444-4444-8444-444444444444';
const USER = '55555555-5555-4555-8555-555555555555';

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

jest.mock('@/lib/services/providerRegistry', () => ({
  getActiveProvider: jest.fn(async () => ({
    isActive: true,
    provider: 'twilio',
    credentials: { TWILIO_ACCOUNT_SID: 'ACmaster0000000000000000000000000', TWILIO_AUTH_TOKEN: 'tok' },
  })),
}));

jest.mock('@/lib/services/integrations/twilio/twilioSubaccounts', () => ({
  getCommSettings: jest.fn(async () => fake.rows('comm_settings').find((r) => r.organization_id === ORG) ?? null),
}));

const twilioCreate = jest.fn(async () => ({ sid: 'CAf3r3rest1' }));
jest.mock('twilio', () => {
  const factory = () => ({ calls: { create: (...a: unknown[]) => twilioCreate(...(a as [])) } });
  return { __esModule: true, default: factory };
});

import { POST as voiceCallPOST } from '@/app/api/voice/call/route';

function req(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/voice/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function seed(commSettings?: Row[]): FakeDb {
  return new FakeDb({
    tables: {
      comm_settings: commSettings ?? [
        { organization_id: ORG, phone_number: null, voice_caller_id: '+573001234567', voice_recording_enabled: false, twilio_subaccount_sid: null },
        { organization_id: OTHER_ORG, phone_number: null, voice_caller_id: '+573009999999', voice_recording_enabled: false, twilio_subaccount_sid: null },
      ],
      customers: [
        { id: CUSTOMER_OWN, organization_id: ORG },
        { id: CUSTOMER_ALIEN, organization_id: OTHER_ORG },
      ],
      opportunities: [{ id: OPP_ALIEN, organization_id: OTHER_ORG }],
      phone_numbers: [],
      calls: [],
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TWILIO_WEBHOOK_BASE_URL = 'https://webhooks.test';
  delete process.env.TWILIO_PHONE_NUMBER;
  delete process.env.VOICE_ALLOW_PLATFORM_CALLER_ID;
  fake = seed();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('N-1 · /api/voice/call: A2, M2 y B1 en la ruta REST', () => {
  it('N-1.1 (A2) · customer_id/opportunity_id de otra org llegan del body → se descartan a null', async () => {
    const res = await voiceCallPOST(
      req({ mode: 'bridge', to: '+573001112233', customer_id: CUSTOMER_ALIEN, opportunity_id: OPP_ALIEN }) as never
    );
    expect(res.status).toBe(201);
    const row = fake.rows('calls')[0];
    expect(row.customer_id).toBeNull();
    expect(row.opportunity_id).toBeNull();
    expect((row.metadata as Row).rejected_refs).toEqual([`customer:${CUSTOMER_ALIEN}`, `opportunity:${OPP_ALIEN}`]);
  });

  it('N-1.2 (A2) · contraprueba: un customer_id propio se conserva', async () => {
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233', customer_id: CUSTOMER_OWN }) as never);
    expect(res.status).toBe(201);
    expect(fake.rows('calls')[0].customer_id).toBe(CUSTOMER_OWN);
  });

  it('N-1.3 (M2) · `from` del body que no es de la organización → 403 y NO se marca', async () => {
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233', from: '+18506003708' }) as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'CALLER_ID_NOT_OWNED' });
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(fake.rows('calls')).toHaveLength(0);
  });

  it('N-1.4 (M2) · sin caller id propio (solo el número global de la plataforma) → 400 y NO se marca', async () => {
    process.env.TWILIO_PHONE_NUMBER = '+15005550006';
    fake = seed([{ organization_id: ORG, phone_number: null, voice_caller_id: null, voice_recording_enabled: false, twilio_subaccount_sid: null }]);
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'NO_ORG_CALLER_ID' });
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(fake.rows('calls')).toHaveLength(0);
  });

  it('N-1.5 (M2) · contraprueba: el `from` propio de la org sí se acepta', async () => {
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233', from: '+573001234567' }) as never);
    expect(res.status).toBe(201);
    expect(fake.rows('calls')[0].from_number).toBe('+573001234567');
  });

  it('N-1.6 (B1) · to="12345" → 400 número inválido, sin llamada y sin fila', async () => {
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '12345' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'INVALID_DESTINATION' });
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(fake.rows('calls')).toHaveLength(0);
  });

  it('N-1.7 (B1) · contraprueba: to="+573001112233" sí marca', async () => {
    const res = await voiceCallPOST(req({ mode: 'bridge', to: '+573001112233' }) as never);
    expect(res.status).toBe(201);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
  });
});
