/// <reference types="jest" />
/**
 * F10 r2 — pasos del cierre «al ganar» (`wonCloseSteps.ts`, antes dentro de
 * `WonCloseModal`). Cubre las mutaciones M52/M53 del tester (tareas
 * `renovacion`/`referido`, `opportunity_id` en la factura), la comisión ya
 * devengada por el trigger y la retirada del paso «stock» (tabla `inventory`
 * inexistente).
 */
import { createFakeSupabase, type FakeDb } from '@/lib/services/crm/__tests__/f10FakeSupabase';
import {
  buildInitialSteps,
  executeCommission,
  executeInvoice,
  executeReferral,
  executeRenewal,
  WON_STEP_EXECUTORS,
  type OpportunityData,
  type WonCloseDeps,
} from '@/lib/services/crm/wonCloseSteps';
import { readFileSync } from 'fs';
import { join } from 'path';

let db: FakeDb;
const NOW = new Date('2026-09-15T15:00:00Z');

const opp: OpportunityData = {
  id: 'op-1', name: 'Plan anual', customer_id: 'c-1', amount: 1200000, currency: 'COP', salesperson_id: 'u-seller',
  pipeline_id: 'pipe-1', stage_id: 'st-won', billing_cycle_months: 12, metadata: { foo: 'bar' }, created_by: 'u-owner',
};

function deps(over: Partial<WonCloseDeps> = {}): WonCloseDeps & { calls: { convert: unknown[][]; accrue: unknown[][] } } {
  const calls = { convert: [] as unknown[][], accrue: [] as unknown[][] };
  return {
    calls,
    supabase: createFakeSupabase(db) as never,
    orgId: 120,
    contextBranchId: 7,
    timezone: 'America/Bogota',
    now: () => new Date(NOW),
    getLatestProposal: async () => ({ id: 'q-1', branch_id: 3 }),
    convertToInvoice: async (...args) => { calls.convert.push(args); return 'inv-00000001-abcd'; },
    accrueCommission: async (...args) => { calls.accrue.push(args); return { id: 'cm-new', base_amount: 1200000, commission_rate: 10, commission_amount: 120000, status: 'accrued' }; },
    ...over,
  };
}

beforeEach(() => {
  db = { writes: [], rows: { tasks: [], opportunities: [{ id: 'op-1', organization_id: 120, metadata: { foo: 'bar' } }, { id: 'op-1', organization_id: 121, metadata: null }], accounts_receivable: [{ id: 'ar-1', organization_id: 120, invoice_id: 'inv-00000001-abcd', balance: 1200000 }] } };
});

