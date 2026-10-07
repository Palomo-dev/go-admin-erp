/**
 * Cola de campañas: un objetivo que no entra a la cola se cuenta como omitido
 * y dice por qué (org 125, 2026-10-07).
 *
 * Caso real: la campaña de ensayo tenía dos clientes (el dueño y un número de
 * prueba). El run reportó `calls_enqueued 1` y `calls_skipped 0`, y el número
 * de prueba no aparecía en ningún lado. Causa: ese cliente ya tenía una llamada
 * `pending` del MISMO agente en otra campaña de prueba («Prueba de llamada 3»),
 * detenida por la compuerta real (`tope_cliente_dia`: dos intentos hoy). El
 * índice `voice_agent_calls_una_viva_por_cliente` impide una segunda llamada
 * viva y `enqueueCampaignTargets` lo descartaba con un `continue` mudo. Una
 * campaña creada después solo con ese cliente tampoco llamó, con `errors: 0`.
 *
 * La regla (una sola llamada viva por cliente y agente, y dos intentos por
 * cliente y día) es correcta y se mantiene; lo que se corrige es el silencio.
 */

jest.mock('@/lib/services/providerRegistry', () => ({
  getActiveProvider: jest.fn(async () => ({ credentials: {}, settings: {} })),
}));

const twilioCreate = jest.fn();
jest.mock('@/lib/services/integrations/twilio/twilioConfig', () => ({
  getMasterClient: () => ({ calls: { create: twilioCreate } }),
  getMasterPhoneNumber: () => '+15550000000',
  formatE164: (p: string) => (p.startsWith('+') ? p : `+57${p.replace(/\D/g, '')}`),
  normalizeDialableE164: (p: string | null | undefined) => {
    if (!p) return null;
    const e164 = p.startsWith('+') ? p : `+57${p.replace(/\D/g, '')}`;
    return /^\+[1-9]\d{9,14}$/.test(e164) ? e164 : null;
  },
  getWebhookBaseUrl: () => 'https://app.example.com',
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { runCampaignQueue } from '@/lib/services/crm/voiceAgentService';

type Filtro = [string, string, unknown];
type Op = { table: string; verb: string; payload?: unknown; filters: Filtro[]; head?: boolean };
type Resultado = { data?: unknown; count?: number; error?: { message: string; code?: string } | null };

function makeSupabase(
  resolve: (op: Op) => Resultado,
  resolveRpc: (name: string, args: Record<string, unknown>) => Resultado
) {
  const ops: Op[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];

  function builder(op: Op) {
    const filter = (name: string) => (col: string, val?: unknown) => {
      op.filters.push([name, col, val]);
      return proxy;
    };
    const settle = () => {
      const r = resolve(op);
      return { data: r.data ?? null, count: r.count ?? null, error: r.error ?? null };
    };
    const proxy: Record<string, unknown> = {
      select: (_sel?: string, opts?: { head?: boolean }) => {
        op.head = opts?.head;
        return proxy;
      },
      eq: filter('eq'), neq: filter('neq'), in: filter('in'), gte: filter('gte'),
      lte: filter('lte'), gt: filter('gt'), lt: filter('lt'), not: filter('not'), is: filter('is'),
      order: filter('order'), limit: filter('limit'), range: filter('range'),
      maybeSingle: async () => settle(),
      single: async () => settle(),
      then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
        Promise.resolve(settle()).then(onOk, onErr),
    };
    return proxy;
  }

  const client = {
    from(table: string) {
      const push = (verb: string, payload?: unknown) => {
        const op: Op = { table, verb, payload, filters: [] };
        ops.push(op);
        return op;
      };
      return {
        select: (sel?: string, opts?: { head?: boolean }) =>
          (builder(push('select')) as { select: (s?: string, o?: unknown) => unknown }).select(sel, opts),
        insert: (payload: unknown) => builder(push('insert', payload)),
        upsert: (payload: unknown) => builder(push('upsert', payload)),
        update: (payload: unknown) => builder(push('update', payload)),
        delete: () => builder(push('delete')),
      };
    },
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      const r = resolveRpc(name, args);
      return { data: r.data ?? null, error: r.error ?? null };
    }),
  } as unknown as SupabaseClient;

  return { client, ops, rpcs };
}

const ORG = 125;
const AGENTE = 'agent-1';
const DUENIO = 'cust-duenio';
const PRUEBA = 'cust-prueba';

const CAMPANA = {
  id: 'camp-ensayo', organization_id: ORG, voice_agent_id: AGENTE, name: 'Ensayo latencia',
  target_source: 'manual_list', target_config: { customer_ids: [DUENIO, PRUEBA] },
  schedule: {}, max_calls_per_day: 2, max_calls_per_hour: 2, max_concurrent: 2,
  emergency_stop: false, consecutive_failures: 0, status: 'running',
};

interface Opciones {
  /** Llamada viva del mismo agente que retiene al número de prueba. */
  viva?: { id: string; customer_id: string; campaign_id: string | null; status: string } | null;
  /** Clientes con `fn_can_contact = false`. */
  sinConsentimiento?: string[];
  /** Respuesta de `crm_voice_call_claim_motivo`. */
  motivo?: Resultado;
}

function escenario(o: Opciones = {}) {
  const viva = o.viva === undefined
    ? { id: 'vac-otra', customer_id: PRUEBA, campaign_id: 'camp-prueba-3', status: 'pending' }
    : o.viva;
  const tiene = (op: Op, tipo: string, col: string) => op.filters.some((f) => f[0] === tipo && f[1] === col);

  return makeSupabase(
    (op) => {
      if (op.table === 'voice_agent_campaigns' && op.verb === 'select') {
        // Nombre de la campaña que retiene la llamada viva.
        if (tiene(op, 'eq', 'id')) return { data: { name: 'Prueba de llamada 3' } };
        return { data: [CAMPANA] };
      }
      if (op.table === 'comm_settings') {
        return {
          data: {
            voice_caller_id: '+573001234567', voice_recording_enabled: false,
            voice_agent_enabled: true, data_policy_url: 'https://example.com/politica-de-datos',
            is_active: true, voice_minutes_remaining: 100, voice_max_concurrent_calls: 3,
          },
        };
      }
      if (op.table === 'voice_agent_call_attempts' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.verb === 'select') {
        // `enqueueCampaignTargets.existing`: llamadas vivas del agente.
        const estados = op.filters.find((f) => f[0] === 'in' && f[1] === 'status')?.[2] as string[] | undefined;
        if (estados?.includes('pending')) return { data: viva ? [viva] : [] };
        return { data: [] };
      }
      if (op.table === 'voice_agent_calls' && op.verb === 'insert') return { data: null };
      if (op.table === 'voice_agents') {
        return { data: { retry_policy: {}, is_active: true, max_calls_per_day: 500, max_calls_per_hour: 100 } };
      }
      if (op.table === 'customers') {
        return { data: [{ id: DUENIO, phone: '+573000000001' }, { id: PRUEBA, phone: '+573000000002' }] };
      }
      if (op.table === 'crm_excluded_numbers') return { data: [] };
      return { data: null };
    },
    (name, args) => {
      if (name === 'fn_can_contact') return { data: !(o.sinConsentimiento ?? []).includes(String(args.p_customer)) };
      if (name === 'crm_voice_call_claim_motivo') return o.motivo ?? { data: 'tope_cliente_dia' };
      // El reclamo no es parte de este caso: nada que marcar.
      if (name === 'fn_claim_voice_agent_calls') return { data: [] };
      return { data: null };
    }
  );
}

/** Miércoles 12:40 en America/Bogota: laborable y dentro de la franja legal. */
const RELOJ = new Date('2026-10-07T17:40:00.000Z');

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick', 'queueMicrotask', 'performance'], now: RELOJ });
  twilioCreate.mockReset();
});
afterEach(() => jest.useRealTimers());

