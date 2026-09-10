/**
 * opportunityStageService.changeStage — gate, needs_won/needs_lost, override
 * registrado en metadata, datos de pérdida y (ronda 2) la reconciliación de
 * `status`/`closed_at` frente al trigger `fn_sync_status_from_stage`
 * (FASE-09 §9.1, defectos F9-01, F9-12 y F9-13).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { changeStage } from '../opportunityStageService';

jest.mock('@/lib/services/crm/stageGateService', () => ({
  evaluateStageGate: jest.fn(),
}));

import { evaluateStageGate } from '@/lib/services/crm/stageGateService';

type Row = Record<string, unknown>;
const gateMock = evaluateStageGate as jest.Mock;

interface MockOpts {
  /**
   * Emula `trg_sync_status_from_stage`: tras un UPDATE que toca `stage_id`,
   * la BD reescribe `status`/`closed_at` según `stages.probability`. El
   * RETURNING de PostgREST se materializa ANTES, así que la fila devuelta al
   * servicio miente — igual que en producción.
   */
  triggerStatus?: 'won' | 'lost' | 'open';
  /** El primer UPDATE con guarda `updated_at` no encuentra fila (carrera). */
  conflictOnce?: boolean;
}

function makeSupabase(opp: Row | null, stage: Row | null, opts: MockOpts = {}) {
  const updates: Row[] = [];
  let current: Row | null = opp ? { ...opp } : null;
  let conflictPending = Boolean(opts.conflictOnce);

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let payload: Row | null = null;
    let isUpdate = false;

    const matching = (): Row[] => {
      const list = table === 'opportunities' ? (current ? [current] : []) : table === 'stages' && stage ? [stage] : [];
      return list.filter((r) => filters.every(([c, v]) => !(c in r) || r[c] === v));
    };

    const exec = () => {
      const rows = matching();
      if (!isUpdate) return { data: rows[0] ? { ...rows[0] } : null, error: null };
      if (conflictPending) {
        // otro PATCH ganó la carrera: cambia `updated_at` y este UPDATE no casa
        conflictPending = false;
        if (current) current.updated_at = new Date(Date.now() + 1000).toISOString();
        return { data: null, error: null };
      }
      if (rows.length === 0) return { data: null, error: null };
      updates.push(payload ?? {});
      const returned = { ...current, ...(payload ?? {}) } as Row;
      current = { ...returned };
      if (payload && 'stage_id' in payload && opts.triggerStatus) {
        current.status = opts.triggerStatus;
        current.closed_at = opts.triggerStatus === 'open' ? null : new Date().toISOString();
      }
      return { data: returned, error: null };
    };

    const b: Row = {
      select: () => b,
      eq: (col: string, v: unknown) => { filters.push([col, v]); return b; },
      update: (p: Row) => { isUpdate = true; payload = p; return b; },
      maybeSingle: () => Promise.resolve(exec()),
      single: () => Promise.resolve(exec()),
    };
    return b;
  };
  return { sb: { from } as unknown as SupabaseClient, updates, state: () => current };
}

const OPP: Row = { id: 'o1', organization_id: 7, pipeline_id: 'p1', stage_id: 's1', status: 'open', closed_at: null, updated_at: '2026-09-08T10:00:00.000Z', metadata: {} };
const S2: Row = { id: 's2', name: 'Negociación', pipeline_id: 'p1', is_won: false, is_lost: false };
const WON: Row = { id: 'sw', name: 'Ganada', pipeline_id: 'p1', is_won: true, is_lost: false };
const LOST: Row = { id: 'sl', name: 'Perdida', pipeline_id: 'p1', is_won: false, is_lost: true };

beforeEach(() => gateMock.mockReset());