describe('pasos del modal', () => {
  it('sin paso «stock»: la tabla inventory no existe y nadie la lee', () => {
    const ids = buildInitialSteps().map((s) => s.id);
    expect(ids).toEqual(['invoice', 'pos_sale', 'reservations', 'onboarding', 'renewal', 'referral', 'commission']);
    expect(ids).not.toContain('stock');
    expect(Object.keys(WON_STEP_EXECUTORS).sort()).toEqual([...ids].sort());
    for (const f of ['src/lib/services/crm/wonCloseSteps.ts', 'src/components/crm/pipeline/WonCloseModal.tsx']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8')).not.toMatch(/from\('inventory'\)/);
    }
  });

  it('factura: convertToInvoice recibe opportunity_id (M53) con la sucursal del contexto; informa la cartera', async () => {
    const d = deps();
    const out = await executeInvoice(opp, d);
    expect(d.calls.convert).toEqual([['q-1', 120, 7, 'op-1']]);
    expect(out).toMatch(/cartera creada/);
    // sin sucursal de contexto → la de la propuesta; sin ninguna → se omite sin llamar
    const d2 = deps({ contextBranchId: null });
    await executeInvoice(opp, d2);
    expect(d2.calls.convert[0][2]).toBe(3);
    const d3 = deps({ contextBranchId: null, getLatestProposal: async () => ({ id: 'q-1', branch_id: null }) });
    expect(await executeInvoice(opp, d3)).toMatch(/se omitió la factura/);
    expect(d3.calls.convert).toEqual([]);
  });

  it('renovación: 6 tareas type=renovacion en la organización, prioridad por cercanía, y metadata de la oportunidad solo en la org 120 (M52)', async () => {
    const out = await executeRenewal(opp, deps());
    const tasks = db.writes.filter((w) => w.table === 'tasks' && w.op === 'insert').map((w) => w.row!);
    expect(tasks).toHaveLength(6);
    for (const t of tasks) expect(t).toMatchObject({ organization_id: 120, type: 'renovacion', status: 'open', related_to_type: 'opportunity', related_to_id: 'op-1', assigned_to: 'u-seller', customer_id: 'c-1' });
    expect(tasks.map((t) => t.priority)).toEqual(['med', 'med', 'med', 'high', 'high', 'high']);
    expect(tasks.map((t) => String(t.title))).toEqual([120, 90, 60, 30, 15, 7].map((d) => `Renovación Plan anual — hito ${d}d`));
    expect(out).toMatch(/Hitos creados: 6 \(renovación: 15\/09\/2027\)/);
    const upd = db.writes.find((w) => w.table === 'opportunities' && w.op === 'update');
    expect(upd?.filters).toMatchObject({ id: 'op-1', organization_id: 120 });
    expect(upd?.row).toMatchObject({ metadata: { foo: 'bar', billing_cycle_months: 12, renewal_date: '2027-09-15T15:00:00.000Z' } });
    expect(db.rows.opportunities[1].metadata).toBeNull(); // la fila señuelo de la org 121 no se tocó
  });

  it('renovación sin ciclo → se omite sin escribir', async () => {
    expect(await executeRenewal({ ...opp, billing_cycle_months: null }, deps())).toMatch(/se omitió renovación/);
    expect(db.writes).toEqual([]);
  });

  it('referido: una tarea type=referido a +30 días (M52)', async () => {
    const out = await executeReferral(opp, deps());
    const tasks = db.writes.filter((w) => w.table === 'tasks');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].row).toMatchObject({ organization_id: 120, type: 'referido', status: 'open', priority: 'med', due_date: '2026-10-15T15:00:00.000Z', related_to_id: 'op-1', title: 'Pedir referido — Plan anual' });
    expect(out).toBe('Tarea de referido programada para 15/10/2026');
  });

  it('comisión: ya devengada por el trigger → mensaje honesto y sin duplicar; nueva → «Comisión devengada»; sin vendedor → omitida', async () => {
    const dup = deps({ accrueCommission: async () => ({ id: 'cm-trigger', base_amount: 1200000, commission_rate: 10, commission_amount: 120000, status: 'accrued', already_accrued: true }) });
    expect(await executeCommission(opp, dup)).toBe('Comisión ya devengada por el sistema al ganar: 120000 (tasa 10%) — no se duplicó');
    const cancelled = deps({ accrueCommission: async () => ({ id: 'cm-c', base_amount: 1200000, commission_rate: 10, commission_amount: 120000, status: 'cancelled', already_accrued: true, existing_status: 'cancelled' }) });
    expect(await executeCommission(opp, cancelled)).toBe('Comisión existente cancelada por un gestor (rechazo o clawback): no se devenga otra automáticamente; si procede, hazlo desde Comisiones');
    const d = deps();
    expect(await executeCommission(opp, d)).toBe('Comisión devengada: 120000 (tasa 10%)');
    expect(d.calls.accrue).toEqual([['op-1', 'u-seller', 1200000]]);
    const none = deps();
    expect(await executeCommission({ ...opp, salesperson_id: null }, none)).toMatch(/Sin vendedor/);
    expect(none.calls.accrue).toEqual([]);
    expect(await executeCommission(opp, deps({ accrueCommission: async () => null }))).toMatch(/tasa = 0/);
  });

  it('organización inválida → error antes de escribir', async () => {
    await expect(executeRenewal(opp, deps({ orgId: 0 }))).rejects.toThrow('Organización no válida');
    await expect(executeReferral(opp, deps({ orgId: -1 }))).rejects.toThrow('Organización no válida');
    expect(db.writes).toEqual([]);
  });
});
