/**
 * F6 · r-voz 2026-09-23 — «la campaña se crea y no llama nadie, nunca».
 *
 * Los tres eslabones que faltaban, cada uno con su caso en ROJO contra el código
 * anterior:
 *
 *  1. ENGANCHE AL PLANIFICADOR. `runCampaignQueue` estaba implementada y
 *     protegida, pero nada la disparaba: `vercel.json` no tenía ninguna entrada
 *     de voz y la voz no era un `JobKind` del runner genérico. Los casos
 *     «Enganche» fallan si alguien la desengancha: no basta con que exista la
 *     función, tiene que estar en la tabla que lee `/api/crm/jobs/run` Y en un
 *     cron real de `vercel.json`, y una ejecución del planificador tiene que
 *     acabar consultando `voice_agent_campaigns`.
 *
 *  2. TOPE DE CONCURRENCIA DE LA ORGANIZACIÓN. `comm_settings.voice_max_concurrent_calls`
 *     se leía y NO se aplicaba en el camino de campañas (solo en el despacho
 *     puntual): tres campañas de 3 podían marcar 9 a la vez.
 *
 *  3. EL PANEL DICE POR QUÉ NO LLAMA. Antes, silencio.
 *
 * Nada de esto marca de verdad: `twilio.calls.create` está doblado.
 */

jest.mock('@/lib/services/providerRegistry', () => ({
  getActiveProvider: jest.fn(async () => ({ credentials: {}, settings: {} })),
}));

/**
 * `@/lib/jobs/scheduler` arrastra el runner y, con él, el índice de handlers →
 * `svix` (ESM puro, que jest en CJS no parsea). Mismo mock que usa
 * `src/lib/jobs/__tests__/scheduler.test.ts`: aquí no se ejecuta ningún handler
 * de la cola, solo la tarea programada de voz.
 */
jest.mock('@/lib/jobs/handlers', () => ({}));
// `renewalsSync` importa el cliente de NAVEGADOR al cargarse (sin variables de
// entorno en jest revienta al importar). Mismo mock que `scheduler.test.ts`.
jest.mock('@/lib/jobs/scheduled/renewalsSync', () => ({ runRenewalsSync: jest.fn(async () => ({})) }));
jest.mock('@/lib/jobs/scheduled/healthRecalculate', () => ({ runHealthRecalculate: jest.fn(async () => ({})) }));

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

import fs from 'fs';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runCampaignQueue } from '@/lib/services/crm/voiceAgentService';
import { runCampaignsForAllOrgs } from '@/lib/services/crm/voiceAgentCron';
import { diagnosticarCampanasDeVoz } from '@/lib/services/crm/voiceCampaignDiagnostics';
import { SCHEDULED_TASKS, isScheduledTask, splitScheduledKinds } from '@/lib/jobs/scheduledOrgs';
import { JOBS_RUN_PATH, JOBS_RUN_SCHEDULES, VERCEL_SCHEDULE_KINDS } from '@/lib/jobs/schedule';
import { SCHEDULED_KINDS, hasScheduledKinds, runScheduledKinds } from '@/lib/jobs/scheduler';

/**
 * Compuertas legales: la cola exige la URL de la política de tratamiento de
 * datos. No exige el RNE. Los escenarios de despacho traen la política; sus
 * casos propios viven en `src/__tests__/voz/` y `voiceAgent/__tests__/`.
 */
const POLITICA_DATOS = 'https://example.com/politica-de-datos';
const RNE_VIGENTE = { id: 'rne-1', checked_at: '2026-09-01T00:00:00Z', valid_until: '2999-01-01T00:00:00Z' };

const ROOT = process.cwd();
const SRC = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * Fuente SIN comentarios.
 *
 * Mutación M8 de esta ronda: cambiar `withOrg(handler, { admin: true })` por
 * `withOrg(handler, {})` dejaba el caso V20 en VERDE, porque el propio
 * comentario de cabecera de la ruta cita `{ admin: true }` en prosa. Una
 * aserción de texto que un comentario puede satisfacer no comprueba nada.
 */
const CODIGO = (rel: string) =>
  SRC(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ 	]*\/\/.*$/gm, ' ')
    .replace(/([^:])\/\/.*$/gm, '$1');

