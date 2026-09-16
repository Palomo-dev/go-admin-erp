/// <reference types="jest" />
/**
 * Tester adversarial D1/D2 (sprint de deuda 2026-09-16): el cierre «al ganar»
 * delega en F11. Ataca idempotencia real (Promise.all con los índices únicos
 * parciales REALES de la BD simulados en el doble), tenencia (señuelo org 121
 * con los MISMOS ids y colocado primero en cada tabla), fechas (fallback de
 * closed_at, zona de la organización, fin de mes, hito exactamente en `now`),
 * comportamiento cambiado (oportunidad no ganada), `sequence_error` y el grafo
 * de imports que `WonCloseModal` (cliente) arrastra al navegador.
 * Fixtures sin datos reales (org 120 / señuelo 121). Ejecutar con TZ=UTC y
 * TZ=America/Bogota.
 */
import { createFakeSupabase, type FakeDb, type Row } from '@/lib/services/crm/__tests__/f10FakeSupabase';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve as pathResolve, relative } from 'path';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
const enrollMock = jest.fn(async (_org: number, seqId: string) => ({ id: `enr-${seqId}`, created: true, reason: null, steps: 1, first_run_at: null, status: 'active' }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: (...a: unknown[]) => enrollMock(a[0] as number, a[1] as string) }));

import { scheduleRenewal, SEQUENCE_ENROLL_DEFERRED } from '@/lib/services/crm/renewalService';
import { executeOnboarding, executeRenewal, type OpportunityData, type WonCloseDeps } from '@/lib/services/crm/wonCloseSteps';

const ORG = 120;
const DECOY = 121;
const NOW = new Date('2026-09-15T15:00:00.000Z');
const STEPS = [{ day: 0, key: 'kickoff', owner: 'vendor', title: 'Kickoff' }, { day: 7, key: 'config', owner: 'cs', title: 'Configuración' }];

const opp: OpportunityData = {
  id: 'op-1', name: 'Plan anual', customer_id: 'c-1', amount: 1200000, currency: 'COP', salesperson_id: 'u-seller',
  pipeline_id: 'pipe-1', stage_id: 'st-won', billing_cycle_months: 1, metadata: { foo: 'bar' }, created_by: 'u-owner',
};

let db: FakeDb;

