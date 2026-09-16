/// <reference types="jest" />
/**
 * F11 — lógica pura de onboarding (`onboardingProgress.ts`): pasos desde la
 * plantilla real (`steps` jsonb: `{day, key, owner, title}`), progreso,
 * responsable, completar solo con todos los pasos hechos y etapa ganada por
 * `is_won` (nunca por nombre).
 */
import {
  buildStepRows,
  canCompleteOnboarding,
  computeOnboardingProgress,
  findWonStage,
  isOnboardingOpportunity,
  ownerLabel,
  parseTemplateSteps,
  pickDefaultTemplate,
  resolveStepOwner,
} from '../onboardingProgress';

/** Pasos tal cual los sembró `fn_crm_seed_defaults` (verificados por MCP). */
const REAL_STEPS = [
  { day: 0, key: 'kickoff', owner: 'vendor', title: 'Kickoff y objetivos' },
  { day: 2, key: 'config', owner: 'cs', title: 'Configuración inicial' },
  { day: 5, key: 'import', owner: 'cs', title: 'Importación de datos' },
  { day: 7, key: 'training', owner: 'cs', title: 'Capacitación del equipo' },
  { day: 10, key: 'assisted', owner: 'cs', title: 'Uso asistido' },
  { day: 14, key: 'review14', owner: 'vendor', title: 'Revisión día 14' },
  { day: 30, key: 'br30', owner: 'vendor', title: 'Business review día 30' },
];

describe('parseTemplateSteps', () => {
  it('lee la forma real y conserva el orden', () => {
    const s = parseTemplateSteps(REAL_STEPS);
    expect(s).toHaveLength(7);
    expect(s[0]).toEqual({ day: 0, key: 'kickoff', owner: 'vendor', title: 'Kickoff y objetivos', description: null });
  });
  it('tolera `name` en vez de `title`, descarta entradas sin título y basura', () => {
    expect(parseTemplateSteps([{ name: 'Paso A' }, { title: '' }, 'x', null, { title: 'B', day: '3' }])).toEqual([
      { day: null, key: null, owner: null, title: 'Paso A', description: null },
      { day: null, key: null, owner: null, title: 'B', description: null },
    ]);
    expect(parseTemplateSteps(null)).toEqual([]);
    expect(parseTemplateSteps('[]')).toEqual([]);
  });
});

describe('buildStepRows', () => {
  const start = new Date('2026-09-15T15:00:00Z');
  it('due_date = inicio + day; conserva step_number 1..n y organization_id', () => {
    const rows = buildStepRows({ templateSteps: parseTemplateSteps(REAL_STEPS), startedAt: start, defaultDurationDays: 30, orgId: 120, instanceId: 'inst-1' });
    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ organization_id: 120, instance_id: 'inst-1', step_number: 1, name: 'Kickoff y objetivos', is_completed: false, due_date: '2026-09-15T15:00:00.000Z' });
    expect(rows[6]).toMatchObject({ step_number: 7, due_date: '2026-10-15T15:00:00.000Z' });
  });
  it('sin `day` reparte la duración por defecto de forma uniforme', () => {
    const rows = buildStepRows({ templateSteps: parseTemplateSteps([{ title: 'a' }, { title: 'b' }, { title: 'c' }]), startedAt: start, defaultDurationDays: 30, orgId: 120, instanceId: 'i' });
    expect(rows.map((r) => r.due_date)).toEqual(['2026-09-25T15:00:00.000Z', '2026-10-05T15:00:00.000Z', '2026-10-15T15:00:00.000Z']);
  });
  it('sin pasos → sin filas (no inventa un "Paso 1")', () => {
    expect(buildStepRows({ templateSteps: [], startedAt: start, defaultDurationDays: 30, orgId: 120, instanceId: 'i' })).toEqual([]);
  });
});

describe('computeOnboardingProgress / canCompleteOnboarding', () => {
  const steps = [
    { step_number: 1, is_completed: true },
    { step_number: 2, is_completed: false },
    { step_number: 3, is_completed: true },
  ];
  it('cuenta hechos, total y porcentaje redondeado', () => {
    expect(computeOnboardingProgress(steps)).toEqual({ total: 3, done: 2, pct: 67, allDone: false });
    expect(computeOnboardingProgress([])).toEqual({ total: 0, done: 0, pct: 0, allDone: false });
  });
  it('solo se puede completar con TODOS los pasos hechos y al menos uno', () => {
    expect(canCompleteOnboarding(steps)).toBe(false);
    expect(canCompleteOnboarding(steps.map((s) => ({ ...s, is_completed: true })))).toBe(true);
    expect(canCompleteOnboarding([])).toBe(false);
  });
});

describe('resolveStepOwner / ownerLabel', () => {
  const tpl = parseTemplateSteps(REAL_STEPS);
  it('empareja por índice (step_number − 1) y traduce el owner', () => {
    expect(resolveStepOwner({ step_number: 2, name: 'Configuración inicial' }, tpl)).toBe('cs');
    expect(resolveStepOwner({ step_number: 1, name: 'Kickoff y objetivos' }, tpl)).toBe('vendor');
    expect(resolveStepOwner({ step_number: 99, name: 'x' }, tpl)).toBeNull();
    expect(resolveStepOwner({ step_number: 1, name: 'x' }, [])).toBeNull();
  });
  it('si el nombre no coincide con el índice, busca por título antes de rendirse', () => {
    expect(resolveStepOwner({ step_number: 1, name: 'Uso asistido' }, tpl)).toBe('cs');
  });
  it('etiquetas legibles', () => {
    expect(ownerLabel('vendor')).toBe('Vendedor');
    expect(ownerLabel('cs')).toBe('Customer success');
    expect(ownerLabel('otro')).toBe('otro');
    expect(ownerLabel(null)).toBe('Sin responsable');
  });
});

describe('pickDefaultTemplate', () => {
  it('primera activa por nombre; ignora inactivas; null si no hay', () => {
    const t = [
      { id: 'z', name: 'Zeta', is_active: true },
      { id: 'i', name: 'Alfa inactiva', is_active: false },
      { id: 'b', name: 'Beta', is_active: true },
    ];
    expect(pickDefaultTemplate(t)?.id).toBe('b');
    expect(pickDefaultTemplate([t[1]])).toBeNull();
    expect(pickDefaultTemplate([])).toBeNull();
  });
});

describe('findWonStage — por is_won, nunca por nombre', () => {
  it('devuelve la etapa is_won del pipeline aunque se llame de cualquier forma', () => {
    const stages = [
      { id: 's1', name: 'Ganado', is_won: false, position: 1 },
      { id: 's2', name: 'Cierre', is_won: true, position: 2 },
    ];
    expect(findWonStage(stages)?.id).toBe('s2');
    expect(findWonStage([{ id: 's1', name: 'Ganado', is_won: false, position: 1 }])).toBeNull();
  });
});

describe('isOnboardingOpportunity', () => {
  it('metadata.type=onboarding o pipeline de tipo onboarding', () => {
    expect(isOnboardingOpportunity({ metadata: { type: 'onboarding' } })).toBe(true);
    expect(isOnboardingOpportunity({ metadata: null, pipeline: { pipeline_type: 'onboarding' } })).toBe(true);
    expect(isOnboardingOpportunity({ metadata: { type: 'renewal' } })).toBe(false);
    expect(isOnboardingOpportunity(null)).toBe(false);
  });
});
