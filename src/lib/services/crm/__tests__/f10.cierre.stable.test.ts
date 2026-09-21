/// <reference types="jest" />
/**
 * F10 — pasos «onboarding» y «renovación» del cierre «al ganar» contra F11 con
 * el doble de índices únicos reales (`f10WonCloseFake`): idempotencia real
 * (Promise.all), tenencia (señuelo org 121 con los mismos ids y primero en cada
 * tabla), fechas (fallback de closed_at, zona de la organización, fin de mes,
 * hito exactamente en `now`), oportunidad no ganada, validación antes de
 * escribir y `sequence_error`. Consolidado el 2026-09-21 desde el tester D1/D2
 * (`f10D1D2Tester`); lo ya afirmado por `f10WonCloseF11`/`f10WonCloseSteps` no
 * se repite. Ejecutar con TZ=UTC y TZ=America/Bogota. Sin datos reales.
 */
import * as W from '@/lib/services/crm/__tests__/f10WonCloseFake';
import type { Row } from '@/lib/services/crm/__tests__/f10FakeSupabase';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/utils/orgId', () => ({ getOrganizationId: () => 120 }));
const enrollMock = jest.fn(async (_org: number, seqId: string) => ({ id: `enr-${seqId}`, created: true, reason: null, steps: 1, first_run_at: null, status: 'active' }));
jest.mock('@/lib/services/crm/sequenceService', () => ({ enrollInSequence: (...a: unknown[]) => enrollMock(a[0] as number, a[1] as string) }));

import { scheduleRenewal, SEQUENCE_ENROLL_DEFERRED } from '@/lib/services/crm/renewalService';
import { executeOnboarding, executeRenewal, type WonCloseDeps } from '@/lib/services/crm/wonCloseSteps';

const { ORG, NOW, opp, state, deps, children, renewals, milestones, writeRows, decoySnapshot, parent } = W;
const reseed = (over: Parameters<typeof W.seed>[0] = {}) => { state.db = W.seed(over); };

