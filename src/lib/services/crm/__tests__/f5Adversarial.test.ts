/**
 * F5 adversarial — "Llamar desde mi celular" (bridge de 2 patas).
 *
 * Origen: suite del tester (ronda 1, 66 casos F5-01..F5-66) que documentaba los
 * defectos de la fase. El constructor de la ronda 1 **conserva escenario y
 * datos de cada caso** y convierte su aserción en la del comportamiento
 * correcto una vez corregido el defecto. Los identificadores F5-xx NO cambian:
 * `npx jest … -t "F5-07"` sigue apuntando al mismo escenario.
 *
 * Sigue contrastando el código real con el esquema REAL verificado por MCP
 * contra `jgmgphmzusbluqhuqihj` (columnas, NOT NULL y CHECK de `calls`,
 * `mobile_call_bridges`, `call_consents`), ahora con las migraciones
 * `crm_v4_f05_bridges_call_link` y `crm_v4_f05_mobile_verification` aplicadas
 * (2026-09-10).
 */

process.env.VOICE_CALLBACK_SECRET = 'f5-test-secret-0123456789abcdef';
process.env.TWILIO_WEBHOOK_BASE_URL = 'https://app.goadmin.io';

// ─── Mocks de infraestructura ────────────────────────────────────────────────

const twilioCreate = jest.fn();
const twilioCallUpdate = jest.fn();
const twilioCallFetch = jest.fn();
const twilioCallsFn = jest.fn((_sid: string) => ({ update: twilioCallUpdate, fetch: twilioCallFetch }));
const masterClient = Object.assign(twilioCallsFn, { calls: Object.assign(twilioCallsFn, { create: twilioCreate }) });

jest.mock('@/lib/services/integrations/twilio/twilioConfig', () => ({
  getMasterClient: () => masterClient,
  getMasterPhoneNumber: () => '+576010000000',
  getWebhookBaseUrl: () => 'https://app.goadmin.io',
  formatE164: (p: string, cc = '+57') => {
    let c = String(p).replace(/[\s\-()]/g, '');
    if (c.startsWith('+')) return c;
    if (c.startsWith('0')) c = c.slice(1);
    return `${cc}${c}`;
  },
}));

jest.mock('@/lib/services/providerRegistry', () => ({
  getActiveProvider: jest.fn(async () => ({
    provider: 'twilio',
    isActive: true,
    credentials: {} as Record<string, string>,
  })),
}));

/** Contexto de telefonía de F3 (credenciales, caller id, ajustes, aislamiento). */
const telephonySettings = {
  organization_id: 7,
  phone_number: '+576010000000',
  voice_caller_id: '+576010000000',
  voice_recording_enabled: true,
  voice_recording_retention_days: 90,
  voice_consent_message: 'Esta llamada será grabada con fines de calidad y servicio.',
  voice_ring_timeout_seconds: 30,
  voice_max_concurrent_calls: 5,
  voice_minutes_remaining: 100,
  voice_twiml_app_sid: null,
  twilio_subaccount_sid: null,
  voice_agent_enabled: false,
};
let callerIdSource: 'settings_caller_id' | 'phone_numbers' | 'platform' = 'phone_numbers';
const accountSidMatchesOrg = jest.fn(async (_orgId: number, accountSid: string) => accountSid === 'ACmaster');

jest.mock('@/lib/services/crm/voiceContextService', () => ({
  VoiceNotConfiguredError: class VoiceNotConfiguredError extends Error {},
  getTelephonySettings: jest.fn(async () => telephonySettings),
  pickCallerId: jest.fn(async () => ({ e164: '+576010000000', phoneNumberId: null, source: callerIdSource })),
  getTwilioClientForOrg: jest.fn(async () => ({ client: masterClient, creds: {} })),
  accountSidMatchesOrg: (orgId: number, accountSid: string) => accountSidMatchesOrg(orgId, accountSid),
  filterOrgOwnedRefs: jest.fn(
    async (
      orgId: number,
      refs: { customerId?: string | null; opportunityId?: string | null },
      client: { from: (t: string) => Record<string, unknown> }
    ) => {
      const rejected: string[] = [];
      const belongs = async (table: string, id: string) => {
        const q = client.from(table) as unknown as {
          select: () => typeof q;
          eq: (c: string, v: unknown) => typeof q;
          maybeSingle: () => Promise<{ data: unknown }>;
        };
        const { data } = await q.select().eq('id', id).eq('organization_id', orgId).maybeSingle();
        return Boolean(data);
      };
      let customerId = refs.customerId || null;
      let opportunityId = refs.opportunityId || null;
      if (customerId && !(await belongs('customers', customerId))) {
        rejected.push(`customer:${customerId}`);
        customerId = null;
      }
      if (opportunityId && !(await belongs('opportunities', opportunityId))) {
        rejected.push(`opportunity:${opportunityId}`);
        opportunityId = null;
      }
      return { customerId, opportunityId, rejected };
    }
  ),
}));

const verifyTwilioWebhook = jest.fn();
class WebhookErrorStub extends Error {
  statusCode: number;
  code: string;
  constructor(statusCode: number, code: string) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}
jest.mock('@/lib/security/webhookSignatures', () => ({
  verifyTwilioWebhook: (...a: unknown[]) => verifyTwilioWebhook(...a),
  WebhookError: WebhookErrorStub,
  getTwilioWebhookOrigin: () => 'https://app.goadmin.io',
}));

let serviceClient: FakeSupabase;
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => serviceClient,
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  initiateBridge,
  cancelBridge,
  getBridge,
  BridgeError,
  normalizeE164,
  buildWhisper,
  applyAgentLegEvent,
  applyCustomerLegEvent,
} from '@/lib/services/crm/mobileBridgeService';
import { signBridgeToken } from '@/lib/services/crm/bridgeTokens';

// ─── Esquema REAL (MCP, 2026-09-10) ──────────────────────────────────────────

/** `information_schema.columns` de `public.calls` (31 columnas). */
const CALLS_COLUMNS = new Set([
  'id', 'organization_id', 'provider', 'provider_call_sid', 'parent_call_sid', 'direction', 'mode',
  'from_number', 'to_number', 'customer_id', 'opportunity_id', 'user_id', 'voice_agent_id', 'status',
  'answered_by', 'started_at', 'answered_at', 'ended_at', 'duration_seconds', 'ring_seconds',
  'recording_enabled', 'consent_given', 'cost_amount', 'cost_currency', 'metadata', 'created_at',
  'updated_at', 'bridge_mode', 'agent_leg_sid', 'customer_leg_sid', 'duration_source',
]);
/** NOT NULL sin DEFAULT: si el INSERT no los trae, Postgres lo rechaza. */
const CALLS_REQUIRED = ['organization_id', 'direction', 'mode', 'from_number', 'to_number'];

/** `mobile_call_bridges` HOY, con la migración `f05_bridges_call_link` aplicada. */
const BRIDGE_COLUMNS = new Set([
  'id', 'organization_id', 'user_id', 'agent_phone', 'target_phone', 'customer_id', 'opportunity_id',
  'agent_leg_sid', 'customer_leg_sid', 'status', 'confirm_digit_required', 'whisper_text',
  'created_at', 'updated_at', 'call_id', 'cancel_requested_at', 'last_error',
]);
const BRIDGE_STATUS_CHECK = [
  'initiating', 'agent_ringing', 'agent_answered', 'customer_dialing', 'in_progress',
  'completed', 'failed', 'agent_no_answer', 'agent_rejected',
];
const CALLS_STATUS_CHECK = [
  'dialing', 'ringing', 'in_progress', 'completed', 'failed', 'busy', 'no_answer', 'canceled', 'voicemail',
];
const CALLS_MODE_CHECK = ['browser', 'bridge', 'ai_agent', 'manual', 'inbound'];
const CALLS_BRIDGE_MODE_CHECK = ['agent_leg', 'customer_leg', 'full_bridge'];

