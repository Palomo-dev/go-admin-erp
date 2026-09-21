/// <reference types="jest" />
/**
 * F10 — harness del cierre «al ganar» (consolidación 2026-09-21, extraído del
 * tester D1/D2). Semilla con el señuelo org 121 PRIMERO en cada tabla y con
 * los MISMOS ids (un filtro de organización olvidado lo devuelve) y un cliente
 * doble con los índices únicos parciales REALES de la BD (verificados por MCP
 * el 2026-09-16), comprobados al RESOLVER (`then`) como en Postgres para que
 * `Promise.all` interleave de verdad. Lo usa `f10.cierre.stable.test.ts`.
 */
import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f10FakeSupabase';
import type { OpportunityData, WonCloseDeps } from '@/lib/services/crm/wonCloseSteps';

export const ORG = 120;
export const DECOY = 121;
export const NOW = new Date('2026-09-15T15:00:00.000Z');
export const STEPS = [{ day: 0, key: 'kickoff', owner: 'vendor', title: 'Kickoff' }, { day: 7, key: 'config', owner: 'cs', title: 'Configuración' }];

export const opp: OpportunityData = {
  id: 'op-1', name: 'Plan anual', customer_id: 'c-1', amount: 1200000, currency: 'COP', salesperson_id: 'u-seller',
  pipeline_id: 'pipe-1', stage_id: 'st-won', billing_cycle_months: 1, metadata: { foo: 'bar' }, created_by: 'u-owner',
};

export const state = { db: null as unknown as FakeDb };

export function seed(over: { status?: string; closedAt?: string | null; cycle?: number } = {}): FakeDb {
  return {
    writes: [],
    rows: {
      opportunities: [
        { id: 'op-1', organization_id: DECOY, name: 'Señuelo', status: 'won', customer_id: 'c-1', amount: 5, currency: 'USD', salesperson_id: 'u-121', billing_cycle_months: 12, closed_at: '2020-01-01T00:00:00.000Z', metadata: null },
        { id: 'op-1', organization_id: ORG, name: 'Plan anual', status: over.status ?? 'won', customer_id: 'c-1', amount: 1200000, currency: 'COP', salesperson_id: 'u-seller', billing_cycle_months: over.cycle ?? 1, closed_at: over.closedAt ?? null, metadata: { foo: 'bar' } },
      ],
      pipelines: [
        { id: 'p-onb-121', organization_id: DECOY, pipeline_type: 'onboarding' }, { id: 'p-ren-121', organization_id: DECOY, pipeline_type: 'renewal' },
        { id: 'p-onb', organization_id: ORG, pipeline_type: 'onboarding' }, { id: 'p-ren', organization_id: ORG, pipeline_type: 'renewal' },
      ],
      stages: [
        { id: 's-onb-121', pipeline_id: 'p-onb-121', position: 1 }, { id: 's-ren-121', pipeline_id: 'p-ren-121', position: 1 },
        { id: 's-onb-2', pipeline_id: 'p-onb', position: 2 }, { id: 's-onb-1', pipeline_id: 'p-onb', position: 1 }, { id: 's-ren-1', pipeline_id: 'p-ren', position: 1 },
      ],
      onboarding_templates: [
        { id: 'tpl-121', organization_id: DECOY, name: 'AAA señuelo (primera alfabéticamente)', steps: [{ title: 'Intruso' }], default_duration_days: 1, is_active: true },
        { id: 'tpl-120', organization_id: ORG, name: 'Estándar', steps: STEPS, default_duration_days: 30, is_active: true },
      ],
      customers: [{ id: 'c-1', organization_id: DECOY, full_name: 'Intruso' }, { id: 'c-1', organization_id: ORG, full_name: 'Cliente Uno' }],
      sequences: [{ id: 'seq-121', organization_id: DECOY, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null }],
      onboarding_instances: [], onboarding_steps: [], tasks: [],
    },
  };
}

export type Sb = WonCloseDeps['supabase'];