// ─── Doble de Supabase encadenable (mismo contrato que el de f6Adversarial) ───

type Op = { table: string; verb: string; payload?: unknown; filters: Array<[string, string, unknown]>; head?: boolean };
interface Resolver {
  (op: Op): { data?: unknown; count?: number; error?: { message: string } | null };
}
interface RpcResolver {
  (call: { name: string; args: Record<string, unknown> }): { data?: unknown; error?: { message: string } | null };
}

function makeSupabase(resolve: Resolver, resolveRpc?: RpcResolver) {
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
      lte: filter('lte'), gt: filter('gt'), lt: filter('lt'), not: filter('not'),
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
      const r = resolveRpc ? resolveRpc({ name, args }) : {};
      return { data: r.data ?? null, error: r.error ?? null };
    }),
  } as unknown as SupabaseClient;

  return { client, ops, rpcs };
}

const ORG = 7;

function campaignRow(over: Record<string, unknown> = {}) {
  return {
    id: 'camp-1', organization_id: ORG, voice_agent_id: 'agent-1', name: 'Campaña de prueba',
    target_source: 'pipeline_stage', target_config: { stage_id: 'st-1' },
    schedule: null, max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3,
    emergency_stop: false, consecutive_failures: 0, status: 'running',
    ...over,
  };
}

function pendingRow(id = 'vac-1') {
  return {
    id, organization_id: ORG, voice_agent_id: 'agent-1', campaign_id: 'camp-1',
    customer_id: 'cust-1', opportunity_id: null, status: 'in_progress', attempts: 1,
    scheduled_at: '2020-01-01T00:00:00.000Z',
  };
}

/** ¿Es el conteo de llamadas en curso de TODA la organización (no el de una campaña)? */
function esConteoDeOrganizacion(op: Op): boolean {
  const cols = op.filters.filter((f) => f[0] === 'eq').map((f) => String(f[1]));
  return op.table === 'voice_agent_calls' && op.head === true && cols.includes('organization_id') && !cols.includes('campaign_id');
}

interface EscenarioOpts {
  campaigns?: Record<string, unknown>[];
  /** Llamadas del agente IA en curso en toda la organización. */
  orgInProgress?: number;
  maxConcurrentOrg?: number;
  claimed?: unknown[];
  commSettings?: Record<string, unknown> | null;
}

function escenario(o: EscenarioOpts = {}) {
  const claimedRows = o.claimed ?? [pendingRow()];
  const resolver: Resolver = (op) => {
    if (op.table === 'voice_agent_campaigns' && op.verb === 'select') return { data: o.campaigns ?? [campaignRow()] };
    if (op.table === 'voice_campaign_rne_checks') return { data: [RNE_VIGENTE] };
    if (op.table === 'comm_settings') {
      if (o.commSettings === null) return { data: null };
      return {
        data: {
          voice_caller_id: '+573001234567',
          voice_recording_enabled: true,
          voice_consent_message: 'Esta llamada será grabada.',
          voice_agent_enabled: true, data_policy_url: POLITICA_DATOS,
          is_active: true,
          voice_minutes_remaining: 100,
          voice_max_concurrent_calls: o.maxConcurrentOrg ?? 3,
          ...(o.commSettings ?? {}),
        },
      };
    }
    if (esConteoDeOrganizacion(op)) return { count: o.orgInProgress ?? 0 };
    if (op.table === 'voice_agent_call_attempts' && op.head) return { count: 0 };
    if (op.table === 'voice_agent_calls' && op.head) return { count: 0 };
    if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: [] };
    if (op.table === 'voice_agents' && op.verb === 'select') {
      return { data: { retry_policy: {}, is_active: true, max_calls_per_day: 50, max_calls_per_hour: 20 } };
    }
    if (op.table === 'opportunities') return { data: [] };
    if (op.table === 'calls' && op.verb === 'insert') return { data: { id: 'call-uuid-0001' } };
    if (op.table === 'customers') return { data: { id: 'cust-1', phone: '3001112233', timezone: 'America/Bogota' } };
    if (op.table === 'phone_numbers') return { data: null };
    return { data: null };
  };
  const rpcResolver: RpcResolver = ({ name }) => {
    if (name === 'fn_claim_voice_agent_calls') return { data: claimedRows };
    if (name === 'fn_can_contact') return { data: true };
    if (name === 'deduct_comm_credits') return { data: true };
    return { data: null };
  };
  return makeSupabase(resolver, rpcResolver);
}

