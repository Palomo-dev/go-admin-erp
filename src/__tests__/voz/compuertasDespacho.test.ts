import { dobleReservaVoz } from '@/lib/services/crm/__tests__/dobles/reservaVoz';
/**
 * Compuertas legales del despachador de voz (2026-09-30), ejercitadas por el
 * camino REAL (`runCampaignQueue` → `dialClaimedCall`) con un doble de Supabase
 * y Twilio doblado. Ninguna llamada sale si:
 *  1. falta la URL de la política de tratamiento de datos;
 *  2. es fuera del horario de la Ley 2300 (se reprograma a la ventana siguiente);
 *  3. ya hubo un contacto efectivo esta semana (se reprograma a la semana siguiente).
 * El Registro de Números Excluidos no frena la campaña: la organización decide
 * qué números carga.
 * Y cuando sí sale, la llamada lleva AMD.
 */

jest.mock('@/lib/services/providerRegistry', () => ({
  getActiveProvider: jest.fn(async () => ({ credentials: {}, settings: {} })),
}));

const twilioCreate = jest.fn();
jest.mock('@/lib/services/integrations/twilio/twilioConfig', () => ({
  getMasterClient: () => ({ calls: { create: twilioCreate } }),
  getMasterPhoneNumber: () => '+15550000000',
  normalizeDialableE164: (p: string | null | undefined) => {
    if (!p) return null;
    const e164 = p.startsWith('+') ? p : `+57${p.replace(/\D/g, '')}`;
    return /^\+[1-9]\d{9,14}$/.test(e164) ? e164 : null;
  },
  getWebhookBaseUrl: () => 'https://app.example.com',
}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { runCampaignQueue } from '@/lib/services/crm/voiceAgentService';

type Op = { table: string; verb: string; payload?: unknown; filters: Array<[string, string, unknown]>; head?: boolean };
type Res = { data?: unknown; count?: number; error?: { message: string; code?: string } | null };

function makeSupabase(resolve: (op: Op) => Res, resolveRpc: (name: string, args: Record<string, unknown>) => Res) {
  const ops: Op[] = [];
  const rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
  const reserva = dobleReservaVoz();
  const builder = (op: Op) => {
    const filtro = (n: string) => (c: string, v?: unknown) => {
      op.filters.push([n, c, v]);
      return proxy;
    };
    const settle = () => {
      const r = resolve(op);
      return { data: r.data ?? null, count: r.count ?? null, error: r.error ?? null };
    };
    const proxy: Record<string, unknown> = {
      select: (_s?: string, o?: { head?: boolean }) => {
        op.head = o?.head;
        return proxy;
      },
      eq: filtro('eq'), is: filtro('is'), in: filtro('in'), gte: filtro('gte'), lte: filtro('lte'), not: filtro('not'),
      order: filtro('order'), limit: filtro('limit'), range: filtro('range'),
      maybeSingle: async () => settle(),
      single: async () => settle(),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(settle()).then(ok, ko),
    };
    return proxy;
  };
  const client = {
    from(table: string) {
      const push = (verb: string, payload?: unknown) => {
        const op: Op = { table, verb, payload, filters: [] };
        ops.push(op);
        return op;
      };
      return {
        select: (s?: string, o?: { head?: boolean }) =>
          (builder(push('select')) as { select: (a?: string, b?: unknown) => unknown }).select(s, o),
        insert: (p: unknown) => builder(push('insert', p)),
        update: (p: unknown) => builder(push('update', p)),
      };
    },
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      if (name === 'crm_voice_campaign_rne_status') {
        const r = resolve({ table: 'voice_campaign_rne_checks', verb: 'select', filters: [
          ['eq', 'organization_id', args.p_org], ['eq', 'campaign_id', args.p_campaign],
        ] });
        const row = Array.isArray(r.data) ? r.data[0] : null;
        return { data: row ? { evidence_available: true, audience_unchanged: true, changed_targets: 0, ...row } : null, error: r.error ?? null };
      }

      const r = resolveRpc(name, args);
      return { data: r.data ?? (r.error ? null : reserva(name, args)) ?? null, error: r.error ?? null };
    }),
  } as unknown as SupabaseClient;
  return { client, ops, rpcs };
}

interface Escenario {
  topesCampana?: { max_calls_per_day?: number | null; max_calls_per_hour?: number | null; max_concurrent?: number | null };
  concurrenciaOrg?: number;
  archivada?: boolean;
  politica?: string | null;
  rne?: unknown[];
  excluido?: boolean;
  contactosSemana?: Array<{ canal: string; contactos: number }>;
  /** El teléfono del cliente está en `crm_voice_test_numbers` (vigente). */
  numeroPrueba?: boolean;
  /** `fn_can_contact` responde false (baja voluntaria). */
  sinConsentimiento?: boolean;
  /** `deduct_comm_credits` responde false (sin minutos). */
  sinCreditos?: boolean;
  /** Intentos ya anotados hoy en el libro (topes diarios/horarios). */
  intentosHoy?: number;
}

