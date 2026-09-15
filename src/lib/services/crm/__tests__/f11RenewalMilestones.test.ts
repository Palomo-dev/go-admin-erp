/// <reference types="jest" />
/**
 * F11 — lógica pura de renovación (`renewalMilestones.ts`).
 * Una oportunidad de renovación por contrato; los hitos 120/90/60/30/15/7 son
 * tareas. Los hitos ya vencidos no se crean. `closed_at` es obligatorio.
 */
import {
  RENEWAL_MILESTONE_DAYS,
  RenewalPlanError,
  buildRenewalPlan,
  computeExpiryDate,
  computeRenewalMilestones,
  milestoneTaskTitle,
  nextContactFromTasks,
  pickRenewalSequence,
} from '../renewalMilestones';

const NOW = new Date('2026-09-15T12:00:00Z');

describe('computeExpiryDate', () => {
  it('suma los meses del ciclo sobre closed_at (instante)', () => {
    expect(computeExpiryDate(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(computeExpiryDate(new Date('2026-03-15T10:00:00Z'), 12).toISOString()).toBe('2027-03-15T10:00:00.000Z');
  });
  it('rechaza ciclos no positivos o no enteros', () => {
    expect(() => computeExpiryDate(NOW, 0)).toThrow(RenewalPlanError);
    expect(() => computeExpiryDate(NOW, -3)).toThrow(RenewalPlanError);
    expect(() => computeExpiryDate(NOW, 1.5)).toThrow(RenewalPlanError);
  });
});

describe('computeRenewalMilestones', () => {
  it('genera los 6 hitos futuros ordenados del más lejano al más cercano al vencimiento', () => {
    const expiry = new Date('2027-09-15T12:00:00Z');
    const m = computeRenewalMilestones(expiry, NOW);
    expect(m.map((x) => x.days)).toEqual([...RENEWAL_MILESTONE_DAYS]);
    expect(m[0].dueAt.toISOString()).toBe('2027-05-18T12:00:00.000Z'); // 120 días antes
    expect(m[5].dueAt.toISOString()).toBe('2027-09-08T12:00:00.000Z'); // 7 días antes
    // ascendente en el tiempo
    for (let i = 1; i < m.length; i += 1) expect(m[i].dueAt.getTime()).toBeGreaterThan(m[i - 1].dueAt.getTime());
  });
  it('descarta los hitos ya vencidos (vence en 20 días → solo 15 y 7)', () => {
    const expiry = new Date('2026-10-05T12:00:00Z');
    const m = computeRenewalMilestones(expiry, NOW);
    expect(m.map((x) => x.days)).toEqual([15, 7]);
  });
  it('un hito que cae exactamente ahora no se crea (debe ser estrictamente futuro)', () => {
    const expiry = new Date('2026-09-22T12:00:00Z'); // 7 días → hito de 7 = NOW exacto
    expect(computeRenewalMilestones(expiry, NOW).map((x) => x.days)).toEqual([]);
  });
  it('contrato ya vencido → sin hitos', () => {
    expect(computeRenewalMilestones(new Date('2026-01-01T00:00:00Z'), NOW)).toEqual([]);
  });
});

describe('buildRenewalPlan', () => {
  it('closed_at null → RenewalPlanError con mensaje claro', () => {
    expect(() => buildRenewalPlan({ closedAt: null, billingCycleMonths: 12, now: NOW })).toThrow(/closed_at/);
    expect(() => buildRenewalPlan({ closedAt: 'no-es-fecha', billingCycleMonths: 12, now: NOW })).toThrow(RenewalPlanError);
  });
  it('devuelve vencimiento, hitos futuros y next_contact_at = primer hito pendiente', () => {
    const plan = buildRenewalPlan({ closedAt: '2026-09-01T00:00:00Z', billingCycleMonths: 3, now: NOW });
    expect(plan.expiryDate.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    // 77 días al vencimiento: 120 y 90 ya pasaron
    expect(plan.milestones.map((m) => m.days)).toEqual([60, 30, 15, 7]);
    expect(plan.nextContactAt?.toISOString()).toBe('2026-10-02T00:00:00.000Z');
  });
  it('sin hitos pendientes → nextContactAt null', () => {
    const plan = buildRenewalPlan({ closedAt: '2026-09-10T00:00:00Z', billingCycleMonths: 1, now: new Date('2026-10-09T00:00:00Z') });
    expect(plan.milestones).toEqual([]);
    expect(plan.nextContactAt).toBeNull();
  });
  it('la fecha calendario del vencimiento respeta la zona de la organización', () => {
    // 2026-12-01T03:00Z es 2026-11-30 22:00 en Bogotá
    const plan = buildRenewalPlan({ closedAt: '2026-09-01T03:00:00Z', billingCycleMonths: 3, now: NOW, timezone: 'America/Bogota' });
    expect(plan.expiryPlainDate).toBe('2026-11-30');
    const utc = buildRenewalPlan({ closedAt: '2026-09-01T03:00:00Z', billingCycleMonths: 3, now: NOW, timezone: 'UTC' });
    expect(utc.expiryPlainDate).toBe('2026-12-01');
  });
});

describe('nextContactFromTasks', () => {
  it('toma la tarea abierta más próxima en el futuro; ignora hechas, canceladas y pasadas', () => {
    const tasks = [
      { due_date: '2026-09-10T00:00:00Z', status: 'open' }, // pasada
      { due_date: '2026-10-01T00:00:00Z', status: 'done' },
      { due_date: '2026-11-01T00:00:00Z', status: 'canceled' },
      { due_date: '2026-12-01T00:00:00Z', status: 'open' },
      { due_date: '2026-10-15T00:00:00Z', status: 'in_progress' },
    ];
    expect(nextContactFromTasks(tasks, NOW)?.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(nextContactFromTasks([], NOW)).toBeNull();
  });
});

describe('milestoneTaskTitle / pickRenewalSequence', () => {
  it('título en español con los días', () => {
    expect(milestoneTaskTitle(30)).toBe('Contacto de renovación — 30 días antes del vencimiento');
  });
  it('elige la secuencia activa de evento renewal_scheduled o template_key renewal; nunca inactivas', () => {
    const seqs = [
      { id: 'a', is_active: false, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null },
      { id: 'b', is_active: true, trigger_type: 'manual', trigger_config: {}, template_key: 'renewal' },
      { id: 'c', is_active: true, trigger_type: 'event', trigger_config: { event: 'renewal_scheduled' }, template_key: null },
    ];
    expect(pickRenewalSequence(seqs)?.id).toBe('c');
    expect(pickRenewalSequence(seqs.slice(0, 2))?.id).toBe('b');
    expect(pickRenewalSequence([seqs[0]])).toBeNull();
    expect(pickRenewalSequence([])).toBeNull();
  });
});