describe('changeStage', () => {
  test('oportunidad de otra org → not_found; etapa de otro pipeline → pipeline_mismatch', async () => {
    expect(await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, makeSupabase(null, S2).sb)).toEqual({ ok: false, reason: 'not_found' });
    expect(await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, makeSupabase(OPP, { ...S2, pipeline_id: 'p9' }).sb)).toEqual({ ok: false, reason: 'pipeline_mismatch' });
  });

  test('gate ok:false sin override → reason gate con missing', async () => {
    gateMock.mockResolvedValue({ ok: false, missing: [{ type: 'field', label: 'Cotización', detail: 'Falta cotización' }] });
    const { sb, updates } = makeSupabase(OPP, S2);
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, sb);
    expect(r.ok).toBe(false);
    if (!r.ok && r.reason === 'gate') expect(r.gate.missing[0].label).toBe('Cotización');
    expect(updates).toHaveLength(0);
  });

  test('gate ok:false con override → mueve y registra gate_overrides en metadata', async () => {
    gateMock.mockResolvedValue({ ok: false, missing: [{ type: 'field', label: 'Cotización', detail: '' }] });
    const { sb, updates } = makeSupabase(OPP, S2);
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2', override: true, overrideReason: 'cliente urgente' }, sb);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.overridden).toBe(true);
    const md = updates[0].metadata as { gate_overrides: Row[] };
    expect(md.gate_overrides).toHaveLength(1);
    expect(md.gate_overrides[0]).toMatchObject({ by: 'u1', from_stage_id: 's1', to_stage_id: 's2', reason: 'cliente urgente' });
  });

  test('override con gate no evaluable también deja traza (r1: se perdía en silencio)', async () => {
    gateMock.mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sb, updates } = makeSupabase(OPP, S2);
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2', override: true }, sb);
    expect(r.ok).toBe(true);
    const md = updates[0].metadata as { gate_overrides: Row[] };
    expect(md.gate_overrides[0]).toMatchObject({ gate_evaluated: false });
    warn.mockRestore();
  });

  test('F9-01 · etapa NO terminal → status open y closed_at null aunque probability sea 0/100', async () => {
    gateMock.mockResolvedValue({ ok: true, missing: [] });
    // El trigger de BD marcaría 'lost' (probability = 0 en "Reunión Agendada")
    const { sb, updates, state } = makeSupabase(OPP, S2, { triggerStatus: 'lost' });
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, sb);
    expect(r.ok).toBe(true);
    expect(updates[0]).toMatchObject({ stage_id: 's2', status: 'open', closed_at: null });
    // y tras la reconciliación la fila en BD queda abierta, sin cierre fantasma
    expect(state()).toMatchObject({ status: 'open', closed_at: null });
    expect(updates[updates.length - 1]).toMatchObject({ status: 'open', closed_at: null });
  });

  test('F9-01 · etapa is_won → el cierre sobrevive aunque el trigger lo pise a open', async () => {
    gateMock.mockResolvedValue({ ok: true, missing: [] });
    const { sb, state } = makeSupabase(OPP, WON, { triggerStatus: 'open' });
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sw', wonData: { product: 'Plan Pro' } }, sb);
    expect(r.ok).toBe(true);
    const s = state() as Row;
    expect(s.status).toBe('won');
    expect(typeof s.closed_at).toBe('string');
    if (r.ok) expect((r.opportunity as Row).status).toBe('won');
  });

  test('F9-12 · won_data/loss_data vacíos NO saltan el modal de cierre', async () => {
    gateMock.mockResolvedValue({ ok: true, missing: [] });
    const a = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sw', wonData: {} }, makeSupabase(OPP, WON).sb);
    expect(a).toMatchObject({ ok: false, reason: 'needs_won' });
    const b = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sl', lossData: {} }, makeSupabase(OPP, LOST).sb);
    expect(b).toMatchObject({ ok: false, reason: 'needs_lost' });
    const c = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sl', lossData: { notes: 'sin razón' } }, makeSupabase(OPP, LOST).sb);
    expect(c).toMatchObject({ ok: false, reason: 'needs_lost' });
  });

  test('is_won sin wonData → needs_won; con wonData → status won + closed_at', async () => {
    gateMock.mockResolvedValue({ ok: true, missing: [] });
    const a = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sw' }, makeSupabase(OPP, WON).sb);
    expect(a).toMatchObject({ ok: false, reason: 'needs_won' });
    const { sb, updates } = makeSupabase(OPP, WON);
    const b = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sw', wonData: { product: 'Plan Pro' } }, sb);
    expect(b.ok).toBe(true);
    expect(updates[0]).toMatchObject({ stage_id: 'sw', status: 'won', win_data: { product: 'Plan Pro' } });
    expect(typeof updates[0].closed_at).toBe('string');
  });

  test('is_lost con lossData → status lost + campos de pérdida (nunca closed_at sin razón)', async () => {
    gateMock.mockResolvedValue({ ok: true, missing: [] });
    const { sb, updates } = makeSupabase(OPP, LOST);
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 'sl', lossData: { lossReasonId: 'price', lossReasonLabel: 'Precio', competitor: 'ACME', notes: 'muy caro' } }, sb);
    expect(r.ok).toBe(true);
    expect(updates[0]).toMatchObject({ status: 'lost', loss_reason: 'Precio', loss_reason_value: 'price', competitor_name: 'ACME' });
    expect((updates[0].metadata as Row).loss_notes).toBe('muy caro');
  });

  test('F9-13 · carrera en `updated_at` → se relee y se reintenta sin perder el override', async () => {
    gateMock.mockResolvedValue({ ok: false, missing: [{ type: 'field', label: 'X', detail: '' }] });
    const { sb, updates } = makeSupabase(OPP, S2, { conflictOnce: true });
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2', override: true }, sb);
    expect(r.ok).toBe(true);
    // el primer intento no escribió; el segundo sí, sobre el metadata releído
    expect(updates).toHaveLength(1);
    expect((updates[0].metadata as { gate_overrides: Row[] }).gate_overrides).toHaveLength(1);
  });

  test('gate que lanza no bloquea el cambio', async () => {
    gateMock.mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await changeStage(7, 'u1', { opportunityId: 'o1', stageId: 's2' }, makeSupabase(OPP, S2).sb);
    expect(r.ok).toBe(true);
    warn.mockRestore();
  });
});
