/**
 * F5 adversarial (tester, ronda 1) — "Llamar desde mi celular" (bridge de 2 patas).
 *
 * Ejercita el CÓDIGO REAL de la fase con dobles en memoria:
 *   - `mobileBridgeService.initiateBridge` / `cancelBridge`
 *   - rutas `/api/voice/bridge/status`, `/api/voice/twiml/agent-leg`,
 *     `/api/voice/twiml/customer-leg`
 * y lo contrasta con el esquema REAL verificado hoy por MCP contra
 * `jgmgphmzusbluqhuqihj` (columnas, NOT NULL y CHECK de `calls`,
 * `mobile_call_bridges`, `call_consents`).
 *
 * Convención de nombres de caso: F5-xx para poder correr `-t "F5-03"`.
 */

// ─── Mocks de infraestructura ────────────────────────────────────────────────

const twilioCreate = jest.fn();
const twilioCallUpdate = jest.fn();
const twilioCallsFn = jest.fn((_sid: string) => ({ update: twilioCallUpdate }));
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
}));

let serviceClient: FakeSupabase;
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => serviceClient,
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { initiateBridge, cancelBridge, getBridge } from '@/lib/services/crm/mobileBridgeService';

// ─── Esquema REAL (MCP, 2026-09-09) ──────────────────────────────────────────

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

/** `mobile_call_bridges` hoy (la migración `f05_bridges_call_link` NO está aplicada). */
const BRIDGE_COLUMNS = new Set([
  'id', 'organization_id', 'user_id', 'agent_phone', 'target_phone', 'customer_id', 'opportunity_id',
  'agent_leg_sid', 'customer_leg_sid', 'status', 'confirm_digit_required', 'whisper_text',
  'created_at', 'updated_at',
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
  tables: Record<string, Row[]> = {};
  /** Errores forzados por (tabla, operación). */
  failOn: { table: string; kind: 'insert' | 'update' }[] = [];
  /** Si true, valida columnas/NOT NULL/CHECK como el Postgres real. */
  strict = false;

  seed(table: string, rows: Row[]) {
    this.tables[table] = rows.map((r) => ({ ...r }));
    return this;
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
    let payload: Row | undefined;
    let kind: 'insert' | 'update' | 'select' = 'select';

    const rows = () => (self.tables[table] ??= []);
    const matching = () =>
      rows().filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));

    const result = () => {
      const forced = self.failOn.find((f) => f.table === table && f.kind === kind);
      if (forced) return { data: null, error: { message: `forced-${kind}-error` } };
      const bad = payload ? self.validate(table, payload, kind as 'insert' | 'update') : null;
      if (bad) return { data: null, error: { message: bad, code: '42703' } };
      if (kind === 'insert') {
        const row = { id: `row-${rows().length + 1}`, created_at: 'T0', updated_at: 'T0', ...payload };
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
      order() { return builder; },
      limit() { return builder; },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
    };
    return builder as never;
  }
}

const asSb = (f: FakeSupabase) => f as unknown as SupabaseClient;