/**
 * Índices únicos parciales reales:
 *  - uq_opportunities_one_onboarding_child_per_parent (organization_id, parent_opportunity_id, pipeline_id) WHERE metadata->>'type'='onboarding' AND parent IS NOT NULL
 *  - uq_opportunities_one_renewal_per_parent (organization_id, parent_opportunity_id) WHERE deal_type='renewal' AND parent IS NOT NULL
 *  - uq_onboarding_instances_org_opportunity (organization_id, opportunity_id) WHERE opportunity_id IS NOT NULL
 */
export function violatedIndex(table: string, r: Row, all: Row[]): string | null {
  const meta = r.metadata as { type?: string } | null | undefined;
  if (table === 'opportunities' && r.parent_opportunity_id) {
    if (meta?.type === 'onboarding' && all.some((e) => e.organization_id === r.organization_id && e.parent_opportunity_id === r.parent_opportunity_id && e.pipeline_id === r.pipeline_id && (e.metadata as { type?: string } | null)?.type === 'onboarding')) return 'uq_opportunities_one_onboarding_child_per_parent';
    if (r.deal_type === 'renewal' && all.some((e) => e.organization_id === r.organization_id && e.parent_opportunity_id === r.parent_opportunity_id && e.deal_type === 'renewal')) return 'uq_opportunities_one_renewal_per_parent';
  }
  if (table === 'onboarding_instances' && r.opportunity_id && all.some((e) => e.organization_id === r.organization_id && e.opportunity_id === r.opportunity_id)) return 'uq_onboarding_instances_org_opportunity';
  return null;
}

export function uniqueClient(database: FakeDb = state.db): Sb {
  const base = createFakeSupabase(database);
  return {
    ...base,
    from: (t: string) => {
      const chain = base.from(t) as Record<string, unknown>;
      const insert = chain.insert as (row: Row | Row[]) => unknown;
      const then = chain.then as (res: (v: unknown) => void, rej?: (e: unknown) => void) => void;
      let pending: Row[] | null = null;
      chain.insert = (row: Row | Row[]) => { pending = Array.isArray(row) ? row : [row]; return insert(row); };
      chain.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => {
        if (pending) {
          for (const r of pending) {
            const idx = violatedIndex(t, r, database.rows[t] ?? []);
            if (idx) {
              database.writes.push({ table: t, op: 'insert', row: r, filters: { __unique: idx } });
              res({ data: null, error: { code: '23505', message: `duplicate key value violates unique constraint "${idx}"` }, count: null });
              return;
            }
          }
        }
        then(res, rej);
      };
      return chain;
    },
  } as unknown as Sb;
}

export function deps(over: Partial<WonCloseDeps> = {}): WonCloseDeps {
  return {
    supabase: uniqueClient(state.db), orgId: ORG, contextBranchId: 7, timezone: 'America/Bogota', now: () => new Date(NOW),
    getLatestProposal: async () => ({ id: 'q-1', branch_id: 3 }), convertToInvoice: async () => 'inv-1', accrueCommission: async () => null,
    ...over,
  };
}

export const children = () => state.db.rows.opportunities.filter((o) => o.parent_opportunity_id === 'op-1' && (o.metadata as { type?: string } | null)?.type === 'onboarding');
export const renewals = () => state.db.rows.opportunities.filter((o) => o.deal_type === 'renewal' && o.parent_opportunity_id === 'op-1');
export const milestones = () => state.db.rows.tasks.filter((t) => t.type === 'renewal_milestone');
/** Filas de una escritura (los insert en lote viajan como `{ __rows }` en el doble). */
export const writeRows = (w: { row: Row | null }): Row[] => (w.row && Array.isArray((w.row as Row).__rows) ? ((w.row as Row).__rows as Row[]) : [w.row ?? {}]);
export const decoyRows = (t: string) => (state.db.rows[t] ?? []).filter((r) => r.organization_id === DECOY);
export const decoySnapshot = () => JSON.stringify(state.db.rows.opportunities[0]);
/** La fila de la org 120 (la segunda: el señuelo va primero). */
export const parent = () => state.db.rows.opportunities[1];