// ─── Doble de Supabase con validación de esquema ─────────────────────────────

interface Op {
  table: string;
  kind: 'insert' | 'update' | 'select';
  payload?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

type Row = Record<string, unknown>;

class FakeSupabase {
  ops: Op[] = [];
  rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  tables: Record<string, Row[]> = {};
  /** Errores forzados por (tabla, operación). */
  failOn: { table: string; kind: 'insert' | 'update' }[] = [];
  /** Si true, valida columnas/NOT NULL/CHECK como el Postgres real. */
  strict = false;
  /** Resultado de `deduct_comm_credits` (false = sin saldo). */
  creditsOk = true;

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows.map((r) => ({ ...r }));
    return this;
  }

  async rpc(fn: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ fn, args });
    if (fn === 'deduct_comm_credits') return { data: this.creditsOk, error: null };
    return { data: null, error: null };
  }

  private validate(table: string, payload: Row, kind: 'insert' | 'update'): string | null {
    if (!this.strict) return null;
    if (table === 'calls') {
      for (const k of Object.keys(payload)) {
        if (!CALLS_COLUMNS.has(k)) return `column "${k}" of relation "calls" does not exist`;
      }
      if (kind === 'insert') {
        for (const req of CALLS_REQUIRED) {
          if (payload[req] === undefined || payload[req] === null) {
            return `null value in column "${req}" of relation "calls" violates not-null constraint`;
          }
        }
      }
      if (payload.status !== undefined && !CALLS_STATUS_CHECK.includes(String(payload.status))) return 'calls_status_check';
      if (payload.mode !== undefined && !CALLS_MODE_CHECK.includes(String(payload.mode))) return 'calls_mode_check';
      if (payload.bridge_mode !== undefined && payload.bridge_mode !== null && !CALLS_BRIDGE_MODE_CHECK.includes(String(payload.bridge_mode))) return 'calls_bridge_mode_check';
    }
    if (table === 'mobile_call_bridges') {
      for (const k of Object.keys(payload)) {
        if (!BRIDGE_COLUMNS.has(k)) return `column "${k}" of relation "mobile_call_bridges" does not exist`;
      }
      if (payload.status !== undefined && !BRIDGE_STATUS_CHECK.includes(String(payload.status))) return 'mobile_call_bridges_status_check';
    }
    return null;
  }

  from(table: string) {
    const self = this;
    const filters: Record<string, unknown> = {};
    const inFilters: { col: string; values: unknown[] }[] = [];
    let payload: Row | undefined;
    let kind: 'insert' | 'update' | 'select' = 'select';

    const rows = () => (self.tables[table] ??= []);
    const matching = () =>
      rows().filter(
        (r) =>
          Object.entries(filters).every(([k, v]) => r[k] === v) &&
          inFilters.every((f) => f.values.includes(r[f.col]))
      );

    const result = () => {
      const forced = self.failOn.find((f) => f.table === table && f.kind === kind);
      if (forced) return { data: null, error: { message: `forced-${kind}-error` } };
      const bad = payload ? self.validate(table, payload, kind as 'insert' | 'update') : null;
      if (bad) return { data: null, error: { message: bad, code: '42703' } };
      if (kind === 'insert') {
        const row = { id: `${table === 'calls' ? 'call' : 'row'}-${rows().length + 1}`, created_at: 'T0', updated_at: 'T0', ...payload };
        rows().push(row);
        return { data: row, error: null };
      }
      if (kind === 'update') {
        const hit = matching();
        hit.forEach((r) => Object.assign(r, payload));
        return { data: hit[0] ?? null, error: null };
      }
      return { data: matching()[0] ?? null, error: null };
    };

    const builder: Record<string, unknown> = {
      insert(p: Row) { kind = 'insert'; payload = p; self.ops.push({ table, kind, payload: p, filters: { ...filters } }); return builder; },
      update(p: Row) { kind = 'update'; payload = p; self.ops.push({ table, kind, payload: p, filters }); return builder; },
      select() { if (kind === 'select') self.ops.push({ table, kind, filters }); return builder; },
      eq(col: string, val: unknown) { filters[col] = val; return builder; },
      in(col: string, values: unknown[]) { inFilters.push({ col, values }); return builder; },
      order() { return builder; },
      limit() { return builder; },
      range() { return builder; },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
    };
    return builder as never;
  }
}

const asSb = (f: FakeSupabase) => f as unknown as SupabaseClient;

/** Vendedor con celular verificado en la org 7 (única fuente legítima, §0.2). */
const seedVerifiedMobile = (sb: FakeSupabase, phone = '+573999999999', userId = 'user-1', orgId = 7) =>
  sb.seed('user_comm_preferences', [
    { id: 'ucp-1', user_id: userId, organization_id: orgId, mobile_phone_e164: phone, mobile_verified_at: '2026-09-01T10:00:00Z' },
  ]);

const ctxOf = (sb: FakeSupabase, userId = 'user-1', orgId = 7) => ({
  organizationId: orgId,
  userId,
  supabase: asSb(sb),
});