/** El señuelo (121) va PRIMERO en cada tabla y comparte ids: un filtro de organización olvidado lo devuelve. */
function seed(over: { status?: string; closedAt?: string | null; cycle?: number } = {}): FakeDb {
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

type Sb = WonCloseDeps['supabase'];

/**
 * Doble con los índices únicos parciales REALES (verificados por MCP el 2026-09-16):
 *  - uq_opportunities_one_onboarding_child_per_parent (organization_id, parent_opportunity_id, pipeline_id) WHERE metadata->>'type'='onboarding' AND parent IS NOT NULL
 *  - uq_opportunities_one_renewal_per_parent (organization_id, parent_opportunity_id) WHERE deal_type='renewal' AND parent IS NOT NULL
 *  - uq_onboarding_instances_org_opportunity (organization_id, opportunity_id) WHERE opportunity_id IS NOT NULL
 * La comprobación se hace al RESOLVER (then), como en Postgres, para que Promise.all interleave de verdad.
 */
function violatedIndex(table: string, r: Row, all: Row[]): string | null {
  const meta = r.metadata as { type?: string } | null | undefined;
  if (table === 'opportunities' && r.parent_opportunity_id) {
    if (meta?.type === 'onboarding' && all.some((e) => e.organization_id === r.organization_id && e.parent_opportunity_id === r.parent_opportunity_id && e.pipeline_id === r.pipeline_id && (e.metadata as { type?: string } | null)?.type === 'onboarding')) return 'uq_opportunities_one_onboarding_child_per_parent';
    if (r.deal_type === 'renewal' && all.some((e) => e.organization_id === r.organization_id && e.parent_opportunity_id === r.parent_opportunity_id && e.deal_type === 'renewal')) return 'uq_opportunities_one_renewal_per_parent';
  }
  if (table === 'onboarding_instances' && r.opportunity_id && all.some((e) => e.organization_id === r.organization_id && e.opportunity_id === r.opportunity_id)) return 'uq_onboarding_instances_org_opportunity';
  return null;
}

function uniqueClient(database: FakeDb): Sb {
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

function deps(over: Partial<WonCloseDeps> = {}): WonCloseDeps {
  return {
    supabase: uniqueClient(db), orgId: ORG, contextBranchId: 7, timezone: 'America/Bogota', now: () => new Date(NOW),
    getLatestProposal: async () => ({ id: 'q-1', branch_id: 3 }), convertToInvoice: async () => 'inv-1', accrueCommission: async () => null,
    ...over,
  };
}

const children = () => db.rows.opportunities.filter((o) => o.parent_opportunity_id === 'op-1' && (o.metadata as { type?: string } | null)?.type === 'onboarding');
const renewals = () => db.rows.opportunities.filter((o) => o.deal_type === 'renewal' && o.parent_opportunity_id === 'op-1');
const milestones = () => db.rows.tasks.filter((t) => t.type === 'renewal_milestone');
/** Filas de una escritura (los insert en lote viajan como `{ __rows }` en el doble). */
const writeRows = (w: { row: Row | null }): Row[] => (w.row && Array.isArray((w.row as Row).__rows) ? ((w.row as Row).__rows as Row[]) : [w.row ?? {}]);
const decoyRows = (t: string) => (db.rows[t] ?? []).filter((r) => r.organization_id === DECOY);
const decoyRow = () => db.rows.opportunities[0];
const decoySnapshot = () => JSON.stringify(decoyRow());

beforeEach(() => { db = seed(); enrollMock.mockClear(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

// ─── (1) Idempotencia real ───────────────────────────────────────────────────

describe('idempotencia real con los índices únicos parciales de la BD', () => {
  it('dos clics simultáneos (Promise.all) sobre «onboarding» → UNA hija, UNA instancia, 2 pasos, ninguno lanza', async () => {
    const [a, b] = await Promise.all([executeOnboarding(opp, deps()), executeOnboarding(opp, deps())]);
    expect(children()).toHaveLength(1);
    expect(db.rows.onboarding_instances).toHaveLength(1);
    expect(db.rows.onboarding_steps).toHaveLength(2);
    expect([a, b].filter((m) => /^Onboarding (creado|ya existía)/.test(m))).toHaveLength(2);
    expect(db.writes.filter((w) => w.filters.__unique)).not.toHaveLength(0); // el índice único intervino de verdad
  });

  it('cinco ejecuciones simultáneas de «onboarding» → sin duplicados y sin excepciones', async () => {
    await Promise.all(Array.from({ length: 5 }, () => executeOnboarding(opp, deps())));
    expect(children()).toHaveLength(1);
    expect(db.rows.onboarding_instances).toHaveLength(1);
    expect(db.rows.onboarding_steps).toHaveLength(2);
  });

  it('23505 en la INSTANCIA (uq_onboarding_instances_org_opportunity) con la hija ya creada → no lanza, una instancia, «ya existía»', async () => {
    await executeOnboarding(opp, deps());
    // Se borra la instancia y se recrea con el índice devolviendo 23505 en el primer intento.
    const inst = db.rows.onboarding_instances[0];
    db.rows.onboarding_instances = [];
    const base = uniqueClient(db);
    let armed = true;
    const sb: Sb = { ...base, from: (t: string) => {
      const chain = (base as unknown as { from: (t: string) => Record<string, unknown> }).from(t);
      if (t === 'onboarding_instances' && armed) {
        const insert = chain.insert as (row: Row) => unknown;
        // El «ganador» de la carrera ya insertó la instancia: el índice único del doble responde 23505.
        chain.insert = (row: Row) => { armed = false; db.rows.onboarding_instances.push(inst); return insert(row); };
      }
      return chain;
    } } as unknown as Sb;
    const out = await executeOnboarding(opp, deps({ supabase: sb }));
    expect(out).toMatch(/^Onboarding ya existía: .* — no se duplicó$/);
    expect(db.rows.onboarding_instances).toHaveLength(1);
    expect(children()).toHaveLength(1);
  });

  it('dos clics simultáneos sobre «renovación» → UNA renovación, hitos una sola vez (2 futuros), ninguno lanza, metadata del padre coherente', async () => {
    const [a, b] = await Promise.all([executeRenewal(opp, deps()), executeRenewal(opp, deps())]);
    expect(renewals()).toHaveLength(1);
    expect(milestones()).toHaveLength(2);
    expect([a, b].sort()).toEqual(['Hitos creados: 2 (renovación: 15/10/2026)', 'Renovación ya programada (15/10/2026) — no se duplicó']);
    expect(db.rows.opportunities[1].metadata).toEqual({ foo: 'bar', renewal_date: '2026-10-15T15:00:00.000Z', billing_cycle_months: 1 });
  });

  it('cinco ejecuciones simultáneas de «renovación» → una sola renovación y 2 hitos', async () => {
    await Promise.all(Array.from({ length: 5 }, () => executeRenewal(opp, deps())));
    expect(renewals()).toHaveLength(1);
    expect(milestones()).toHaveLength(2);
  });

  it('secuencial: onboarding y renovación ejecutados dos veces (modal reabierto) no escriben nada nuevo la segunda vez salvo el metadata del padre', async () => {
    await executeOnboarding(opp, deps());
    await executeRenewal(opp, deps());
    const before = db.writes.length;
    expect(await executeOnboarding(opp, deps())).toMatch(/ya existía/);
    expect(await executeRenewal(opp, deps())).toMatch(/ya programada/);
    const extra = db.writes.slice(before);
    expect(extra.map((w) => `${w.table}:${w.op}`)).toEqual(['opportunities:update']);
    expect(extra[0].filters).toMatchObject({ id: 'op-1', organization_id: ORG });
  });
});

// ─── (2) Seguridad: la organización sale del contexto ────────────────────────

describe('tenencia: todo lleva la organización del contexto, nunca la del señuelo', () => {
  it('onboarding: hija, instancia y pasos en org 120; nombre del cliente y plantilla de la 120 aunque el señuelo comparte id y va primero', async () => {
    const snap = decoySnapshot();
    await executeOnboarding(opp, deps());
    const child = children()[0];
    expect(child).toMatchObject({ organization_id: ORG, pipeline_id: 'p-onb', stage_id: 's-onb-1', customer_id: 'c-1', name: 'Onboarding — Cliente Uno', branch_id: 7, created_by: 'u-owner', salesperson_id: 'u-seller', currency: 'COP' });
    expect(db.rows.onboarding_instances[0]).toMatchObject({ organization_id: ORG, template_id: 'tpl-120', opportunity_id: child.id, customer_id: 'c-1', parent_opportunity_id: 'op-1' });
    for (const s of db.rows.onboarding_steps) expect(s).toMatchObject({ organization_id: ORG, instance_id: db.rows.onboarding_instances[0].id });
    expect(db.rows.onboarding_steps.map((s) => s.name)).toEqual(['Kickoff', 'Configuración']);
    for (const w of db.writes) for (const r of writeRows(w)) expect(r.organization_id ?? w.filters.organization_id).toBe(ORG);
    expect(decoySnapshot()).toBe(snap);
    expect(decoyRows('opportunities')).toHaveLength(1);
  });

  it('renovación: oportunidad, hitos y metadata en org 120; el señuelo (mismo id, closed_at 2020, USD) no se lee ni se toca', async () => {
    const snap = decoySnapshot();
    expect(await executeRenewal(opp, deps())).toBe('Hitos creados: 2 (renovación: 15/10/2026)');
    const ren = renewals()[0];
    expect(ren).toMatchObject({ organization_id: ORG, pipeline_id: 'p-ren', stage_id: 's-ren-1', customer_id: 'c-1', currency: 'COP', amount: 1200000, salesperson_id: 'u-seller', expected_close_date: '2026-10-15' });
    expect(String(ren.name)).toContain('Cliente Uno');
    for (const t of milestones()) expect(t).toMatchObject({ organization_id: ORG, related_to_id: ren.id, customer_id: 'c-1', assigned_to: 'u-seller' });
    for (const w of db.writes) for (const r of writeRows(w)) expect(r.organization_id ?? w.filters.organization_id).toBe(ORG);
    expect(decoySnapshot()).toBe(snap);
    expect(enrollMock).not.toHaveBeenCalled(); // la secuencia del señuelo no se usa
  });

  it('oportunidad ajena: deps.orgId=120 pero la oportunidad solo existe en la 121 → ambos pasos lanzan «no encontrada en la organización» y no escriben', async () => {
    db.rows.opportunities = db.rows.opportunities.filter((o) => o.organization_id !== ORG);
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/no encontrada en la organización/);
    await expect(executeRenewal(opp, deps())).rejects.toThrow(/no encontrada en la organización/);
    expect(db.writes).toEqual([]);
  });

  it('el pipeline de renovación se crea en la org del contexto si no existe (nunca se reutiliza el de la 121)', async () => {
    db.rows.pipelines = db.rows.pipelines.filter((p) => p.id !== 'p-ren');
    await executeRenewal(opp, deps());
    const created = db.rows.pipelines.find((p) => p.organization_id === ORG && p.pipeline_type === 'renewal');
    expect(created).toBeTruthy();
    expect(renewals()[0].pipeline_id).toBe(created!.id);
    expect(db.rows.stages.filter((s) => s.pipeline_id === created!.id)).toHaveLength(6);
  });
});

// ─── (3) Fechas ──────────────────────────────────────────────────────────────

describe('fechas: closedAtFallback, zona de la organización, ciclos, hito en now', () => {
  it('closed_at null en la BD → el vencimiento sale del instante del cierre y NO se escribe closed_at', async () => {
    expect(await executeRenewal(opp, deps())).toBe('Hitos creados: 2 (renovación: 15/10/2026)');
    expect(db.rows.opportunities[1].closed_at).toBeNull();
    expect(renewals()[0].metadata).toMatchObject({ renewal_date: '2026-10-15T15:00:00.000Z' });
  });

  it('el hito de 30 días cae EXACTAMENTE en now (ciclo 1 mes, 15-sep → 15-oct = 30 días) y se excluye: ningún hito con due_date <= now', async () => {
    await executeRenewal(opp, deps());
    expect(milestones().map((t) => t.due_date)).toEqual(['2026-09-30T15:00:00.000Z', '2026-10-08T15:00:00.000Z']);
    for (const t of milestones()) expect(Date.parse(String(t.due_date))).toBeGreaterThan(NOW.getTime());
    expect(renewals()[0].next_contact_at).toBe('2026-09-30T15:00:00.000Z');
  });

  it('ciclo de 12 meses → 6 hitos futuros ordenados 120→7 y vencimiento un año después', async () => {
    db = seed({ cycle: 12 });
    expect(await executeRenewal({ ...opp, billing_cycle_months: 12 }, deps())).toBe('Hitos creados: 6 (renovación: 15/09/2027)');
    const dues = milestones().map((t) => Date.parse(String(t.due_date)));
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
    expect(dues).toHaveLength(6);
    expect(renewals()[0]).toMatchObject({ expected_close_date: '2027-09-15', billing_cycle_months: 12 });
  });

  it('fin de mes en la zona de la organización: 30-ene 23:30 Bogotá (31-ene 04:30Z) + 1 mes = 28-feb 23:30 Bogotá; en UTC es 31-ene → 28-feb 04:30Z', async () => {
    const closed = '2026-01-31T04:30:00.000Z';
    const now = new Date('2026-01-31T05:00:00.000Z');
    db = seed({ closedAt: closed });
    const bog = await executeRenewal(opp, deps({ now: () => new Date(now), timezone: 'America/Bogota' }));
    expect(bog).toBe('Hitos creados: 2 (renovación: 28/02/2026)'); // 28 días de ciclo: solo los hitos de 15 y 7
    expect(renewals()[0]).toMatchObject({ expected_close_date: '2026-02-28', metadata: expect.objectContaining({ renewal_date: '2026-03-01T04:30:00.000Z' }) });
    expect(db.rows.opportunities[1].metadata).toMatchObject({ renewal_date: '2026-03-01T04:30:00.000Z' });

    db = seed({ closedAt: closed });
    const utc = await executeRenewal(opp, deps({ now: () => new Date(now), timezone: 'UTC' }));
    expect(utc).toBe('Hitos creados: 2 (renovación: 28/02/2026)');
    expect(renewals()[0]).toMatchObject({ expected_close_date: '2026-02-28', metadata: expect.objectContaining({ renewal_date: '2026-02-28T04:30:00.000Z' }) });
  });

  it('borde de medianoche: closed_at 04:59:59Z = 23:59:59 Bogotá del día anterior → etiqueta y expected_close_date del día 14 en Bogotá, del 15 en UTC', async () => {
    const closed = '2026-09-15T04:59:59.000Z';
    db = seed({ closedAt: closed, cycle: 12 });
    expect(await executeRenewal({ ...opp, billing_cycle_months: 12 }, deps({ timezone: 'America/Bogota' }))).toBe('Hitos creados: 6 (renovación: 14/09/2027)');
    expect(renewals()[0].expected_close_date).toBe('2027-09-14');
    db = seed({ closedAt: closed, cycle: 12 });
    expect(await executeRenewal({ ...opp, billing_cycle_months: 12 }, deps({ timezone: 'UTC' }))).toBe('Hitos creados: 6 (renovación: 15/09/2027)');
    expect(renewals()[0].expected_close_date).toBe('2027-09-15');
  });

  it('segunda ejecución con closed_at real: metadata.renewal_date del padre no cambia aunque now avance', async () => {
    db = seed({ closedAt: '2026-09-01T15:00:00.000Z' });
    await executeRenewal(opp, deps());
    const first = (db.rows.opportunities[1].metadata as Row).renewal_date;
    expect(await executeRenewal(opp, deps({ now: () => new Date('2026-09-20T15:00:00.000Z') }))).toBe('Renovación ya programada (01/10/2026) — no se duplicó');
    expect((db.rows.opportunities[1].metadata as Row).renewal_date).toBe(first);
  });

  it('los pasos de onboarding se fechan desde now con el day de la plantilla (0 y 7)', async () => {
    await executeOnboarding(opp, deps());
    expect(db.rows.onboarding_steps.map((s) => s.due_date)).toEqual(['2026-09-15T15:00:00.000Z', '2026-09-22T15:00:00.000Z']);
    expect(db.rows.onboarding_instances[0].started_at).toBe('2026-09-15T15:00:00.000Z');
  });
});

// ─── (5) Comportamiento cambiado: oportunidad no ganada ──────────────────────

describe('oportunidad no ganada al abrir el modal (PATCH fallido o etapa is_won sin win_data)', () => {
  it('onboarding: F11 lanza «no está ganada», el mensaje sube intacto y no se escribe nada', async () => {
    db = seed({ status: 'open' });
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/no está ganada/);
    expect(db.writes).toEqual([]);
  });

  it('renovación: sin closed_at y sin status won el fallback NO aplica → lanza «no está ganada» y no crea renovación ni hitos', async () => {
    db = seed({ status: 'open' });
    await expect(executeRenewal(opp, deps())).rejects.toThrow(/no está ganada/);
    expect(db.writes).toEqual([]);
    expect(renewals()).toHaveLength(0);
  });

  it('renovación: perdida con closed_at (lost) tampoco se programa', async () => {
    db = seed({ status: 'lost', closedAt: '2026-09-10T15:00:00.000Z' });
    await expect(executeRenewal(opp, deps())).rejects.toThrow(/no está ganada/);
    expect(db.writes).toEqual([]);
  });

  it('el modal pinta el error del paso de forma honesta (status error + err.message)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/crm/pipeline/WonCloseModal.tsx'), 'utf8');
    expect(src).toMatch(/updateStep\(step\.id, \{ status: 'error', result: err instanceof Error \? err\.message/);
    expect(src).toMatch(/step\.status === 'error' \? 'text-red-600'/);
  });
});

// ─── Escrituras parciales y (6) sequence_error ───────────────────────────────

describe('validación antes de escribir y sequence_error visible', () => {
  it('sin plantilla de onboarding activa → lanza con mensaje claro y NO deja una hija huérfana; la segunda vez tampoco', async () => {
    db.rows.onboarding_templates = db.rows.onboarding_templates.filter((t) => t.organization_id !== ORG);
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/plantilla/);
    expect(children()).toHaveLength(0);
    expect(db.writes).toEqual([]);
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/plantilla/);
    expect(children()).toHaveLength(0);
  });

  // Ronda 2 (H1): el navegador NO inscribe en la secuencia (no tiene `enroll`; `sequenceService`
  // arrastra twilio/svix/service role). El paso lo dice y la inscripción la hace `renewals_sync`.
  it('secuencia de renovación de la org: desde el navegador NO se llama a sequenceService; el paso informa que la inscribe el servidor y la renovación queda creada', async () => {
    db.rows.sequences.push({ id: 'seq-120', organization_id: ORG, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null });
    const out = await executeRenewal(opp, deps());
    expect(out).toMatch(/^Hitos creados: 2 \(renovación: 15\/10\/2026\)/);
    expect(out).toMatch(/secuencia de renovación/);
    expect(out).toContain(SEQUENCE_ENROLL_DEFERRED);
    expect(renewals()).toHaveLength(1);
    expect(enrollMock).not.toHaveBeenCalled();
    expect(db.rows.sequence_enrollments ?? []).toEqual([]);
  });

  it('sin secuencia de renovación en la org (solo la del señuelo) → mensaje limpio y sin llamar a sequenceService', async () => {
    expect(await executeRenewal(opp, deps())).toBe('Hitos creados: 2 (renovación: 15/10/2026)');
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it('cuando el llamador SÍ aporta `enroll` (servidor) y falla, el paso lo dice (no se traga el error) y la renovación queda creada', async () => {
    db.rows.sequences.push({ id: 'seq-120', organization_id: ORG, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null });
    const enroll = jest.fn(async () => { throw new Error('proveedor caído'); });
    const schedule: NonNullable<WonCloseDeps['scheduleRenewal']> = (o, id, cycle, sb, opts) => scheduleRenewal(o, id, cycle, sb, { ...opts, enroll });
    const out = await executeRenewal(opp, deps({ scheduleRenewal: schedule }));
    expect(out).toMatch(/^Hitos creados: 2 \(renovación: 15\/10\/2026\)/);
    expect(out).toMatch(/secuencia de renovación no inscrita: proveedor caído/);
    expect(renewals()).toHaveLength(1);
    expect(enroll).toHaveBeenCalledTimes(1);
    expect((enroll.mock.calls[0] as unknown[]).slice(0, 3)).toEqual([ORG, 'seq-120', renewals()[0].id]);
  });

  it('la renovación creada desde el modal lleva branch_id de la sucursal del contexto y created_by de la oportunidad (como la hija de onboarding)', async () => {
    await executeRenewal(opp, deps({ contextBranchId: 7 }));
    expect(renewals()[0]).toMatchObject({ organization_id: ORG, branch_id: 7, created_by: 'u-owner' });
    // sin sucursal de contexto («Todas»): hereda la del contrato padre, si la tiene
    db = seed();
    db.rows.opportunities[1].branch_id = 11;
    await executeRenewal(opp, deps({ contextBranchId: null }));
    expect(renewals()[0]).toMatchObject({ branch_id: 11, created_by: 'u-owner' });
  });
});

// ─── (4) Navegador: grafo de imports de wonCloseSteps ────────────────────────

const ROOT = process.cwd();
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];
function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = pathResolve(dirname(from), spec);
  else return null;
  for (const e of ['', ...EXTS, ...EXTS.map((x) => `/index${x}`)]) { const p = base + e; if (existsSync(p) && statSync(p).isFile()) return p; }
  return null;
}
/** Módulos alcanzados desde `entry` (imports estáticos; `withDynamic` añade `import()`), con sus especificadores externos. */
function graph(entry: string, withDynamic: boolean): { files: string[]; externals: string[] } {
  const seen = new Set<string>(); const externals = new Set<string>();
  const walk = (f: string) => {
    if (seen.has(f)) return; seen.add(f);
    const code = readFileSync(f, 'utf8');
    for (const line of code.split('\n')) {
      const t = line.trim();
      if (!/^(import|export)\b/.test(t) || /^(import|export)\s+type\s/.test(t)) continue;
      const m = t.match(/from\s+['"]([^'"]+)['"]/) ?? t.match(/^import\s+['"]([^'"]+)['"]/);
      if (!m) continue;
      const r = resolveSpec(f, m[1]); if (r) walk(r); else externals.add(m[1]);
    }
    if (withDynamic) {
      for (const d of code.matchAll(/(?:\bimport|\brequire)\(\s*['"]([^'"]+)['"]\s*\)/g)) { const r = resolveSpec(f, d[1]); if (r) walk(r); else externals.add(d[1]); }
    }
  };
  walk(entry);
  return { files: [...seen].map((f) => relative(ROOT, f).replace(/\\/g, '/')), externals: [...externals] };
}
const SERVER_ONLY = /server-service|server-only|twilio|svix|standardwebhooks|nodemailer|next\/headers|sequenceService|emailService|webhookSignatures/;
const NODE_BUILTINS_SIN_POLYFILL = new Set(['net', 'tls', 'fs', 'dns', 'child_process', 'node:net', 'node:tls', 'node:fs']);

