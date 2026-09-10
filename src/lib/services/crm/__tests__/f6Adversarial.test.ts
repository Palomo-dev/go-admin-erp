/**
 * F6 adversarial (tester, ronda 1 · actualizado por el builder en la ronda 1).
 * FASE-06 "Agente IA de voz — propósito por etapa del embudo".
 *
 * Convención heredada del tester: un caso llamado "FALLO:" / "CRÍTICO:" PASABA cuando
 * demostraba que el defecto existía. En esta actualización, cada caso cuyo defecto se
 * ha corregido conserva el MISMO escenario y los MISMOS datos, pero su aserción pasa a
 * fijar el comportamiento correcto y el nombre lleva el prefijo `[CORREGIDO r1]`.
 * Los casos cuyo defecto SIGUE vivo (por depender de archivos compartidos que el
 * builder no puede tocar) se conservan intactos y así lo dicen.
 *
 * Los literales de CHECK/columnas están tomados de `pg_constraint`/`pg_attribute`
 * del proyecto real jgmgphmzusbluqhuqihj (2026-09-09, tras las migraciones
 * `crm_v4_f06_01..03`).
 */

jest.mock('@/lib/services/providerRegistry', () => ({
  getActiveProvider: jest.fn(async () => ({ credentials: {}, settings: {} })),
}));

const twilioCreate = jest.fn();
jest.mock('@/lib/services/integrations/twilio/twilioConfig', () => ({
  getMasterClient: () => ({ calls: { create: twilioCreate } }),
  getMasterPhoneNumber: () => '+15550000000',
  formatE164: (p: string) => (p.startsWith('+') ? p : `+57${p.replace(/\D/g, '')}`),
  getWebhookBaseUrl: () => 'https://app.example.com',
}));

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runCampaignQueue,
  isWithinCustomerHours,
  dispatchAgentCall,
  VoiceDispatchBlocked,
  startOfDayIso,
} from '@/lib/services/crm/voiceAgentService';
import {
  stageAgentAiCallListener,
  registerStageAgentAiCallListener,
  STAGE_AGENT_LISTENER_NAME,
} from '@/lib/services/crm/voiceAgent/stageAgentTrigger';
import { getCrmEventListeners } from '@/lib/jobs/dispatch/eventDispatcher';
import type { CrmEvent } from '@/lib/jobs/types';
import { issueWsSessionToken, verifyWsSessionToken } from '@/lib/security/wsSessionToken';
import { VOICE_AGENT_TOOLS } from '@/lib/services/integrations/twilio/voiceAgent/voiceAgentTools';
import { VOICE_AGENT_TOOL_DEFINITIONS, ALL_TOOL_NAMES } from '@/lib/services/crm/voiceAgentTools';

// ─── Esquema real (verificado por MCP contra jgmgphmzusbluqhuqihj) ────────────

const DB = {
  /** Ampliado por `crm_v4_f06_03_dispatcher_guardrails_and_claim`. */
  voiceAgentCallsStatus: [
    'pending', 'queued', 'in_progress', 'completed', 'failed',
    'transferred', 'no_answer', 'voicemail', 'canceled', 'skipped',
  ],
  voiceAgentsPurposeType: [
    'qualify_lead', 'confirm_demo', 'follow_up_proposal', 'reactivate_cold',
    'collect_payment', 'nps_survey', 'renewal_reminder', 'sell_product',
    'book_meeting', 'custom',
  ],
  campaignTargetSource: ['segment', 'pipeline_stage', 'manual_list', 'sequence_step', 'followup_due'],
  outboundJobKinds: [
    'email', 'whatsapp', 'sms', 'ai_call', 'sequence_step', 'automation', 'transcribe',
    'analyze', 'recording_fetch', 'recording_cleanup', 'campaign_batch', 'crm_event',
    'maintenance', 'noop',
    // Anadido por F8 (crm_v4_f08_01_engine_schema) e integrado en enums.ts y en
    // db-checks.json el 2026-09-09. Estaba ausente de esta copia y por eso A4
    // pasaba afirmando lo contrario de lo que dice la base (tester r4, N1).
    'time_events',
  ],
  callsColumns: [
    'id', 'organization_id', 'provider', 'provider_call_sid', 'parent_call_sid', 'direction',
    'mode', 'from_number', 'to_number', 'customer_id', 'opportunity_id', 'user_id',
    'voice_agent_id', 'status', 'answered_by', 'started_at', 'answered_at', 'ended_at',
    'duration_seconds', 'ring_seconds', 'recording_enabled', 'consent_given', 'cost_amount',
    'cost_currency', 'metadata', 'created_at', 'updated_at', 'bridge_mode', 'agent_leg_sid',
    'customer_leg_sid', 'duration_source',
  ],
  callsNotNull: ['organization_id', 'provider', 'direction', 'mode', 'from_number', 'to_number', 'status', 'started_at'],
  activitiesColumns: ['id', 'organization_id', 'activity_type', 'user_id', 'notes', 'related_type', 'related_id', 'occurred_at', 'metadata', 'channel', 'outcome', 'duration_seconds'],
  activityTypes: ['call', 'email', 'whatsapp', 'sms', 'meeting', 'visit', 'note', 'system', 'ai_call', 'task'],
  tasksRelatedColumn: 'related_to_id',
  /** Tablas creadas en la ronda 1 (antes ausentes). */
  createdTablesR1: ['voices', 'stage_agents', 'voice_agent_tool_runs'],
  /** Siguen sin existir y nadie las usa. */
  stillMissingTables: ['voice_agent_templates', 'do_not_call_list'],
  /** Columnas añadidas a voice_agents en la ronda 1. */
  voiceAgentColumnsAddedR1: ['identity_disclosure', 'voice_ref_id'],
  voiceAgentsColumns: [
    'id', 'organization_id', 'name', 'slug', 'description', 'engine', 'purpose_type',
    'system_prompt', 'first_message', 'voice_provider', 'voice_id', 'voice_settings',
    'language', 'stt_provider', 'llm_provider', 'llm_model', 'temperature', 'max_turns',
    'max_duration_seconds', 'allowed_tools', 'guardrails', 'transfer_to_human_rules',
    'business_hours', 'retry_policy', 'is_active', 'created_by', 'created_at', 'updated_at',
    'identity_disclosure', 'voice_ref_id',
  ],
  /** `customers.do_not_call` EXISTE desde `crm_v4_f06_01` (boolean NOT NULL DEFAULT false). */
  customersDoNotCall: true,
};

const SRC = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

// ─── Doble de Supabase encadenable ────────────────────────────────────────────

type Op = { table: string; verb: string; payload?: unknown; filters: Array<[string, string, unknown]>; select?: string; head?: boolean };
type RpcCall = { name: string; args: Record<string, unknown> };

interface Resolver {
  (op: Op): { data?: unknown; count?: number; error?: { message: string; code?: string } | null };
}
interface RpcResolver {
  (call: RpcCall): { data?: unknown; error?: { message: string; code?: string } | null };
}

function makeSupabase(resolve: Resolver, resolveRpc?: RpcResolver) {
  const ops: Op[] = [];
  const rpcs: RpcCall[] = [];
  /** Orden global de efectos, para comprobar QUÉ pasa antes de QUÉ. */
  const trace: string[] = [];

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
      select: (sel?: string, opts?: { head?: boolean }) => {
        op.select = sel;
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
        trace.push(`${verb}:${table}`);
        return op;
      };
      return {
        select: (sel?: string, opts?: { head?: boolean }) => {
          const op = push('select');
          return (builder(op) as { select: (s?: string, o?: unknown) => unknown }).select(sel, opts);
        },
        insert: (payload: unknown) => builder(push('insert', payload)),
        upsert: (payload: unknown) => builder(push('upsert', payload)),
        update: (payload: unknown) => builder(push('update', payload)),
        delete: () => builder(push('delete')),
      };
    },
    rpc: jest.fn(async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      trace.push(`rpc:${name}`);
      const r = resolveRpc ? resolveRpc({ name, args }) : {};
      return { data: r.data ?? null, error: r.error ?? null };
    }),
  } as unknown as SupabaseClient & { rpc: jest.Mock };

  return { client, ops, rpcs, trace };
}

/** Escenario base: 1 campaña 'running' con 1 llamada 'pending' lista para marcar. */
function scenario(
  overrides: Partial<{
    customerRow: unknown;
    customerError: { message: string; code?: string };
    canContact: boolean;
    credits: boolean;
    claimed: unknown[];
  }> = {}
) {
  const pending = {
    id: 'vac-1', organization_id: 7, voice_agent_id: 'agent-1', campaign_id: 'camp-1',
    customer_id: 'cust-1', opportunity_id: 'opp-1', status: 'in_progress', attempts: 1,
    scheduled_at: '2020-01-01T00:00:00.000Z',
  };
  const campaign = {
    id: 'camp-1', organization_id: 7, voice_agent_id: 'agent-1', name: 'C',
    target_source: 'pipeline_stage', target_config: { stage_id: 'st-1' },
    schedule: null, max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3,
    emergency_stop: false, consecutive_failures: 0, status: 'running', stats: {},
  };
  const resolver: Resolver = (op) => {
    if (op.table === 'voice_agent_campaigns' && op.verb === 'select') return { data: [campaign] };
    if (op.table === 'comm_settings') {
      return {
        data: {
          voice_recording_enabled: true,
          voice_consent_message: 'Esta llamada será grabada.',
          // r2: el despachador comprueba que el canal esté habilitado (F-NEW-11).
          voice_agent_enabled: true,
          is_active: true,
          voice_max_concurrent_calls: 3,
        },
      };
    }
    if (op.table === 'voice_agent_call_attempts' && op.head) return { count: 0 };
    if (op.table === 'voice_agent_calls' && op.head) return { count: 0 };
    if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: [] };
    if (op.table === 'voice_agents' && op.verb === 'select') return { data: { retry_policy: {}, is_active: true } };
    if (op.table === 'opportunities') return { data: [] };
    if (op.table === 'calls' && op.verb === 'insert') return { data: { id: 'call-uuid-0001' } };
    if (op.table === 'customers') {
      if (overrides.customerError) return { data: null, error: overrides.customerError };
      // El despachador ya NO selecciona `do_not_call`: la baja voluntaria pasa por fn_can_contact.
      return { data: overrides.customerRow ?? { id: 'cust-1', phone: '3001112233', timezone: 'America/Bogota' } };
    }
    return { data: null };
  };
  const rpcResolver: RpcResolver = ({ name }) => {
    if (name === 'fn_claim_voice_agent_calls') return { data: overrides.claimed ?? [pending] };
    if (name === 'fn_can_contact') return { data: overrides.canContact ?? true };
    if (name === 'deduct_comm_credits') return { data: overrides.credits ?? true };
    return { data: null };
  };
  return { resolver, rpcResolver, pending, campaign };
}