beforeEach(() => {
  jest.clearAllMocks();
  twilioCreate.mockResolvedValue({ sid: 'CAagent' });
  twilioCallUpdate.mockResolvedValue({});
  twilioCallFetch.mockResolvedValue({ status: 'ringing' });
  accountSidMatchesOrg.mockImplementation(async (_orgId: number, accountSid: string) => accountSid === 'ACmaster');
  callerIdSource = 'phone_numbers';
  serviceClient = new FakeSupabase();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. initiateBridge — el teléfono del vendedor NO puede venir del body
// ═══════════════════════════════════════════════════════════════════════════

describe('initiateBridge — origen del número del vendedor', () => {
  test('F5-01 el celular del agente sale de user_comm_preferences verificado; un agent_phone del body se ignora', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase(), '+573999999999');
    await initiateBridge(ctxOf(sb), {
      to: '+573001112233',
      // Campo hostil heredado del cliente antiguo: ya no existe en el contrato.
      ...({ agent_phone: '+573666666666' } as Record<string, string>),
    });

    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(twilioCreate.mock.calls[0][0].to).toBe('+573999999999');
    // La tabla que el doc §0.2 declara ÚNICA fuente legítima sí se consulta.
    expect(sb.ops.some((o) => o.table === 'user_comm_preferences')).toBe(true);
    // Y ya no hay respaldo por `profiles.phone` (nunca pasa por OTP).
    expect(sb.ops.some((o) => o.table === 'profiles')).toBe(false);
  });

  test('F5-02 un número de otro país/premium en el body no llega a marcarse: la pata del vendedor es siempre su celular verificado', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase(), '+573999999999');
    await initiateBridge(ctxOf(sb), {
      to: '+8801700000001',
      ...({ agent_phone: '+8801700000000' } as Record<string, string>),
    });
    expect(twilioCreate.mock.calls[0][0].to).toBe('+573999999999');
    expect(twilioCreate.mock.calls[0][0].to).not.toBe('+8801700000000');
  });

  test('F5-03 basura sin "+" se RECHAZA en vez de convertirse en un E.164 falso (+57 a ciegas)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    await expect(initiateBridge(ctxOf(sb), { to: '123' })).rejects.toMatchObject({ code: 'INVALID_PHONE' });
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(sb.tables.mobile_call_bridges ?? []).toHaveLength(0);
    expect(normalizeE164('abc')).toBeNull();
    expect(normalizeE164('900609')).toBeNull();
  });

  test('F5-04 los créditos se reservan ANTES de llamar al proveedor (2 minutos, uno por pata)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    const reserve = sb.rpcCalls.find((c) => c.fn === 'deduct_comm_credits');
    expect(reserve).toBeDefined();
    expect(reserve!.args).toMatchObject({ p_org_id: 7, p_channel: 'voice', p_amount: 2 });
    // Orden: la reserva ocurre antes del INSERT de `calls` y de `calls.create`.
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(sb.rpcCalls[0].fn).toBe('deduct_comm_credits');
  });

  test('F5-04b sin saldo NO se llama al proveedor (402 NO_CREDITS)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    sb.creditsOk = false;
    await expect(initiateBridge(ctxOf(sb), { to: '+573002223344' })).rejects.toMatchObject({ code: 'NO_CREDITS', statusCode: 402 });
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('F5-04c sin celular verificado se responde 409 MOBILE_NOT_VERIFIED y no se reserva nada', async () => {
    const sb = new FakeSupabase().seed('user_comm_preferences', [
      { user_id: 'user-1', organization_id: 7, mobile_phone_e164: '+573999999999', mobile_verified_at: null },
    ]);
    await expect(initiateBridge(ctxOf(sb), { to: '+573001112233' })).rejects.toMatchObject({
      code: 'MOBILE_NOT_VERIFIED',
      statusCode: 409,
    });
    expect(sb.rpcCalls).toHaveLength(0);
    expect(twilioCreate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. El INSERT en `calls` contra el esquema REAL
// ═══════════════════════════════════════════════════════════════════════════

describe('initiateBridge — INSERT en calls contra el esquema real', () => {
  test('F5-05 el payload solo usa columnas que existen en public.calls (ya no `phone_number`)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    const ins = sb.ops.find((o) => o.table === 'calls' && o.kind === 'insert');
    expect(ins).toBeDefined();
    const desconocidas = Object.keys(ins!.payload!).filter((c) => !CALLS_COLUMNS.has(c));
    expect(desconocidas).toEqual([]);
  });

  test('F5-06 el payload trae TODAS las columnas NOT NULL sin default (mode, from_number, to_number)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    const ins = sb.ops.find((o) => o.table === 'calls' && o.kind === 'insert')!;
    const faltantes = CALLS_REQUIRED.filter((c) => ins.payload![c] === undefined || ins.payload![c] === null);
    expect(faltantes).toEqual([]);
    expect(ins.payload!.mode).toBe('bridge');
    expect(ins.payload!.from_number).toBe('+576010000000');
    expect(ins.payload!.to_number).toBe('+573002223344');
  });

  test('F5-07 con validación de esquema real el INSERT entra y la fila `calls` existe (sin ella no hay grabación ni actividad)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    sb.strict = true;
    const res = await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    expect(res.agentLegSid).toBe('CAagent');
    expect(res.bridge.status).toBe('agent_ringing');
    expect(sb.tables.calls ?? []).toHaveLength(1);
    expect(res.callId).toBe(sb.tables.calls![0].id);
    expect(sb.tables.mobile_call_bridges![0].call_id).toBe(res.callId);
  });

  test('F5-07b si el INSERT de `calls` falla, el error NO se traga: excepción, sin llamada y con reembolso', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    sb.failOn.push({ table: 'calls', kind: 'insert' });
    await expect(initiateBridge(ctxOf(sb), { to: '+573002223344' })).rejects.toMatchObject({ code: 'CALL_INSERT_FAILED' });
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(sb.rpcCalls.map((c) => c.args.p_amount)).toEqual([2, -2]);
  });

  test('F5-08 `provider_call_sid` se persiste en calls: /api/voice/recording puede resolver la llamada', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    sb.strict = true;
    await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    const row = (sb.tables.calls ?? []).find((r) => r.provider_call_sid === 'CAagent');
    expect(row).toBeDefined();
    expect(row!.agent_leg_sid).toBe('CAagent');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Fallos del proveedor a mitad de flujo / concurrencia
// ═══════════════════════════════════════════════════════════════════════════

describe('initiateBridge — fallos y concurrencia', () => {
  test('F5-09 error de Twilio → bridge `failed` con `last_error`, excepción y devolución de los 2 minutos reservados', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    twilioCreate.mockRejectedValueOnce(new Error('21210 caller id inválido'));
    await expect(initiateBridge(ctxOf(sb), { to: '+573002223344' })).rejects.toThrow(/21210/);
    const row = sb.tables.mobile_call_bridges![0];
    expect(row.status).toBe('failed');
    expect(String(row.last_error)).toMatch(/21210/);
    expect(sb.rpcCalls.map((c) => c.args.p_amount)).toEqual([2, -2]);
  });

  test('F5-10 si el UPDATE de `failed` también falla, el llamador SIGUE recibiendo el error (nunca un 201 falso)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    sb.failOn.push({ table: 'mobile_call_bridges', kind: 'update' });
    twilioCreate.mockRejectedValueOnce(new Error('network'));
    await expect(initiateBridge(ctxOf(sb), { to: '+573002223344' })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(sb.tables.mobile_call_bridges![0].status).toBe('initiating');
    // Y los créditos vuelven aunque el estado no se pueda escribir.
    expect(sb.rpcCalls.map((c) => c.args.p_amount)).toEqual([2, -2]);
  });

  test('F5-11 doble clic: el segundo initiate del MISMO usuario responde 409 BRIDGE_IN_PROGRESS y no marca dos veces', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    twilioCreate.mockResolvedValueOnce({ sid: 'CA1' }).mockResolvedValueOnce({ sid: 'CA2' });
    const a = await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    await expect(initiateBridge(ctxOf(sb), { to: '+573002223344' })).rejects.toMatchObject({
      code: 'BRIDGE_IN_PROGRESS',
      statusCode: 409,
    });
    expect(a.bridge.id).toBeDefined();
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(sb.tables.mobile_call_bridges).toHaveLength(1);
  });

  test('F5-12 todas las URLs del bridge llevan token HMAC: no basta con adivinar el bridgeId', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    const res = await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    const arg = twilioCreate.mock.calls[0][0];
    const t = signBridgeToken(res.bridge.id);
    expect(arg.url).toMatch(/twiml\/agent-leg\?bridgeId=/);
    expect(arg.url).toContain(`&t=${t}`);
    expect(arg.statusCallback).toContain(`&t=${t}`);
    expect(arg.statusCallback).toContain('&leg=agent');
  });

  test('F5-13 `calls.create` usa el timeout configurable de la org (comm_settings), no un 30 fijo', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase()).seed('comm_settings', [
      { organization_id: 7, voice_bridge_confirm_digit: true, voice_bridge_agent_timeout: 45, voice_mobile_ivr_enabled: false },
    ]);
    await initiateBridge(ctxOf(sb), { to: '+573002223344' });
    const arg = twilioCreate.mock.calls[0][0];
    expect(arg.timeout).toBe(45);
    expect(arg.statusCallbackEvent).toEqual(['initiated', 'ringing', 'answered', 'completed']);
    // AMD sigue siendo opcional y apagado por defecto (cuesta $0.0075/llamada).
    expect(arg.machineDetection).toBeUndefined();
  });

  test('F5-13b sin caller id propio de la organización no se marca (nunca el número global de la plataforma)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    callerIdSource = 'platform';
    await expect(initiateBridge(ctxOf(sb), { to: '+573002223344' })).rejects.toMatchObject({
      code: 'CALLER_ID_NOT_CONFIGURED',
    });
    expect(twilioCreate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. cancelBridge
// ═══════════════════════════════════════════════════════════════════════════

describe('cancelBridge', () => {
  const seedBridge = (status: string) =>
    new FakeSupabase()
      .seed('mobile_call_bridges', [
        { id: 'b1', organization_id: 7, user_id: 'owner', status, agent_leg_sid: 'CAagent', customer_leg_sid: 'CAcust', agent_phone: '+571', target_phone: '+572', call_id: 'call-1' },
      ])
      .seed('calls', [{ id: 'call-1', organization_id: 7, status: 'ringing', metadata: {} }]);

  test('F5-14 con la llamada ya en curso manda `completed` (Twilio solo acepta `canceled` en queued|ringing)', async () => {
    const sb = seedBridge('in_progress');
    twilioCallFetch.mockResolvedValue({ status: 'in-progress' });
    await cancelBridge('b1', 7, 'owner', false, asSb(sb));
    expect(twilioCallUpdate).toHaveBeenCalledWith({ status: 'completed' });
    expect(twilioCallUpdate).not.toHaveBeenCalledWith({ status: 'canceled' });
  });

  test('F5-14b mientras timbra manda `canceled` (el verbo depende del estado real de la pata)', async () => {
    const sb = seedBridge('agent_ringing');
    twilioCallFetch.mockResolvedValue({ status: 'ringing' });
    await cancelBridge('b1', 7, 'owner', false, asSb(sb));
    expect(twilioCallUpdate).toHaveBeenCalledWith({ status: 'canceled' });
  });

  test('F5-15 si Twilio rechaza la cancelación se propaga el error y el bridge NO se marca terminado (la llamada sigue viva)', async () => {
    const sb = seedBridge('in_progress');
    twilioCallFetch.mockResolvedValue({ status: 'in-progress' });
    twilioCallUpdate.mockRejectedValue(new Error('21220 Call is not in-progress'));
    await expect(cancelBridge('b1', 7, 'owner', false, asSb(sb))).rejects.toMatchObject({ code: 'CANCEL_FAILED' });
    expect(sb.tables.mobile_call_bridges![0].status).toBe('in_progress');
    expect(String(sb.tables.mobile_call_bridges![0].last_error)).toMatch(/21220/);
  });

  test('F5-16 IDOR intra-org cerrado: otro miembro de la org no puede cancelar el bridge de un compañero', async () => {
    const sb = seedBridge('agent_ringing');
    await expect(cancelBridge('b1', 7, 'otro-usuario', false, asSb(sb))).rejects.toMatchObject({
      code: 'FORBIDDEN',
      statusCode: 403,
    });
    expect(twilioCallUpdate).not.toHaveBeenCalled();
    expect(sb.tables.mobile_call_bridges![0].status).toBe('agent_ringing');
    // La firma ya recibe el userId de la sesión (id, orgId, userId, isAdmin, client).
    expect(cancelBridge.length).toBe(5);
  });

  test('F5-17 una cancelación deliberada es distinguible de un fallo del proveedor (`cancel_requested_at` + motivo)', async () => {
    const sb = seedBridge('agent_ringing');
    await cancelBridge('b1', 7, 'owner', false, asSb(sb));
    const row = sb.tables.mobile_call_bridges![0];
    // El CHECK real de la tabla NO tiene 'canceled': el motivo va aparte.
    expect(BRIDGE_STATUS_CHECK).not.toContain('canceled');
    expect(row.status).toBe('failed');
    expect(row.cancel_requested_at).toBeTruthy();
    expect(row.last_error).toBe('canceled_by_user');
    expect(sb.tables.calls![0].status).toBe('canceled');
    // Se devuelve el minuto del cliente, que nunca se usó.
    expect(sb.rpcCalls.map((c) => c.args.p_amount)).toEqual([-1]);
  });

  test('F5-18 un bridge terminal `agent_no_answer` ya no se puede "cancelar" otra vez (409)', async () => {
    const sb = seedBridge('agent_no_answer');
    await expect(cancelBridge('b1', 7, 'owner', false, asSb(sb))).rejects.toMatchObject({
      code: 'BRIDGE_TERMINAL',
      statusCode: 409,
    });
    expect(twilioCallUpdate).not.toHaveBeenCalled();
  });

  test('F5-19 getBridge sí filtra por organization_id (aislamiento correcto en la lectura)', async () => {
    const sb = seedBridge('in_progress');
    expect(await getBridge('b1', 99, asSb(sb))).toBeNull();
    expect(await getBridge('b1', 7, asSb(sb))).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Ruta /api/voice/bridge/status — duplicados, fuera de orden, org ajena
// ═══════════════════════════════════════════════════════════════════════════

async function postStatus(
  form: Record<string, string>,
  query = `bridgeId=b1&t=${signBridgeToken('b1')}&leg=agent`
): Promise<Response> {
  const { POST } = await import('@/app/api/voice/bridge/status/route');
  verifyTwilioWebhook.mockResolvedValueOnce({ params: form, accountSid: form.AccountSid ?? 'ACmaster', rawBody: '' });
  return POST(new Request(`https://app.goadmin.io/api/voice/bridge/status?${query}`, { method: 'POST' }));
}

const seedBridgeAndCall = (bridgeStatus = 'agent_ringing', callPatch: Row = {}) =>
  new FakeSupabase()
    .seed('mobile_call_bridges', [
      { id: 'b1', organization_id: 7, user_id: 'u', customer_id: null, opportunity_id: null, call_id: 'call-1', agent_leg_sid: 'CAagent', agent_phone: '+571', target_phone: '+572', status: bridgeStatus },
    ])
    .seed('calls', [
      { id: 'call-1', organization_id: 7, provider_call_sid: 'CAagent', status: 'dialing', mode: 'bridge', from_number: '+571', to_number: '+572', direction: 'outbound', recording_enabled: true, metadata: {}, ...callPatch },
    ]);

describe('/api/voice/bridge/status', () => {
  beforeEach(() => {
    serviceClient = seedBridgeAndCall();
  });

  test('F5-20 firma inválida → 403 y ninguna escritura', async () => {
    const { POST } = await import('@/app/api/voice/bridge/status/route');
    verifyTwilioWebhook.mockRejectedValueOnce(new WebhookErrorStub(403, 'twilio_signature_invalid'));
    const res = await POST(new Request(`https://app.goadmin.io/api/voice/bridge/status?bridgeId=b1&t=${signBridgeToken('b1')}&leg=agent`, { method: 'POST' }));
    expect(res.status).toBe(403);
    expect(serviceClient.ops).toHaveLength(0);
  });

  test('F5-20b token HMAC inválido → 403 aunque la firma de Twilio sea correcta', async () => {
    const res = await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed' }, 'bridgeId=b1&t=deadbeef&leg=agent');
    expect(res.status).toBe(403);
    expect(serviceClient.ops).toHaveLength(0);
  });

  test('F5-21 el AccountSid firmante DEBE ser el de la org del bridge: una subcuenta ajena recibe 403 y no escribe', async () => {
    const res = await postStatus({ AccountSid: 'ACdeOtraOrg', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '77' });
    expect(res.status).toBe(403);
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_ringing');
    expect(serviceClient.tables.calls![0].duration_seconds).toBeUndefined();
  });

  test('F5-22 `leg=agent CallStatus=completed` tras contestar sin conectar marca `agent_rejected`, no `completed`', async () => {
    serviceClient = seedBridgeAndCall('agent_answered');
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '9' });
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_rejected');
    expect(serviceClient.tables.calls![0].status).toBe('canceled');
  });

  test('F5-23 `leg=agent no-answer` deja motivo en `calls.metadata` y devuelve el minuto del cliente', async () => {
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'no-answer' });
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_no_answer');
    expect(serviceClient.tables.calls![0].status).toBe('no_answer');
    expect((serviceClient.tables.calls![0].metadata as Row).reason).toBe('agent_no_answer');
    expect(serviceClient.rpcCalls.map((c) => c.args.p_amount)).toEqual([-1]);
  });

  test('F5-24 webhook duplicado: el mismo `SequenceNumber` se ignora y no pisa la duración buena', async () => {
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '120', SequenceNumber: '3' });
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '0', SequenceNumber: '3' });
    const call = serviceClient.tables.calls![0];
    // La duración del leg del VENDEDOR no es la conversación: va a metadata.
    expect((call.metadata as Row).agent_call_duration).toBe(120);
    expect(call.duration_seconds).toBeUndefined();
  });

  test('F5-25 fuera de orden: un `ringing` tardío NO revive una llamada ya terminada', async () => {
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '200' });
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'ringing', SequenceNumber: '1' });
    expect(serviceClient.tables.calls![0].status).toBe('no_answer');
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_no_answer');
  });

  test('F5-26 `leg=customer` NO crea una segunda fila: actualiza la única `calls` del bridge (doc §0.4)', async () => {
    await postStatus(
      { AccountSid: 'ACmaster', CallSid: 'CAcustomer', CallStatus: 'in-progress', From: '+571', To: '+572' },
      `bridgeId=b1&t=${signBridgeToken('b1')}&leg=customer`
    );
    expect(serviceClient.tables.calls).toHaveLength(1);
    const call = serviceClient.tables.calls![0];
    expect(call.customer_leg_sid).toBe('CAcustomer');
    expect(call.status).toBe('in_progress');
    expect(call.answered_at).toBeTruthy();
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('in_progress');
    expect(serviceClient.tables.mobile_call_bridges![0].customer_leg_sid).toBe('CAcustomer');
    for (const k of Object.keys(call)) {
      if (['id', 'created_at', 'updated_at'].includes(k)) continue;
      expect(CALLS_COLUMNS.has(k)).toBe(true);
    }
  });

  test('F5-27 `leg=customer` no fuerza `recording_enabled`: manda lo que decidió `initiate` con comm_settings', async () => {
    serviceClient = seedBridgeAndCall('customer_dialing', { recording_enabled: false });
    await postStatus(
      { AccountSid: 'ACmaster', CallSid: 'CAcustomer', CallStatus: 'initiated' },
      `bridgeId=b1&t=${signBridgeToken('b1')}&leg=customer`
    );
    const call = serviceClient.tables.calls![0];
    expect(call.recording_enabled).toBe(false);
    // `consent_given` lo marca `twiml/consent-whisper` cuando el cliente lo oye.
    expect(call.consent_given).toBeUndefined();
  });

  test('F5-28 bridgeId inexistente → 200 sin escrituras (no se filtra si existe o no)', async () => {
    const res = await postStatus(
      { AccountSid: 'ACmaster', CallSid: 'CAx', CallStatus: 'completed' },
      `bridgeId=noexiste&t=${signBridgeToken('noexiste')}&leg=agent`
    );
    expect(res.status).toBe(200);
    expect(serviceClient.tables.calls).toHaveLength(1);
    expect(serviceClient.tables.calls![0].status).toBe('dialing');
  });

  test('F5-29 sin bridgeId responde 400: un callback mal configurado no se pierde en silencio', async () => {
    const res = await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAx', CallStatus: 'completed' }, 'leg=agent');
    expect(res.status).toBe(400);
    expect(serviceClient.ops).toHaveLength(0);
  });

  test('F5-30 ningún estado escrito se sale del CHECK real de calls / mobile_call_bridges', async () => {
    for (const s of ['queued', 'initiated', 'ringing', 'in-progress', 'answered', 'completed', 'busy', 'no-answer', 'failed', 'canceled', 'inventado']) {
      serviceClient = seedBridgeAndCall();
      serviceClient.strict = true;
      await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: s });
      expect(CALLS_STATUS_CHECK).toContain(serviceClient.tables.calls![0].status);
      expect(BRIDGE_STATUS_CHECK).toContain(serviceClient.tables.mobile_call_bridges![0].status);
    }
  });

  test('F5-30b un fallo inesperado responde 500 para que Twilio reintente', async () => {
    serviceClient = seedBridgeAndCall();
    serviceClient.failOn.push({ table: 'mobile_call_bridges', kind: 'update' });
    const res = await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'in-progress' });
    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. TwiML: agent-leg / customer-leg