describe('navegador: lo que WonCloseModal (cliente) arrastra vía wonCloseSteps', () => {
  const entry = join(ROOT, 'src/lib/services/crm/wonCloseSteps.ts');

  it('WonCloseModal es cliente e importa wonCloseSteps estáticamente', () => {
    const modal = readFileSync(join(ROOT, 'src/components/crm/pipeline/WonCloseModal.tsx'), 'utf8');
    expect(modal.startsWith("'use client'")).toBe(true);
    expect(modal).toMatch(/from '@\/lib\/services\/crm\/wonCloseSteps'/);
  });

  it('por import ESTÁTICO no se alcanza ningún módulo solo-servidor ni builtin de Node sin polyfill', () => {
    const g = graph(entry, false);
    expect(g.files).toEqual(expect.arrayContaining(['src/lib/services/crm/onboardingService.ts', 'src/lib/services/crm/renewalService.ts']));
    expect(g.files.filter((f) => SERVER_ONLY.test(f))).toEqual([]);
    expect(g.externals.filter((e) => SERVER_ONLY.test(e) || NODE_BUILTINS_SIN_POLYFILL.has(e))).toEqual([]);
  });

  // H1 [alto] del tester D1/D2 (2026-09-16), cerrado en la ronda 2: renewalService hacía
  // `import('@/lib/services/crm/sequenceService')`; webpack lo compila igualmente en
  // el bundle de cliente y esa cadena llegaba a emailService → email/webhookService →
  // security/webhookSignatures → twilio (net, fs, tls sin polyfill en Next 15) y a
  // supabase/server-service (`next build`: «Can't resolve 'net'»). Ahora la inscripción
  // se INYECTA desde los llamadores de servidor (`ScheduleRenewalOptions.enroll`).
  it('incluyendo import() dinámicos y require() tampoco se alcanza sequenceService/webhookSignatures/twilio/server-service ni net/fs/tls', () => {
    const g = graph(entry, true);
    expect(g.files.filter((f) => SERVER_ONLY.test(f))).toEqual([]);
    expect(g.externals.filter((e) => SERVER_ONLY.test(e) || NODE_BUILTINS_SIN_POLYFILL.has(e))).toEqual([]);
  });

  it('el recorrido dinámico sí detecta un import() (control del propio test: un módulo de servidor real lo alcanza)', () => {
    // `renewals/sync/route.ts` importa sequenceService estáticamente: si el walker no lo viera, el test anterior no probaría nada.
    const g = graph(join(ROOT, 'src/app/api/crm/renewals/sync/route.ts'), true);
    expect(g.files.filter((f) => /sequenceService/.test(f))).toEqual(['src/lib/services/crm/sequenceService.ts']);
  });

  it('renewalService no menciona sequenceService de ninguna forma (ni estático, ni import(), ni require)', () => {
    const src = readFileSync(join(ROOT, 'src/lib/services/crm/renewalService.ts'), 'utf8');
    expect(src).not.toMatch(/sequenceService/);
    expect(src).not.toMatch(/import\(/);
    expect(src).not.toMatch(/require\(/);
  });

  it('los llamadores de servidor (renewals_sync y la ruta POST) inyectan enrollInSequence', () => {
    for (const f of ['src/lib/jobs/scheduled/renewalsSync.ts', 'src/app/api/crm/renewals/sync/route.ts']) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect({ f, hit: /import \{[^}]*\benrollInSequence\b[^}]*\} from '@\/lib\/services\/crm\/sequenceService'/.test(src) }).toEqual({ f, hit: true });
      expect({ f, hit: /enroll: enrollInSequence/.test(src) }).toEqual({ f, hit: true });
    }
  });
});