function insertados(ops: Op[]): string[] {
  return ops
    .filter((op) => op.table === 'voice_agent_calls' && op.verb === 'insert')
    .flatMap((op) => (Array.isArray(op.payload) ? op.payload : [op.payload]))
    .map((r) => String((r as { customer_id: string }).customer_id));
}

describe('Cola de campañas: los objetivos que no entran se cuentan como omitidos', () => {
  test('ROJO-ANTES · cliente retenido por una llamada pendiente de OTRA campaña: omitido, con la campaña y el motivo de la compuerta', async () => {
    const { client, ops, rpcs } = escenario();
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });

    // El dueño se encola; el número de prueba no (una sola llamada viva por cliente y agente).
    expect(insertados(ops)).toEqual([DUENIO]);
    expect(res.calls_enqueued).toBe(1);
    // Antes: 0 y sin rastro.
    expect(res.calls_skipped).toBe(1);
    const msg = res.errors.find((e) => e.includes(PRUEBA));
    expect(msg).toBeDefined();
    expect(msg).toContain('«Ensayo latencia»');
    expect(msg).toContain('«Prueba de llamada 3»');
    expect(msg).toContain('pendiente');
    expect(msg).toContain('tope por cliente y día');
    // El motivo sale de la compuerta REAL, en modo lectura (sin bloquear filas).
    expect(rpcs).toContainEqual({
      name: 'crm_voice_call_claim_motivo',
      args: { p_org: ORG, p_vac: 'vac-otra', p_bloquear: false },
    });
  });

  test('si la llamada viva es de ESTA misma campaña no es una omisión (ya está en su cola)', async () => {
    const { client, ops, rpcs } = escenario({
      viva: { id: 'vac-propia', customer_id: PRUEBA, campaign_id: CAMPANA.id, status: 'pending' },
    });
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });
    expect(insertados(ops)).toEqual([DUENIO]);
    expect(res.calls_skipped).toBe(0);
    expect(res.errors).toEqual([]);
    expect(rpcs.some((r) => r.name === 'crm_voice_call_claim_motivo')).toBe(false);
  });

  test('una llamada viva en curso se nombra como tal y no consulta la compuerta', async () => {
    const { client, rpcs } = escenario({
      viva: { id: 'vac-otra', customer_id: PRUEBA, campaign_id: null, status: 'in_progress' },
    });
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });
    expect(res.calls_skipped).toBe(1);
    expect(res.errors.join('\n')).toContain('en curso del mismo agente en un despacho puntual');
    expect(rpcs.some((r) => r.name === 'crm_voice_call_claim_motivo')).toBe(false);
  });

  test('si la compuerta no responde, la omisión se cuenta igual (sin el detalle)', async () => {
    const { client } = escenario({ motivo: { error: { message: 'permiso denegado' } } });
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });
    expect(res.calls_skipped).toBe(1);
    const msg = res.errors.find((e) => e.includes(PRUEBA)) ?? '';
    expect(msg).toContain('«Prueba de llamada 3»');
    expect(msg).not.toContain('detenida');
  });

  test('sin consentimiento («no llamar»): omitido con su motivo, nunca encolado', async () => {
    const { client, ops } = escenario({ viva: null, sinConsentimiento: [PRUEBA] });
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });
    expect(insertados(ops)).toEqual([DUENIO]);
    expect(res.calls_skipped).toBe(1);
    expect(res.errors.find((e) => e.includes(PRUEBA))).toContain('no llamar');
  });

  test('sin nada que lo retenga, los dos se encolan y no hay omitidos', async () => {
    const { client, ops } = escenario({ viva: null });
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });
    expect(insertados(ops).sort()).toEqual([DUENIO, PRUEBA].sort());
    expect(res.calls_enqueued).toBe(2);
    expect(res.calls_skipped).toBe(0);
  });
});