function escenario(e: Escenario = {}) {
  const campana = {
    id: 'camp-1', organization_id: 7, voice_agent_id: 'agent-1', name: 'C',
    target_source: 'pipeline_stage', target_config: { stage_id: 'st-1' }, schedule: null,
    max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3,
    ...e.topesCampana,
    emergency_stop: false, consecutive_failures: 0, status: 'running',
  };
  const fila = {
    id: '20000000-0000-4000-8000-000000000001', organization_id: 7, voice_agent_id: 'agent-1', campaign_id: 'camp-1',
    customer_id: 'cust-1', opportunity_id: null, status: 'in_progress', attempts: 1,
  };
  return makeSupabase(
    (op) => {
      if (op.table === 'voice_agent_campaigns' && op.verb === 'select') {
        const excluyeArchivadas = op.filters.some(([f, col, value]) => f === 'is' && col === 'stats->>archived_at' && value === null);
        return { data: e.archivada && excluyeArchivadas ? [] : [campana] };
      }
      if (op.table === 'comm_settings') {
        return {
          data: {
            voice_caller_id: '+573001234567', voice_recording_enabled: false, voice_agent_enabled: true,
            is_active: true, voice_max_concurrent_calls: e.concurrenciaOrg ?? 3,
            data_policy_url: e.politica === undefined ? 'https://example.com/politica' : e.politica,
          },
        };
      }
      if (op.table === 'voice_campaign_rne_checks') {
        return { data: e.rne ?? [{ id: 'r', checked_at: '2026-09-01T00:00:00Z', valid_until: '2999-01-01T00:00:00Z', numbers_in_file: 2 }] };
      }
      if (op.table === 'crm_excluded_numbers') return { data: e.excluido ? [{ id: 'x', phone_e164: '+573001112233' }] : [] };
      if (op.table === 'voice_agents') return { data: { is_active: true, max_calls_per_day: 50, max_calls_per_hour: 20, retry_policy: {} } };
      if (op.table === 'voice_agent_call_attempts' && op.head) return { count: e.intentosHoy ?? 0 };
      if (op.table === 'voice_agent_calls' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: [] };
      if (op.table === 'opportunities') return { data: [] };
      if (op.table === 'customers') return { data: { id: 'cust-1', phone: '3001112233', timezone: 'America/Bogota' } };
      if (op.table === 'calls' && op.verb === 'insert') return { data: { id: 'call-1' } };
      return { data: null };
    },
    (name) => {
      if (name === 'fn_claim_voice_agent_calls') return { data: [fila] };
      if (name === 'fn_can_contact') return { data: !e.sinConsentimiento };
      if (name === 'crm_voice_dispatch_prepare' && e.sinCreditos) return { error: { code: 'P0001', message: 'creditos_insuficientes' } };
      if (name === 'fn_voz_es_numero_prueba') return { data: e.numeroPrueba === true };
      if (name === 'fn_contactos_efectivos_semana') return { data: e.contactosSemana ?? [] };
      return { data: null };
    }
  );
}

const MARTES_10_BOG = new Date('2026-09-29T15:00:00Z');

beforeEach(() => {
  jest.useFakeTimers({ now: MARTES_10_BOG, doNotFake: ['setTimeout', 'setImmediate', 'nextTick', 'queueMicrotask'] });
  twilioCreate.mockReset();
  twilioCreate.mockResolvedValue({ sid: `CA${'1'.repeat(32)}` });
});
afterEach(() => jest.useRealTimers());

const reprogramacion = (ops: Op[]) =>
  ops.find((o) => o.table === 'voice_agent_calls' && o.verb === 'update' && (o.payload as Record<string, unknown>).status === 'pending')
    ?.payload as Record<string, unknown> | undefined;