/** Jueves 14:00 en America/Bogota: laborable y dentro de la franja legal. */
const RELOJ_FIJO = new Date('2026-09-10T19:00:00.000Z');
const NO_FALSEAR = [
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate',
  'clearImmediate', 'nextTick', 'queueMicrotask', 'performance',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'cancelIdleCallback', 'hrtime',
] as const;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: [...NO_FALSEAR], now: RELOJ_FIJO });
  twilioCreate.mockReset();
  twilioCreate.mockResolvedValue({ sid: 'CA00000000000000000000000000000001' });
});
afterEach(() => {
  jest.useRealTimers();
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Enganche al planificador
// ═══════════════════════════════════════════════════════════════════════════════

describe('1. La cola de voz está enganchada al planificador', () => {
  test('V1 ROJO-ANTES · `voice_campaigns` es una tarea programada reconocible', () => {
    expect(SCHEDULED_TASKS).toContain('voice_campaigns');
    expect(isScheduledTask('voice_campaigns')).toBe(true);
    // Y NO es un `JobKind`: el reclamo de trabajo ya vive en la base
    // (`fn_claim_voice_agent_calls`), no hace falta una fila en `outbound_jobs`.
    expect(splitScheduledKinds(['voice_campaigns'])).toEqual({ jobKinds: [], tasks: ['voice_campaigns'] });
  });

  test('V2 ROJO-ANTES · el productor la ejecuta: `SCHEDULED_KINDS` la incluye', () => {
    expect(SCHEDULED_KINDS).toContain('voice_campaigns');
    expect(hasScheduledKinds(['voice_campaigns'])).toBe(true);
  });

  test('V3 ROJO-ANTES · un cron REAL de vercel.json la dispara (si alguien la desengancha, esto se pone rojo)', () => {
    const schedules = Object.entries(VERCEL_SCHEDULE_KINDS)
      .filter(([, kinds]) => (kinds as readonly string[]).includes('voice_campaigns'))
      .map(([s]) => s);
    expect(schedules.length).toBeGreaterThan(0);

    const vercel = JSON.parse(SRC('vercel.json')) as { crons?: { path: string; schedule: string }[] };
    const crons = (vercel.crons ?? []).filter((c) => c.path === JOBS_RUN_PATH).map((c) => c.schedule);
    for (const s of schedules) {
      expect({ schedule: s, enVercelJson: crons.includes(s) }).toEqual({ schedule: s, enVercelJson: true });
      expect(JOBS_RUN_SCHEDULES).toContain(s);
    }
  });

  test('V4 ROJO-ANTES · ejecutar el planificador con ese kind acaba consultando las campañas de voz', async () => {
    const { client, ops } = escenario({ campaigns: [] });
    const out = await runScheduledKinds({
      kinds: ['voice_campaigns'],
      budgetMs: 5_000,
      taskBudgetMs: 5_000,
      totalBudgetMs: 5_000,
      worker: 'test',
      supabase: client,
    });
    expect(out.voice_campaigns?.ok).toBe(true);
    // El planificador NO reimplementa nada: llega al mismo despachador, que
    // empieza leyendo las campañas `running`.
    expect(ops.some((o) => o.table === 'voice_agent_campaigns' && o.verb === 'select')).toBe(true);
  });

  test('V5 · el presupuesto agotado no gasta ni una consulta (y lo declara)', async () => {
    const { client, ops } = escenario();
    const abortado = new AbortController();
    abortado.abort();
    const res = await runCampaignsForAllOrgs(client, 'w', { signal: abortado.signal, budgetMs: 1_000 });
    expect(res.truncated).toBe(true);
    expect(ops).toHaveLength(0);
    expect(twilioCreate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Barreras que el enganche NO puede saltarse
// ═══════════════════════════════════════════════════════════════════════════════

describe('2. Lo que el disparo automático sigue respetando', () => {
  test('V6 · una campaña pausada o cancelada no marca: ni siquiera se reclama nada', async () => {
    for (const status of ['paused', 'draft', 'completed', 'scheduled']) {
      const { client, rpcs } = escenario({ campaigns: [] }); // el filtro .eq('status','running') las deja fuera
      const res = await runCampaignQueue(ORG, client, { worker: 'w' });
      expect({ status, iniciadas: res.calls_initiated }).toEqual({ status, iniciadas: 0 });
      expect(rpcs.some((r) => r.name === 'fn_claim_voice_agent_calls')).toBe(false);
      expect(twilioCreate).not.toHaveBeenCalled();
    }
  });

  test('V7 · el despachador solo pide campañas `running` y sin parada de emergencia', async () => {
    const { client, ops } = escenario();
    await runCampaignQueue(ORG, client, { worker: 'w' });
    const sel = ops.find((o) => o.table === 'voice_agent_campaigns' && o.verb === 'select');
    const eq = (sel?.filters ?? []).filter((f) => f[0] === 'eq').map((f) => [f[1], f[2]]);
    expect(eq).toEqual(expect.arrayContaining([['status', 'running'], ['emergency_stop', false]]));
  });

  test('V8 ROJO-ANTES · el tope de concurrencia de la ORGANIZACIÓN se respeta (antes solo el de la campaña)', async () => {
    // 2 llamadas ya en curso en la organización y tope 2 ⇒ no cabe ninguna más,
    // aunque la campaña permita 3 y no tenga ninguna suya en curso.
    const { client, rpcs } = escenario({ maxConcurrentOrg: 2, orgInProgress: 2 });
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });
    expect(res.calls_initiated).toBe(0);
    expect(rpcs.some((r) => r.name === 'fn_claim_voice_agent_calls')).toBe(false);
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(res.errors.join(' ')).toMatch(/simultáneas/i);
  });

  test('V9 ROJO-ANTES · con hueco para 1, se reclama 1 aunque la campaña permita 3', async () => {
    const { client, rpcs } = escenario({ maxConcurrentOrg: 3, orgInProgress: 2 });
    await runCampaignQueue(ORG, client, { worker: 'w' });
    const claim = rpcs.find((r) => r.name === 'fn_claim_voice_agent_calls');
    expect(claim?.args.p_limit).toBe(1);
  });

  test('V10 · dos ejecuciones solapadas no marcan dos veces la misma fila: las filas salen SOLO del claim atómico', async () => {
    // La primera pasada recibe la fila; la segunda, nada (la RPC ya la reservó
    // con FOR UPDATE SKIP LOCKED). El despachador no tiene otra fuente de filas.
    const a = escenario({ claimed: [pendingRow('vac-1')] });
    const b = escenario({ claimed: [] });
    const [r1, r2] = await Promise.all([
      runCampaignQueue(ORG, a.client, { worker: 'w1' }),
      runCampaignQueue(ORG, b.client, { worker: 'w2' }),
    ]);
    expect(r1.calls_initiated + r2.calls_initiated).toBe(1);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    // Nadie lee `voice_agent_calls` con un select de filas para marcarlas: el
    // único origen es la RPC de reserva.
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).toMatch(/fn_claim_voice_agent_calls/);
    expect(src.match(/const claimed = /g) ?? []).toHaveLength(1);
  });

  test('V11 · sin fila de comm_settings no se marca (fail-closed) y lo dice', async () => {
    const { client } = escenario({ commSettings: null });
    const res = await runCampaignQueue(ORG, client, { worker: 'w' });
    expect(res.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. El panel dice POR QUÉ no llama
// ═══════════════════════════════════════════════════════════════════════════════

describe('3. Diagnóstico de bloqueos', () => {
  const codigos = (ms: { codigo: string }[]) => ms.map((m) => m.codigo);

  test('V12 ROJO-ANTES · sin fila de comm_settings el motivo es explícito y bloqueante', async () => {
    const { client } = escenario({ commSettings: null, campaigns: [] });
    const d = await diagnosticarCampanasDeVoz(ORG, client);
    expect(codigos(d.organizacion)).toContain('sin_comm_settings');
    expect(d.organizacion.find((m) => m.codigo === 'sin_comm_settings')?.bloquea).toBe(true);
    expect(d.puedeLlamar).toBe(false);
  });

  test('V13 · canal apagado y agente de voz apagado son motivos DISTINTOS', async () => {
    const apagado = escenario({ commSettings: { voice_agent_enabled: false }, campaigns: [] });
    expect(codigos((await diagnosticarCampanasDeVoz(ORG, apagado.client)).organizacion)).toContain('agente_voz_apagado');

    const inactivo = escenario({ commSettings: { is_active: false }, campaigns: [] });
    expect(codigos((await diagnosticarCampanasDeVoz(ORG, inactivo.client)).organizacion)).toContain('canal_inactivo');
  });

  test('V14 · sin minutos de voz se bloquea; `null` es ILIMITADO y no bloquea (así lo hace deduct_comm_credits)', async () => {
    const sin = escenario({ commSettings: { voice_minutes_remaining: 0 }, campaigns: [] });
    expect(codigos((await diagnosticarCampanasDeVoz(ORG, sin.client)).organizacion)).toContain('sin_minutos');

    const ilimitado = escenario({ commSettings: { voice_minutes_remaining: null }, campaigns: [] });
    expect(codigos((await diagnosticarCampanasDeVoz(ORG, ilimitado.client)).organizacion)).not.toContain('sin_minutos');
  });

  test('V15 · sin número propio de la organización se bloquea', async () => {
    const { client } = escenario({ commSettings: { voice_caller_id: null }, campaigns: [] });
    const d = await diagnosticarCampanasDeVoz(ORG, client);
    expect(codigos(d.organizacion)).toContain('sin_numero_propio');
  });

  test('V16 · sin campañas activas se dice, en vez de dejar el panel mudo', async () => {
    const { client } = escenario({ campaigns: [campaignRow({ status: 'draft' })] });
    const d = await diagnosticarCampanasDeVoz(ORG, client);
    expect(codigos(d.organizacion)).toContain('sin_campanas_activas');
    expect(d.campanas[0].motivos.map((m) => m.codigo)).toContain('campana_pausada');
  });

  test('V17 · una campaña activa con el agente inactivo señala al agente', async () => {
    const resolver: Resolver = (op) => {
      if (op.table === 'voice_agent_campaigns' && op.verb === 'select') return { data: [campaignRow()] };
      if (op.table === 'voice_campaign_rne_checks') return { data: [RNE_VIGENTE] };
      if (op.table === 'comm_settings') {
        return { data: { voice_caller_id: '+573001234567', voice_agent_enabled: true, data_policy_url: POLITICA_DATOS, is_active: true, voice_minutes_remaining: 10 } };
      }
      if (op.table === 'voice_agents') return { data: { is_active: false, max_calls_per_day: 50, max_calls_per_hour: 20 } };
      if (op.table === 'voice_agent_call_attempts' && op.head) return { count: 0 };
      if (op.table === 'opportunities') return { data: [] };
      return { data: null };
    };
    const { client } = makeSupabase(resolver, () => ({ data: null }));
    const d = await diagnosticarCampanasDeVoz(ORG, client);
    expect(d.campanas[0].motivos.map((m) => m.codigo)).toContain('agente_inactivo');
  });

  test('V18 · el motivo de Twilio se declara NO VERIFICABLE, no se finge', async () => {
    const { client } = escenario({ campaigns: [] });
    const d = await diagnosticarCampanasDeVoz(ORG, client);
    const m = d.organizacion.find((x) => x.codigo === 'twilio_no_verificable');
    expect(m).toBeDefined();
    expect(m?.bloquea).toBe(false);
  });

  test('V19 · el diagnóstico NO devuelve ninguna credencial', async () => {
    const { client } = escenario({ campaigns: [] });
    const d = await diagnosticarCampanasDeVoz(ORG, client);
    const texto = JSON.stringify(d);
    for (const clave of ['TWILIO_SUBACCOUNT_AUTH_TOKEN', 'TWILIO_AUTH_TOKEN', 'auth_token', 'credentials']) {
      expect({ clave, aparece: texto.includes(clave) }).toEqual({ clave, aparece: false });
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Contratos de las rutas (regla dura 5 y 6, y el cron intacto)
// ═══════════════════════════════════════════════════════════════════════════════

describe('4. Rutas', () => {
  const RUN_NOW = 'src/app/api/crm/voice-agents/campaigns/run-now/route.ts';

  test('V20 ROJO-ANTES · «Ejecutar ahora» existe, saca la organización de la sesión y exige admin EN EL SERVIDOR', () => {
    // `CODIGO`, no `SRC`: el comentario de la ruta cita `{ admin: true }` y
    // haría pasar el caso aunque el código no lo tuviera (mutación M8).
    const src = CODIGO(RUN_NOW);
    expect(src).toMatch(/withOrg\(/);
    expect(src).toMatch(/\{\s*admin:\s*true\s*\}/);
    // Regla dura 5 (b): organización ajena en cuerpo o query → 403 + registro.
    expect(src).toMatch(/readOrgBody(?:<[^>]*>)?\s*\(/);
    // Nunca por el nombre del rol (regla dura 6) ni con un valor del cliente.
    expect(src).not.toMatch(/role_?[Nn]ame|'Admin|"Admin/);
    expect(src).not.toMatch(/organization_id\s*[:=]\s*body|body\.organization_id/);
  });

  test('V21 · el criterio de admin es EL MISMO que el de «Lanzar» de campañas, no una copia', () => {
    // «Lanzar» usa `withWhatsAppRoute(..., { admin: true })`, que por dentro
    // llama a `requireOrgAdminOrPermission`. `withOrg(..., { admin: true })`
    // llama exactamente a esa misma función.
    const http = SRC('src/lib/services/crm/whatsapp/http.ts');
    const orgContext = SRC('src/lib/utils/orgContext.ts');
    expect(http).toMatch(/requireOrgAdminOrPermission\(ctx\)/);
    expect(orgContext).toMatch(/if \(opts\?\.admin\) await requireOrgAdminOrPermission\(ctx\)/);
    // Y el panel no decide el permiso por su cuenta: lo pregunta al servidor.
    // Desde 2026-10-06 el diagnóstico (y `puede_ejecutar`) lo lee una sola vez
    // `useDiagnosticoVoz`, compartido por el panel y las tarjetas (chips).
    const hook = CODIGO('src/components/crm/agentes/campanas/useDiagnosticoVoz.ts');
    expect(hook).toMatch(/setPuedeEjecutar\(json\.puede_ejecutar === true\)/);
    const panel = CODIGO('src/components/crm/agentes/campanas/CampaignRunNow.tsx');
    expect(panel).toMatch(/puedeEjecutar/);
    for (const src of [hook, panel]) expect(src).not.toMatch(/role_?[Nn]ame|is_super_admin/);
  });

  test('V22 · los dos caminos del CRON siguen siendo fail-closed por CRON_SECRET (no se debilitan)', () => {
    const alias = CODIGO('src/app/api/crm/voice-agents/campaigns/run/route.ts');
    const canonica = CODIGO('src/app/api/voice/agent-campaigns/run/route.ts');
    expect(alias).toMatch(/withCron\(/);
    expect(canonica).toMatch(/verifyCronSecret\(/);
    for (const src of [alias, canonica]) {
      // Ni sesión ni admin: si apareciera, habría dos autenticaciones y mandaría la débil.
      expect(src).not.toMatch(/getServerOrgContext|withOrg\(/);
    }
  });

  test('V23 · el diagnóstico es de lectura y también saca la organización de la sesión', () => {
    const src = CODIGO('src/app/api/crm/voice-agents/campaigns/diagnostics/route.ts');
    expect(src).toMatch(/withOrg\(/);
    expect(src).toMatch(/hasOrgAdminOrPermission\(ctx\)/);
    expect(src).not.toMatch(/export const (POST|PUT|PATCH|DELETE)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. UI nueva en cuatro idiomas
// ═══════════════════════════════════════════════════════════════════════════════

describe('5. Traducciones', () => {
  const IDIOMAS = ['es', 'en', 'fr', 'pt'] as const;
  const NS = 'vozCampanasDisparo';
  const mensajes = Object.fromEntries(
    IDIOMAS.map((l) => [l, JSON.parse(SRC(`messages/${l}.json`)) as Record<string, unknown>]),
  ) as Record<(typeof IDIOMAS)[number], Record<string, unknown>>;

  function aplanar(o: Record<string, unknown>, pre = ''): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      const ruta = pre ? `${pre}.${k}` : k;
      if (typeof v === 'string') out[ruta] = v;
      else if (v && typeof v === 'object') Object.assign(out, aplanar(v as Record<string, unknown>, ruta));
    }
    return out;
  }

  test('V24 · el namespace existe en los 4 idiomas con exactamente las mismas claves y sin vacíos', () => {
    const base = Object.keys(aplanar(mensajes.es[NS] as Record<string, unknown>)).sort();
    expect(base.length).toBeGreaterThan(10);
    for (const l of IDIOMAS) {
      const ns = mensajes[l][NS] as Record<string, unknown> | undefined;
      expect({ idioma: l, existe: !!ns }).toEqual({ idioma: l, existe: true });
      const plano = aplanar(ns as Record<string, unknown>);
      expect({ idioma: l, claves: Object.keys(plano).sort() }).toEqual({ idioma: l, claves: base });
      for (const [k, v] of Object.entries(plano)) {
        expect({ idioma: l, clave: k, vacio: v.trim().length === 0 }).toEqual({ idioma: l, clave: k, vacio: false });
      }
    }
  });

  test('V25 · todo código de motivo del servidor tiene su texto (si se añade uno sin traducir, rojo)', () => {
    const src = SRC('src/lib/services/crm/voiceCampaignDiagnostics.ts');
    const bloque = src.slice(src.indexOf('export type MotivoCodigo'), src.indexOf('export interface Motivo'));
    const codigos = Array.from(bloque.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(codigos.length).toBeGreaterThan(10);
    const motivosEs = (mensajes.es[NS] as { motivos: Record<string, string> }).motivos;
    for (const c of codigos) {
      expect({ codigo: c, traducido: typeof motivosEs[c] === 'string' }).toEqual({ codigo: c, traducido: true });
    }
  });

  test('V27 ROJO-ANTES · el interruptor del agente de voz EXISTE y se puede guardar', () => {
    // El bloqueo mas tonto de todos: `comm_settings.voice_agent_enabled` es
    // DEFAULT false y no habia ninguna pantalla que lo pusiera en true, asi que
    // el agente no podia llamar nunca. Hacen falta las dos mitades.
    const schema = CODIGO('src/lib/services/crm/telephonySettingsService.ts');
    expect(schema).toMatch(/voice_agent_enabled:\s*z\.boolean\(\)\.optional\(\)/);
    const seccion = CODIGO('src/components/configuracion/crm/telefonia/VoiceAgentSwitchSection.tsx');
    expect(seccion).toMatch(/voice_agent_enabled:\s*valor/);
    // Desde la configuración unificada (2026-10-07) el interruptor vive en
    // Configuración › CRM › Agente de voz, no en Telefonía; sigue montado.
    expect(CODIGO('src/components/configuracion/panels/crm/AgenteVozSeccion.tsx')).toMatch(/<VoiceAgentSwitchSection\b/);
  });

  test('V28 · el interruptor esta traducido en los 4 idiomas', () => {
    for (const l of IDIOMAS) {
      const ns = mensajes[l][NS] as { interruptor?: Record<string, string> };
      expect({ idioma: l, tiene: !!ns.interruptor?.etiqueta }).toEqual({ idioma: l, tiene: true });
    }
  });

  test('V26 · el panel usa next-intl y no deja cadenas nuevas cableadas en español', () => {
    const src = SRC('src/components/crm/agentes/campanas/CampaignRunNow.tsx');
    expect(src).toMatch(/useTranslations\(["']vozCampanasDisparo["']\)/);
    // El panel de campañas lo monta.
    expect(SRC('src/components/crm/agentes/AgentCampaignsPanel.tsx')).toMatch(/<CampaignRunNow\b/);
  });
});