beforeEach(() => { reseed(); enrollMock.mockClear(); jest.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('idempotencia real con los índices únicos parciales de la BD (tester D1/D2 §1)', () => {
  it('1.1/1.2 clics simultáneos (2 y 5) sobre «onboarding» → UNA hija, UNA instancia, 2 pasos, ninguno lanza; el índice único intervino de verdad', async () => {
    const [a, b] = await Promise.all([executeOnboarding(opp, deps()), executeOnboarding(opp, deps())]);
    expect([a, b].filter((m) => /^Onboarding (creado|ya existía)/.test(m))).toHaveLength(2);
    expect(state.db.writes.filter((w) => w.filters.__unique)).not.toHaveLength(0);
    await Promise.all(Array.from({ length: 5 }, () => executeOnboarding(opp, deps())));
    expect(children()).toHaveLength(1);
    expect(state.db.rows.onboarding_instances).toHaveLength(1);
    expect(state.db.rows.onboarding_steps).toHaveLength(2);
  });

  it('1.3 23505 en la INSTANCIA (uq_onboarding_instances_org_opportunity) con la hija ya creada → no lanza, una instancia, «ya existía»', async () => {
    await executeOnboarding(opp, deps());
    const inst = state.db.rows.onboarding_instances[0];
    state.db.rows.onboarding_instances = [];
    const base = W.uniqueClient();
    let armed = true;
    const sb: W.Sb = { ...base, from: (t: string) => {
      const chain = (base as unknown as { from: (t: string) => Record<string, unknown> }).from(t);
      if (t === 'onboarding_instances' && armed) {
        const insert = chain.insert as (row: Row) => unknown;
        // El «ganador» de la carrera ya insertó la instancia: el índice único del doble responde 23505.
        chain.insert = (row: Row) => { armed = false; state.db.rows.onboarding_instances.push(inst); return insert(row); };
      }
      return chain;
    } } as unknown as W.Sb;
    expect(await executeOnboarding(opp, deps({ supabase: sb }))).toMatch(/^Onboarding ya existía: .* — no se duplicó$/);
    expect(state.db.rows.onboarding_instances).toHaveLength(1);
    expect(children()).toHaveLength(1);
  });

  it('1.4/1.5 clics simultáneos (2 y 5) sobre «renovación» → UNA renovación, hitos una sola vez (2 futuros), ninguno lanza, metadata del padre coherente', async () => {
    const [a, b] = await Promise.all([executeRenewal(opp, deps()), executeRenewal(opp, deps())]);
    expect([a, b].sort()).toEqual(['Hitos creados: 2 (renovación: 15/10/2026)', 'Renovación ya programada (15/10/2026) — no se duplicó']);
    await Promise.all(Array.from({ length: 5 }, () => executeRenewal(opp, deps())));
    expect(renewals()).toHaveLength(1);
    expect(milestones()).toHaveLength(2);
    expect(parent().metadata).toEqual({ foo: 'bar', renewal_date: '2026-10-15T15:00:00.000Z', billing_cycle_months: 1 });
  });

  it('1.6 secuencial: onboarding y renovación ejecutados dos veces (modal reabierto) no escriben nada nuevo la segunda vez salvo el metadata del padre', async () => {
    await executeOnboarding(opp, deps());
    await executeRenewal(opp, deps());
    const before = state.db.writes.length;
    expect(await executeOnboarding(opp, deps())).toMatch(/ya existía/);
    expect(await executeRenewal(opp, deps())).toMatch(/ya programada/);
    const extra = state.db.writes.slice(before);
    expect(extra.map((w) => `${w.table}:${w.op}`)).toEqual(['opportunities:update']);
    expect(extra[0].filters).toMatchObject({ id: 'op-1', organization_id: ORG });
  });
});

describe('tenencia: todo lleva la organización del contexto, nunca la del señuelo (§2)', () => {
  it('2.1 onboarding: hija, instancia y pasos en org 120; nombre del cliente y plantilla de la 120 aunque el señuelo comparte id y va primero', async () => {
    const snap = decoySnapshot();
    await executeOnboarding(opp, deps());
    const child = children()[0];
    expect(child).toMatchObject({ organization_id: ORG, pipeline_id: 'p-onb', stage_id: 's-onb-1', customer_id: 'c-1', name: 'Onboarding — Cliente Uno', branch_id: 7, created_by: 'u-owner', salesperson_id: 'u-seller', currency: 'COP' });
    expect(state.db.rows.onboarding_instances[0]).toMatchObject({ organization_id: ORG, template_id: 'tpl-120', opportunity_id: child.id, customer_id: 'c-1', parent_opportunity_id: 'op-1' });
    for (const s of state.db.rows.onboarding_steps) expect(s).toMatchObject({ organization_id: ORG, instance_id: state.db.rows.onboarding_instances[0].id });
    expect(state.db.rows.onboarding_steps.map((s) => s.name)).toEqual(['Kickoff', 'Configuración']);
    for (const w of state.db.writes) for (const r of writeRows(w)) expect(r.organization_id ?? w.filters.organization_id).toBe(ORG);
    expect(decoySnapshot()).toBe(snap);
    expect(W.decoyRows('opportunities')).toHaveLength(1);
  });

  it('2.2 renovación: oportunidad, hitos y metadata en org 120; el señuelo (mismo id, closed_at 2020, USD) no se lee ni se toca; la secuencia del señuelo no se usa', async () => {
    const snap = decoySnapshot();
    expect(await executeRenewal(opp, deps())).toBe('Hitos creados: 2 (renovación: 15/10/2026)');
    const ren = renewals()[0];
    expect(ren).toMatchObject({ organization_id: ORG, pipeline_id: 'p-ren', stage_id: 's-ren-1', customer_id: 'c-1', currency: 'COP', amount: 1200000, salesperson_id: 'u-seller', expected_close_date: '2026-10-15' });
    expect(String(ren.name)).toContain('Cliente Uno');
    for (const t of milestones()) expect(t).toMatchObject({ organization_id: ORG, related_to_id: ren.id, customer_id: 'c-1', assigned_to: 'u-seller' });
    for (const w of state.db.writes) for (const r of writeRows(w)) expect(r.organization_id ?? w.filters.organization_id).toBe(ORG);
    expect(decoySnapshot()).toBe(snap);
    expect(enrollMock).not.toHaveBeenCalled();
  });

  it('2.3 oportunidad ajena: deps.orgId=120 pero la oportunidad solo existe en la 121 → ambos pasos lanzan «no encontrada en la organización» y no escriben', async () => {
    state.db.rows.opportunities = state.db.rows.opportunities.filter((o) => o.organization_id !== ORG);
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/no encontrada en la organización/);
    await expect(executeRenewal(opp, deps())).rejects.toThrow(/no encontrada en la organización/);
    expect(state.db.writes).toEqual([]);
  });

  it('2.4 el pipeline de renovación se crea en la org del contexto si no existe (nunca se reutiliza el de la 121)', async () => {
    state.db.rows.pipelines = state.db.rows.pipelines.filter((p) => p.id !== 'p-ren');
    await executeRenewal(opp, deps());
    const created = state.db.rows.pipelines.find((p) => p.organization_id === ORG && p.pipeline_type === 'renewal');
    expect(created).toBeTruthy();
    expect(renewals()[0].pipeline_id).toBe(created!.id);
    expect(state.db.rows.stages.filter((s) => s.pipeline_id === created!.id)).toHaveLength(6);
  });
});

describe('fechas: closedAtFallback, zona de la organización, ciclos, hito en now (§3)', () => {
  it('3.1/3.2 closed_at null → el vencimiento sale del instante del cierre sin escribir closed_at; el hito de 30 días cae EXACTAMENTE en now y se excluye; next_contact_at = primer hito', async () => {
    expect(await executeRenewal(opp, deps())).toBe('Hitos creados: 2 (renovación: 15/10/2026)');
    expect(parent().closed_at).toBeNull();
    expect(renewals()[0].metadata).toMatchObject({ renewal_date: '2026-10-15T15:00:00.000Z' });
    expect(milestones().map((t) => t.due_date)).toEqual(['2026-09-30T15:00:00.000Z', '2026-10-08T15:00:00.000Z']);
    for (const t of milestones()) expect(Date.parse(String(t.due_date))).toBeGreaterThan(NOW.getTime());
    expect(renewals()[0].next_contact_at).toBe('2026-09-30T15:00:00.000Z');
  });

  it('3.3 ciclo de 12 meses → 6 hitos futuros ordenados 120→7 y vencimiento un año después', async () => {
    reseed({ cycle: 12 });
    expect(await executeRenewal({ ...opp, billing_cycle_months: 12 }, deps())).toBe('Hitos creados: 6 (renovación: 15/09/2027)');
    const dues = milestones().map((t) => Date.parse(String(t.due_date)));
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
    expect(dues).toHaveLength(6);
    expect(renewals()[0]).toMatchObject({ expected_close_date: '2027-09-15', billing_cycle_months: 12 });
  });

  it('3.4 fin de mes en la zona de la organización: 30-ene 23:30 Bogotá (31-ene 04:30Z) + 1 mes = 28-feb 23:30 Bogotá; en UTC es 31-ene → 28-feb 04:30Z', async () => {
    const closed = '2026-01-31T04:30:00.000Z';
    const now = new Date('2026-01-31T05:00:00.000Z');
    reseed({ closedAt: closed });
    expect(await executeRenewal(opp, deps({ now: () => new Date(now), timezone: 'America/Bogota' }))).toBe('Hitos creados: 2 (renovación: 28/02/2026)'); // 28 días de ciclo: solo los hitos de 15 y 7
    expect(renewals()[0]).toMatchObject({ expected_close_date: '2026-02-28', metadata: expect.objectContaining({ renewal_date: '2026-03-01T04:30:00.000Z' }) });
    expect(parent().metadata).toMatchObject({ renewal_date: '2026-03-01T04:30:00.000Z' });
    reseed({ closedAt: closed });
    expect(await executeRenewal(opp, deps({ now: () => new Date(now), timezone: 'UTC' }))).toBe('Hitos creados: 2 (renovación: 28/02/2026)');
    expect(renewals()[0]).toMatchObject({ expected_close_date: '2026-02-28', metadata: expect.objectContaining({ renewal_date: '2026-02-28T04:30:00.000Z' }) });
  });

  it('3.5 borde de medianoche: closed_at 04:59:59Z = 23:59:59 Bogotá del día anterior → etiqueta y expected_close_date del día 14 en Bogotá, del 15 en UTC', async () => {
    const closed = '2026-09-15T04:59:59.000Z';
    reseed({ closedAt: closed, cycle: 12 });
    expect(await executeRenewal({ ...opp, billing_cycle_months: 12 }, deps({ timezone: 'America/Bogota' }))).toBe('Hitos creados: 6 (renovación: 14/09/2027)');
    expect(renewals()[0].expected_close_date).toBe('2027-09-14');
    reseed({ closedAt: closed, cycle: 12 });
    expect(await executeRenewal({ ...opp, billing_cycle_months: 12 }, deps({ timezone: 'UTC' }))).toBe('Hitos creados: 6 (renovación: 15/09/2027)');
    expect(renewals()[0].expected_close_date).toBe('2027-09-15');
  });

  it('3.6/3.7 segunda ejecución con closed_at real: metadata.renewal_date del padre no cambia aunque now avance; los pasos de onboarding se fechan desde now con el day de la plantilla', async () => {
    reseed({ closedAt: '2026-09-01T15:00:00.000Z' });
    await executeRenewal(opp, deps());
    const first = (parent().metadata as Row).renewal_date;
    expect(await executeRenewal(opp, deps({ now: () => new Date('2026-09-20T15:00:00.000Z') }))).toBe('Renovación ya programada (01/10/2026) — no se duplicó');
    expect((parent().metadata as Row).renewal_date).toBe(first);
    await executeOnboarding(opp, deps());
    expect(state.db.rows.onboarding_steps.map((s) => s.due_date)).toEqual(['2026-09-15T15:00:00.000Z', '2026-09-22T15:00:00.000Z']);
    expect(state.db.rows.onboarding_instances[0].started_at).toBe('2026-09-15T15:00:00.000Z');
  });
});

describe('oportunidad no ganada al abrir el modal (PATCH fallido o etapa is_won sin win_data) (§5)', () => {
  it('5.1-5.3 open (sin closed_at el fallback NO aplica) o lost con closed_at → F11 lanza «no está ganada», el mensaje sube intacto y no se escribe nada', async () => {
    reseed({ status: 'open' });
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/no está ganada/);
    await expect(executeRenewal(opp, deps())).rejects.toThrow(/no está ganada/);
    expect(state.db.writes).toEqual([]);
    expect(renewals()).toHaveLength(0);
    reseed({ status: 'lost', closedAt: '2026-09-10T15:00:00.000Z' });
    await expect(executeRenewal(opp, deps())).rejects.toThrow(/no está ganada/);
    expect(state.db.writes).toEqual([]);
  });
});