// ═══════════════════════════════════════════════════════════════════════════

async function postAgentLeg(
  query = `bridgeId=b1&t=${signBridgeToken('b1')}`,
  form: Record<string, string> = { AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'in-progress' }
) {
  const { POST } = await import('@/app/api/voice/twiml/agent-leg/route');
  verifyTwilioWebhook.mockResolvedValueOnce({ params: form, accountSid: form.AccountSid, rawBody: '' });
  const res = await POST(new Request(`https://app.goadmin.io/api/voice/twiml/agent-leg?${query}`, { method: 'POST' }));
  return { res, xml: await res.text() };
}

async function postCustomerLeg(digits: string, query = `bridgeId=b1&t=${signBridgeToken('b1')}`, accountSid = 'ACmaster') {
  const { POST } = await import('@/app/api/voice/twiml/customer-leg/route');
  verifyTwilioWebhook.mockResolvedValueOnce({ params: { AccountSid: accountSid, CallSid: 'CAagent', Digits: digits }, accountSid, rawBody: '' });
  const res = await POST(new Request(`https://app.goadmin.io/api/voice/twiml/customer-leg?${query}`, { method: 'POST' }));
  return { res, xml: await res.text() };
}

const seedTwimlBridge = (patch: Row = {}) =>
  new FakeSupabase()
    .seed('mobile_call_bridges', [
      { id: 'b1', organization_id: 7, user_id: 'u', customer_id: 'cus-1', opportunity_id: null, call_id: 'call-1', agent_phone: '+571', target_phone: '+573001112233', status: 'agent_ringing', confirm_digit_required: true, whisper_text: null, ...patch },
    ])
    .seed('calls', [{ id: 'call-1', organization_id: 7, status: 'dialing', metadata: {} }])
    .seed('customers', [{ id: 'cus-1', organization_id: 7, first_name: 'Juan', last_name: 'Pérez', company_name: 'Corral' }]);