describe('Compuertas legales del despachador de voz', () => {
  test('con todo en regla marca, y la llamada lleva detección de contestadora', async () => {
    const { client } = escenario();
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(1);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(twilioCreate.mock.calls[0][0]).toMatchObject({ to: '+573001112233', machineDetection: 'Enable' });
  });

  test('sin política de tratamiento de datos no se reclama ni se marca nada', async () => {
    const { client, rpcs } = escenario({ politica: null });
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(r.errors.join(' ')).toMatch(/política de tratamiento de datos/);
    expect(rpcs.some((c) => c.name === 'fn_claim_voice_agent_calls')).toBe(false);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('una campaña anterior sin concurrencia explícita usa 5 y respeta la configuración de la organización', async () => {
    for (const [concurrenciaOrg, expected] of [[10, 5], [2, 2]]) {
      const { client, rpcs } = escenario({ topesCampana: { max_concurrent: null }, concurrenciaOrg });
      expect((await runCampaignQueue(7, client)).calls_initiated).toBe(1);
      expect(rpcs.find(r => r.name === 'fn_claim_voice_agent_calls')?.args.p_limit).toBe(expected);
    }
  });

  test('un tope de concurrencia cero no se sustituye por un valor que permita marcar', async () => {
    const { client, rpcs } = escenario({ topesCampana: { max_concurrent: 0 } });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
    expect(rpcs.some(r => r.name === 'fn_claim_voice_agent_calls')).toBe(false);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('una URL sin https no cuenta como política', async () => {
    const { client } = escenario({ politica: 'http://example.com/politica' });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
  });

  test('sin verificación RNE la campaña igual reclama y marca', async () => {
    for (const rne of [[], [{ id: 'r', checked_at: '2026-08-01T00:00:00Z', valid_until: '2026-08-31T00:00:00Z' }]]) {
      const { client, rpcs } = escenario({ rne });
      const r = await runCampaignQueue(7, client);
      expect(r.calls_initiated).toBe(1);
      expect(r.errors.join(' ')).not.toMatch(/Registro de Números Excluidos/);
      expect(rpcs.some((c) => c.name === 'fn_claim_voice_agent_calls')).toBe(true);
    }
    expect(twilioCreate).toHaveBeenCalled();
  });
  test.each([
    { evidence_available: false, audience_unchanged: false, changed_targets: 0 },
    { evidence_available: true, audience_unchanged: false, changed_targets: 1 },
  ])('la evidencia opcional RNE no bloquea una campaña: %j', async evidence => {
    const { client, rpcs } = escenario({ rne: [{ valid_until: '2999-01-01T00:00:00Z', numbers_in_file: 2, ...evidence }] });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(1);
    expect(rpcs.some(r => r.name === 'crm_voice_campaign_rne_status')).toBe(false);
    expect(rpcs.some(r => r.name === 'crm_voice_dispatch_prepare')).toBe(true);
    expect(twilioCreate).toHaveBeenCalled();
  });

  test('un número que estaba en la lista de excluidos se marca igual', async () => {
    const { client, ops, rpcs } = escenario({ excluido: true });
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(1);
    const cierre = ops.find((o) => o.table === 'voice_agent_calls' && o.verb === 'update' && (o.payload as Record<string, unknown>).last_error_code === 'RNE');
    expect(cierre).toBeUndefined();
    expect(rpcs.some((c) => c.name === 'crm_voice_dispatch_prepare')).toBe(true);
    expect(twilioCreate).toHaveBeenCalled();
  });

  test('fuera del horario de la Ley 2300 (sábado 15:30) se reprograma al martes 07:00: el lunes 12 de octubre es festivo', async () => {
    jest.setSystemTime(new Date('2026-10-10T20:30:00Z')); // sábado 15:30 en Bogotá
    const { client, ops } = escenario();
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
    const p = reprogramacion(ops);
    expect(p).toMatchObject({ claimed_at: null, locked_by: null, last_error_code: 'LEY2300' });
    expect(p?.scheduled_at).toBe('2026-10-13T12:00:00.000Z'); // martes 07:00 en Bogotá
  });

  test('ya hubo una llamada contestada esta semana: se reprograma al lunes siguiente 07:00', async () => {
    const { client, ops } = escenario({ contactosSemana: [{ canal: 'voice', contactos: 1 }, { canal: 'email', contactos: 0 }] });
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(reprogramacion(ops)?.scheduled_at).toBe('2026-10-05T12:00:00.000Z');
  });

  test('dos contactos esta semana por otros canales también bloquean la llamada', async () => {
    const { client, ops } = escenario({ contactosSemana: [{ canal: 'email', contactos: 1 }, { canal: 'whatsapp', contactos: 1 }] });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
    expect(String(reprogramacion(ops)?.error_message)).toMatch(/dos contactos/);
  });

  test('si la base no puede contar los contactos de la semana, no se marca (falla cerrado)', async () => {
    const base = escenario();
    const rpc = base.client.rpc as unknown as jest.Mock;
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) =>
      name === 'fn_contactos_efectivos_semana' ? { data: null, error: { message: 'boom' } } : original(name, args)
    );
    const r = await runCampaignQueue(7, base.client);
    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
  });
});

/**
 * Números de prueba internos (`crm_voice_test_numbers`): eximen SOLO del tope
 * semanal de la Ley 2300. Todo lo demás se ejercita por el mismo camino real.
 */
describe('Número de prueba interno: exime solo del tope semanal', () => {
  const SEMANA_LLENA = [{ canal: 'voice', contactos: 1 }, { canal: 'email', contactos: 1 }];
  const insertCalls = (ops: Op[]) => ops.find((o) => o.table === 'calls' && o.verb === 'insert')?.payload as Record<string, unknown> | undefined;
  const cierre = (ops: Op[]) =>
    ops.find((o) => o.table === 'voice_agent_calls' && o.verb === 'update' && (o.payload as Record<string, unknown>).status === 'skipped')
      ?.payload as Record<string, unknown> | undefined;

  test('con la semana llena, un número de prueba se marca, no se cuentan contactos y la llamada queda marcada', async () => {
    const { client, rpcs } = escenario({ numeroPrueba: true, contactosSemana: SEMANA_LLENA });
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(1);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(rpcs.find((c) => c.name === 'fn_voz_es_numero_prueba')?.args).toEqual({ p_org: 7, p_phone: '+573001112233' });
    expect(rpcs.some((c) => c.name === 'fn_contactos_efectivos_semana')).toBe(false);
    expect(rpcs.find(c => c.name === 'crm_voice_dispatch_prepare')?.args.p_metadata).toMatchObject({ ley2300_exencion: 'numero_prueba' });
  });

  test('la misma semana llena con un número que NO es de prueba sigue reprogramándose, sin marca', async () => {
    const { client, ops } = escenario({ numeroPrueba: false, contactosSemana: SEMANA_LLENA });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
    expect(reprogramacion(ops)).toMatchObject({ last_error_code: 'LEY2300' });
    expect(insertCalls(ops)).toBeUndefined();
  });

  test('una llamada normal (sin exención) no lleva la marca', async () => {
    const { client, rpcs } = escenario();
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(1);
    expect(rpcs.find(c => c.name === 'crm_voice_dispatch_prepare')?.args.p_metadata).not.toHaveProperty('ley2300_exencion');
  });

  test('NO exime de la franja horaria: sábado 15:30 se reprograma al martes 07:00', async () => {
    jest.setSystemTime(new Date('2026-10-10T20:30:00Z'));
    const { client, ops } = escenario({ numeroPrueba: true });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(reprogramacion(ops)).toMatchObject({ last_error_code: 'LEY2300', scheduled_at: '2026-10-13T12:00:00.000Z' });
  });

  test('un número de prueba que estaba en la lista de excluidos se marca: el RNE ya no frena', async () => {
    const { client, ops } = escenario({ numeroPrueba: true, excluido: true });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(1);
    expect(cierre(ops)).toBeUndefined();
    expect(twilioCreate).toHaveBeenCalled();
  });

  test('NO exime de la baja voluntaria (fn_can_contact)', async () => {
    const { client, ops } = escenario({ numeroPrueba: true, sinConsentimiento: true });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
    expect(String(cierre(ops)?.error_message)).toMatch(/baja voluntaria/);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('NO exime de los créditos: sin minutos no se marca', async () => {
    const { client } = escenario({ numeroPrueba: true, sinCreditos: true });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('NO exime de los topes diarios de la campaña y del agente: no se reclama ninguna fila', async () => {
    const { client, rpcs } = escenario({ numeroPrueba: true, intentosHoy: 50 });
    expect((await runCampaignQueue(7, client)).calls_initiated).toBe(0);
    expect(rpcs.some((c) => c.name === 'fn_claim_voice_agent_calls')).toBe(false);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('sin verificación RNE un número de prueba se marca; sin política de datos no', async () => {
    const sinRne = escenario({ numeroPrueba: true, rne: [] });
    expect((await runCampaignQueue(7, sinRne.client)).calls_initiated).toBe(1);
    const sinPolitica = escenario({ numeroPrueba: true, politica: null });
    expect((await runCampaignQueue(7, sinPolitica.client)).calls_initiated).toBe(0);
    expect(sinPolitica.rpcs.some((c) => c.name === 'fn_claim_voice_agent_calls')).toBe(false);
  });

  test('si la base no puede decir si es de prueba, se aplica el tope semanal (falla hacia lo restrictivo)', async () => {
    const base = escenario({ contactosSemana: SEMANA_LLENA });
    const rpc = base.client.rpc as unknown as jest.Mock;
    const original = rpc.getMockImplementation()!;
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) =>
      name === 'fn_voz_es_numero_prueba' ? { data: null, error: { message: 'boom' } } : original(name, args)
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect((await runCampaignQueue(7, base.client)).calls_initiated).toBe(0);
      expect(reprogramacion(base.ops)).toMatchObject({ last_error_code: 'LEY2300' });
    } finally {
      warn.mockRestore();
    }
  });
});

test('una campaña archivada no vuelve a llamar aunque una integración cambie su estado a running', async () => {
  const { client, rpcs } = escenario({ archivada: true });
  const r = await runCampaignQueue(7, client);
  expect(r.campaigns_processed).toBe(0);
  expect(twilioCreate).not.toHaveBeenCalled();
  expect(rpcs.some(c => c.name === 'fn_claim_voice_agent_calls')).toBe(false);
});