beforeEach(() => {
  jest.clearAllMocks();
  twilioCreate.mockResolvedValue({ sid: 'CAagent' });
  twilioCallUpdate.mockResolvedValue({});
  serviceClient = new FakeSupabase();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. initiateBridge — el teléfono del vendedor y el destino salen del BODY
// ═══════════════════════════════════════════════════════════════════════════

describe('initiateBridge — origen del número del vendedor', () => {
  test('F5-01 el celular del agente se toma tal cual del input: nunca se consulta user_comm_preferences', async () => {
    const sb = new FakeSupabase();
    await initiateBridge(7, 'user-1', { agent_phone: '+573999999999', target_phone: '+573001112233' }, asSb(sb));

    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(twilioCreate.mock.calls[0][0].to).toBe('+573999999999');
    // Ninguna lectura de la tabla que, según el doc §0.2, es la ÚNICA fuente legítima.
    expect(sb.ops.some((o) => o.table === 'user_comm_preferences')).toBe(false);
    expect(sb.ops.some((o) => o.table === 'profiles')).toBe(false);
  });

  test('F5-02 un número de otro país/premium pasa igual: no hay allow-list ni validación E.164 estricta', async () => {
    const sb = new FakeSupabase();
    await initiateBridge(7, 'user-1', { agent_phone: '+8801700000000', target_phone: '+8801700000001' }, asSb(sb));
    expect(twilioCreate.mock.calls[0][0].to).toBe('+8801700000000');
  });

  test('F5-03 basura sin "+" se convierte en un E.164 falso (+57 a ciegas) y se marca igualmente', async () => {
    const sb = new FakeSupabase();
    await initiateBridge(7, 'user-1', { agent_phone: 'abc', target_phone: '123' }, asSb(sb));
    expect(twilioCreate.mock.calls[0][0].to).toBe('+57abc');
  });

  test('F5-04 no hay reserva de créditos antes de llamar al proveedor', async () => {
    const sb = new FakeSupabase();
    const rpc = jest.fn();
    (sb as unknown as { rpc: unknown }).rpc = rpc;
    await initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb));
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. El INSERT en `calls` contra el esquema REAL
// ═══════════════════════════════════════════════════════════════════════════

describe('initiateBridge — INSERT en calls contra el esquema real', () => {
  test('F5-05 el payload usa `phone_number`, que NO existe en public.calls', async () => {
    const sb = new FakeSupabase();
    await initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb));
    const ins = sb.ops.find((o) => o.table === 'calls' && o.kind === 'insert');
    expect(ins).toBeDefined();
    const cols = Object.keys(ins!.payload!);
    const unknown = cols.filter((c) => !CALLS_COLUMNS.has(c));
    expect(unknown).toEqual(['phone_number']);
  });

  test('F5-06 el payload omite columnas NOT NULL sin default (mode, from_number, to_number)', async () => {
    const sb = new FakeSupabase();
    await initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb));
    const ins = sb.ops.find((o) => o.table === 'calls' && o.kind === 'insert')!;
    const missing = CALLS_REQUIRED.filter((c) => ins.payload![c] === undefined);
    expect(missing.sort()).toEqual(['from_number', 'mode', 'to_number']);
  });

  test('F5-07 con validación de esquema real el INSERT falla y el servicio NO se entera (error tragado)', async () => {
    const sb = new FakeSupabase();
    sb.strict = true;
    const res = await initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb));
    // El bridge se devuelve como si todo hubiera ido bien…
    expect(res.agentLegSid).toBe('CAagent');
    expect(res.bridge.status).toBe('agent_ringing');
    // …pero no existe ninguna fila `calls`: sin ella no hay grabación, ni
    // transcripción (F4 busca por call_id), ni actividad, ni timeline.
    expect(sb.tables.calls ?? []).toHaveLength(0);
  });

  test('F5-08 tampoco se persiste `provider_call_sid` en calls: /api/voice/recording no podrá resolver la llamada', async () => {
    const sb = new FakeSupabase();
    sb.strict = true;
    await initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb));
    expect((sb.tables.calls ?? []).find((r) => r.provider_call_sid === 'CAagent')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Fallos del proveedor a mitad de flujo / concurrencia
// ═══════════════════════════════════════════════════════════════════════════

describe('initiateBridge — fallos y concurrencia', () => {
  test('F5-09 error de Twilio → bridge `failed` y excepción; no hay créditos que devolver porque no se reservaron', async () => {
    const sb = new FakeSupabase();
    twilioCreate.mockRejectedValueOnce(new Error('21210 caller id inválido'));
    await expect(initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb))).rejects.toThrow(/21210/);
    const upd = sb.ops.filter((o) => o.table === 'mobile_call_bridges' && o.kind === 'update');
    expect(upd.at(-1)!.payload!.status).toBe('failed');
  });

  test('F5-10 si el UPDATE de `failed` también falla, el bridge queda colgado en `initiating` para siempre', async () => {
    const sb = new FakeSupabase();
    sb.failOn.push({ table: 'mobile_call_bridges', kind: 'update' });
    twilioCreate.mockRejectedValueOnce(new Error('network'));
    await expect(initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb))).rejects.toThrow();
    expect(sb.tables.mobile_call_bridges![0].status).toBe('initiating');
  });

  test('F5-11 doble clic: dos initiate simultáneos del MISMO usuario crean 2 bridges y 2 llamadas (sin 409 BRIDGE_IN_PROGRESS)', async () => {
    const sb = new FakeSupabase();
    twilioCreate.mockResolvedValueOnce({ sid: 'CA1' }).mockResolvedValueOnce({ sid: 'CA2' });
    const [a, b] = await Promise.all([
      initiateBridge(7, 'user-1', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb)),
      initiateBridge(7, 'user-1', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb)),
    ]);
    expect(a.bridge.id).not.toBe(b.bridge.id);
    expect(twilioCreate).toHaveBeenCalledTimes(2);
    expect(sb.tables.mobile_call_bridges).toHaveLength(2);
  });

  test('F5-12 el `statusCallback` no lleva token HMAC: la URL solo depende del bridgeId', async () => {
    const sb = new FakeSupabase();
    await initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb));
    const arg = twilioCreate.mock.calls[0][0];
    expect(arg.url).toMatch(/twiml\/agent-leg\?bridgeId=/);
    expect(arg.url).not.toMatch(/[?&]t=/);
    expect(arg.statusCallback).not.toMatch(/[?&]t=/);
  });

  test('F5-13 `calls.create` no pide detección de contestador ni respeta un timeout configurable (fijo 30 s)', async () => {
    const sb = new FakeSupabase();
    await initiateBridge(7, 'u', { agent_phone: '+573001', target_phone: '+573002' }, asSb(sb));
    const arg = twilioCreate.mock.calls[0][0];
    expect(arg.timeout).toBe(30);
    expect(arg.machineDetection).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. cancelBridge
// ═══════════════════════════════════════════════════════════════════════════

describe('cancelBridge', () => {
  const seedBridge = (status: string) =>
    new FakeSupabase().seed('mobile_call_bridges', [
      { id: 'b1', organization_id: 7, user_id: 'owner', status, agent_leg_sid: 'CAagent', customer_leg_sid: 'CAcust', agent_phone: '+571', target_phone: '+572' },
    ]);

  test('F5-14 con la llamada ya en curso manda status "canceled", que Twilio solo acepta en queued|ringing', async () => {
    const sb = seedBridge('in_progress');
    await cancelBridge('b1', 7, asSb(sb));
    expect(twilioCallUpdate).toHaveBeenCalledWith({ status: 'canceled' });
    expect(twilioCallUpdate).not.toHaveBeenCalledWith({ status: 'completed' });
  });

  test('F5-15 si Twilio rechaza la cancelación el error se traga y el bridge se marca `failed` igual (la llamada sigue viva)', async () => {
    const sb = seedBridge('in_progress');
    twilioCallUpdate.mockRejectedValue(new Error('21220 Call is not in-progress'));
    await expect(cancelBridge('b1', 7, asSb(sb))).resolves.toBeUndefined();
    expect(sb.tables.mobile_call_bridges![0].status).toBe('failed');
  });

  test('F5-16 IDOR intra-org: cualquier miembro de la org cancela el bridge de otro (no se compara user_id)', async () => {
    const sb = seedBridge('agent_ringing');
    await cancelBridge('b1', 7, asSb(sb)); // sin userId en la firma: imposible comprobarlo
    expect(sb.tables.mobile_call_bridges![0].status).toBe('failed');
    expect(cancelBridge.length).toBeLessThan(4); // (id, orgId, supabase)
  });

  test('F5-17 el estado final de una cancelación es `failed`, no un estado propio: se confunde con un fallo del proveedor', async () => {
    const sb = seedBridge('agent_ringing');
    await cancelBridge('b1', 7, asSb(sb));
    expect(BRIDGE_STATUS_CHECK).not.toContain('canceled');
    expect(sb.tables.mobile_call_bridges![0].status).toBe('failed');
  });

  test('F5-18 un bridge terminal `agent_no_answer` sí se puede "cancelar" otra vez (solo bloquea completed/failed)', async () => {
    const sb = seedBridge('agent_no_answer');
    await expect(cancelBridge('b1', 7, asSb(sb))).resolves.toBeUndefined();
    expect(twilioCallUpdate).toHaveBeenCalled();
  });

  test('F5-19 getBridge sí filtra por organization_id (aislamiento correcto en la lectura)', async () => {
    const sb = seedBridge('in_progress');
    expect(await getBridge('b1', 99, asSb(sb))).toBeNull();
    expect(await getBridge('b1', 7, asSb(sb))).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Ruta /api/voice/bridge/status — webhooks duplicados, fuera de orden, org ajena
// ═══════════════════════════════════════════════════════════════════════════

async function postStatus(
  form: Record<string, string>,
  query = 'bridgeId=b1&leg=agent'
): Promise<Response> {
  const { POST } = await import('@/app/api/voice/bridge/status/route');
  verifyTwilioWebhook.mockResolvedValueOnce({ params: form, accountSid: form.AccountSid ?? 'ACmaster', rawBody: '' });
  return POST(new Request(`https://app.goadmin.io/api/voice/bridge/status?${query}`, { method: 'POST' }));
}

describe('/api/voice/bridge/status', () => {
  beforeEach(() => {
    serviceClient = new FakeSupabase()
      .seed('mobile_call_bridges', [
        { id: 'b1', organization_id: 7, user_id: 'u', customer_id: null, opportunity_id: null, agent_leg_sid: 'CAagent', agent_phone: '+571', target_phone: '+572', status: 'agent_ringing' },
      ])
      .seed('calls', [
        { id: 'call-1', organization_id: 7, provider_call_sid: 'CAagent', status: 'in_progress', mode: 'bridge', from_number: '+571', to_number: '+572', direction: 'outbound' },
      ]);
  });

  test('F5-20 firma inválida → 403 y ninguna escritura', async () => {
    const { POST } = await import('@/app/api/voice/bridge/status/route');
    verifyTwilioWebhook.mockRejectedValueOnce(new WebhookErrorStub(403, 'twilio_signature_invalid'));
    const res = await POST(new Request('https://app.goadmin.io/api/voice/bridge/status?bridgeId=b1&leg=agent', { method: 'POST' }));
    expect(res.status).toBe(403);
    expect(serviceClient.ops).toHaveLength(0);
  });

  test('F5-21 NO se comprueba que el AccountSid firmante sea el de la org del bridge (cross-tenant)', async () => {
    const res = await postStatus({ AccountSid: 'ACdeOtraOrg', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '77' });
    expect(res.status).toBe(200);
    // La escritura se aplicó pese a venir firmada por otra (sub)cuenta.
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('completed');
    expect(serviceClient.tables.calls![0].duration_seconds).toBe(77);
  });

  test('F5-22 `leg=agent CallStatus=completed` cierra el bridge como `completed` aunque el cliente nunca contestara', async () => {
    serviceClient.tables.mobile_call_bridges![0].status = 'agent_answered';
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '9' });
    // Doc §2.4: debería ser `agent_rejected` (hubo agent_answered pero no customer_dialing).
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('completed');
  });

  test('F5-23 `leg=agent no-answer` marca agent_no_answer pero `calls` queda `no_answer` sin motivo ni reembolso', async () => {
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'no-answer' });
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_no_answer');
    expect(serviceClient.tables.calls![0].status).toBe('no_answer');
    expect(serviceClient.tables.calls![0].metadata).toBeUndefined();
  });

  test('F5-24 webhook duplicado: el mismo evento se aplica dos veces (no hay SequenceNumber ni terminal pegajoso)', async () => {
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '120', SequenceNumber: '3' });
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '0', SequenceNumber: '3' });
    // El reintento con duración 0 PISA la duración buena.
    expect(serviceClient.tables.calls![0].duration_seconds).toBe(0);
  });

  test('F5-25 fuera de orden: un `ringing` tardío revive una llamada ya terminada', async () => {
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'completed', CallDuration: '200' });
    await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'ringing', SequenceNumber: '1' });
    expect(serviceClient.tables.calls![0].status).toBe('ringing');
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_ringing');
  });

  test('F5-26 `leg=customer` crea una SEGUNDA fila en calls: dos filas por conversación (doc §0.4 exige una)', async () => {
    await postStatus(
      { AccountSid: 'ACmaster', CallSid: 'CAcustomer', CallStatus: 'in-progress', From: '+571', To: '+572' },
      'bridgeId=b1&leg=customer'
    );
    expect(serviceClient.tables.calls).toHaveLength(2);
    const nueva = serviceClient.tables.calls![1];
    expect(nueva.bridge_mode).toBe('customer_leg');
    // Y el payload sí es válido contra el esquema real (esta ruta sí lo respeta).
    for (const k of Object.keys(nueva)) {
      if (['id', 'created_at', 'updated_at'].includes(k)) continue;
      expect(CALLS_COLUMNS.has(k)).toBe(true);
    }
  });

  test('F5-27 el `leg=customer` fuerza recording_enabled=true sin mirar comm_settings ni consentimiento', async () => {
    await postStatus(
      { AccountSid: 'ACmaster', CallSid: 'CAcustomer', CallStatus: 'initiated' },
      'bridgeId=b1&leg=customer'
    );
    const nueva = serviceClient.tables.calls![1];
    expect(nueva.recording_enabled).toBe(true);
    expect(nueva.consent_given).toBeUndefined();
  });

  test('F5-28 bridgeId inexistente → 200 sin escrituras (no se filtra si existe o no)', async () => {
    const res = await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAx', CallStatus: 'completed' }, 'bridgeId=noexiste&leg=agent');
    expect(res.status).toBe(200);
    expect(serviceClient.tables.calls).toHaveLength(1);
  });

  test('F5-29 sin bridgeId devuelve 200 OK sin hacer nada (callbacks del agente IA se pierden en silencio)', async () => {
    const res = await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAx', CallStatus: 'completed' }, 'leg=agent');
    expect(res.status).toBe(200);
    expect(serviceClient.ops).toHaveLength(0);
  });

  test('F5-30 ningún estado escrito se sale del CHECK real de calls / mobile_call_bridges', async () => {
    for (const s of ['queued', 'initiated', 'ringing', 'in-progress', 'answered', 'completed', 'busy', 'no-answer', 'failed', 'canceled', 'inventado']) {
      serviceClient = new FakeSupabase()
        .seed('mobile_call_bridges', [{ id: 'b1', organization_id: 7, user_id: 'u', agent_leg_sid: 'CAagent', agent_phone: '+571', target_phone: '+572', status: 'agent_ringing' }])
        .seed('calls', [{ id: 'c', organization_id: 7, provider_call_sid: 'CAagent', status: 'dialing' }]);
      serviceClient.strict = true;
      await postStatus({ AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: s });
      expect(CALLS_STATUS_CHECK).toContain(serviceClient.tables.calls![0].status);
      expect(BRIDGE_STATUS_CHECK).toContain(serviceClient.tables.mobile_call_bridges![0].status);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. TwiML: agent-leg / customer-leg
// ═══════════════════════════════════════════════════════════════════════════

async function postAgentLeg(query = 'bridgeId=b1', form: Record<string, string> = { AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'in-progress' }) {
  const { POST } = await import('@/app/api/voice/twiml/agent-leg/route');
  verifyTwilioWebhook.mockResolvedValueOnce({ params: form, accountSid: form.AccountSid, rawBody: '' });
  const res = await POST(new Request(`https://app.goadmin.io/api/voice/twiml/agent-leg?${query}`, { method: 'POST' }));
  return { res, xml: await res.text() };
}

async function postCustomerLeg(digits: string, query = 'bridgeId=b1') {
  const { POST } = await import('@/app/api/voice/twiml/customer-leg/route');
  verifyTwilioWebhook.mockResolvedValueOnce({ params: { AccountSid: 'ACmaster', CallSid: 'CAagent', Digits: digits }, accountSid: 'ACmaster', rawBody: '' });
  const res = await POST(new Request(`https://app.goadmin.io/api/voice/twiml/customer-leg?${query}`, { method: 'POST' }));
  return { res, xml: await res.text() };
}

describe('TwiML agent-leg / customer-leg', () => {
  beforeEach(() => {
    serviceClient = new FakeSupabase()
      .seed('mobile_call_bridges', [
        { id: 'b1', organization_id: 7, user_id: 'u', customer_id: 'cus-1', opportunity_id: null, agent_phone: '+571', target_phone: '+573001112233', status: 'agent_ringing', confirm_digit_required: true, whisper_text: null },
      ])
      .seed('customers', [{ id: 'cus-1', organization_id: 7, first_name: 'Juan', last_name: 'Pérez', company_name: 'Corral' }]);
  });

  test('F5-31 el <Say> usa language="es-CO", combinación que Twilio no soporta (error 13520 → sin audio)', async () => {
    const { xml } = await postAgentLeg();
    expect(xml).toContain('language="es-CO"');
    expect(xml).toContain('voice="Polly.Lupe"');
    // F3 ya centralizó lo correcto en twimlBuilders: es-MX + Polly.Mia-Neural.
    const { CONSENT_LANGUAGE, CONSENT_VOICE } = await import('@/lib/services/crm/twimlBuilders');
    expect(CONSENT_LANGUAGE).toBe('es-MX');
    expect(CONSENT_VOICE).toBe('Polly.Mia-Neural');
    expect(xml).not.toContain(CONSENT_LANGUAGE);
  });

  test('F5-32 el TwiML no sale de twimlBuilders: no existen los builders de bridge que exige el doc §4.2', async () => {
    const mod = await import('@/lib/services/crm/twimlBuilders');
    expect(Object.keys(mod)).not.toContain('buildAgentLegTwiml');
    expect(Object.keys(mod)).not.toContain('buildCustomerLegTwiml');
    expect(Object.keys(mod)).not.toContain('buildAgentDialGatherTwiml');
  });

  test('F5-33 el nombre del cliente de OTRA org no se filtra (lectura scoped por organization_id)', async () => {
    serviceClient.tables.customers![0].organization_id = 999;
    const { xml } = await postAgentLeg();
    expect(xml).not.toContain('Juan');
    expect(xml).toContain('el cliente');
  });

  test('F5-34 pero el TwiML sí revela el nombre del cliente a quien firme con CUALQUIER cuenta resoluble (no se valida la org del AccountSid)', async () => {
    const { xml } = await postAgentLeg('bridgeId=b1', { AccountSid: 'ACdeOtraOrg', CallSid: 'CAx', CallStatus: 'in-progress' });
    expect(xml).toContain('Juan Pérez');
  });

  test('F5-35 `agent_answered` se escribe SIEMPRE, incluso si el bridge ya está en un estado terminal', async () => {
    serviceClient.tables.mobile_call_bridges![0].status = 'completed';
    await postAgentLeg();
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_answered');
  });

  test('F5-36 AnsweredBy=machine_start (buzón del vendedor) recibe el whisper igual: no hay rama AMD', async () => {
    const { xml } = await postAgentLeg('bridgeId=b1', { AccountSid: 'ACmaster', CallSid: 'CAagent', CallStatus: 'in-progress', AnsweredBy: 'machine_start' });
    // Se le sigue hablando al buzón en vez de colgar y marcar agent_no_answer.
    expect(xml).toContain('<Gather');
    expect(xml).toContain('Pulse 1 para continuar');
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_answered');
  });

  test('F5-37 el <Gather> no ofrece cancelar con 2 y su timeout es de 10 s (el doc promete "1 conectar / 2 cancelar")', async () => {
    const { xml } = await postAgentLeg();
    expect(xml).toContain('timeout="10"');
    expect(xml).not.toMatch(/2 para cancelar/i);
  });

  test('F5-38 Digits=1 → <Dial> SIN callerId, SIN action(dial-complete), SIN <Number url=consent-whisper>', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('<Dial');
    expect(xml).not.toContain('callerId=');
    expect(xml).not.toContain('dial-complete');
    expect(xml).not.toMatch(/<Number[^>]*url=/);
    expect(xml).not.toContain('consent-whisper');
  });

  test('F5-39 el aviso de grabación lo oye el VENDEDOR, no el cliente: el <Say> va antes del <Dial>', async () => {
    const { xml } = await postCustomerLeg('1');
    const iSay = xml.indexOf('será grabada');
    const iDial = xml.indexOf('<Dial');
    expect(iSay).toBeGreaterThan(-1);
    expect(iSay).toBeLessThan(iDial); // fuera de la pata del cliente
  });

  test('F5-40 no se registra NADA en call_consents (obligatorio por D9 / doc §7)', async () => {
    await postCustomerLeg('1');
    expect(serviceClient.ops.some((o) => o.table === 'call_consents')).toBe(false);
  });

  test('F5-41 la grabación es incondicional: no se consulta comm_settings.voice_recording_enabled', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('record="record-from-answer-dual"');
    expect(serviceClient.ops.some((o) => o.table === 'comm_settings')).toBe(false);
  });

  test('F5-42 falta recordingStatusCallbackEvent="completed absent": la grabación ausente nunca se notifica', async () => {
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('recordingStatusCallback=');
    expect(xml).not.toContain('recordingStatusCallbackEvent');
  });

  test('F5-43 Digits distinto de 1 → agent_rejected, pero `calls` no se toca (queda en dialing)', async () => {
    serviceClient.seed('calls', [{ id: 'c1', organization_id: 7, provider_call_sid: 'CAagent', status: 'dialing' }]);
    await postCustomerLeg('2');
    expect(serviceClient.tables.mobile_call_bridges![0].status).toBe('agent_rejected');
    expect(serviceClient.tables.calls![0].status).toBe('dialing');
  });

  test('F5-44 dos POST con Digits=1 (reintento de Twilio) devuelven dos <Dial> y reescriben el estado', async () => {
    const a = await postCustomerLeg('1');
    const b = await postCustomerLeg('1');
    expect(a.xml).toBe(b.xml);
    const updates = serviceClient.ops.filter((o) => o.table === 'mobile_call_bridges' && o.kind === 'update');
    expect(updates).toHaveLength(2);
  });

  test('F5-45 el número del cliente se inyecta escapado (no hay inyección XML por target_phone)', async () => {
    serviceClient.tables.mobile_call_bridges![0].target_phone = '+57</Number><Hangup/><Number>900';
    const { xml } = await postCustomerLeg('1');
    expect(xml).toContain('&lt;/Number&gt;');
    expect(xml.match(/<Hangup\/>/g) ?? []).toHaveLength(0);
  });

  test('F5-46 whisper_text del bridge se escapa (viene del body de initiate, sin longitud máxima)', async () => {
    serviceClient.tables.mobile_call_bridges![0].whisper_text = '<Say>pwn</Say> & "x"';
    const { xml } = await postAgentLeg();
    expect(xml).toContain('&lt;Say&gt;pwn&lt;/Say&gt; &amp;amp; &amp;quot;x&amp;quot;'.replace('&amp;amp;', '&amp;').replace(/&amp;quot;/g, '&quot;'));
    expect(xml).not.toContain('<Say>pwn</Say>');
  });

  test('F5-47 sin confirm_digit el <Dial> del agent-leg tiene los MISMOS huecos (sin callerId ni action)', async () => {
    serviceClient.tables.mobile_call_bridges![0].confirm_digit_required = false;
    const { xml } = await postAgentLeg();
    expect(xml).toContain('<Dial');
    expect(xml).not.toContain('callerId=');
    expect(xml).not.toContain('dial-complete');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Créditos: cobro y reembolso
// ═══════════════════════════════════════════════════════════════════════════

describe('Créditos del bridge', () => {
  test('F5-48 no existe ningún reembolso de créditos de voz en el código (refund_comm_credits no se invoca)', async () => {
    const credits = await import('@/lib/services/crm/callCreditsService');
    expect(Object.keys(credits)).not.toContain('refundVoiceMinutes');
    expect(Object.keys(credits)).not.toContain('refundCommCredits');
  });

  test('F5-49 computeSettlement de F3 solo factura UNA pata: el bridge PSTN cuesta el doble de lo que liquida', async () => {
    const { computeSettlement } = await import('@/lib/services/crm/callCreditsService');
    const s = computeSettlement({
      durationSeconds: 300, reservedMinutes: 1, mode: 'bridge', recordingEnabled: true,
      unitCosts: { pstn: 0.0377, sdk: 0.004, recording: 0.0025 },
    });
    expect(s.minutes).toBe(5);
    expect(s.breakdown.pstn).toBeCloseTo(0.1885, 6); // 1 pata; el real son 2 (≈0.377)
    expect(s.breakdown.sdk).toBe(0);
  });

  test('F5-50 no hay sku `voice_bridge`: la clasificación es por destino, sin concepto de 2 patas', async () => {
    const { classifyDestinationSku } = await import('@/lib/services/crm/callCreditsService');
    expect(classifyDestinationSku('+573001112233')).toBe('voice_out_co_mobile');
    expect(['voice_out_co_mobile', 'voice_out_co_landline', 'voice_in_local_co']).not.toContain('voice_bridge');
  });
});