describe('validación antes de escribir y sequence_error visible (§6)', () => {
  it('6.1 sin plantilla de onboarding activa → lanza con mensaje claro y NO deja una hija huérfana; la segunda vez tampoco', async () => {
    state.db.rows.onboarding_templates = state.db.rows.onboarding_templates.filter((t) => t.organization_id !== ORG);
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/plantilla/);
    expect(children()).toHaveLength(0);
    expect(state.db.writes).toEqual([]);
    await expect(executeOnboarding(opp, deps())).rejects.toThrow(/plantilla/);
    expect(children()).toHaveLength(0);
  });

  // r2 (H1): el navegador NO inscribe en la secuencia (no tiene `enroll`; `sequenceService` arrastra
  // twilio/svix/service role). El paso lo dice y la inscripción la hace `renewals_sync`.
  it('6.2 secuencia de renovación de la org: desde el navegador NO se llama a sequenceService; el paso informa que la inscribe el servidor y la renovación queda creada', async () => {
    state.db.rows.sequences.push({ id: 'seq-120', organization_id: ORG, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null });
    const out = await executeRenewal(opp, deps());
    expect(out).toMatch(/^Hitos creados: 2 \(renovación: 15\/10\/2026\)/);
    expect(out).toMatch(/secuencia de renovación/);
    expect(out).toContain(SEQUENCE_ENROLL_DEFERRED);
    expect(renewals()).toHaveLength(1);
    expect(enrollMock).not.toHaveBeenCalled();
    expect(state.db.rows.sequence_enrollments ?? []).toEqual([]);
  });

  it('6.4 cuando el llamador SÍ aporta `enroll` (servidor) y falla, el paso lo dice (no se traga el error) y la renovación queda creada', async () => {
    state.db.rows.sequences.push({ id: 'seq-120', organization_id: ORG, is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null });
    const enroll = jest.fn(async () => { throw new Error('proveedor caído'); });
    const schedule: NonNullable<WonCloseDeps['scheduleRenewal']> = (o, id, cycle, sb, opts) => scheduleRenewal(o, id, cycle, sb, { ...opts, enroll });
    const out = await executeRenewal(opp, deps({ scheduleRenewal: schedule }));
    expect(out).toMatch(/^Hitos creados: 2 \(renovación: 15\/10\/2026\)/);
    expect(out).toMatch(/secuencia de renovación no inscrita: proveedor caído/);
    expect(renewals()).toHaveLength(1);
    expect(enroll).toHaveBeenCalledTimes(1);
    expect((enroll.mock.calls[0] as unknown[]).slice(0, 3)).toEqual([ORG, 'seq-120', renewals()[0].id]);
  });

  it('6.5 la renovación creada desde el modal lleva branch_id de la sucursal del contexto y created_by de la oportunidad; sin sucursal («Todas») hereda la del contrato padre', async () => {
    await executeRenewal(opp, deps({ contextBranchId: 7 }));
    expect(renewals()[0]).toMatchObject({ organization_id: ORG, branch_id: 7, created_by: 'u-owner' });
    reseed();
    parent().branch_id = 11;
    await executeRenewal({ ...opp, metadata: null }, deps({ contextBranchId: null }));
    expect(renewals()[0]).toMatchObject({ branch_id: 11, created_by: 'u-owner' });
    // metadata null en la oportunidad → el padre queda solo con lo que escribe el paso
    expect(parent().metadata).toEqual({ renewal_date: '2026-10-15T15:00:00.000Z', billing_cycle_months: 1 });
  });
});