describe('TwiML agent-leg / customer-leg', () => {
  beforeEach(() => {
    serviceClient = seedTwimlBridge();
  });

  test('F5-31 el <Say> usa la combinación que Twilio sí soporta: es-MX + Polly.Mia-Neural (nunca es-CO)', async () => {
    const { xml } = await postAgentLeg();
    const { CONSENT_LANGUAGE, CONSENT_VOICE } = await import('@/lib/services/crm/twimlBuilders');
    expect(CONSENT_LANGUAGE).toBe('es-MX');
    expect(CONSENT_VOICE).toBe('Polly.Mia-Neural');
    expect(xml).toContain(`language="${CONSENT_LANGUAGE}"`);
    expect(xml).toContain(`voice="${CONSENT_VOICE}"`);
    expect(xml).not.toContain('es-CO');
    expect(xml).not.toContain('Polly.Lupe');
  });

  test('F5-32 el TwiML sale de builders puros (§4.2), no de plantillas sueltas en las rutas', async () => {
    const mod = await import('@/lib/services/crm/bridgeTwimlBuilders');
    expect(Object.keys(mod)).toContain('buildAgentLegTwiml');
    expect(Object.keys(mod)).toContain('buildCustomerLegTwiml');
    expect(Object.keys(mod)).toContain('buildAgentDialGatherTwiml');
    // Y las rutas los usan (no reconstruyen el XML a mano).
    expect(SRC(AGENT_LEG_SRC)).toContain('buildAgentLegTwiml');
    expect(SRC(CUSTOMER_LEG_SRC)).toContain('buildCustomerLegTwiml');
  });

  test('F5-33 el nombre del cliente de OTRA org no se filtra (lectura scoped por organization_id)', async () => {
    serviceClient.tables.customers![0].organization_id = 999;
    const { xml } = await postAgentLeg();
    expect(xml).not.toContain('Juan');
    expect(xml).toContain('un cliente');
  });

  test('F5-34 quien firma con una cuenta ajena a la org recibe 403 y NO ve el nombre del cliente', async () => {
    const { res, xml } = await postAgentLeg(`bridgeId=b1&t=${signBridgeToken('b1')}`, {
      AccountSid: 'ACdeOtraOrg',
      CallSid: 'CAx',
      CallStatus: 'in-progress',
    });
    expect(res.status).toBe(403);
    expect(xml).not.toContain('Juan Pérez');
  });

  test('F5-35 `agent_answered` NO se escribe sobre un estado terminal: se cuelga', async () => {
    serviceClient.tables.mobile_call_bridges![0].status = 'completed';
    const { xml } = await postAgentLeg();
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('completed');
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('<Gather');
  });

  test('F5-36 AnsweredBy=machine_start (buzón del vendedor) cuelga y marca `agent_no_answer`', async () => {
    const { xml } = await postAgentLeg(`bridgeId=b1&t=${signBridgeToken('b1')}`, {
      AccountSid: 'ACmaster',
      CallSid: 'CAagent',
      CallStatus: 'in-progress',
      AnsweredBy: 'machine_start',
    });
    expect(xml).not.toContain('<Gather');
    expect(xml).toContain('<Hangup/>');
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_no_answer');
    expect(serviceClient.tables.calls![0].status).toBe('no_answer');
  });

  test('F5-37 el <Gather> ofrece "2 para cancelar" y espera 8 s (§4.5.1)', async () => {
    const { xml } = await postAgentLeg();
    expect(xml).toContain('timeout="8"');
    expect(xml).toMatch(/2 para cancelar/i);
    expect(xml).toMatch(/Presiona 1 para conectar/i);
  });

  test('F5-38 Digits=1 → <Dial> con callerId, action(dial-complete) y <Number url=consent-whisper>', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('<Dial');
    expect(xml).toContain('callerId="+576010000000"');
    expect(xml).toContain('dial-complete');
    expect(xml).toMatch(/<Number[^>]*url=/);
    expect(xml).toContain('consent-whisper');
  });

  test('F5-39 el aviso de grabación del CLIENTE viaja en <Number url=consent-whisper>; el <Say> previo es para el vendedor', async () => {
    const { xml } = await postCustomerLeg('1');
    const iSay = xml.indexOf('se grabará');
    const iDial = xml.indexOf('<Dial');
    expect(iSay).toBeGreaterThan(-1);
    expect(iSay).toBeLessThan(iDial); // el vendedor lo oye antes de marcar
    // …y el cliente oye el suyo al contestar, dentro de la grabación dual.
    expect(xml).toMatch(/<Number[^>]*url="[^"]*consent-whisper[^"]*callId=call-1/);
  });

  test('F5-40 el consentimiento SÍ se registra en `call_consents` con el texto exacto (D9 / doc §7)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    await initiateBridge(ctxOf(sb), { to: '+573001112233' });
    const consent = sb.ops.find((o) => o.table === 'call_consents' && o.kind === 'insert');
    expect(consent).toBeDefined();
    expect(consent!.payload).toMatchObject({
      organization_id: 7,
      consent_type: 'recording',
      method: 'voice_announcement',
      locale: 'es-MX',
      recorded_announcement_text: telephonySettings.voice_consent_message,
    });
    // Y la ruta que lo reproduce queda enlazada en el TwiML del cliente.
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('consent-whisper');
  });

  test('F5-41 la grabación respeta `comm_settings.voice_recording_enabled`', async () => {
    telephonySettings.voice_recording_enabled = false;
    try {
      const { xml } = await postCustomerLeg('1');
      expect(xml).not.toContain('record="record-from-answer-dual"');
      expect(xml).not.toContain('consent-whisper');
    } finally {
      telephonySettings.voice_recording_enabled = true;
    }
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('record="record-from-answer-dual"');
  });

  test('F5-42 `recordingStatusCallbackEvent="completed absent"`: una grabación ausente sí se notifica', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('recordingStatusCallback=');
    expect(xml).toContain('recordingStatusCallbackEvent="completed absent"');
  });

  test('F5-43 Digits distinto de 1 → `agent_rejected` y la llamada queda `canceled` (ya no en dialing)', async () => {
    await postCustomerLeg('2');
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_rejected');
    expect(serviceClient.tables.calls![0].status).toBe('canceled');
    expect(serviceClient.rpcCalls.map((c) => c.args.p_amount)).toEqual([-1]);
  });

  test('F5-44 dos POST con Digits=1 (reintento de Twilio) devuelven el MISMO TwiML y no reescriben el estado', async () => {
    const a = await postCustomerLeg('1');
    const b = await postCustomerLeg('1');
    expect(a.xml).toBe(b.xml);
    const updates = serviceClient.ops.filter((o) => o.table === 'mobile_call_bridges' && o.kind === 'update');
    expect(updates).toHaveLength(1);
  });

  test('F5-45 el número del cliente se inyecta escapado (no hay inyección XML por target_phone)', async () => {
    serviceClient.tables.mobile_call_bridges![0].target_phone = '+57</Number><Hangup/><Number>900';
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('&lt;/Number&gt;');
    expect(xml.match(/<Hangup\/>/g) ?? []).toHaveLength(0);
  });

  test('F5-46 whisper_text del bridge se escapa (viene del body de initiate, con longitud máxima)', async () => {
    serviceClient.tables.mobile_call_bridges![0].whisper_text = '<Say>pwn</Say> & "x"';
    const { xml } = await postAgentLeg();
    expect(xml).toContain('&lt;Say&gt;pwn&lt;/Say&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).not.toContain('<Say>pwn</Say>');
  });

  test('F5-47 sin confirm_digit el <Dial> del agent-leg tiene los MISMOS atributos (callerId y action)', async () => {
    serviceClient.tables.mobile_call_bridges![0].confirm_digit_required = false;
    const { xml } = await postAgentLeg();
    expect(xml).toContain('<Dial');
    expect(xml).toContain('callerId="+576010000000"');
    expect(xml).toContain('dial-complete');
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('customer_dialing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Créditos: cobro y reembolso
// ═══════════════════════════════════════════════════════════════════════════

describe('Créditos del bridge', () => {
  test('F5-48 existe el reembolso de créditos de voz y usa `deduct_comm_credits` con importe negativo', async () => {
    const credits = await import('@/lib/services/crm/callCreditsService');
    expect(Object.keys(credits)).toContain('refundVoiceMinutes');
    const sb = new FakeSupabase();
    await credits.refundVoiceMinutes(7, 2, asSb(sb));
    expect(sb.rpcCalls[0]).toEqual({ fn: 'deduct_comm_credits', args: { p_org_id: 7, p_channel: 'voice', p_amount: -2 } });
  });

  test('F5-49 computeSettlement factura las DOS patas del bridge PSTN', async () => {
    const { computeSettlement } = await import('@/lib/services/crm/callCreditsService');
    const s = computeSettlement({
      durationSeconds: 300, reservedMinutes: 2, mode: 'bridge', recordingEnabled: true,
      unitCosts: { pstn: 0.0377, sdk: 0.004, recording: 0.0025 },
    });
    expect(s.minutes).toBe(5);
    expect(s.breakdown.pstn).toBeCloseTo(0.377, 6); // 2 patas, no 1
    expect(s.breakdown.sdk).toBe(0);
  });

  test('F5-50 el bridge se clasifica por destino y se cobran 2 patas (no hace falta un sku `voice_bridge`)', async () => {
    const { classifyDestinationSku, defaultLegsForMode } = await import('@/lib/services/crm/callCreditsService');
    expect(classifyDestinationSku('+573001112233')).toBe('voice_out_co_mobile');
    expect(defaultLegsForMode('bridge')).toBe(2);
    expect(defaultLegsForMode('browser')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Comprobaciones estructurales sobre los archivos de la fase.
//    Verificado contra la BASE REAL `jgmgphmzusbluqhuqihj` el 2026-09-10, tras
//    aplicar las migraciones del doc §3.1:
//      · mobile_call_bridges TIENE call_id / cancel_requested_at / last_error
//      · comm_settings TIENE voice_bridge_* y voice_mobile_ivr_enabled
//      · existen mobile_verification_attempts y fn_mobile_otp_allowed
//      · existe el índice uq_ucp_org_verified_mobile
//      · mobile_call_bridges está en la publicación supabase_realtime
//      · la política mcb_update es por DUEÑO (user_id = auth.uid())
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8');
const EXISTS = (rel: string) => existsSync(resolve(process.cwd(), rel));

const AGENT_LEG_SRC = 'src/app/api/voice/twiml/agent-leg/route.ts';
const CUSTOMER_LEG_SRC = 'src/app/api/voice/twiml/customer-leg/route.ts';
const BRIDGE_STATUS_SRC = 'src/app/api/voice/bridge/status/route.ts';
const BRIDGE_INIT_SRC = 'src/app/api/voice/bridge/initiate/route.ts';
const BRIDGE_SVC_SRC = 'src/lib/services/crm/mobileBridgeService.ts';
const DIALOG_SRC = 'src/components/crm/shared/MobileCallDialog.tsx';

describe('8a. El <Dial> del bridge puede cerrar la llamada', () => {
  beforeEach(() => {
    serviceClient = seedTwimlBridge({ customer_id: null });
  });

  test('F5-51 `statusCallback` cuelga del <Number>, no del <Dial>: la pata del cliente SÍ notifica', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).not.toMatch(/<Dial[^>]*statusCallback=/);
    expect(xml).toMatch(/<Number[^>]+statusCallback=/);
    expect(xml).toMatch(/<Number[^>]+statusCallbackEvent="initiated ringing answered completed"/);
    expect(xml).toMatch(/statusCallback="[^"]*leg=customer/);
    // Y el handler que ya sabía tratarlo deja de ser código muerto.
    expect(SRC(BRIDGE_STATUS_SRC)).toContain("'customer'");
  });

  test('F5-52 el <Dial> lleva `action` a la ruta dial-complete de F3 (implementada y correcta)', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).toMatch(/<Dial[^>]*action="[^"]*\/api\/voice\/dial-complete\?callId=call-1"/);
    expect(EXISTS('src/app/api/voice/dial-complete/route.ts')).toBe(true);
    const dc = SRC('src/app/api/voice/dial-complete/route.ts');
    expect(dc).toContain('DialCallDuration');
    expect(dc).toContain('settleVoiceCall');
    // El bridge la nombra explícitamente en los dos TwiML que marcan al cliente.
    expect(SRC(CUSTOMER_LEG_SRC)).toContain('dial-complete');
    expect(SRC(AGENT_LEG_SRC)).toContain('dial-complete');
  });

  test('F5-53 `duration_seconds` viene de `DialCallDuration`; el CallDuration del vendedor solo va a metadata', () => {
    const st = SRC(BRIDGE_STATUS_SRC);
    expect(st).toContain('agent_call_duration');
    expect(SRC('src/app/api/voice/dial-complete/route.ts')).toContain('DialCallDuration');
    // La duración de la conversación la fija dial-complete, no este callback.
    expect(st).toContain('applyStatusEvent');
  });

  test('F5-54 las 3 rutas del bridge comprueban que el AccountSid sea el de la org, como las 5 de F3', () => {
    for (const ok of [
      'src/app/api/voice/dial-complete/route.ts',
      'src/app/api/voice/recording/route.ts',
      'src/app/api/voice/status/route.ts',
      'src/app/api/voice/twiml/consent-whisper/route.ts',
      'src/app/api/voice/twiml/inbound/route.ts',
    ]) {
      expect(SRC(ok)).toContain('accountSidMatchesOrg');
    }
    for (const fixed of [AGENT_LEG_SRC, CUSTOMER_LEG_SRC, BRIDGE_STATUS_SRC]) {
      expect(SRC(fixed)).toContain('verifyTwilioWebhook');
      expect(SRC(fixed)).toContain('accountSidMatchesOrg');
      expect(SRC(fixed)).toContain('verifyBridgeToken');
    }
  });
});

describe('8b. Aviso de grabación y consentimiento (D9 / doc §7)', () => {
  beforeEach(() => {
    serviceClient = seedTwimlBridge({ customer_id: null });
  });

  test('F5-55 el <Number> lleva `url=consent-whisper`: el CLIENTE oye el aviso de grabación', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('consent-whisper');
    expect(xml).toMatch(/<Number[^>]+url=/);
    const cw = SRC('src/app/api/voice/twiml/consent-whisper/route.ts');
    expect(cw).toContain('call_consents');
    expect(cw).toContain('consent_given');
  });

  test('F5-56 el bridge escribe `call_consents` y enlaza quien marca `consent_given`', async () => {
    expect(SRC(BRIDGE_SVC_SRC)).toContain('call_consents');
    expect(SRC(CUSTOMER_LEG_SRC)).toContain('consent-whisper');
    expect(SRC(AGENT_LEG_SRC)).toContain('consent-whisper');
    const sb = seedVerifiedMobile(new FakeSupabase());
    await initiateBridge(ctxOf(sb), { to: '+573001112233' });
    expect(sb.ops.filter((o) => o.table === 'call_consents')).toHaveLength(1);
  });
});

describe('8c. Rutas y servicios del doc §4.1/§4.2', () => {
  test('F5-57 existen cancel y GET del bridge; dial-complete se reutiliza (F3) y la IVR/OTP siguen pendientes (§13)', () => {
    for (const rel of [
      'src/app/api/voice/bridge/[id]/cancel/route.ts',
      'src/app/api/voice/bridge/[id]/route.ts',
      'src/app/api/voice/dial-complete/route.ts',
    ]) {
      expect({ rel, existe: EXISTS(rel) }).toEqual({ rel, existe: true });
    }
    // Pendientes declarados en el registro de implementación (no son deuda oculta):
    for (const rel of [
      'src/app/api/voice/twiml/agent-dial/route.ts',
      'src/app/api/crm/me/comm-preferences/mobile/send-otp/route.ts',
    ]) {
      expect({ rel, existe: EXISTS(rel) }).toEqual({ rel, existe: false });
    }
  });

  test('F5-58 el bridge consume el celular verificado que escribe el OTP autenticado de /api/integrations/twilio/verify/*', () => {
    const send = SRC('src/app/api/integrations/twilio/verify/send/route.ts');
    const check = SRC('src/app/api/integrations/twilio/verify/check/route.ts');
    expect(send).toContain('getServerOrgContext');
    expect(check).toContain('getServerOrgContext');
    expect(check).toContain('mobile_phone_e164');
    expect(check).toContain('mobile_verified_at');
    // …y ahora el bridge sí lo lee.
    expect(SRC(BRIDGE_SVC_SRC)).toContain('user_comm_preferences');
    expect(SRC(BRIDGE_SVC_SRC)).toContain('mobile_verified_at');
  });

  test('F5-59 el `initiate` valida el body con zod y no acepta el teléfono del vendedor', () => {
    const init = SRC(BRIDGE_INIT_SRC);
    expect(init).toContain("from 'zod'");
    expect(init).not.toContain('body.agent_phone');
    expect(init).toContain('MOBILE_NOT_VERIFIED');
    expect(SRC(BRIDGE_SVC_SRC)).toContain('BRIDGE_IN_PROGRESS');
  });
});

describe('8d. UI — MobileCallDialog', () => {
  const ui = () => SRC(DIALOG_SRC);

  test('F5-60 el celular del vendedor ya no es un <Input> editable ni viaja en el body (doc §0.2)', () => {
    expect(ui()).not.toContain('id="mc-agent"');
    expect(ui()).not.toContain('setAgentPhone');
    expect(ui()).not.toContain('agent_phone');
    expect(ui()).toMatch(/body: JSON\.stringify\(\{ to,/);
  });

  test('F5-61 exige `mobile_verified_at`, filtra por organización y no cae a `profiles.phone`', () => {
    expect(ui()).toContain("select('mobile_phone_e164, mobile_verified_at')");
    expect(ui()).toContain('mobile_verified_at');
    expect(ui()).not.toContain("from('profiles')");
    expect(ui()).toMatch(/from\('user_comm_preferences'\)[\s\S]{0,240}?\.eq\('organization_id', orgId\)/);
  });

  test('F5-62 el progreso llega por Realtime (la tabla ya está publicada) con respaldo HTTP', () => {
    expect(ui()).toContain('.channel(');
    expect(ui()).toContain('postgres_changes');
    expect(ui()).not.toContain('}, 3000)');
    expect(SRC('src/components/crm/shared/realtimeTables.ts')).toContain('mobile_call_bridges');
  });

  test('F5-63 se puede cancelar el bridge desde la UI antes de conectar (doc §0.3)', () => {
    expect(ui()).toContain('/cancel');
    expect(ui()).toContain('Cancelar llamada');
    expect(ui()).toContain('handleCancel');
  });
});

describe('8e. Esquema real vs doc §3.1 (migraciones aplicadas)', () => {
  test('F5-64 la conversación se enlaza por `call_id` en todos los archivos del bridge', () => {
    for (const f of [BRIDGE_SVC_SRC, BRIDGE_STATUS_SRC, AGENT_LEG_SRC, CUSTOMER_LEG_SRC]) {
      expect(SRC(f)).toMatch(/call_id/);
    }
    // Columnas confirmadas por MCP tras `crm_v4_f05_bridges_call_link`.
    expect(BRIDGE_COLUMNS.has('call_id')).toBe(true);
    expect(BRIDGE_COLUMNS.has('cancel_requested_at')).toBe(true);
    expect(BRIDGE_COLUMNS.has('last_error')).toBe(true);
  });

  test('F5-65 los ajustes de bridge de §3.1 se leen de comm_settings', async () => {
    const svc = SRC(BRIDGE_SVC_SRC);
    expect(svc).toContain('voice_bridge_agent_timeout');
    expect(svc).toContain('voice_bridge_confirm_digit');
    expect(svc).toContain('voice_mobile_ivr_enabled');
    expect(svc).toContain('comm_settings');
    // Y se aplican de verdad (F5-13 comprueba el timeout; aquí el dígito).
    const sb = seedVerifiedMobile(new FakeSupabase()).seed('comm_settings', [
      { organization_id: 7, voice_bridge_confirm_digit: false, voice_bridge_agent_timeout: 25, voice_mobile_ivr_enabled: false },
    ]);
    await initiateBridge(ctxOf(sb), { to: '+573001112233' });
    expect(sb.tables.mobile_call_bridges![0].confirm_digit_required).toBe(false);
  });

  test('F5-66 un customer_id/opportunity_id de OTRA org NO entra en el bridge (la tabla no tiene FK: se valida en código)', async () => {
    const sb = seedVerifiedMobile(new FakeSupabase());
    await initiateBridge(ctxOf(sb), {
      to: '+573004445566',
      customerId: '11111111-1111-4111-8111-111111111111',
      opportunityId: '22222222-2222-4222-8222-222222222222',
    });
    const ins = sb.ops.find((o) => o.table === 'mobile_call_bridges' && o.kind === 'insert')!;
    expect(ins.payload!.customer_id).toBeNull();
    expect(ins.payload!.opportunity_id).toBeNull();
    expect(SRC(BRIDGE_SVC_SRC)).toContain('filterOrgOwnedRefs');
    const callIns = sb.ops.find((o) => o.table === 'calls' && o.kind === 'insert')!;
    expect((callIns.payload!.metadata as Row).rejected_refs).toEqual([
      'customer:11111111-1111-4111-8111-111111111111',
      'opportunity:22222222-2222-4222-8222-222222222222',
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Máquina de estados pura (§2.4) — cobertura de las transiciones
// ═══════════════════════════════════════════════════════════════════════════

describe('9. Máquina de estados del bridge', () => {
  test('F5-67 agent leg: ringing → agent_ringing; in-progress → agent_answered; buzón → agent_no_answer', () => {
    expect(applyAgentLegEvent('initiating', { CallStatus: 'ringing' })).toBe('agent_ringing');
    expect(applyAgentLegEvent('agent_ringing', { CallStatus: 'in-progress' })).toBe('agent_answered');
    expect(applyAgentLegEvent('agent_ringing', { CallStatus: 'in-progress', AnsweredBy: 'machine_start' })).toBe('agent_no_answer');
    expect(applyAgentLegEvent('agent_answered', { CallStatus: 'completed' })).toBe('agent_rejected');
    expect(applyAgentLegEvent('agent_ringing', { CallStatus: 'completed' })).toBe('agent_no_answer');
    expect(applyAgentLegEvent('in_progress', { CallStatus: 'completed' })).toBeNull();
    expect(applyAgentLegEvent('completed', { CallStatus: 'ringing' })).toBeNull();
    expect(applyAgentLegEvent('agent_ringing', { CallStatus: 'inventado' })).toBeNull();
  });

  test('F5-68 customer leg: initiated → customer_dialing; in-progress → in_progress; completed sin bridge → failed', () => {
    expect(applyCustomerLegEvent('agent_answered', { CallStatus: 'initiated' })).toBe('customer_dialing');
    expect(applyCustomerLegEvent('customer_dialing', { CallStatus: 'in-progress' })).toBe('in_progress');
    expect(applyCustomerLegEvent('in_progress', { CallStatus: 'completed' })).toBe('completed');
    expect(applyCustomerLegEvent('customer_dialing', { CallStatus: 'completed' })).toBe('failed');
    expect(applyCustomerLegEvent('customer_dialing', { CallStatus: 'no-answer' })).toBe('failed');
    expect(applyCustomerLegEvent('completed', { CallStatus: 'in-progress' })).toBeNull();
  });

  test('F5-69 el whisper nombra al cliente y la oportunidad, y ofrece las dos opciones', () => {
    expect(buildWhisper({ customerName: 'Juan Pérez', opportunityName: 'Renovación 2027', confirmDigit: true })).toBe(
      'Llamada a Juan Pérez por Renovación 2027. Presiona 1 para conectar, o 2 para cancelar.'
    );
    expect(buildWhisper({ customerName: '', opportunityName: null, confirmDigit: false })).toBe('Llamada a un cliente. Conectando.');
  });

  test('F5-70 el token de bridge no vale para otro bridge ni con longitud distinta', async () => {
    const { verifyBridgeToken } = await import('@/lib/services/crm/bridgeTokens');
    const t = signBridgeToken('b1');
    expect(verifyBridgeToken('b1', t)).toBe(true);
    expect(verifyBridgeToken('b2', t)).toBe(false);
    expect(verifyBridgeToken('b1', `${t}00`)).toBe(false);
    expect(verifyBridgeToken('b1', null)).toBe(false);
  });
});