// ─── Guardas estáticas de la zona ────────────────────────────────────────────

describe('guardas estáticas', () => {
  const zona = ['src/lib/services/crm/wonCloseSteps.ts', 'src/lib/services/crm/onboardingService.ts', 'src/lib/services/crm/renewalService.ts', 'src/lib/services/crm/renewalMilestones.ts'];
  it("toISOString().split('T')[0] y .split('T')[0] sobre valores de BD están prohibidos en la zona", () => {
    for (const f of zona) {
      const src = readFileSync(join(ROOT, f), 'utf8');
      expect({ f, hit: /toISOString\(\)\.split\('T'\)\[0\]/.test(src) }).toEqual({ f, hit: false });
      expect({ f, hit: /\.split\('T'\)\[0\]/.test(src) }).toEqual({ f, hit: false });
    }
  });
  // Observación del tester D1/D2 (r2): `useStageFlow.onWonConfirmed` abría WonCloseModal aunque el PATCH de etapa
  // (`change()`) devolviera false (gate, error, needs_won de nuevo) y el modal ejecutaba los pasos sobre una
  // oportunidad que NO estaba ganada. Sin DOM en jest (jsx: preserve): contrato de fuente.
  it('useStageFlow: onWonConfirmed no abre WonCloseModal si change() devuelve false', () => {
    const src = readFileSync(join(ROOT, 'src/components/crm/oportunidades/detail/useStageFlow.tsx'), 'utf8');
    const body = src.slice(src.indexOf('const onWonConfirmed'), src.indexOf('const dialogs'));
    expect(body).toMatch(/if \(!\(await change\(wonStage,/);
    const guard = body.indexOf('if (!(await change(wonStage,');
    const open = body.indexOf('setWonClose(true)');
    expect(guard).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(guard);
    expect(body.slice(guard, open)).toMatch(/return;/);
    // el cambio de etapa nunca se hace «a ciegas» (await change(...) sin mirar el resultado)
    expect(body).not.toMatch(/\{\s*await change\(wonStage/);
  });

  it('wonCloseSteps no crea a mano ni la hija ni los hitos ni la renovación (regla dura 7)', () => {
    const src = readFileSync(join(ROOT, zona[0]), 'utf8');
    expect(src).not.toMatch(/deal_type: 'renewal'/);
    expect(src).not.toMatch(/type: 'onboarding'/);
    expect(src).not.toMatch(/type: 'renewal_milestone'/);
    expect(src).not.toMatch(/setMonth\(/);
  });
});
