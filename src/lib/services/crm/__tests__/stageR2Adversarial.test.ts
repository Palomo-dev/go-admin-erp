/**
 * F9 · ronda 2 — pruebas adversarias del TESTER sobre `changeStage`.
 *
 * Foco: la reconciliación post-trigger (F9-01) con la migración de DB YA
 * aplicada, la escritura optimista con reintento (F9-13) y el bypass de
 * `same_stage`.
 *
 * PROTOCOLO: los casos marcados `test.failing` afirman el comportamiento
 * CORRECTO y HOY FALLAN — pinchan un defecto vivo. Jest los da por buenos
 * mientras el defecto exista y **fallará ruidosamente** en cuanto se corrija:
 * entonces hay que cambiar `test.failing` por `test`, NO invertir el assert.
 *
 * Ronda 3 (builder): S2.3 y S2.7 (F9-35) y S2.6 (F9-37) están corregidos y
 * convertidos en `test` normales, con el mismo escenario y el mismo assert. No
 * queda ningún `test.failing`: los 7 casos afirman el comportamiento correcto.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { changeStage } from '../opportunityStageService';

jest.mock('@/lib/services/crm/stageGateService', () => ({ evaluateStageGate: jest.fn() }));
import { evaluateStageGate } from '@/lib/services/crm/stageGateService';

type Row = Record<string, unknown>;
const gateMock = evaluateStageGate as jest.Mock;

interface Opts {
  /** Emula el trigger YA MIGRADO: deriva status de is_won/is_lost y NO toca closed_at. */
  migratedTrigger?: boolean;
  /** Emula el trigger VIEJO: deriva status de probability y escribe closed_at. */
  legacyTriggerStatus?: 'won' | 'lost' | 'open';
  /** El primer UPDATE con guarda `updated_at` no casa (otro PATCH ganó). */
  conflictOnce?: boolean;
  /** Todos los UPDATE con guarda fallan (conflicto permanente). */
  conflictAlways?: boolean;
  /** Justo después del UPDATE principal, otro proceso mueve la oportunidad. */
  raceAfterUpdate?: Row;
}

function makeSupabase(opp: Row, stage: Row, opts: Opts = {}) {
  const updates: Row[] = [];
  let current: Row = { ...opp };
  let conflictPending = Boolean(opts.conflictOnce);
  let raced = false;
  let mainUpdateDone = false;

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let payload: Row | null = null;
    let isUpdate = false;

    const matching = (): Row[] => {
      const list = table === 'opportunities' ? [current] : table === 'stages' ? [stage] : [];
      return list.filter((r) => filters.every(([c, v]) => !(c in r) || r[c] === v));
    };

    const exec = () => {
      const rows = matching();
      if (!isUpdate) {
        if (table !== 'opportunities') return { data: rows[0] ? { ...rows[0] } : null, error: null };
        // carrera: otro proceso escribe entre el UPDATE principal y el reconcile
        if (mainUpdateDone && opts.raceAfterUpdate && !raced) {
          raced = true;
          current = { ...current, ...opts.raceAfterUpdate };
        }
        return { data: rows[0] ? { ...current } : null, error: null };
      }
      if (opts.conflictAlways || conflictPending) {
        conflictPending = false;
        current = { ...current, updated_at: new Date(Date.now() + 1000).toISOString() };
        return { data: null, error: null };
      }
      if (rows.length === 0) return { data: null, error: null };
      updates.push({ ...(payload ?? {}) });
      const returned = { ...current, ...(payload ?? {}) } as Row;
      current = { ...returned };
      if (payload && 'stage_id' in payload) {
        mainUpdateDone = true;
        if (opts.migratedTrigger) {
          const target = stage.is_won ? 'won' : stage.is_lost ? 'lost' : null;
          if (target && current.status !== target) current.status = target;
        } else if (opts.legacyTriggerStatus) {
          current.status = opts.legacyTriggerStatus;
          current.closed_at = opts.legacyTriggerStatus === 'open' ? null : new Date().toISOString();
        }
      }
      return { data: returned, error: null };
    };

    const b: Row = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push([c, v]); return b; },
      update: (p: Row) => { isUpdate = true; payload = p; return b; },
      maybeSingle: () => Promise.resolve(exec()),
      single: () => Promise.resolve(exec()),
    };
    return b;
  };
  return { sb: { from } as unknown as SupabaseClient, updates, state: () => current };
}

const OPP: Row = { id: 'o1', organization_id: 7, pipeline_id: 'p1', stage_id: 's1', status: 'open', closed_at: null, updated_at: '2026-09-08T10:00:00.000Z', metadata: {} };
const MID: Row = { id: 's2', name: 'Negociación', pipeline_id: 'p1', is_won: false, is_lost: false };
const WON: Row = { id: 'sw', name: 'Ganado', pipeline_id: 'p1', is_won: true, is_lost: false };