beforeEach(() => {
  twilioCreate.mockReset();
  twilioCreate.mockResolvedValue({ sid: 'CA00000000000000000000000000000001' });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A. Literales del código contra los CHECK reales
// ═══════════════════════════════════════════════════════════════════════════════

describe('A. Literales contra los CHECK reales de pg_constraint', () => {
  test('A1 [CORREGIDO r1] PurposeType ya no declara valores que el CHECK rechaza', () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    // Ahora el tipo se deriva de `VOICE_AGENT_PURPOSES` (src/lib/crm/enums.ts), que es
    // la única fuente sincronizada con el CHECK.
    expect(src).toContain('export type PurposeType = VoiceAgentPurpose;');
    expect(src).not.toMatch(/'follow_up'/);
    expect(src).not.toMatch(/\|\s*'survey'/);
    const enums = SRC('src/lib/crm/enums.ts');
    const block = enums.slice(enums.indexOf('export const VOICE_AGENT_PURPOSES'), enums.indexOf('export type VoiceAgentPurpose'));
    const declared = Array.from(block.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(declared.filter((v) => !DB.voiceAgentsPurposeType.includes(v))).toEqual([]);
  });

  test('A2 [CORREGIDO r1] los 10 propósitos del CHECK están disponibles, incluidos los dos que pidió el dueño', () => {
    const enums = SRC('src/lib/crm/enums.ts');
    const block = enums.slice(enums.indexOf('export const VOICE_AGENT_PURPOSES'), enums.indexOf('export type VoiceAgentPurpose'));
    const declared = Array.from(block.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(DB.voiceAgentsPurposeType.filter((v) => !declared.includes(v))).toEqual([]);
    expect(declared).toContain('sell_product');
    expect(declared).toContain('book_meeting');
    // Y el servicio los reexporta para la validación de la ruta POST.
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).toContain('export const PURPOSE_TYPES = VOICE_AGENT_PURPOSES;');
  });

  test('A3 [CORREGIDO r1] la máquina de estados del doc cabe en el CHECK ampliado (salvo "dialing")', () => {
    const docStates = ['queued', 'dialing', 'in_progress', 'completed', 'transferred', 'voicemail', 'no_answer', 'failed', 'canceled', 'skipped'];
    const rejected = docStates.filter((s) => !DB.voiceAgentCallsStatus.includes(s));
    // `crm_v4_f06_03` añadió queued|no_answer|voicemail|canceled|skipped.
    // 'dialing' se descarta a propósito: el tramo de marcación ya lo representa `calls.status`.
    expect(rejected).toEqual(['dialing']);
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    for (const s of ['queued', 'no_answer', 'voicemail', 'canceled', 'skipped']) {
      expect(svc).toContain(`| '${s}'`);
    }
  });

  // Corregido tras el tester r4 (N1): este caso era el unico de los 96 sin
  // artefacto real, y la base lo desmentia. Afirmaba que `time_events` NO estaba
  // en el CHECK y si esta desde que F8 lo anadio; pasaba solo porque la copia
  // local del enumerado estaba desfasada. Ahora la copia esta al dia y el caso
  // afirma lo unico que sigue siendo cierto: los tres kinds que F6 llego a
  // contemplar no existen en la base, asi que nadie debe encolarlos.
  test('A4 los kinds que F6 nunca llego a crear siguen fuera del CHECK real', () => {
    for (const k of ['agent_orchestration', 'ai_whatsapp', 'ai_draft_email']) {
      expect(DB.outboundJobKinds).not.toContain(k);
    }
    // Y el que si existe, existe: la copia local no puede volver a desfasarse en
    // silencio sin que este caso lo diga.
    expect(DB.outboundJobKinds).toContain('time_events');
  });

  test('A5 [CORREGIDO r1] buildCampaignTargets usa solo literales del CHECK e implementa 5 de 5', () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).not.toContain("'customer_list'");
    for (const s of DB.campaignTargetSource) {
      expect(src).toContain(`campaign.target_source === '${s}'`);
    }
    // La lista exportada coincide exactamente con el CHECK.
    const block = src.slice(src.indexOf('export const CAMPAIGN_TARGET_SOURCES'), src.indexOf('export interface VoiceAgentCampaign'));
    const declared = Array.from(block.matchAll(/'([a-z_]+)'/g)).map((m) => m[1]);
    expect(declared.sort()).toEqual([...DB.campaignTargetSource].sort());
  });

  test('A6 [CORREGIDO r1] voiceAgentTools usa activity_type válidos y columnas reales de activities', () => {
    const src = SRC('src/lib/services/crm/voiceAgentTools.ts');
    const used = Array.from(src.matchAll(/activity_type:\s*'([a-z_]+)'/g)).map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    expect(used.filter((t) => !DB.activityTypes.includes(t))).toEqual([]);
    expect(used).toContain('ai_call');
    // Ni `title` ni `description` se escriben en activities (no son columnas).
    expect(src).not.toMatch(/title:\s*`Etapa movida por agente IA`/);
    const insIdx = src.indexOf("from('activities').insert(");
    const insertBlock = src.slice(insIdx, src.indexOf('if (error)', insIdx));
    expect(insertBlock).not.toMatch(/^\s*title:/m);
    expect(insertBlock).not.toMatch(/^\s*description:/m);
    expect(insertBlock).toContain('notes:');
    expect(DB.activitiesColumns).not.toContain('title');
  });

  test('A7 [CORREGIDO r1] createTask escribe tasks.related_to_id y un status del CHECK', () => {
    const src = SRC('src/lib/services/crm/voiceAgentTools.ts');
    expect(src).toContain('related_to_id');
    expect(src).not.toMatch(/related_id:\s*data\.related_id/);
    const tasksIdx = src.indexOf('export async function createTask');
    const tasksInsert = src.slice(tasksIdx, src.indexOf(".select('id, title, status')", tasksIdx));
    expect(tasksInsert).toContain("status: 'open'");
    expect(tasksInsert).not.toContain("status: 'pending'");
    expect(DB.tasksRelatedColumn).toBe('related_to_id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Campaña ejecutada dos veces a la vez / topes de llamadas
// ═══════════════════════════════════════════════════════════════════════════════

describe('B. Concurrencia y topes del despachador de campañas', () => {
  test('B1 [CORREGIDO r1] dos ejecuciones simultáneas: solo una marca la fila (claim atómico)', async () => {
    const { resolver, rpcResolver, pending } = scenario();
    // El claim con FOR UPDATE SKIP LOCKED entrega la fila UNA sola vez.
    let entregada = false;
    const claimOnce: RpcResolver = (call) => {
      if (call.name === 'fn_claim_voice_agent_calls') {
        if (entregada) return { data: [] };
        entregada = true;
        return { data: [pending] };
      }
      return rpcResolver(call);
    };
    const a = makeSupabase(resolver, claimOnce);
    const b = makeSupabase(resolver, claimOnce);
    const [ra, rb] = await Promise.all([
      runCampaignQueue(7, a.client),
      runCampaignQueue(7, b.client),
    ]);
    expect(ra.calls_initiated + rb.calls_initiated).toBe(1);
    // Una sola marcación real: el mismo cliente NO recibe dos llamadas simultáneas.
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    expect(twilioCreate.mock.calls[0][0].url).toContain('callId=vac-1');
  });

  test('B2 [CORREGIDO r1] la fila se RESERVA antes de marcar (fn_claim_voice_agent_calls precede a Twilio)', async () => {
    const { resolver, rpcResolver } = scenario();
    const { client, rpcs, trace } = makeSupabase(resolver, rpcResolver);
    await runCampaignQueue(7, client);
    expect(rpcs.map((r) => r.name)).toContain('fn_claim_voice_agent_calls');
    const claim = rpcs.find((r) => r.name === 'fn_claim_voice_agent_calls');
    expect(claim!.args).toMatchObject({ p_org: 7, p_campaign: 'camp-1' });
    // El claim ocurre antes de cualquier escritura de la llamada.
    const idxClaim = trace.indexOf('rpc:fn_claim_voice_agent_calls');
    const idxInsertCall = trace.indexOf('insert:calls');
    expect(idxClaim).toBeGreaterThanOrEqual(0);
    expect(idxClaim).toBeLessThan(idxInsertCall);
    // Y la RPC hace el UPDATE condicional en la base (SQL verificado en la migración).
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(svc).toContain('fn_claim_voice_agent_calls');
  });

  test('B3 [CORREGIDO r1] el encolado de targets tiene tope: 500 objetivos no producen 500 filas', async () => {
    const targets = Array.from({ length: 500 }, (_, i) => ({
      id: `opp-${i}`, customer_id: `cust-${i}`, stage_id: 'st-1',
    }));
    const resolver: Resolver = (op) => {
      if (op.table === 'voice_agent_campaigns' && op.verb === 'select') {
        return { data: [{ id: 'camp-1', organization_id: 7, voice_agent_id: 'a', target_source: 'pipeline_stage', target_config: { stage_id: 'st-1' }, schedule: null, max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3, emergency_stop: false, consecutive_failures: 0, status: 'running' }] };
      }
      if (op.table === 'comm_settings') return { data: { voice_recording_enabled: true, voice_agent_enabled: true, is_active: true } };
      if (op.table === 'voice_agent_call_attempts' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: [] };
      if (op.table === 'opportunities') {
        // `limit` acota en la propia consulta: se respeta el límite pedido.
        const lim = op.filters.find(([f]) => f === 'limit')?.[1] as number | undefined;
        return { data: targets.slice(0, lim ?? targets.length) };
      }
      if (op.table === 'voice_agents' && op.verb === 'select') return { data: { retry_policy: {}, is_active: true } };
      if (op.table === 'stage_agents') return { data: null };
      return { data: null };
    };
    const { client, ops } = makeSupabase(resolver, scenario().rpcResolver);
    await runCampaignQueue(7, client);
    const inserts = ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'insert');
    // Un solo insert por lote y como mucho la cuota diaria (50), nunca 500 filas.
    const filas = inserts.reduce(
      (n, o) => n + (Array.isArray(o.payload) ? (o.payload as unknown[]).length : 1),
      0
    );
    expect(filas).toBeLessThanOrEqual(50);
    expect(filas).toBeGreaterThan(0);
  });

  test('B4 [CORREGIDO r2] el tope cuenta el LIBRO de intentos, no `claimed_at` (que el reintento anula)', () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    const block = src.slice(src.indexOf('async function countAttempts'), src.indexOf('/** Intentos de un agente'));
    // r2: se cuenta contra `voice_agent_call_attempts`, una fila inmutable por reserva.
    expect(block).toContain("from('voice_agent_call_attempts')");
    expect(block).toContain(".gte('attempted_at', sinceIso)");
    // Ya NO se cuenta por claimed_at: el reintento y la franja horaria lo ponen a null.
    expect(block).not.toContain('claimed_at');
    // Ya no hay lista blanca de estados: una llamada fallida también consume cuota.
    expect(block).not.toContain("['completed', 'in_progress', 'transferred']");
    // Y la reserva (que escribe en el libro) ocurre ANTES de marcar.
    expect(src).toContain('fn_claim_voice_agent_calls');
    // Los dos caminos que anulan `claimed_at` siguen existiendo: por eso el conteo
    // no puede depender de esa columna.
    expect(src).toContain('claimed_at: null');
    // El dia del tope es el de la organizacion, no UTC (F-NEW-12).
    expect(src).toContain('export function startOfDayIso');
    expect(src).not.toContain('setUTCHours(0, 0, 0, 0)');
  });

  test('B5 [CORREGIDO r2] el tope de 50/dia se cumple aunque TODO falle y se reintente (el doble ya no lleva su propio contador)', async () => {
    // Mismo escenario del tester: 3 pendientes, Twilio rechaza las 3, con
    // `retry_policy.max_attempts = 5`, que es el caso que multiplicaba el tope por 5.
    //
    // Diferencia clave con la ronda 1: el doble NO decide cuantas filas puede
    // entregar. Modela la semantica REAL de la base (la RPC de reserva escribe una
    // fila en `voice_agent_call_attempts` por cada llamada reclamada, y el reintento
    // del servicio pone `claimed_at` a null) y deja que el tope lo imponga el
    // servicio. Con el conteo por `claimed_at` de la ronda 1 este caso se pone ROJO.
    twilioCreate.mockRejectedValue(new Error('21211 invalid To number'));
    const pendings = Array.from({ length: 3 }, (_, i) => ({
      id: `vac-${i}`, organization_id: 7, voice_agent_id: 'agent-1', campaign_id: 'camp-1',
      customer_id: `cust-${i}`, opportunity_id: null, status: 'in_progress', attempts: 1,
      scheduled_at: '2020-01-01T00:00:00.000Z',
    }));
    /** Libro de intentos real: una fila por reserva, jamas se borra. */
    const ledger: Array<{ call: string }> = [];
    /** Marca `claimed_at` por fila, tal y como la escribe/anula la base. */
    const claimedAt = new Map<string, string | null>();

    const resolver: Resolver = (op) => {
      if (op.table === 'voice_agent_campaigns' && op.verb === 'select') {
        return { data: [{ id: 'camp-1', organization_id: 7, voice_agent_id: 'agent-1', target_source: 'pipeline_stage', target_config: { stage_id: 's' }, schedule: null, max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3, emergency_stop: false, consecutive_failures: 0, status: 'running' }] };
      }
      if (op.table === 'comm_settings') {
        return { data: { voice_recording_enabled: true, voice_agent_enabled: true, is_active: true } };
      }
      // El conteo de intentos: el libro entero (todas las filas son de hoy).
      if (op.table === 'voice_agent_call_attempts' && op.head) return { count: ledger.length };
      // El conteo por `claimed_at`, que es lo que hacia la ronda 1: solo refleja
      // el ULTIMO intento de cada fila, y los reintentos lo ponen a null.
      if (op.table === 'voice_agent_calls' && op.head) {
        const porClaimedAt = op.filters.some(([f, c]) => f === 'gte' && c === 'claimed_at');
        if (porClaimedAt) return { count: [...claimedAt.values()].filter(Boolean).length };
        return { count: 0 };
      }
      if (op.table === 'voice_agent_calls' && op.verb === 'update') {
        // El servicio reprograma poniendo `claimed_at: null` (esto es lo que
        // borraba el intento del conteo en la ronda 1).
        const payload = (op.payload ?? {}) as Record<string, unknown>;
        if ('claimed_at' in payload && payload.claimed_at === null) {
          const id = op.filters.find(([f, c]) => f === 'eq' && c === 'id')?.[2] as string | undefined;
          if (id) claimedAt.set(id, null);
        }
        return { data: null };
      }
      if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: [] };
      if (op.table === 'voice_agents' && op.verb === 'select') {
        return { data: { retry_policy: { max_attempts: 5, backoff_minutes: 5 }, is_active: true } };
      }
      if (op.table === 'calls' && op.verb === 'insert') return { data: { id: 'call-uuid-0001' } };
      if (op.table === 'customers') return { data: { id: 'c', phone: '3001112233', timezone: 'America/Bogota' } };
      if (op.table === 'opportunities') return { data: [] };
      return { data: null };
    };

    const rpc: RpcResolver = ({ name, args }) => {
      if (name === 'fn_claim_voice_agent_calls') {
        // La RPC real entrega hasta `p_limit` filas y ESCRIBE una fila en el libro
        // por cada una. No conoce ningun tope: ese lo aplica el servicio.
        const limite = Math.max(0, Number(args.p_limit) || 0);
        const lote = pendings.slice(0, Math.min(pendings.length, limite));
        for (const pend of lote) {
          ledger.push({ call: pend.id });
          claimedAt.set(pend.id, new Date().toISOString());
        }
        return { data: lote };
      }
      if (name === 'fn_can_contact') return { data: true };
      if (name === 'deduct_comm_credits') return { data: true };
      return { data: null };
    };
    const { client } = makeSupabase(resolver, rpc);

    // 1440 ejecuciones = un dia entero con el cron cada minuto.
    for (let i = 0; i < 1440 && ledger.length < 200; i++) {
      await runCampaignQueue(7, client);
    }

    // El tope declarado (50/dia) se cumple sobre las marcaciones REALES.
    expect(ledger.length).toBeLessThanOrEqual(50);
    expect(twilioCreate.mock.calls.length).toBeLessThanOrEqual(50);
    // Y hubo trabajo de verdad: no pasa por vacio.
    expect(twilioCreate.mock.calls.length).toBeGreaterThan(0);
    // La prueba de que el defecto era real: contando por `claimed_at` solo se verian
    // 3 de las ~50 marcaciones, porque los reintentos lo anulan.
    expect([...claimedAt.values()].filter(Boolean).length).toBeLessThan(ledger.length);
  });

  test('B6 [NUEVO r1] segunda barrera: tope por hora y parada de emergencia, independientes del conteo diario', async () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).toContain('max_calls_per_hour');
    expect(src).toContain('oneHourAgoIso');
    expect(src).toContain('emergency_stop');
    expect(src).toContain('fn_stop_voice_campaign');

    // Con emergency_stop la campaña no marca aunque status siga 'running'.
    const { rpcResolver } = scenario();
    const resolver: Resolver = (op) => {
      if (op.table === 'voice_agent_campaigns' && op.verb === 'select') {
        // El propio SELECT ya filtra emergency_stop=false: la campaña detenida no vuelve.
        const filtra = op.filters.some(([f, c, v]) => f === 'eq' && c === 'emergency_stop' && v === false);
        expect(filtra).toBe(true);
        return { data: [] };
      }
      return { data: null };
    };
    const { client } = makeSupabase(resolver, rpcResolver);
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('B7 [NUEVO r1] racha de fallos consecutivos detiene la campaña sola', () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).toContain('export const FAILURE_STREAK_TO_STOP = 5;');
    expect(src).toMatch(/streak >= FAILURE_STREAK_TO_STOP[\s\S]{0,300}stopCampaign\(/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Créditos: cobro, reembolso y libros
// ═══════════════════════════════════════════════════════════════════════════════

describe('C. Créditos y coste', () => {
  test('C1 [CORREGIDO r1] el despachador debita créditos ANTES de llamar al proveedor', async () => {
    const { resolver, rpcResolver } = scenario();
    const { client, trace, rpcs } = makeSupabase(resolver, rpcResolver);
    await runCampaignQueue(7, client);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    const debito = rpcs.find((r) => r.name === 'deduct_comm_credits');
    expect(debito).toBeDefined();
    expect(debito!.args).toMatchObject({ p_org_id: 7, p_channel: 'voice', p_amount: 1 });
    // Orden: la reserva de crédito precede a la fila en `calls` y, por tanto, a Twilio.
    expect(trace.indexOf('rpc:deduct_comm_credits')).toBeLessThan(trace.indexOf('insert:calls'));
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).toContain('deduct_comm_credits');
    expect(src).toContain('refundVoiceCredits');
  });

  test('C2 [CORREGIDO r1] sin créditos la llamada NO se marca (fail-closed)', async () => {
    const { resolver, rpcResolver } = scenario({ credits: false });
    const { client, ops } = makeSupabase(resolver, rpcResolver);
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
    const upd = ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'update').at(-1);
    expect((upd!.payload as Record<string, unknown>).error_message).toBe('Sin minutos de voz disponibles');
    // `hasAICredits` (que fallaba abierto sobre un libro que nadie debitaba) ya no existe.
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).not.toContain('if (!data) return true; // Si no hay config, permitir');
    expect(src).not.toContain('hasAICredits');
  });

  test('C3 [CORREGIDO r1] el libro que se consulta es el mismo que se debita (comm_settings vía RPC atómico)', () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(src).not.toContain("from('ai_settings')");
    expect(src).toContain("supabase.rpc('deduct_comm_credits'");
    // Y el error de la RPC bloquea, no permite.
    expect(src).toMatch(/deduct_comm_credits[\s\S]{0,400}return false; \/\/ fail-closed/);
  });

  test('C4 [CORREGIDO r2] la reserva se CONCILIA al colgar: 30 s no cuestan 2 creditos', () => {
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(svc).toContain('CREDITS_RESERVED_PER_CALL');           // reserva antes del proveedor
    // La reserva queda anotada en la fila para poder restarla despues.
    expect(svc).toContain('credits_reserved: CREDITS_RESERVED_PER_CALL');

    const src = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    expect(src).toContain('deduct_comm_credits');
    // r2: al colgar se cobra SOLO la diferencia, no los minutos completos encima.
    expect(src).toContain('const creditsToCharge = Math.max(0, duration - alreadyReserved);');
    expect(src).toContain('p_amount: creditsToCharge');
    expect(src).not.toMatch(/p_amount: duration,/);
    // Y una sola vez: un cierre duplicado no vuelve a cobrar.
    expect(src).toContain('credits_settled_at');
    const endIdx = src.indexOf('async function endSession');
    expect(src.indexOf('creditsToCharge')).toBeGreaterThan(endIdx);

    // Si la llamada no llega a hablar (nadie contesta / falla), la reserva se devuelve.
    const status = SRC('src/app/api/voice/ai-agent/status/route.ts');
    expect(status).toContain('NO_CONVERSATION');
    expect(status).toContain('p_amount: -reserved');
  });

  test('C5 [CORREGIDO r1] el camino de la voz clonada existe: catálogo, ttsProvider y voice en el TwiML', () => {
    const twiml = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(twiml).toContain("attr('ttsProvider'");
    expect(twiml).toContain("attr('voice'");
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain("from('voices')");
    expect(runtime).toContain("'ElevenLabs'");
    expect(runtime).toContain('crVoiceModelSuffix');
    // Y hay cliente REST del proveedor con la credencial correcta.
    const client = SRC('src/lib/services/integrations/elevenlabs/voiceCloneClient.ts');
    expect(client).toContain('api.elevenlabs.io');
    expect(client).toContain('xi-api-key');
    expect(client).toContain('/voices/add');
    // Honestidad: el archivo declara que no se pudo verificar en vivo (clave placeholder).
    expect(client).toContain('NO VERIFICADO');
    expect(DB.createdTablesR1).toContain('voices');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Llamada que falla a mitad / webhook fuera de orden
// ═══════════════════════════════════════════════════════════════════════════════

describe('D. Fallos a mitad de llamada y estado', () => {
  test('D1 [CORREGIDO r1] el insert en `calls` usa columnas reales y cubre los 8 NOT NULL', async () => {
    const { resolver, rpcResolver } = scenario();
    const { client, ops } = makeSupabase(resolver, rpcResolver);
    await runCampaignQueue(7, client);
    const ins = ops.find((o) => o.table === 'calls' && o.verb === 'insert');
    expect(ins).toBeDefined();
    const row = ins!.payload as Record<string, unknown>;
    expect(Object.keys(row)).not.toContain('phone_number');
    for (const col of Object.keys(row)) expect(DB.callsColumns).toContain(col);
    expect(DB.callsNotNull.filter((c) => !(c in row))).toEqual([]);
    expect(row.mode).toBe('ai_agent');
    expect(row.provider).toBe('twilio');
    expect(row.direction).toBe('outbound');
  });

  test('D2 [CORREGIDO r1] voice_agent_calls.call_id recibe el UUID de calls; el CallSid va en provider_call_sid', async () => {
    const { resolver, rpcResolver } = scenario();
    const { client, ops } = makeSupabase(resolver, rpcResolver);
    await runCampaignQueue(7, client);
    const updates = ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'update');
    const link = updates.find((o) => 'call_id' in (o.payload as Record<string, unknown>));
    expect((link!.payload as Record<string, unknown>).call_id).toBe('call-uuid-0001');
    const correlate = updates.find((o) => 'provider_call_sid' in (o.payload as Record<string, unknown>));
    expect((correlate!.payload as Record<string, unknown>).provider_call_sid).toBe('CA00000000000000000000000000000001');
    // Ningún UPDATE mete un CallSid en la columna uuid.
    for (const u of updates) {
      const p = u.payload as Record<string, unknown>;
      if (p.call_id) expect(String(p.call_id)).not.toMatch(/^CA[0-9a-f]{32}$/);
    }
  });

  test('D3 [CORREGIDO r1] fallo de Twilio a mitad: reembolso, retry_policy leída y reintento programado', async () => {
    twilioCreate.mockRejectedValueOnce(new Error('21610 unsubscribed recipient'));
    const { resolver, rpcResolver } = scenario();
    const withRetry: Resolver = (op) => {
      if (op.table === 'voice_agents' && op.verb === 'select') {
        return { data: { retry_policy: { max_attempts: 3, backoff_minutes: 30 }, is_active: true } };
      }
      return resolver(op);
    };
    const { client, ops, rpcs } = makeSupabase(withRetry, rpcResolver);
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(r.calls_skipped).toBe(1);

    // Reembolso del crédito reservado.
    const refunds = rpcs.filter((c) => c.name === 'deduct_comm_credits' && (c.args.p_amount as number) < 0);
    expect(refunds).toHaveLength(1);

    // El despachador SÍ lee retry_policy del agente y reprograma en vez de dar la fila por muerta.
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    const dispatcher = svc.slice(svc.indexOf('export async function runCampaignQueue'));
    expect(dispatcher).toContain('getRetryPolicy');
    expect(svc).toMatch(/getRetryPolicy[\s\S]{0,400}from\('voice_agents'\)[\s\S]{0,120}retry_policy/);
    const upd = ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'update').at(-1)!;
    expect((upd.payload as Record<string, unknown>).status).toBe('pending');
    expect((upd.payload as Record<string, unknown>).scheduled_at).toBeDefined();
    // Y la fila en `calls` queda como fallida, no colgada en 'dialing'.
    const callFail = ops.filter((o) => o.table === 'calls' && o.verb === 'update').at(-1)!;
    expect((callFail.payload as Record<string, unknown>).status).toBe('failed');
  });

  test('D4 [CORREGIDO r1] el status callback apunta a una ruta que SÍ escribe', async () => {
    const { resolver, rpcResolver } = scenario();
    const { client } = makeSupabase(resolver, rpcResolver);
    await runCampaignQueue(7, client);
    const cb = twilioCreate.mock.calls[0][0].statusCallback as string;
    expect(cb).toContain('/api/voice/ai-agent/status?callId=');
    expect(cb).not.toContain('/api/voice/bridge/status');
    const route = SRC('src/app/api/voice/ai-agent/status/route.ts');
    expect(route).toContain("from('voice_agent_calls')");
    expect(route).toContain("from('calls')");
    expect(route).toContain('verifyTwilioWebhook');
    expect(route).toContain('mapTwilioCallStatus');
  });

  test('D5 [CORREGIDO r1] webhook duplicado: started_at no se reescribe y el CallSid se comprueba', () => {
    const src = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(src).toContain('provider_call_sid');
    expect(src).toContain('if (!row.started_at) patch.started_at');
    expect(src).toMatch(/row\.provider_call_sid === callSid/);
  });

  test('D6 [CORREGIDO r1] el CallSid se correlaciona con voice_agent_calls', () => {
    const route = SRC('src/app/api/voice/ai-agent/status/route.ts');
    expect(route).toContain("query.eq('provider_call_sid', callSid)");
    // La org sale de la fila persistida, nunca del cuerpo del webhook.
    expect(route).toContain('vac.organization_id');
    expect(route).not.toMatch(/params\.(OrganizationId|orgId)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Multi-tenant, firma y consentimiento
// ═══════════════════════════════════════════════════════════════════════════════

describe('E. Multi-tenant, firma y consentimiento', () => {
  test('E1 PASA: /voice/twiml/ai-agent verifica firma SIEMPRE (sin rama que la salte)', () => {
    const src = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(src).toContain('await verifyTwilioWebhook(request)');
    expect(src).not.toMatch(/if \(!process\.env\.TWILIO[A-Z_]*\)[\s\S]{0,120}return/);
    const bodyIdx = src.indexOf('export async function POST');
    expect(src.indexOf('verifyTwilioWebhook', bodyIdx)).toBeLessThan(src.indexOf('getServiceClient()', bodyIdx));
  });

  test('E2 PASA: la org sale de la fila voice_agents y el UPDATE se filtra por org + agente', () => {
    const src = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(src).toContain('const agentOrgId = config.orgId;');
    expect(src).toMatch(/\.eq\('id', callId\)[\s\S]{0,160}\.eq\('organization_id', agentOrgId\)[\s\S]{0,160}\.eq\('voice_agent_id', agentId\)/);
    expect(src).not.toMatch(/is_active.*limit\(1\)/);           // sin fallback "primera org activa"
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('const orgId = agent.organization_id;');
  });

  test('E3 PASA: un callId de OTRA org no se puede mover — el filtro por org lo impide', async () => {
    const { client, ops } = makeSupabase(() => ({ data: [] }));
    await client.from('voice_agent_calls').update({ status: 'in_progress' })
      .eq('id', 'vac-de-otra-org').eq('organization_id', 7).eq('voice_agent_id', 'agent-1');
    const f = ops[0].filters.map(([, c]) => c);
    expect(f).toEqual(['id', 'organization_id', 'voice_agent_id']);
  });

  test('E4 PASA: /voice/twiml/agent-leg verifica firma antes de tocar la BD', () => {
    const src = SRC('src/app/api/voice/twiml/agent-leg/route.ts');
    const post = src.indexOf('export async function POST');
    expect(src.indexOf('verifyTwilioWebhook', post)).toBeGreaterThan(post);
    expect(src.indexOf('verifyTwilioWebhook', post)).toBeLessThan(src.indexOf('getServiceClient()', post));
    expect(src).toMatch(/\.eq\('organization_id', orgId\)/);
  });

  test('E5 [CORREGIDO r1] la llamada del agente IA graba en dual y anuncia el consentimiento', async () => {
    const { resolver, rpcResolver } = scenario();
    const { client } = makeSupabase(resolver, rpcResolver);
    await runCampaignQueue(7, client);
    const args = twilioCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(args.record).toBe(true);
    expect(args.recordingChannels).toBe('dual');
    const twiml = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(twiml).toContain('config.consentMessage');
    expect(twiml).toContain("from('call_consents')");
    expect(twiml).toMatch(/<Say voice="\$\{CONSENT_VOICE\}"/);
    // El aviso no depende de una preferencia del agente: solo de si hay grabación.
    expect(twiml).toContain('config.recordingEnabled');
  });

  test('E6 [CORREGIDO r1] la baja voluntaria existe y se respeta en el camino de marcación', () => {
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(svc).toContain('fn_can_contact');
    expect(svc).toContain('canCallCustomer');
    const tools = SRC('src/lib/services/crm/voiceAgentTools.ts');
    expect(tools).toContain('fn_log_consent_opt_out');
    expect(tools).toContain('log_consent_opt_out');
    expect(ALL_TOOL_NAMES).toContain('log_consent_opt_out');
  });

  test('E7 [CORREGIDO r1] la comprobación de "no llamar" es fail-CLOSED y no usa la tabla inexistente', async () => {
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(svc).not.toContain('do_not_call_list');
    expect(svc).not.toContain('return !!data;');
    // Si la RPC falla, NO se marca.
    expect(svc).toMatch(/fn_can_contact[\s\S]{0,400}se bloquea la llamada[\s\S]{0,80}return false;/);

    // Y con la RPC devolviendo false, la llamada se salta.
    const { resolver, rpcResolver } = scenario({ canContact: false });
    const { client, ops } = makeSupabase(resolver, rpcResolver);
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
    const upd = ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'update').at(-1)!;
    expect(String((upd.payload as Record<string, unknown>).error_message)).toContain('do_not_call');
  });

  test('E8 [CORREGIDO r1] los guardarraíles obligatorios se inyectan siempre, por delante del prompt de la org', () => {
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('DEFAULT_IDENTITY_DISCLOSURE');
    expect(runtime).toContain('mandatoryGuardrails');
    expect(runtime).toMatch(/asistente virtual/i);
    // Los guardarraíles van primero; el prompt de la organización, después.
    const build = runtime.slice(runtime.indexOf('export function buildSystemPrompt'));
    expect(build.indexOf('mandatoryGuardrails')).toBeLessThan(build.indexOf('INSTRUCCIONES DE LA ORGANIZACIÓN'));
    expect(DB.voiceAgentColumnsAddedR1).toContain('identity_disclosure');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. La configuración por etapa/agente SÍ llega a la llamada
// ═══════════════════════════════════════════════════════════════════════════════

describe('F. La configuración del agente alcanza el comportamiento de la llamada', () => {
  test('F1 [CORREGIDO r1] el runtime lee TODAS las columnas del agente', () => {
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toMatch(/from\('voice_agents'\)\s*\n?\s*\.select\('\*'\)/);
    // Y todas las que el tester echaba en falta se usan de verdad.
    for (const col of ['system_prompt', 'voice_id', 'voice_provider', 'llm_model', 'temperature',
      'max_turns', 'max_duration_seconds', 'allowed_tools', 'guardrails',
      'transfer_to_human_rules', 'purpose_type', 'identity_disclosure', 'voice_ref_id']) {
      expect(runtime).toContain(col);
    }
    const twiml = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(twiml).toContain('buildRuntimeConfig');
  });

  test('F2 [CORREGIDO r1] <ConversationRelay> sale con ttsProvider/voice/welcomeGreeting/transcriptionProvider', () => {
    const src = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    const attrs = src.slice(src.indexOf('const relayAttrs ='), src.indexOf('const twiml ='));
    for (const a of ['ttsProvider', 'voice', 'welcomeGreeting', 'transcriptionProvider', 'speechModel', 'interruptible', 'dtmfDetection']) {
      expect(attrs).toContain(`'${a}'`);
    }
    // El saludo sale del first_message del agente, resuelto en el runtime.
    expect(src).toContain('config.greeting');
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('firstMessage: agent.first_message');
  });

  test('F3 [CORREGIDO r1] el ws-server usa el agente del CRM y deja de ser un recepcionista de hotel', () => {
    const h = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    expect(h).toContain('buildRuntimeConfig');
    expect(h).toMatch(/claims\.agentId \|\| message\.customParameters\?\.agentId/);
    expect(h).toContain('runtime.systemPrompt');
    expect(h).toContain('runtime.greeting');
    // El prompt de hotel queda SOLO como respaldo del flujo entrante genérico (sin agentId).
    const setup = h.slice(h.indexOf('async function handleSetup'), h.indexOf('async function handlePrompt'));
    expect(setup).toMatch(/if \(runtime\)/);
    expect(setup).toMatch(/} else \{[\s\S]{0,200}buildVoiceAgentPrompt/);
  });

  test('F4 [CORREGIDO r1] el catálogo del CRM tiene las acciones que pidió el dueño y la forma correcta de API', () => {
    // Las tools de hotel siguen existiendo para el flujo entrante genérico.
    const names = VOICE_AGENT_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual(['cancel_reservation', 'check_availability', 'create_reservation', 'get_business_info', 'lookup_reservation', 'take_message', 'transfer_to_agent']);

    // M-F6-29: forma anidada `{type:'function', function:{…}}` que exige chat.completions.
    for (const t of VOICE_AGENT_TOOL_DEFINITIONS) {
      expect(t).toHaveProperty('function');
      expect(typeof (t as { function: { name: string } }).function.name).toBe('string');
    }
    // Todas las acciones que el dueño pidió existen.
    for (const t of ['book_meeting', 'send_payment_link', 'log_objection', 'schedule_callback',
      'end_call', 'log_consent_opt_out', 'update_opportunity_field']) {
      expect(ALL_TOOL_NAMES).toContain(t);
    }
    // Y el handler las importa de verdad (antes tenían cero importadores).
    const h = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    expect(h).toContain("from '@/lib/services/crm/voiceAgentTools'");
    expect(h).toContain('executeCrmTool');
  });

  test('F5 [CORREGIDO r1] (C-13) el historial de tool-calls ya es válido para OpenAI', () => {
    const h = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    // El assistant que precede a los role:'tool' lleva SUS tool_calls.
    expect(h).toMatch(/session\.messages\.push\(\{\s*role: 'assistant',\s*content: '',\s*tool_calls:/);
    // Y el mapeo a OpenAI los conserva.
    const map = h.slice(h.indexOf('function mapToOpenAIMessages'), h.indexOf('// ─── OpenAI Client'));
    expect(map).toContain('tool_calls: m.tool_calls');
    // La interfaz ya declara el campo.
    const iface = h.slice(h.indexOf('interface ConversationMessage'), h.indexOf('export interface ConversationRelaySession'));
    expect(iface).toContain('tool_calls');
  });

  test('F6 [CORREGIDO r1] modelo, temperatura y límites salen del agente, no de constantes', () => {
    const h = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    expect(h).toContain('session.runtime?.model');
    expect(h).toContain('session.runtime?.temperature');
    expect(h).toContain('maxTurns');
    expect(h).toContain('maxDurationSeconds');
    // Ya no hay dos `gpt-4o` fijos sin alternativa del agente.
    expect((h.match(/model: process\.env\.OPENAI_CHAT_MODEL \|\| 'gpt-4o'/g) || []).length).toBe(0);
  });

  test('F7 [CORREGIDO r1] la configuración por ETAPA existe en las tres capas', () => {
    const roots = ['src/lib/services/crm', 'src/app/api/crm', 'src/components/crm'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      const abs = path.join(process.cwd(), dir);
      if (!fs.existsSync(abs)) return;
      for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(rel); }
        else if (/\.tsx?$/.test(e.name) && SRC(rel).includes('stage_agents')) hits.push(rel);
      }
    };
    roots.forEach(walk);
    // Servicio + ruta de API, como mínimo.
    expect(hits).toEqual(expect.arrayContaining([
      'src/lib/services/crm/stageAgentService.ts',
      'src/lib/services/crm/voiceAgentService.ts',
      'src/components/crm/pipeline/StageAgentTab.tsx',
    ]));
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/api/crm/stage-agents/route.ts'))).toBe(true);
    expect(DB.createdTablesR1).toContain('stage_agents');

    // r2 (F-NEW-3): no basta con que un archivo CONTENGA el nombre de la pestaña.
    // El diálogo que la monta tiene que abrirse de verdad desde el tablero.
    const dlg = SRC('src/components/crm/pipeline/StageDialog.tsx');
    expect(dlg).toContain('StageAgentTab');
    expect(dlg.toLowerCase()).toContain('agente ia');
    // Y ese diálogo lo monta el tablero pasándole la etapa que se está editando,
    // desde el engranaje «Configurar etapa» de la columna.
    const board = SRC('src/components/crm/pipeline/KanbanBoardV2.tsx');
    expect(board).toContain("from './StageDialog'");
    expect(board).toMatch(/<StageDialog[\s\S]*?stageId=\{stageDialog\.stage\?\.id\}/);
    const column = SRC('src/components/crm/pipeline/KanbanColumnV2.tsx');
    expect(column).toContain('Configurar etapa');
    expect(column).toContain('onEditStage(stage)');
    // El tablero es el que se pinta en el pipeline (no es código muerto).
    const pipelineView = SRC('src/components/crm/pipeline/PipelineView.tsx');
    expect(pipelineView).toContain('KanbanBoardV2');

    const tab = SRC('src/components/crm/pipeline/StageAgentTab.tsx');
    expect(tab).toContain('/api/crm/stage-agents');
    expect(tab).toContain('sell_product');

    // r3 (R3-8): la pestaña se monta en UN solo diálogo. Estaba también en el
    // huérfano `StageConfigDialog`, y dos montajes son dos fuentes de verdad.
    const montajes: string[] = [];
    for (const e of fs.readdirSync(path.join(process.cwd(), 'src/components/crm/pipeline'), { withFileTypes: true })) {
      if (!e.isFile() || !/\.tsx$/.test(e.name) || e.name === 'StageAgentTab.tsx') continue;
      if (/<StageAgentTab\b/.test(SRC(`src/components/crm/pipeline/${e.name}`))) montajes.push(e.name);
    }
    expect(montajes).toEqual(['StageDialog.tsx']);

    // Y llega al comportamiento REAL de la llamada.
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('resolveStageAgentContext');
    expect(runtime).toContain('OBJETIVO DE ESTA LLAMADA');
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(svc).toContain('stage_agent_id');
  });

  test('F8 [CORREGIDO r1 · parcial] la UI de agentes IA existe; la entrada del menú queda pendiente', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/app/crm/agentes-ia/page.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(process.cwd(), 'src/components/crm/agentes/AgentesIaPage.tsx'))).toBe(true);
    // `src/config/crmNav.ts` es archivo COMPARTIDO: el builder no puede tocarlo.
    // La activación (`enabled: true`) queda declarada como integración pendiente.
    const nav = SRC('src/config/crmNav.ts');
    expect(nav).toMatch(/key: 'agentes-ia'[\s\S]{0,600}enabled: true/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Token de sesión ws y entorno
// ═══════════════════════════════════════════════════════════════════════════════

describe('G. Token de sesión del ws-server', () => {
  const orig = process.env.WS_SESSION_SECRET;
  afterEach(() => {
    if (orig === undefined) delete process.env.WS_SESSION_SECRET;
    else process.env.WS_SESSION_SECRET = orig;
  });

  test('G1 PASA: con secreto, el token va firmado, expira y valida la org', () => {
    process.env.WS_SESSION_SECRET = 'secreto-de-prueba';
    const t = issueWsSessionToken({ orgId: 7, agentId: 'a', callId: 'c', callSid: 'CA1' });
    expect(verifyWsSessionToken(t)?.orgId).toBe(7);
    const [p, s] = t.split('.');
    expect(verifyWsSessionToken(`${p}.${s.slice(0, -1)}x`)).toBeNull();
    const forged = Buffer.from(JSON.stringify({ orgId: 99, exp: 2e9 })).toString('base64url');
    expect(verifyWsSessionToken(`${forged}.${s}`)).toBeNull();
    expect(verifyWsSessionToken(null)).toBeNull();
  });

  test('G2 PASA: token caducado se rechaza', () => {
    process.env.WS_SESSION_SECRET = 'secreto-de-prueba';
    const t = issueWsSessionToken({ orgId: 7 }, -1);
    expect(verifyWsSessionToken(t)).toBeNull();
  });

  test('G3 [CORREGIDO r1] sin WS_SESSION_SECRET el TwiML lo detecta antes y lo dice con claridad', () => {
    delete process.env.WS_SESSION_SECRET;
    expect(() => issueWsSessionToken({ orgId: 7 })).toThrow('WS_SESSION_SECRET no configurado');
    const src = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    // La comprobación va ANTES de tocar la base y devuelve un mensaje específico.
    const check = src.indexOf("if (!process.env.WS_SESSION_SECRET)");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(src.indexOf('getServiceClient()'));
    expect(src).toContain('El asistente virtual no está configurado en este momento');
  });

  test('G4 [ACEPTADO r1] el token viaja en la query de la URL wss porque el upgrade se autentica antes del <Parameter>', () => {
    const src = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(src).toContain('?st=${encodeURIComponent(token)}');
    // Motivo documentado en el propio archivo (riesgo aceptado, no olvidado).
    expect(src).toContain('autenticar el UPGRADE');
    // El ws-server efectivamente lo lee en el handshake.
    const ws = SRC('ws-server.ts');
    expect(ws).toContain("url.searchParams.get('st')");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Cola, cron y alcanzabilidad
// ═══════════════════════════════════════════════════════════════════════════════

describe('H. Cola y cron', () => {
  test('H1 PASA: el cron de campañas es fail-closed sin CRON_SECRET', () => {
    const src = SRC('src/app/api/voice/agent-campaigns/run/route.ts');
    // Usa el helper canónico del proyecto: sin CRON_SECRET lanza 401, y con token
    // incorrecto también (comparación en tiempo constante).
    expect(src).toContain("import { verifyCronSecret, WebhookError } from '@/lib/security/webhookSignatures';");
    expect(src).toMatch(/verifyCronSecret\(request\)[\s\S]{0,400}status: err\.statusCode/);
    const helper = SRC('src/lib/security/webhookSignatures.ts');
    expect(helper).toMatch(/if \(!expected\) throw new WebhookError\(401, 'cron_secret_not_configured'\)/);
    // Y el cron NO acepta ninguna organización de entrada.
    expect(src).not.toMatch(/body\??\.organization_id/);
  });

  test('H2 [CORREGIDO r1] la ruta canónica del cron vive bajo un prefijo YA exento del middleware', () => {
    const mw = SRC('src/middleware.ts');
    // `src/middleware.ts` es archivo COMPARTIDO: no se edita. En vez de pedir una
    // exención nueva, el cron se movió a `/api/voice/…`, que ya está exento.
    expect(mw).toContain("'/api/voice/'");
    expect(mw).not.toContain('voice-agents/campaigns/run');
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/api/voice/agent-campaigns/run/route.ts'))).toBe(true);
    // El alias histórico sigue existiendo y declara que queda detrás del middleware.
    const alias = SRC('src/app/api/crm/voice-agents/campaigns/run/route.ts');
    expect(alias).toContain('runCampaignsForAllOrgs');
    expect(alias).toContain('DETRÁS del middleware');
    // La lógica compartida vive fuera del route handler (un route.ts de Next no puede
    // exportar nada más que sus handlers).
    expect(fs.existsSync(path.join(process.cwd(), 'src/lib/services/crm/voiceAgentCron.ts'))).toBe(true);
  });

  test('H3 [CORREGIDO r2] el kind `ai_call` está registrado Y existe un productor que lo encola', () => {
    const idx = SRC('src/lib/jobs/handlers/index.ts');
    // El manejador está registrado (lo aplicó el orquestador en la ronda 1).
    expect(idx).toMatch(/registerJobHandler\(\s*'ai_call'/);
    expect(DB.outboundJobKinds).toContain('ai_call');
    // La importación del servicio de voz es perezosa: no se arrastra al arranque.
    expect(idx).toMatch(/registerJobHandler\(\s*'ai_call'[\s\S]{0,400}await import\('@\/lib\/services\/crm\/voiceAgentService'\)/);
    // r2 (F-NEW-4): además del manejador hay PRODUCTOR, y está registrado.
    expect(idx).toContain('registerStageAgentAiCallListener');
    const trigger = SRC('src/lib/services/crm/voiceAgent/stageAgentTrigger.ts');
    expect(trigger).toContain("onCrmEvent('opportunity.stage_changed'");
    expect(trigger).toContain("from('stage_agents')");
    expect(trigger).toContain("trigger_on !== 'enter'");
    expect(trigger).toMatch(/enqueueJob\(\{[\s\S]{0,200}kind: 'ai_call'/);
    // Idempotente: el mismo evento reintentado no encola dos llamadas.
    expect(trigger).toContain('dedupeKey');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Defectos verificados contra la base real
// ═══════════════════════════════════════════════════════════════════════════════

describe('I. Defectos verificados contra la base real', () => {
  test('I1 [CORREGIDO r1] voiceAgentTools ya no arrastra el cliente de NAVEGADOR de Supabase', () => {
    const tools = SRC('src/lib/services/crm/voiceAgentTools.ts');
    expect(tools).not.toContain("from '@/lib/services/crm/stageGateService'");
    expect(tools).not.toContain("@/lib/supabase/config");
    // Recibe el cliente por parámetro (código de servidor puro).
    expect(tools).toContain("import type { SupabaseClient } from '@supabase/supabase-js';");
    // Prueba viva: esta suite ya NO necesita mockear `@/lib/supabase/config` para importarlo.
    expect(ALL_TOOL_NAMES.length).toBeGreaterThan(5);
  });

  test('I2 [CORREGIDO r1] createVoiceAgent no envía null explícito a columnas NOT NULL', () => {
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    const insert = svc.slice(svc.indexOf('export async function createVoiceAgent'), svc.indexOf('export async function updateVoiceAgent'));
    for (const col of ['voice_provider', 'voice_settings', 'stt_provider', 'llm_provider',
      'llm_model', 'guardrails', 'transfer_to_human_rules', 'business_hours', 'retry_policy']) {
      expect(insert).not.toMatch(new RegExp(`${col}: data\\.${col} \\?\\? null`));
    }
    // Solo se envían las claves presentes: así manda el DEFAULT de la columna.
    expect(insert).toContain('if (data[key] !== undefined) row[key] = data[key];');
    // Y las dos NOT NULL sin DEFAULT siempre llevan valor.
    expect(insert).toContain('DEFAULT_SYSTEM_PROMPT');
    expect(insert).toContain('DEFAULT_FIRST_MESSAGE');
  });

  test('I3 [CORREGIDO r1] el despachador no selecciona do_not_call y PROPAGA el error de la base', async () => {
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(svc).not.toContain("select('phone, timezone, do_not_call')");
    expect(svc).toContain("select('id, phone, timezone')");

    // Mismo escenario del tester: la lectura de customers devuelve 42703.
    const { resolver, rpcResolver } = scenario({
      customerError: { message: 'column customers.x does not exist', code: '42703' },
    });
    const { client, ops } = makeSupabase(resolver, rpcResolver);
    const r = await runCampaignQueue(7, client);

    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
    // El error real viaja en el informe con su SQLSTATE: ya no miente diciendo
    // «Cliente no encontrado».
    expect(r.errors.join(' ')).toContain('42703');
    expect(r.errors.join(' ')).not.toContain('Cliente no encontrado');
    const upd = ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'update').at(-1)!;
    expect((upd.payload as Record<string, unknown>).status).toBe('failed');
    // La lectura DESESTRUCTURA el error.
    expect(svc).toMatch(/const customerRes = await supabase\s*\n\s*\.from\('customers'\)/);
    expect(svc).toContain('if (customerRes.error)');
  });

  test('I4 [CORREGIDO r1] createTask y getCustomerContext usan columnas y estados reales', () => {
    const src = SRC('src/lib/services/crm/voiceAgentTools.ts');
    expect(src).toContain('related_to_id');
    expect(src).toContain('related_to_type');
    const tasksIdx = src.indexOf('export async function createTask');
    const tasksInsert = src.slice(tasksIdx, src.indexOf(".select('id, title, status')", tasksIdx));
    expect(tasksInsert).toContain("status: 'open'");
    expect(tasksInsert).not.toContain("status: 'pending'");
    expect(src).toMatch(/from\('tasks'\)[\s\S]{0,260}\.eq\('related_to_id', customerId\)/);
    expect(src).toMatch(/from\('tasks'\)[\s\S]{0,400}\.in\('status', \['open', 'in_progress'\]\)/);
    // `opportunities.status` con los literales reales (open|won|lost).
    expect(src).toContain(".eq('status', 'open')");
    expect(src).not.toContain('closed_lost');
  });

  test('I5 [CORREGIDO r1] la tool no miente: se niega a mover a una etapa terminal y deja tarea de cierre', () => {
    const src = SRC('src/lib/services/crm/voiceAgentTools.ts');
    // Lee is_won/is_lost de la etapa destino.
    expect(src).toMatch(/from\('stages'\)[\s\S]{0,200}is_won, is_lost/);
    expect(src).toContain('if (st.is_won || st.is_lost)');
    // Y devuelve success:false con el motivo, más una tarea para la persona.
    const bloque = src.slice(src.indexOf('if (st.is_won || st.is_lost)'), src.indexOf('if (ctx.actionPolicy'));
    expect(bloque).toContain('success: false');
    expect(bloque).toContain('requires_human_close: true');
    expect(bloque).toContain('createTask');
    // El UPDATE de stage_id solo se alcanza DESPUÉS de descartar la etapa terminal.
    const updIdx = src.indexOf('.update({ stage_id: stageId');
    expect(updIdx).toBeGreaterThan(0);
    expect(updIdx).toBeGreaterThan(src.indexOf('if (st.is_won || st.is_lost)'));
    const upd = src.slice(updIdx, src.indexOf('.select(', updIdx));
    expect(upd).toContain('stage_id: stageId');
  });

  test('I6 [REESCRITO r3] las políticas de RLS ya NO se comprueban contra una lista inventada', () => {
    // Este caso era teatro: declaraba un objeto literal con los nombres de las
    // políticas y luego comprobaba `expect(policies).toHaveLength(4)` sobre ESE
    // MISMO literal. Pasaba en verde aunque la base no tuviera ni una política.
    // La comprobación de verdad —contra `pg_policies` real— vive ahora en el
    // bloque L (`violacionesDePrivilegios`), que además distingue las tablas de
    // datos (4 políticas) de los libros inmutables (solo SELECT).
    expect(DB.voiceAgentsColumns).toContain('organization_id');
    const suite = SRC('src/lib/services/crm/__tests__/f6Adversarial.test.ts');
    expect(suite).toContain('function violacionesDePrivilegios');
    expect(suite).toContain('TABLAS_CON_CRUD_COMPLETO');
  });

  test('I7 [CORREGIDO r1 · NO VERIFICADO en vivo] la voz clonada tiene tabla, consentimiento y camino al TwiML', () => {
    // La clave de ElevenLabs de este entorno sigue siendo el marcador de ejemplo
    // (401 en /v1/user y /v1/voices), así que NADA de ElevenLabs se ha ejecutado
    // contra el proveedor real. Lo que sí se verifica aquí es el camino completo.
    expect(DB.createdTablesR1).toContain('voices');
    const twiml = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(twiml).toContain("attr('ttsProvider'");
    expect(twiml).toContain("attr('voice'");
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('voice_ref_id');
    expect(runtime).toContain('isCloned');
    expect(DB.voiceAgentColumnsAddedR1).toContain('voice_ref_id');
    // El consentimiento de clonación lo impone la base (CHECK voices_cloned_requires_consent)
    // y también la UI.
    const panel = SRC('src/components/crm/agentes/VoicesPanel.tsx');
    expect(panel).toContain('consentimiento');
    expect(panel).toContain('NO VERIFICADO');
  });

  test('I8 [CORREGIDO r1] el agente se identifica como asistente virtual y el saludo es de llamada SALIENTE', () => {
    const relay = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    // El saludo de «gracias por llamar» queda SOLO en el flujo entrante genérico.
    expect(relay).toMatch(/} else \{[\s\S]{0,400}gracias por llamar/);
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('export function buildGreeting');
    expect(runtime).toContain('DEFAULT_IDENTITY_DISCLOSURE');
    // Si el first_message no incluye la identificación, se antepone: nunca se omite.
    expect(runtime).toContain('if (!disclosureIncluded) pieces.push(p.identityDisclosure);');
    // En el runtime el literal solo aparece en un comentario que explica el cambio,
    // nunca en un saludo emitido.
    expect(runtime).not.toMatch(/greeting[\s\S]{0,80}gracias por llamar/);
    expect(runtime).not.toMatch(/pieces\.push\([^)]*gracias por llamar/);
    const twiml = SRC('src/app/api/voice/twiml/ai-agent/route.ts');
    expect(twiml).toContain("attr('welcomeGreeting', config.greeting)");
  });

  test('I9 [CORREGIDO r1] el despachador ya no se traga los errores de la base ni la zona horaria', () => {
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    // Ninguna lectura descarta `error`: todas pasan por `unwrap(...)` o comprueban `.error`.
    const sinError = svc.match(/const \{ data(?::\s*\w+)? \} = await supabase\s*\n\s*\.from/g) || [];
    expect(sinError).toHaveLength(0);
    expect(svc).toContain('function unwrap<T>(');
    expect(svc).toContain('class VoiceAgentDbError');
    // Zona horaria: fail-CLOSED, ya no se cae a la hora del servidor.
    expect(svc).not.toMatch(/\} catch \{\s*\n\s*hour = now\.getHours\(\);/);
    expect(svc).not.toContain('if (!timezone) return true;');
    expect(isWithinCustomerHours('Zona/Inexistente')).toBe(false);
    // Sin zona se usa America/Bogota (la columna es NOT NULL DEFAULT 'America/Bogota').
    expect(svc).toContain("export const DEFAULT_TIMEZONE = 'America/Bogota';");
  });

  test('I10 [NUEVO r1] `customers.do_not_call` existe y `fn_can_contact` es la única puerta del canal de voz', () => {
    expect(DB.customersDoNotCall).toBe(true);
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    // Un único punto de comprobación, usado al encolar y al marcar.
    expect((svc.match(/canCallCustomer\(/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(svc).toContain("p_channel: 'voice'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Ronda 2: el despacho puntual, el disparo por etapa y el consentimiento
// ═══════════════════════════════════════════════════════════════════════════════

/** Escenario del despacho puntual (`dispatchAgentCall`), sin campaña. */
function manualScenario(
  over: Partial<{
    attemptsToday: number;
    attemptsHour: number;
    attemptsCustomer: number;
    inProgress: number;
    live: Array<{ id: string; status: string }>;
    agentEnabled: boolean;
    businessHours: Record<string, unknown>;
    agentActive: boolean;
  }> = {}
) {
  const agent = {
    id: 'agent-1', organization_id: 7, name: 'A', slug: 'a', purpose_type: 'custom',
    system_prompt: 'p', first_message: 'f', is_active: over.agentActive ?? true,
    business_hours: over.businessHours ?? {}, retry_policy: {},
    max_calls_per_day: 50, max_calls_per_hour: 20, allowed_tools: [],
  };
  /** Orden de las tres consultas al libro: dia, hora, cliente. */
  let ledgerCall = 0;
  const resolver: Resolver = (op) => {
    if (op.table === 'voice_agents' && op.verb === 'select') return { data: agent };
    if (op.table === 'comm_settings') {
      return {
        data: {
          voice_recording_enabled: true,
          voice_consent_message: 'Grabada.',
          voice_agent_enabled: over.agentEnabled ?? true,
          is_active: true,
          voice_max_concurrent_calls: 3,
        },
      };
    }
    if (op.table === 'voice_agent_call_attempts' && op.head) {
      const porCliente = op.filters.some(([f, c]) => f === 'eq' && c === 'customer_id');
      if (porCliente) return { count: over.attemptsCustomer ?? 0 };
      ledgerCall += 1;
      return { count: ledgerCall === 1 ? over.attemptsToday ?? 0 : over.attemptsHour ?? 0 };
    }
    if (op.table === 'voice_agent_calls' && op.head) return { count: over.inProgress ?? 0 };
    if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: over.live ?? [] };
    if (op.table === 'voice_agent_calls' && op.verb === 'insert') {
      return { data: { id: 'vac-new', organization_id: 7, voice_agent_id: 'agent-1', customer_id: 'cust-1', attempts: 0, status: 'pending' } };
    }
    if (op.table === 'calls' && op.verb === 'insert') return { data: { id: 'call-uuid-0002' } };
    if (op.table === 'customers') return { data: { id: 'cust-1', phone: '3001112233', timezone: 'America/Bogota' } };
    if (op.table === 'stage_agents') return { data: null };
    return { data: null };
  };
  const rpcResolver: RpcResolver = ({ name }) => {
    if (name === 'fn_can_contact') return { data: true };
    if (name === 'deduct_comm_credits') return { data: true };
    if (name === 'fn_claim_voice_agent_call_one') {
      return { data: [{ id: 'vac-new', organization_id: 7, voice_agent_id: 'agent-1', customer_id: 'cust-1', opportunity_id: null, attempts: 1, status: 'in_progress' }] };
    }
    return { data: null };
  };
  return { resolver, rpcResolver };
}

describe('J. Despacho puntual, disparo por etapa y consentimiento (ronda 2)', () => {
  test('J1 [CORREGIDO r2] el despacho puntual respeta el tope diario: no crea fila ni marca', async () => {
    const { resolver, rpcResolver } = manualScenario({ attemptsToday: 50 });
    const { client, ops } = makeSupabase(resolver, rpcResolver);
    await expect(
      dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1' })
    ).rejects.toBeInstanceOf(VoiceDispatchBlocked);
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'insert')).toHaveLength(0);
  });

  test('J2 [CORREGIDO r2] el despacho puntual respeta el tope por hora y la concurrencia', async () => {
    const porHora = manualScenario({ attemptsHour: 20 });
    const c1 = makeSupabase(porHora.resolver, porHora.rpcResolver);
    await expect(
      dispatchAgentCall(7, c1.client, { voiceAgentId: 'agent-1', customerId: 'cust-1' })
    ).rejects.toMatchObject({ reason: 'hourly_cap' });

    const concurrente = manualScenario({ inProgress: 3 });
    const c2 = makeSupabase(concurrente.resolver, concurrente.rpcResolver);
    await expect(
      dispatchAgentCall(7, c2.client, { voiceAgentId: 'agent-1', customerId: 'cust-1' })
    ).rejects.toMatchObject({ reason: 'concurrency' });
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('J3 [CORREGIDO r2] N peticiones no son N llamadas: hay deduplicacion por cliente', async () => {
    // Ya hay una llamada viva de este agente para este cliente.
    const { resolver, rpcResolver } = manualScenario({ live: [{ id: 'vac-viva', status: 'in_progress' }] });
    const { client, ops } = makeSupabase(resolver, rpcResolver);
    const r = await dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1' });
    expect(r.dialed).toBe(false);
    expect(r.voice_agent_call_id).toBe('vac-viva');
    expect(ops.filter((o) => o.table === 'voice_agent_calls' && o.verb === 'insert')).toHaveLength(0);
    expect(twilioCreate).not.toHaveBeenCalled();

    // Y el mismo cliente ya intentado 2 veces hoy tampoco se vuelve a marcar.
    const repetido = manualScenario({ attemptsCustomer: 2 });
    const c2 = makeSupabase(repetido.resolver, repetido.rpcResolver);
    await expect(
      dispatchAgentCall(7, c2.client, { voiceAgentId: 'agent-1', customerId: 'cust-1' })
    ).rejects.toMatchObject({ reason: 'customer_cap' });
  });

  test('J4 [CORREGIDO r2] con el canal apagado o el agente inactivo no se marca (ni campana ni puntual)', async () => {
    const apagado = manualScenario({ agentEnabled: false });
    const c1 = makeSupabase(apagado.resolver, apagado.rpcResolver);
    await expect(
      dispatchAgentCall(7, c1.client, { voiceAgentId: 'agent-1', customerId: 'cust-1' })
    ).rejects.toMatchObject({ reason: 'channel_disabled' });

    const inactivo = manualScenario({ agentActive: false });
    const c2 = makeSupabase(inactivo.resolver, inactivo.rpcResolver);
    await expect(
      dispatchAgentCall(7, c2.client, { voiceAgentId: 'agent-1', customerId: 'cust-1' })
    ).rejects.toThrow(/desactivado/i);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('J5 [CORREGIDO r2] el despacho puntual reserva con la RPC atomica (deja intento en el libro)', async () => {
    const { resolver, rpcResolver } = manualScenario();
    const { client, rpcs } = makeSupabase(resolver, rpcResolver);
    const r = await dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1' });
    expect(r.dialed).toBe(true);
    expect(rpcs.map((c) => c.name)).toContain('fn_claim_voice_agent_call_one');
    // La RPC escribe la fila del intento: el tope del proximo despacho ya la ve.
    const svc = SRC('src/lib/services/crm/voiceAgentService.ts');
    expect(svc).toContain("supabase.rpc('fn_claim_voice_agent_call_one'");
    // Y la ruta exige rol de administrador (antes bastaba ser miembro).
    const route = SRC('src/app/api/crm/voice-agents/[id]/dispatch/route.ts');
    expect(route).toContain('requireOrgAdmin(ctx)');
    expect(route).toContain('VoiceDispatchBlocked');
  });

  test('J6 [CORREGIDO r2] el consentimiento NO es desactivable: las tools obligatorias se inyectan siempre', () => {
    const tools = SRC('src/lib/services/crm/voiceAgentTools.ts');
    expect(tools).toContain("export const MANDATORY_TOOLS = ['log_consent_opt_out', 'end_call'] as const;");

    // El runtime las anade aunque la etapa o el agente no las incluyan.
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('...MANDATORY_TOOLS');
    expect(runtime).toMatch(/new Set\(\[\.\.\.configuredTools, \.\.\.MANDATORY_TOOLS\]\)/);

    // Y la casilla de la UI esta bloqueada.
    const editor = SRC('src/components/crm/agentes/AgentEditorDialog.tsx');
    expect(editor).toContain('MANDATORY_TOOLS');
    expect(editor).toContain('disabled={obligatoria}');
    expect(editor).toContain('Obligatoria por ley');
    expect(editor).toMatch(/if \(isMandatoryTool\(tool\)\) return;/);
  });

  test('J7 [CORREGIDO r2] las lecturas sin comprobar error estan cerradas en el runtime y en el handler', () => {
    const sinError = (src: string) =>
      (src.match(/const \{\s*data(?::\s*\w+)?\s*\}\s*=\s*await/g) || []).length;

    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(sinError(runtime)).toBe(0);
    expect(runtime).toContain("throw new AgentRuntimeError('db_error', `customers:");
    expect(runtime).toContain("throw new AgentRuntimeError('db_error', `organizations:");
    expect(runtime).toContain("throw new AgentRuntimeError('db_error', `comm_settings:");

    const handler = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    expect(sinError(handler)).toBe(0);
    // El mensaje ya no miente sobre la causa cuando falla la lectura de comm_settings.
    expect(handler).toContain('No se pudo leer comm_settings');
    expect(handler).toContain('No pudimos verificar la configuración del servicio');

    // r3 · PASADA DE GEMELOS: en la ronda 2 se auditaron solo estos dos archivos
    // y el `voiceAgentService`. El gemelo estaba en el archivo de al lado:
    // `getBusinessInfo` descartaba el error y le contaba al CLIENTE, en mitad de
    // la llamada, que "no hay información del negocio". Se barren TODOS los
    // archivos de la fase, no una lista escogida a mano.
    const ARCHIVOS_F6 = [
      'src/lib/services/crm/voiceAgentService.ts',
      'src/lib/services/crm/voiceAgentTools.ts',
      'src/lib/services/crm/voiceAgentCron.ts',
      'src/lib/services/crm/voiceCatalogService.ts',
      'src/lib/services/crm/voiceAgent/agentRuntime.ts',
      'src/lib/services/crm/voiceAgent/stageAgentTrigger.ts',
      'src/lib/services/crm/voiceAgent/callStatusMap.ts',
      'src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts',
      'src/lib/services/integrations/twilio/voiceAgent/voiceAgentTools.ts',
      'src/lib/services/integrations/twilio/voiceAgent/voiceAgentPrompts.ts',
      'src/lib/services/integrations/twilio/voiceAgent/index.ts',
    ];
    for (const rel of ARCHIVOS_F6) {
      expect([rel, sinError(SRC(rel))]).toEqual([rel, 0]);
    }
    // Y el mensaje del gemelo tampoco miente sobre la causa.
    const tools = SRC('src/lib/services/integrations/twilio/voiceAgent/voiceAgentTools.ts');
    expect(tools).toContain('No pudimos consultar la información del negocio');
  });

  test('J8 [CORREGIDO r2 · NO VERIFICADO en vivo] clonar una voz desde la plataforma tiene ruta, servicio y pantalla', () => {
    // Servicio: llamador real de `createInstantClone` (antes tenia CERO llamadores).
    const svc = SRC('src/lib/services/crm/voiceCatalogService.ts');
    expect(svc).toContain('export async function cloneVoiceFromSample');
    expect(svc).toContain('createInstantClone');
    expect(svc).toContain("kind: 'cloned'");
    expect(svc).toContain('consent_recorded_at');
    // D9: sin consentimiento no se llama al proveedor.
    expect(svc).toMatch(/if \(!input\.consentConfirmed\)[\s\S]{0,320}throw new Error/);

    // Ruta HTTP con multipart, org de sesion y rol de administrador.
    const route = SRC('src/app/api/crm/voices/clone/route.ts');
    expect(route).toContain('requireOrgAdmin(ctx)');
    expect(route).toContain('request.formData()');
    expect(route).toContain("form.getAll('samples')");
    expect(route).toContain('cloneVoiceFromSample');
    expect(route).toContain('NO VERIFICADO');

    // Pantalla: subida de muestras y casilla de consentimiento.
    const panel = SRC('src/components/crm/agentes/VoicesPanel.tsx');
    expect(panel).toContain('/api/crm/voices/clone');
    expect(panel).toContain('type="file"');
    expect(panel).toContain('Clonar voz');
    expect(panel).toContain('cloneConsent');
  });

  test('J9 [CORREGIDO r2] el dia del tope es el de la organizacion, no UTC', () => {
    const ahora = new Date('2026-09-09T02:00:00.000Z'); // 21:00 del dia 8 en Bogota
    const bogota = startOfDayIso('America/Bogota', ahora);
    const utc = startOfDayIso('UTC', ahora);
    expect(bogota).toBe('2026-09-08T05:00:00.000Z'); // medianoche local de Bogota
    expect(utc).toBe('2026-09-09T00:00:00.000Z');
    expect(bogota).not.toBe(utc);
    // Zona invalida: se cae a la zona por defecto del CRM, nunca revienta.
    expect(() => startOfDayIso('No/Existe', ahora)).not.toThrow();
  });

  test('J10 [CORREGIDO r2] la `action` de <Connect> responde TwiML, no texto plano', () => {
    const status = SRC('src/app/api/voice/ai-agent/status/route.ts');
    expect(status).toContain('<Response/>');
    expect(status).toContain("'Content-Type': 'text/xml'");
    expect(status).not.toMatch(/NextResponse\('OK'/);
  });

  test('J11 [CORREGIDO r2] la longitud de la respuesta ya no es una constante', () => {
    const runtime = SRC('src/lib/services/crm/voiceAgent/agentRuntime.ts');
    expect(runtime).toContain('export function resolveMaxResponseTokens');
    expect(runtime).toContain('max_response_tokens');
    const handler = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    expect(handler).toContain('session.runtime?.maxResponseTokens ?? 200');
    expect(handler).not.toMatch(/max_tokens: 200,\n\s*temperature: session\.runtime/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K. El productor de `ai_call` por etapa: COMPORTAMIENTO, no texto (R3-3)
//
// La ronda 2 cubría `stageAgentTrigger.ts` SOLO con `toContain` sobre el fuente
// (caso H3), que es el mismo patrón de falso verde que el tester denunció en B5
// y F7: un cambio de nombre de campo, una condición invertida o un `enqueueJob`
// inalcanzable habrían pasado en verde. Aquí se INVOCA el listener de verdad.
//
// El doble NO sustituye a `enqueueJob`: se le pasa el cliente falso y se deja
// que ejecute el productor real (validación de `kind`, normalización de `runAt`
// y la RPC `fn_enqueue_job` con su `p_dedupe_key`). Lo que se observa son los
// argumentos que llegarían a la base.
// ═══════════════════════════════════════════════════════════════════════════════

const AGENTE_DE_ETAPA = {
  id: 'sa-1', voice_agent_id: 'va-1', trigger_on: 'enter',
  trigger_config: null as Record<string, unknown> | null, is_active: true,
};
const OPORTUNIDAD_ABIERTA = { id: 'opp-1', customer_id: 'cust-1', status: 'open' };

function eventoCambioDeEtapa(overrides: Record<string, unknown> = {}): CrmEvent {
  return {
    id: 'evt-1',
    organization_id: 7,
    event_type: 'opportunity.stage_changed',
    entity_type: 'opportunity',
    entity_id: 'opp-1',
    payload: { from_stage_id: 'st-0', to_stage_id: 'st-1' },
    status: 'pending',
    created_at: '2026-09-09T12:00:00.000Z',
    processed_at: null,
    ...overrides,
  } as unknown as CrmEvent;
}

function contextoDeListener(client: SupabaseClient) {
  const logs: Array<{ nivel: string; msg: string; extra?: Record<string, unknown> }> = [];
  const push = (nivel: string) => (msg: string, extra?: Record<string, unknown>) => {
    logs.push({ nivel, msg, extra });
  };
  return {
    ctx: {
      supabase: client,
      orgId: 7,
      log: { info: push('info'), warn: push('warn'), error: push('error') },
      signal: new AbortController().signal,
    },
    logs,
  };
}

function escenarioProductor(
  over: {
    stageAgent?: unknown;
    stageAgentError?: { message: string };
    opportunity?: unknown;
    opportunityError?: { message: string };
  } = {}
) {
  const resolver: Resolver = (op) => {
    if (op.table === 'stage_agents') {
      if (over.stageAgentError) return { data: null, error: over.stageAgentError };
      return { data: 'stageAgent' in over ? over.stageAgent : AGENTE_DE_ETAPA };
    }
    if (op.table === 'opportunities') {
      if (over.opportunityError) return { data: null, error: over.opportunityError };
      return { data: 'opportunity' in over ? over.opportunity : OPORTUNIDAD_ABIERTA };
    }
    return { data: null };
  };
  const rpc: RpcResolver = ({ name }) => {
    // `fn_enqueue_job` devuelve el uuid del job (o el existente, si hay dedupe).
    if (name === 'fn_enqueue_job') return { data: 'job-uuid-0001' };
    return { data: null };
  };
  return { resolver, rpc };
}

describe('K. El productor de `ai_call` por etapa (comportamiento real, r3)', () => {
  test('K1 con trigger_on=enter ENCOLA un ai_call, con la organizacion del contexto y clave de dedupe', async () => {
    const { resolver, rpc } = escenarioProductor();
    const { client, ops, rpcs } = makeSupabase(resolver, rpc);
    const { ctx } = contextoDeListener(client);

    const res = await stageAgentAiCallListener(eventoCambioDeEtapa(), ctx);

    // Se encoló exactamente un job, y por la RPC real de la cola.
    expect(rpcs.map((r) => r.name)).toEqual(['fn_enqueue_job']);
    const args = rpcs[0].args;
    expect(args.p_kind).toBe('ai_call');
    // Multi-tenant: la organizacion sale del CONTEXTO, nunca del payload del evento.
    expect(args.p_org).toBe(7);
    expect(args.p_dedupe_key).toBe('ai_call:stage_enter:sa-1:opp-1');
    expect(args.p_payload).toMatchObject({
      voice_agent_id: 'va-1',
      opportunity_id: 'opp-1',
      customer_id: 'cust-1',
      stage_agent_id: 'sa-1',
      source: 'stage_enter',
      crm_event_id: 'evt-1',
    });
    expect(res).toMatchObject({ job_id: 'job-uuid-0001', stage_agent_id: 'sa-1' });

    // La lectura de `stage_agents` va filtrada por organizacion, etapa DESTINO,
    // canal de voz y agente activo: nada de leer la etapa de otro inquilino.
    const lectura = ops.find((o) => o.table === 'stage_agents');
    expect(lectura).toBeDefined();
    const f = (col: string) => lectura!.filters.find(([verbo, c]) => verbo === 'eq' && c === col)?.[2];
    expect(f('organization_id')).toBe(7);
    expect(f('stage_id')).toBe('st-1');
    expect(f('channel')).toBe('voice');
    expect(f('is_active')).toBe(true);

    // El productor NO marca: no toca Twilio ni crea la fila de la llamada.
    expect(twilioCreate).not.toHaveBeenCalled();
    expect(ops.some((o) => o.table === 'voice_agent_calls')).toBe(false);
  });

  test('K2 con trigger_on=manual NO encola nada', async () => {
    const { resolver, rpc } = escenarioProductor({
      stageAgent: { ...AGENTE_DE_ETAPA, trigger_on: 'manual' },
    });
    const { client, rpcs } = makeSupabase(resolver, rpc);
    const { ctx } = contextoDeListener(client);

    const res = await stageAgentAiCallListener(eventoCambioDeEtapa(), ctx);

    expect(rpcs).toHaveLength(0);
    expect(res).toEqual({ skipped: true, reason: 'trigger_on=manual' });
  });

  test('K3 no encola sobre oportunidad cerrada, sin cliente, o sin agente en la etapa', async () => {
    const casos: Array<[string, Record<string, unknown>, string]> = [
      ['ganada', { opportunity: { ...OPORTUNIDAD_ABIERTA, status: 'won' } }, 'oportunidad_won'],
      ['perdida', { opportunity: { ...OPORTUNIDAD_ABIERTA, status: 'lost' } }, 'oportunidad_lost'],
      ['sin cliente', { opportunity: { ...OPORTUNIDAD_ABIERTA, customer_id: null } }, 'oportunidad_sin_cliente'],
      ['inexistente', { opportunity: null }, 'oportunidad_no_encontrada'],
      ['etapa sin agente', { stageAgent: null }, 'sin_agente_en_la_etapa'],
    ];
    for (const [caso, over, motivo] of casos) {
      const { resolver, rpc } = escenarioProductor(over);
      const { client, rpcs } = makeSupabase(resolver, rpc);
      const { ctx } = contextoDeListener(client);

      const res = await stageAgentAiCallListener(eventoCambioDeEtapa(), ctx);

      expect([caso, rpcs.length]).toEqual([caso, 0]);
      expect(res).toEqual({ skipped: true, reason: motivo });
    }
  });

  test('K4 un error de base NO se traga: propaga y no encola (fail-closed)', async () => {
    const casos: Array<[string, Record<string, unknown>, RegExp]> = [
      ['stage_agents', { stageAgentError: { message: 'permission denied' } }, /stage_agents: permission denied/],
      ['opportunities', { opportunityError: { message: 'timeout' } }, /opportunities: timeout/],
    ];
    for (const [caso, over, patron] of casos) {
      const { resolver, rpc } = escenarioProductor(over);
      const { client, rpcs } = makeSupabase(resolver, rpc);
      const { ctx } = contextoDeListener(client);

      await expect(stageAgentAiCallListener(eventoCambioDeEtapa(), ctx)).rejects.toThrow(patron);
      // Si la lectura falló, NO se encola "por si acaso".
      expect([caso, rpcs.length]).toEqual([caso, 0]);
    }
  });

  test('K5 sin to_stage_id, o sobre otra entidad, no hace NADA (ni siquiera lee)', async () => {
    const eventos = [
      eventoCambioDeEtapa({ payload: { from_stage_id: 'st-0' } }),
      eventoCambioDeEtapa({ payload: { to_stage_id: 42 } }), // tipo equivocado
      eventoCambioDeEtapa({ entity_type: 'customer' }),
    ];
    for (const evento of eventos) {
      const { resolver, rpc } = escenarioProductor();
      const { client, ops, rpcs } = makeSupabase(resolver, rpc);
      const { ctx } = contextoDeListener(client);

      const res = await stageAgentAiCallListener(evento, ctx);

      expect(res).toMatchObject({ skipped: true });
      expect(rpcs).toHaveLength(0);
      expect(ops).toHaveLength(0);
    }
  });

  test('K6 delay_minutes retrasa el job y queda ACOTADO a 24 h', async () => {
    const medir = async (delay: unknown) => {
      const antes = Date.now();
      const { resolver, rpc } = escenarioProductor({
        stageAgent: { ...AGENTE_DE_ETAPA, trigger_config: { delay_minutes: delay } },
      });
      const { client, rpcs } = makeSupabase(resolver, rpc);
      const { ctx } = contextoDeListener(client);
      await stageAgentAiCallListener(eventoCambioDeEtapa(), ctx);
      return new Date(String(rpcs[0].args.p_run_at)).getTime() - antes;
    };

    // 30 minutos → ~30 minutos.
    const treinta = await medir(30);
    expect(treinta).toBeGreaterThan(29 * 60 * 1000);
    expect(treinta).toBeLessThan(31 * 60 * 1000);

    // Un valor absurdo no programa una llamada dentro de un año: tope 24 h.
    const absurdo = await medir(99999999);
    expect(absurdo).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 5000);
    expect(absurdo).toBeGreaterThan(23 * 60 * 60 * 1000);

    // Basura → inmediato, sin reventar.
    for (const basura of ['ya', null, -5, NaN]) {
      const inmediato = await medir(basura);
      expect(inmediato).toBeLessThan(5000);
    }
  });

  test('K7 sin voice_agent_id no encola y AVISA (no se calla el problema)', async () => {
    const { resolver, rpc } = escenarioProductor({
      stageAgent: { ...AGENTE_DE_ETAPA, voice_agent_id: null },
    });
    const { client, rpcs } = makeSupabase(resolver, rpc);
    const { ctx, logs } = contextoDeListener(client);

    const res = await stageAgentAiCallListener(eventoCambioDeEtapa(), ctx);

    expect(rpcs).toHaveLength(0);
    expect(res).toEqual({ skipped: true, reason: 'stage_agent_sin_voice_agent' });
    expect(logs.some((l) => l.nivel === 'warn' && l.msg === 'stage_agent_sin_voice_agent')).toBe(true);
  });

  test('K8 el listener queda REGISTRADO de verdad en el despachador, y el registro es idempotente', () => {
    registerStageAgentAiCallListener();
    registerStageAgentAiCallListener(); // dos veces: no debe duplicar

    const registrados = getCrmEventListeners('opportunity.stage_changed');
    const mios = registrados.filter((l) => l.name === STAGE_AGENT_LISTENER_NAME);
    expect(mios).toHaveLength(1);
    // Y el registrado es la función real, no un homónimo.
    expect(mios[0].fn).toBe(stageAgentAiCallListener);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// K bis. R3-5: el tope de campaña y el de despacho puntual comparten presupuesto
// ═══════════════════════════════════════════════════════════════════════════════

describe('K bis. Presupuesto UNICO del agente (R3-5)', () => {
  /**
   * Doble del libro de intentos que distingue POR QUÉ columna se cuenta, que es
   * justo lo que separaba los dos saldos: la campaña contaba por `campaign_id`
   * y el despacho puntual por `voice_agent_id`, así que 50 + 50 = 100 marcaciones
   * con un tope declarado de 50.
   */
  function libroSeparado(porCampana: number, porAgente: number): Resolver {
    return (op) => {
      if (op.table === 'voice_agent_campaigns' && op.verb === 'select') {
        return { data: [{
          id: 'camp-1', organization_id: 7, voice_agent_id: 'agent-1', name: 'C',
          target_source: 'manual_list', target_config: {}, schedule: null,
          max_calls_per_day: 50, max_calls_per_hour: 20, max_concurrent: 3,
          emergency_stop: false, consecutive_failures: 0, status: 'running', stats: {},
        }] };
      }
      if (op.table === 'comm_settings') {
        return { data: { voice_recording_enabled: true, voice_agent_enabled: true, is_active: true, voice_max_concurrent_calls: 3 } };
      }
      if (op.table === 'voice_agents' && op.verb === 'select') {
        return { data: { is_active: true, max_calls_per_day: 50, max_calls_per_hour: 20, retry_policy: {} } };
      }
      if (op.table === 'voice_agent_call_attempts' && op.head) {
        const porAgenteFiltro = op.filters.some(([v, c]) => v === 'eq' && c === 'voice_agent_id');
        return { count: porAgenteFiltro ? porAgente : porCampana };
      }
      if (op.table === 'voice_agent_calls' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: [] };
      if (op.table === 'customers') return { data: { id: 'cust-1', phone: '3001112233', timezone: 'America/Bogota' } };
      if (op.table === 'opportunities') return { data: [] };
      if (op.table === 'calls' && op.verb === 'insert') return { data: { id: 'call-uuid-0001' } };
      return { data: null };
    };
  }

  test('K9 la campaña NO marca si el despacho puntual ya gastó el presupuesto del agente', async () => {
    // La campaña no ha marcado nada hoy (0 por `campaign_id`), pero el agente ya
    // lleva 50 intentos hoy por la vía del despacho puntual.
    const { rpcResolver } = scenario();
    const { client, rpcs } = makeSupabase(libroSeparado(0, 50), rpcResolver);

    const r = await runCampaignQueue(7, client);

    // Antes de R3-5 aquí había 50 huecos libres y se marcaba: techo real 100.
    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
    // Ni siquiera se llega a reservar: el saldo se comprueba antes.
    expect(rpcs.map((x) => x.name)).not.toContain('fn_claim_voice_agent_calls');
  });

  test('K10 con saldo en AMBOS la campaña sí marca (la barrera no es un apagón)', async () => {
    const { rpcResolver } = scenario();
    const { client } = makeSupabase(libroSeparado(0, 0), rpcResolver);
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBeGreaterThan(0);
    expect(twilioCreate).toHaveBeenCalled();
  });

  test('K11 el saldo horario del agente frena la campaña igual que el diario', async () => {
    const { rpcResolver } = scenario();
    const { client } = makeSupabase(libroSeparado(0, 20), rpcResolver);
    const r = await runCampaignQueue(7, client);
    expect(r.calls_initiated).toBe(0);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('K12 el despacho puntual descuenta del MISMO libro del agente (no de uno propio)', async () => {
    const { client, ops } = makeSupabase(libroSeparado(0, 50), (call) => {
      if (call.name === 'fn_can_contact') return { data: true };
      return { data: null };
    });
    await expect(
      dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1' })
    ).rejects.toThrow(VoiceDispatchBlocked);

    // Y lo cuenta contra el libro por `voice_agent_id`, que es donde la RPC de
    // campaña también deja sus filas: un solo saldo, no dos.
    const conteo = ops.find((o) => o.table === 'voice_agent_call_attempts' && o.head);
    expect(conteo).toBeDefined();
    expect(conteo!.filters.some(([v, c]) => v === 'eq' && c === 'voice_agent_id')).toBe(true);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('K13 el codigo declara el presupuesto compartido en los DOS caminos', () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    // La campaña ya no mira solo su propio `campaign_id`.
    expect(src).toMatch(/countAgentAttempts\(supabase, orgId, campaign\.voice_agent_id/);
    expect(src).toContain('agentCaps.max_calls_per_day - agentAttemptsToday');
    expect(src).toContain('agentCaps.max_calls_per_hour - agentAttemptsHour');
    // Y el hueco para encolar objetivos usa el saldo MENOR, no el de la campaña.
    expect(src).toMatch(/Math\.min\(dayRoom, 200\)/);
  });
});


// ═══════════════════════════════════════════════════════════════════════════════
// L. PRIVILEGIOS REALES DE LA BASE (R3-4)
//
// Hasta la ronda 2 esta suite no comprobaba NADA sobre privilegios: la constante
// `DB` de arriba es una instantánea escrita a mano. Una migración futura que
// volviera a conceder `anon` —el fallo CRÍTICO de la ronda 2— habría salido
// verde, igual que salió verde la escritura entre inquilinos de la ronda 3.
//
// Estos casos consultan el CATÁLOGO REAL (`fn_f6_privilege_snapshot`, creada en
// `crm_v4_f06_05_privilege_snapshot_for_tests`: SECURITY INVOKER, solo lectura
// de catálogo, concedida solo a `service_role`) y además prueban el EFECTO por
// HTTP con la clave pública que viaja en el bundle del navegador.
//
// Por qué la sonda es SÍNCRONA (proceso hijo) y no un `beforeAll` asíncrono:
// para poder decidir en tiempo de RECOLECCIÓN si los casos corren o se marcan
// SKIPPED. Un `beforeAll` solo permitiría "pasar con un aviso", que es
// exactamente el falso verde que esta fase lleva dos rondas eliminando.
//
// Semántica, sin letra pequeña:
//   · API disponible y privilegios correctos  → VERDE (comprobación real).
//   · API disponible y privilegios ABIERTOS   → ROJO.
//   · API caída (5xx/timeout) o sin credenciales → SKIPPED VISIBLE + L0 lo grita.
//     No se finge que se comprobó: no se comprobó.
// ═══════════════════════════════════════════════════════════════════════════════

interface PrivilegeSnapshot {
  functions: Record<string, string>;
  function_guards: Record<string, { security_definer: boolean; checks_membership: boolean; raises_42501: boolean }>;
  tables: Record<string, { rls: boolean; acl: string }>;
  policies: Array<{ table: string; cmd: string; name: string }>;
  indexes: Record<string, string>;
}

interface SondaAnon { fn: string; status: number; code: unknown }

interface ResultadoSonda {
  modo: 'ok' | 'sin_credenciales' | 'api_caida' | 'respuesta_invalida';
  detalle?: string;
  snapshot?: PrivilegeSnapshot;
  anonRpc?: SondaAnon[];
  anonInsert?: number;
  anonDelete?: number;
}

function cargarEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return out;
  for (const linea of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (m) out[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return out;
}

const ENV_LOCAL = cargarEnvLocal();
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ENV_LOCAL.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPA_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ENV_LOCAL.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ENV_LOCAL.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

/**
 * Privilegios de un rol dentro de un ACL de Postgres.
 * `{postgres=arwdDxt/postgres,anon=rxt/postgres,...}` → 'rxt' para `anon`.
 * a=INSERT r=SELECT w=UPDATE d=DELETE D=TRUNCATE x=REFERENCES t=TRIGGER X=EXECUTE
 */
function privilegiosDe(acl: string, rol: string): string {
  const m = new RegExp(`(?:^|[{,])${rol}=([a-zA-Z*]*)/`).exec(acl);
  return m ? m[1].replace(/\*/g, '') : '';
}

/** Sonda síncrona: una sola llamada a un proceso hijo con TODO lo que hay que medir. */
function sondarPrivilegios(): ResultadoSonda {
  if (!SUPA_URL || !SUPA_SERVICE || !SUPA_ANON) return { modo: 'sin_credenciales' };

  const script = `
const [U, S, A] = process.argv.slice(1);
const H = (k) => ({ apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' });
const T = () => AbortSignal.timeout(8000);
(async () => {
  const out = {};
  const snap = await fetch(U + '/rest/v1/rpc/fn_f6_privilege_snapshot',
    { method: 'POST', headers: H(S), body: '{}', signal: T() });
  out.snapStatus = snap.status;
  out.snapBody = await snap.text();
  const rpcs = [
    ['fn_claim_voice_agent_calls', { p_org: 1, p_campaign: '00000000-0000-0000-0000-000000000000', p_limit: 1, p_worker: 'probe' }],
    ['fn_claim_voice_agent_call_one', { p_org: 1, p_call: '00000000-0000-0000-0000-000000000000', p_worker: 'probe' }],
    ['fn_stop_voice_campaign', { p_org: 1, p_campaign: '00000000-0000-0000-0000-000000000000', p_reason: 'probe' }],
    ['fn_log_consent_opt_out', { p_org: 1, p_customer: '00000000-0000-0000-0000-000000000000', p_channel: 'voice' }],
    ['fn_can_contact', { p_org: 1, p_customer: '00000000-0000-0000-0000-000000000000', p_channel: 'voice' }],
  ];
  out.anonRpc = [];
  for (const [fn, args] of rpcs) {
    const r = await fetch(U + '/rest/v1/rpc/' + fn,
      { method: 'POST', headers: H(A), body: JSON.stringify(args), signal: T() });
    let code = null;
    try { code = (JSON.parse(await r.text()) || {}).code; } catch (e) { code = null; }
    out.anonRpc.push({ fn, status: r.status, code });
  }
  const ins = await fetch(U + '/rest/v1/voice_agent_call_attempts',
    { method: 'POST', headers: H(A), body: JSON.stringify({ organization_id: 1, attempt_no: 1, source: 'manual' }), signal: T() });
  out.anonInsert = ins.status;
  const del = await fetch(U + '/rest/v1/voice_agent_call_attempts?organization_id=gt.0',
    { method: 'DELETE', headers: H(A), signal: T() });
  out.anonDelete = del.status;
  process.stdout.write(JSON.stringify(out));
})().catch((e) => process.stdout.write(JSON.stringify({ transporte: String(e && e.message) })));
`;

  let bruto: string;
  try {
    bruto = execFileSync(process.execPath, ['-e', script, SUPA_URL, SUPA_SERVICE, SUPA_ANON], {
      encoding: 'utf8',
      timeout: 90000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (e) {
    return { modo: 'api_caida', detalle: `la sonda no pudo ejecutarse: ${(e as Error).message}` };
  }

  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(bruto);
  } catch {
    return { modo: 'api_caida', detalle: `salida ilegible de la sonda: ${bruto.slice(0, 200)}` };
  }

  if (datos.transporte) return { modo: 'api_caida', detalle: `error de red: ${String(datos.transporte)}` };

  const status = Number(datos.snapStatus);
  const cuerpo = String(datos.snapBody ?? '');
  // 5xx / 0 = la API de datos no está disponible: NO se comprobó nada.
  if (!status || status >= 500) {
    return { modo: 'api_caida', detalle: `PostgREST devolvió ${status}: ${cuerpo.slice(0, 200)}` };
  }
  // La API contestó pero no dio la foto: eso SÍ es un problema (función borrada,
  // GRANT retirado a service_role, esquema sin recargar…).
  if (status !== 200) {
    return { modo: 'respuesta_invalida', detalle: `PostgREST devolvió ${status}: ${cuerpo.slice(0, 200)}` };
  }

  try {
    return {
      modo: 'ok',
      snapshot: JSON.parse(cuerpo) as PrivilegeSnapshot,
      anonRpc: datos.anonRpc as SondaAnon[],
      anonInsert: Number(datos.anonInsert),
      anonDelete: Number(datos.anonDelete),
    };
  } catch {
    return { modo: 'respuesta_invalida', detalle: `foto ilegible: ${cuerpo.slice(0, 200)}` };
  }
}

const PRIV = sondarPrivilegios();
/** Solo se ejecutan de verdad si la base contestó. Si no, jest los marca SKIPPED. */
const casoPriv = PRIV.modo === 'ok' ? test : test.skip;

describe('L. Privilegios reales de la base (R3-4)', () => {
  test('L0 la comprobación de privilegios NO se salta en silencio', () => {
    if (PRIV.modo === 'ok') {
      expect(PRIV.snapshot).toBeDefined();
      return;
    }
    // La API contestó algo que no es la foto: la red de seguridad está rota y
    // hay que enterarse. Esto es ROJO a propósito.
    expect([PRIV.modo, PRIV.detalle]).not.toEqual(['respuesta_invalida', PRIV.detalle]);
    // Sin credenciales o con la API caída: L1..L7 salen SKIPPED en el informe de
    // jest. No se comprobaron; el aviso lo deja por escrito.
    // eslint-disable-next-line no-console
    console.warn(
      `[F6/L] PRIVILEGIOS NO VERIFICADOS EN ESTA EJECUCIÓN (${PRIV.modo}): ${PRIV.detalle ?? 'sin credenciales en .env.local'}. ` +
      'L1..L6 quedan SKIPPED: no los leas como verdes.'
    );
    expect(['sin_credenciales', 'api_caida']).toContain(PRIV.modo);
  });

  /**
   * EL CONTRATO DE PRIVILEGIOS DE F6, en un solo sitio y como función pura.
   *
   * Devuelve la lista de violaciones (vacía = todo correcto). Que sea pura
   * permite hacer algo que las aserciones sueltas no permiten: demostrar que
   * la red de seguridad MUERDE, pasándole una foto rota a propósito (L8) sin
   * tocar los privilegios de la base real.
   */
  /** Libros de solo-lectura para el inquilino: los escribe el rol de servicio. */
  const LIBROS_INMUTABLES = ['voice_agent_call_attempts', 'voice_agent_tool_runs'];
  /** Tablas de datos del inquilino: RLS con las 4 políticas por organización. */
  const TABLAS_CON_CRUD_COMPLETO = [
    'voice_agents', 'voice_agent_calls', 'voice_agent_campaigns', 'stage_agents', 'voices',
  ];

  function violacionesDePrivilegios(s: PrivilegeSnapshot): string[] {
    const v: string[] = [];

    // (1) Las RPC de RESERVA no las ejecuta nadie con sesión: solo service_role.
    for (const fn of ['fn_claim_voice_agent_calls', 'fn_claim_voice_agent_call_one']) {
      const acl = s.functions[fn];
      if (typeof acl !== 'string') { v.push(`${fn}: no existe`); continue; }
      // Un `proacl` NULO significa EXECUTE para PUBLIC (privilegio por defecto
      // del esquema `public`): es exactamente el agujero de la ronda 2.
      if (acl === 'DEFAULT') v.push(`${fn}: proacl por defecto (EXECUTE a PUBLIC)`);
      if (privilegiosDe(acl, 'anon')) v.push(`${fn}: ejecutable por anon`);
      if (privilegiosDe(acl, 'authenticated')) v.push(`${fn}: ejecutable por authenticated`);
      if (!privilegiosDe(acl, 'service_role').includes('X')) v.push(`${fn}: service_role no puede ejecutarla`);
    }

    // (2) NINGUNA RPC de F6 queda ejecutable por anon.
    for (const [fn, acl] of Object.entries(s.functions)) {
      if (acl === 'DEFAULT') v.push(`${fn}: proacl por defecto (EXECUTE a PUBLIC)`);
      else if (privilegiosDe(acl, 'anon')) v.push(`${fn}: ejecutable por anon`);
    }

    // (3) Las DOS funciones que ESCRIBEN comprueban la pertenencia del llamante.
    // R3-1: `fn_log_consent_opt_out` escribía entre inquilinos porque validaba el
    // cliente pero no al llamante. Es el "gemelo del archivo de al lado" clásico.
    for (const fn of ['fn_stop_voice_campaign', 'fn_log_consent_opt_out']) {
      const g = s.function_guards[fn];
      if (!g) { v.push(`${fn}: sin guarda declarada`); continue; }
      if (!g.security_definer) v.push(`${fn}: dejó de ser SECURITY DEFINER`);
      if (!g.checks_membership) v.push(`${fn}: NO comprueba organization_members (escritura entre inquilinos)`);
      if (!g.raises_42501) v.push(`${fn}: no lanza 42501`);
    }

    // (4) Los LIBROS INMUTABLES: si el inquilino los puede escribir, la garantía
    // que sostienen es de mentira.
    //   · `voice_agent_call_attempts` → el tope diario se resetea (R3-2).
    //   · `voice_agent_tool_runs`     → se borra la prueba de que el cliente
    //     pidió la baja (gemelo de R3-2, encontrado en la pasada de gemelos r3).
    // Los dos los escribe solo el rol de servicio; el inquilino solo LEE.
    const letras: Array<[string, string]> = [['a', 'INSERT'], ['w', 'UPDATE'], ['d', 'DELETE'], ['D', 'TRUNCATE']];
    for (const libroNombre of LIBROS_INMUTABLES) {
      const libro = s.tables[libroNombre];
      if (!libro) { v.push(`${libroNombre}: no existe`); continue; }
      for (const rol of ['anon', 'authenticated']) {
        const privs = privilegiosDe(libro.acl, rol);
        for (const [letra, nombre] of letras) {
          if (privs.includes(letra)) v.push(`${libroNombre}: ${rol} tiene ${nombre}`);
        }
      }
      // El que sí escribe corre como service_role (RPC SECURITY DEFINER o el
      // cliente de servicio del ws-server).
      if (!privilegiosDe(libro.acl, 'service_role').includes('a')) {
        v.push(`${libroNombre}: service_role no puede insertar (dejaría de registrarse)`);
      }
      const cmds = s.policies.filter((p) => p.table === libroNombre).map((p) => p.cmd).sort();
      if (cmds.join(',') !== 'SELECT') {
        v.push(`${libroNombre}: políticas ${cmds.join(',') || '(ninguna)'}, se esperaba solo SELECT`);
      }
    }

    // (5) Las tablas de DATOS del inquilino sí llevan las 4 políticas por
    // organización (esto es lo que el viejo caso I6 fingía comprobar).
    for (const t of TABLAS_CON_CRUD_COMPLETO) {
      const cmds = s.policies.filter((p) => p.table === t).map((p) => p.cmd).sort();
      if (cmds.join(',') !== 'DELETE,INSERT,SELECT,UPDATE') {
        v.push(`${t}: políticas ${cmds.join(',') || '(ninguna)'}, se esperaban DELETE,INSERT,SELECT,UPDATE`);
      }
    }

    // (6) Todas las tablas de F6 conservan RLS.
    for (const t of [...LIBROS_INMUTABLES, ...TABLAS_CON_CRUD_COMPLETO]) {
      if (!s.tables[t]) v.push(`${t}: no existe`);
      else if (!s.tables[t].rls) v.push(`${t}: RLS desactivada`);
    }

    return v;
  }

  casoPriv('L1 el estado REAL de la base cumple el contrato de privilegios de F6', () => {
    const s = PRIV.snapshot!;
    // Las 5 RPC de la fase están todas contempladas: nadie puede añadir una
    // función nueva y quedarse fuera del contrato sin que esto se entere.
    expect(Object.keys(s.functions).sort()).toEqual([
      'fn_can_contact', 'fn_claim_voice_agent_call_one', 'fn_claim_voice_agent_calls',
      'fn_log_consent_opt_out', 'fn_stop_voice_campaign',
    ]);
    expect(violacionesDePrivilegios(s)).toEqual([]);
  });

  casoPriv('L2 la red de seguridad MUERDE: una foto con los fallos de r2/r3 se detecta entera', () => {
    // Foto sintética con EXACTAMENTE los defectos reales de las dos rondas:
    // el `anon` del hallazgo crítico, la guarda que faltaba en la función
    // gemela, y el libro escribible que reseteaba el tope.
    const rota: PrivilegeSnapshot = {
      functions: {
        // r2: concedida a anon (el agujero crítico).
        fn_claim_voice_agent_calls: '{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
        // proacl por defecto = EXECUTE para PUBLIC.
        fn_claim_voice_agent_call_one: 'DEFAULT',
        fn_stop_voice_campaign: '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
        fn_log_consent_opt_out: '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
        fn_can_contact: '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
      },
      function_guards: {
        fn_stop_voice_campaign: { security_definer: true, checks_membership: true, raises_42501: true },
        // r3: el gemelo sin guarda de pertenencia.
        fn_log_consent_opt_out: { security_definer: true, checks_membership: false, raises_42501: false },
      },
      tables: {
        // r3: el "libro inmutable" que cualquier miembro podía borrar.
        voice_agent_call_attempts: { rls: true, acl: '{postgres=arwdDxt/postgres,anon=arwdDxt/postgres,authenticated=arwdDxt/postgres,service_role=arwdDxt/postgres}' },
        // r3 (gemelo): la auditoría del agente, igual de borrable.
        voice_agent_tool_runs: { rls: true, acl: '{postgres=arwdDxt/postgres,anon=arwdDxt/postgres,authenticated=arwdDxt/postgres,service_role=arwdDxt/postgres}' },
        voice_agents: { rls: true, acl: '{service_role=arwdDxt/postgres}' },
        voice_agent_calls: { rls: false, acl: '{service_role=arwdDxt/postgres}' },
        voice_agent_campaigns: { rls: true, acl: '{service_role=arwdDxt/postgres}' },
        stage_agents: { rls: true, acl: '{service_role=arwdDxt/postgres}' },
        voices: { rls: true, acl: '{service_role=arwdDxt/postgres}' },
      },
      policies: [
        { table: 'voice_agent_call_attempts', cmd: 'SELECT', name: 'sel' },
        { table: 'voice_agent_call_attempts', cmd: 'DELETE', name: 'del' },
        { table: 'voice_agent_tool_runs', cmd: 'SELECT', name: 'vatr_select' },
        { table: 'voice_agent_tool_runs', cmd: 'DELETE', name: 'vatr_delete' },
      ],
      // r3: sin el índice único parcial, la deduplicación del despacho puntual
      // vuelve a ser una carrera (R3-6).
      indexes: {},
    };

    const v = violacionesDePrivilegios(rota);
    // Cada uno de los fallos históricos queda cazado por su nombre.
    expect(v).toEqual(expect.arrayContaining([
      'fn_claim_voice_agent_calls: ejecutable por anon',
      'fn_claim_voice_agent_calls: ejecutable por authenticated',
      'fn_claim_voice_agent_call_one: proacl por defecto (EXECUTE a PUBLIC)',
      'fn_log_consent_opt_out: NO comprueba organization_members (escritura entre inquilinos)',
      'voice_agent_call_attempts: authenticated tiene DELETE',
      'voice_agent_call_attempts: anon tiene INSERT',
      'voice_agent_call_attempts: políticas DELETE,SELECT, se esperaba solo SELECT',
      // El gemelo: la auditoría del agente, borrable por el inquilino.
      'voice_agent_tool_runs: authenticated tiene DELETE',
      'voice_agent_tool_runs: políticas DELETE,SELECT, se esperaba solo SELECT',
      'voice_agent_calls: RLS desactivada',
    ]));
    // Y la foto REAL no comparte ni una de esas violaciones.
    expect(violacionesDePrivilegios(PRIV.snapshot!)).toEqual([]);
  });

  casoPriv('L3 la guarda de pertenencia está en las DOS funciones que escriben', () => {
    const { function_guards } = PRIV.snapshot!;
    for (const fn of ['fn_stop_voice_campaign', 'fn_log_consent_opt_out']) {
      const g = function_guards[fn];
      expect([fn, Boolean(g)]).toEqual([fn, true]);
      expect([fn, g.security_definer, g.checks_membership, g.raises_42501])
        .toEqual([fn, true, true, true]);
    }
  });

  casoPriv('L4 los DOS libros inmutables solo los escribe el rol de servicio', () => {
    for (const nombre of LIBROS_INMUTABLES) {
      const libro = PRIV.snapshot!.tables[nombre];
      expect([nombre, Boolean(libro)]).toEqual([nombre, true]);
      // r=SELECT, x=REFERENCES, t=TRIGGER. Ni a(INSERT) ni w(UPDATE) ni d(DELETE).
      expect([nombre, privilegiosDe(libro.acl, 'authenticated')]).toEqual([nombre, 'rxt']);
      expect([nombre, privilegiosDe(libro.acl, 'anon')]).toEqual([nombre, 'rxt']);
      expect(privilegiosDe(libro.acl, 'service_role')).toContain('a');
    }
  });

  casoPriv('L4 bis [R3-6] la deduplicación atómica existe EN LA BASE, no solo en el código', () => {
    // La garantía es el índice único parcial: si alguien lo borra, el servicio
    // sigue leyendo igual de bien y la carrera vuelve. Por eso se comprueba
    // contra `pg_indexes` y no contra el texto de `voiceAgentService.ts`.
    const def = PRIV.snapshot!.indexes?.voice_agent_calls_una_viva_por_cliente;
    expect(typeof def).toBe('string');
    expect(def).toContain('UNIQUE');
    expect(def).toContain('voice_agent_calls');
    for (const col of ['organization_id', 'voice_agent_id', 'customer_id']) {
      expect([col, def!.includes(col)]).toEqual([col, true]);
    }
    // PARCIAL: solo las vivas. Si no lo fuera, no se podría volver a llamar
    // nunca al mismo cliente con el mismo agente.
    expect(def).toMatch(/WHERE/i);
    for (const estado of ['pending', 'queued', 'in_progress']) {
      expect([estado, def!.includes(estado)]).toEqual([estado, true]);
    }
    expect(def).not.toContain('completed');
  });

  casoPriv('L5 con la clave PÚBLICA del navegador, las 5 RPC responden 42501 (prueba de efecto)', () => {
    const sondas = PRIV.anonRpc ?? [];
    expect(sondas).toHaveLength(5);
    for (const s of sondas) {
      // Un 200 aquí es el agujero crítico de la ronda 2 vivo otra vez.
      expect([s.fn, s.status >= 400]).toEqual([s.fn, true]);
      expect([s.fn, s.code]).toEqual([s.fn, '42501']);
    }
  });

  casoPriv('L6 con la clave PÚBLICA no se puede escribir ni borrar el libro de intentos', () => {
    // Rechazado por GRANT (42501) o por RLS. Lo que no puede es crear/borrar.
    expect(PRIV.anonInsert).toBeGreaterThanOrEqual(400);
    expect(PRIV.anonDelete).toBeGreaterThanOrEqual(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M. Cierres de los menores de la ronda 3 (R3-6, R3-7, R3-9)
// ═══════════════════════════════════════════════════════════════════════════════

describe('M. Menores cerrados en la ronda 3', () => {
  /** Escenario completo de despacho puntual, con las filas vivas que se le den. */
  function escenarioDespacho(vivas: Array<{ id: string; status: string }>) {
    const resolver: Resolver = (op) => {
      if (op.table === 'comm_settings') {
        return { data: {
          voice_recording_enabled: true, voice_consent_message: 'Esta llamada será grabada.',
          voice_agent_enabled: true, is_active: true, voice_max_concurrent_calls: 3,
        } };
      }
      if (op.table === 'voice_agents' && op.verb === 'select') {
        return { data: {
          id: 'agent-1', organization_id: 7, name: 'A', is_active: true,
          max_calls_per_day: 50, max_calls_per_hour: 20,
          retry_policy: {}, business_hours: null, guardrails: {},
        } };
      }
      if (op.table === 'voice_agent_call_attempts' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.head) return { count: 0 };
      if (op.table === 'voice_agent_calls' && op.verb === 'select') return { data: vivas };
      if (op.table === 'voice_agent_calls' && op.verb === 'insert') {
        return { data: { id: 'vac-NUEVA', organization_id: 7, voice_agent_id: 'agent-1', customer_id: 'cust-1', status: 'pending', attempts: 0 } };
      }
      if (op.table === 'customers') return { data: { id: 'cust-1', phone: '3001112233', timezone: 'America/Bogota' } };
      if (op.table === 'calls' && op.verb === 'insert') return { data: { id: 'call-uuid-0001' } };
      if (op.table === 'stage_agents') return { data: null };
      return { data: null };
    };
    const rpc: RpcResolver = ({ name, args }) => {
      if (name === 'fn_can_contact') return { data: true };
      if (name === 'fn_claim_voice_agent_call_one') {
        return { data: [{
          id: String(args.p_call), organization_id: 7, voice_agent_id: 'agent-1',
          campaign_id: null, customer_id: 'cust-1', status: 'in_progress', attempts: 1,
        }] };
      }
      if (name === 'deduct_comm_credits') return { data: true };
      return { data: null };
    };
    return { resolver, rpc };
  }

  test('M1 [R3-9] una fila `pending` en espera se REUTILIZA y se marca, en vez de quedarse muerta', async () => {
    // `dial_now: false` dejaba una fila pending SIN campaña, y
    // `fn_claim_voice_agent_calls` filtra por campaign_id: nadie la reclamaba nunca.
    const { resolver, rpc } = escenarioDespacho([{ id: 'vac-EN-ESPERA', status: 'pending' }]);
    const { client, ops, rpcs } = makeSupabase(resolver, rpc);

    const r = await dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1' });

    // Se marca ESA fila, no una nueva.
    expect(r.voice_agent_call_id).toBe('vac-EN-ESPERA');
    expect(r.dialed).toBe(true);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
    // Y no se ha creado ninguna fila de más (que era el otro riesgo).
    expect(ops.some((o) => o.table === 'voice_agent_calls' && o.verb === 'insert')).toBe(false);
    // La reserva es la atómica, y sobre la fila que estaba esperando.
    const claim = rpcs.find((x) => x.name === 'fn_claim_voice_agent_call_one');
    expect(claim).toBeDefined();
    expect(claim!.args.p_call).toBe('vac-EN-ESPERA');
  });

  test('M2 [R3-9] pero una llamada REALMENTE viva sigue deduplicando (no se marca dos veces)', async () => {
    for (const estado of ['queued', 'in_progress']) {
      const { resolver, rpc } = escenarioDespacho([{ id: 'vac-VIVA', status: estado }]);
      const { client, rpcs } = makeSupabase(resolver, rpc);

      const r = await dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1' });

      expect([estado, r.voice_agent_call_id]).toEqual([estado, 'vac-VIVA']);
      expect([estado, r.dialed]).toEqual([estado, false]);
      expect(r.reason).toContain('ya hay una llamada');
      expect(rpcs.some((x) => x.name === 'fn_claim_voice_agent_call_one')).toBe(false);
      expect(twilioCreate).not.toHaveBeenCalled();
      twilioCreate.mockClear();
    }
  });

  test('M3 [R3-9] sin nada vivo se crea la fila, como siempre', async () => {
    const { resolver, rpc } = escenarioDespacho([]);
    const { client, ops } = makeSupabase(resolver, rpc);

    const r = await dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1' });

    expect(r.voice_agent_call_id).toBe('vac-NUEVA');
    expect(ops.some((o) => o.table === 'voice_agent_calls' && o.verb === 'insert')).toBe(true);
    expect(twilioCreate).toHaveBeenCalledTimes(1);
  });

  test('M4 [R3-9] con dial_now:false la fila queda pending y NO se marca', async () => {
    const { resolver, rpc } = escenarioDespacho([]);
    const { client, rpcs } = makeSupabase(resolver, rpc);

    const r = await dispatchAgentCall(7, client, { voiceAgentId: 'agent-1', customerId: 'cust-1', dialNow: false });

    expect(r.dialed).toBe(false);
    expect(r.voice_agent_call_id).toBe('vac-NUEVA');
    expect(rpcs.some((x) => x.name === 'fn_claim_voice_agent_call_one')).toBe(false);
    expect(twilioCreate).not.toHaveBeenCalled();
  });

  test('M5 [R3-6] la campaña excluye por AGENTE, no solo por campaña, y sobrevive a una carrera', () => {
    const src = SRC('src/lib/services/crm/voiceAgentService.ts');
    const bloque = src.slice(
      src.indexOf('async function enqueueCampaignTargets'),
      src.indexOf('async function findStageAgentId')
    );
    // El filtro de "ya encoladas" tiene que cubrir el mismo alcance que el índice
    // único parcial: (organización, agente, cliente).
    expect(bloque).toContain(".eq('voice_agent_id', campaign.voice_agent_id)");
    expect(bloque).toContain(".eq('organization_id', orgId)");
    // Una carrera (23505) no puede tumbar el lote entero…
    expect(bloque).toContain("insercion.error.code !== '23505'");
    // …pero cualquier otro error de base SÍ se propaga: nada de tragárselo.
    expect(bloque).toContain("throw new VoiceAgentDbError('enqueueCampaignTargets.insert'");
    expect(bloque).not.toMatch(/catch\s*\(\s*\)\s*\{\s*\}/);
  });

  test('M6 [R3-7] si el cobro de créditos falla, la llamada NO se da por conciliada', () => {
    const src = SRC('src/lib/services/integrations/twilio/voiceAgent/conversationRelayHandler.ts');
    const bloque = src.slice(src.indexOf('const creditsToCharge'), src.indexOf('// Actualizar log'));
    // El sello depende del resultado del cobro (antes se sellaba pasara lo que pasara).
    expect(bloque).toContain('cobroOk');
    expect(bloque).toMatch(/if \(settleRowId && !cobroOk\)[\s\S]{0,200}settleRowId = null/);
    // El error sigue registrándose con su mensaje real.
    expect(bloque).toContain('creditError.message');
    // Y el sello solo ocurre dentro del `if (settleRowId)`, ya anulado si falló.
    expect(bloque.indexOf('cobroOk = false')).toBeLessThan(bloque.indexOf('if (settleRowId && !cobroOk)'));
  });
});