beforeEach(() => { gateMock.mockReset(); gateMock.mockResolvedValue({ ok: true, missing: [] }); });

describe('F9-r2 · changeStage adversario', () => {
  // ── S2.1 · con la migración aplicada la reconciliación debe ser un no-op ───
  test('S2.1 trigger migrado (etapa NO terminal): 1 solo UPDATE, sin reconcile', async () => {
    const { sb, updates } = makeSupabase(OPP, MID, { migratedTrigger: true });
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, sb);
    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
  });

  test('S2.2 trigger migrado (etapa GANADA con win_data): 1 solo UPDATE, sin reconcile', async () => {
    const { sb, updates } = makeSupabase(OPP, WON, { migratedTrigger: true });
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sw', wonData: { amount: 100 } }, sb);
    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
  });

  // ── S2.3 · el reconcile pisa a un escritor concurrente (pérdida silenciosa) ─
  test('S2.3 si otro proceso cierra la oportunidad entre el UPDATE y el reconcile, no se debe revertir', async () => {
    const { sb, state } = makeSupabase(OPP, MID, {
      legacyTriggerStatus: 'lost',                                   // fuerza needsFix
      raceAfterUpdate: { status: 'won', closed_at: '2026-09-08T11:00:00.000Z', win_data: { amount: 9 } },
    });
    await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, sb);
    // el cierre ganado del otro proceso NO debería quedar revertido a 'open'
    expect(state().status).toBe('won');
  });

  // ── S2.4 · escritura optimista: sin bucle y sin perder gate_overrides ─────
  test('S2.4 conflicto una vez: reintenta y conserva los gate_overrides existentes', async () => {
    const withOverride: Row = { ...OPP, metadata: { gate_overrides: [{ at: 'x', by: 'u0' }] } };
    gateMock.mockResolvedValue({ ok: false, missing: ['algo'] });
    const { sb, state } = makeSupabase(withOverride, MID, { conflictOnce: true });
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2', override: true }, sb);
    expect(r.ok).toBe(true);
    const md = state().metadata as Row;
    expect((md.gate_overrides as unknown[])).toHaveLength(2);
  });

  test('S2.5 conflicto permanente: devuelve conflict en ≤2 intentos (sin bucle)', async () => {
    const { sb, updates } = makeSupabase(OPP, MID, { conflictAlways: true });
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, sb);
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toBe('conflict');
    expect(updates).toHaveLength(0);
  });

  // ── S2.6 · bypass de `same_stage` con won_data vacío ──────────────────────
  test('S2.6 PATCH a la MISMA etapa no terminal con won_data:{} no debe reabrir un cierre', async () => {
    const closed: Row = { ...OPP, status: 'won', closed_at: '2026-01-01T00:00:00.000Z', win_data: { amount: 5 } };
    const { sb, state } = makeSupabase(closed, { ...MID, id: 's1' }, {});
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's1', wonData: {} }, sb);
    // se espera `same_stage` (400): no hay cambio real que aplicar
    expect(r.ok).toBe(false);
    expect(state().status).toBe('won');
  });

  // ── S2.7 · el reconcile no lleva guarda `updated_at` ──────────────────────
  test('S2.7 el UPDATE correctivo debe llevar la misma guarda optimista que el principal', async () => {
    const guards: string[][] = [];
    let current: Row = { ...OPP };
    const stage: Row = { ...MID };
    const sb = {
      from: (table: string) => {
        const filters: string[] = [];
        let isUpdate = false;
        let payload: Row | null = null;
        const exec = () => {
          if (!isUpdate) {
            return { data: table === 'stages' ? { ...stage } : { ...current }, error: null };
          }
          guards.push([...filters]);
          current = { ...current, ...(payload ?? {}) };
          // trigger legacy: fuerza needsFix para que el reconcile se dispare
          if (payload && 'stage_id' in payload) { current.status = 'lost'; current.closed_at = 'x'; }
          return { data: { ...current }, error: null };
        };
        const b: Row = {
          select: () => b,
          eq: (c: string) => { filters.push(c); return b; },
          update: (p: Row) => { isUpdate = true; payload = p; return b; },
          maybeSingle: () => Promise.resolve(exec()),
          single: () => Promise.resolve(exec()),
        };
        return b;
      },
    } as unknown as SupabaseClient;
    await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, sb);
    expect(guards.length).toBeGreaterThanOrEqual(2); // principal + correctivo
    for (const g of guards) expect(g).toContain('updated_at');
  });
});
