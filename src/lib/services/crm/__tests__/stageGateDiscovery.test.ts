/// <reference types="jest" />
/**
 * F2 — arreglo del criterio `discovery`/`require_discovery` de stageGateService.
 *
 * Defecto confirmado (PROGRESS.md, dos veces): el criterio `discovery` sin
 * `requiredKeys` (y su equivalente plano `require_discovery: true`) leía
 * `discovery_data.completed_sections`/`total_sections`. Esas claves NO
 * existen en `discovery_data` — verificado contra la BD real (proyecto
 * jgmgphmzusbluqhuqihj, 2026-09-21): ninguna oportunidad con `discovery_data`
 * no vacío tiene esa forma, y `discovery_templates.sections` es una lista
 * PLANA de campos (`DiscoveryField`), no la forma anidada
 * `{ sections: [{ answers: [...] }] }` que declara `discoveryService.ts` (esa
 * ruta/tipo no tiene ningún `fetch` en el front: es el mismo tipo de trampa
 * que `DiscoveryWizard`, ya borrado). Por eso el criterio daba siempre
 * «0/0» y nunca pasaba (hoy 0 de 90 etapas lo usan).
 *
 * El arreglo vive en `discoveryDataProgress` (discoveryProgress.ts, puro) y
 * se usa desde los dos sitios de stageGateService.ts: el criterio
 * `discovery` de `evaluateRequirement` (formato estructurado
 * `requirements[]`) y el `require_discovery` de `evaluateFlatCriteria`
 * (formato plano F2).
 */
import { discoveryDataProgress } from '../discoveryProgress';
import type { DiscoveryField } from '../discoveryTemplateService';

// ─── Mock de @/lib/supabase/config (solo lo usa loadDiscoveryFields, en el
// camino de evaluateRequirement/estructurado — el camino plano recibe su
// propio cliente inyectado y no lo toca). ────────────────────────────────
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: jest.fn() },
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  useOrganization: () => ({ organizationId: 120 }),
}));
jest.mock('@/lib/utils/orgId', () => ({
  getOrganizationId: () => 120,
}));

import { supabase } from '@/lib/supabase/config';
import StageGateService, { evaluateStageGate, type StageRequirement } from '../stageGateService';

// ─── Fixtures ────────────────────────────────────────────────────────────

/** Plantilla que reproduce el ejemplo del brief: 4 campos, 2 obligatorios. */
const FIELDS_CON_OBLIGATORIOS: DiscoveryField[] = [
  { id: 'who_is', label: 'Quién es', type: 'text' },
  { id: 'business', label: 'Negocio', type: 'text' },
  { id: 'budget', label: 'Presupuesto', type: 'text', required: true },
  { id: 'decision_maker', label: 'Decisor', type: 'text', required: true },
];

/** Plantilla sembrada real (discovery_templates hoy): sin ningún required. */
const FIELDS_SIN_OBLIGATORIOS: DiscoveryField[] = [
  { id: 'who_is', label: 'Quién es', type: 'text' },
  { id: 'business', label: 'Negocio', type: 'text' },
  { id: 'budget', label: 'Presupuesto', type: 'text' },
];

/** Encadenable mínimo: cualquier método intermedio devuelve el mismo objeto;
 * `single`/`maybeSingle` resuelven al resultado dado (evaluateStageGate hace
 * `await` sobre el valor final, y `await` de un no-thenable simplemente lo
 * pasa a través). */
function chain(result: { data: unknown; error: unknown }) {
  const self: Record<string, unknown> = {
    select: () => self,
    eq: () => self,
    order: () => self,
    limit: () => self,
    single: () => result,
    maybeSingle: () => result,
  };
  return self;
}

function makeFakeClient(tables: Record<string, { data: unknown; error?: unknown }>) {
  return {
    from: (table: string) => chain({ data: tables[table]?.data ?? null, error: tables[table]?.error ?? null }),
  } as unknown as Parameters<typeof evaluateStageGate>[0];
}

function baseOpportunity(discoveryData: unknown) {
  return {
    id: 'op-1',
    customer_id: null,
    salesperson_id: null,
    amount: 100,
    expected_close_date: null,
    discovery_data: discoveryData,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. discoveryDataProgress — helper puro
// ═══════════════════════════════════════════════════════════════════════
describe('discoveryDataProgress (helper puro)', () => {
  it('forma real completa: obligatorias respondidas, aunque falten opcionales → sin missing', () => {
    const dd = { who_is: 'Gerente', budget: '2M', decision_maker: 'CEO' };
    const progress = discoveryDataProgress(dd, FIELDS_CON_OBLIGATORIOS);
    expect(progress).toEqual({ completed: 3, total: 4, missing: [] });
  });

  it('forma real incompleta: nombra solo las obligatorias sin responder (ejemplo del brief)', () => {
    const dd = { who_is: 'Gerente', business: 'Tienda de calzado' };
    const progress = discoveryDataProgress(dd, FIELDS_CON_OBLIGATORIOS);
    expect(progress).toEqual({ completed: 2, total: 4, missing: ['Presupuesto', 'Decisor'] });
  });

  it('forma real vacía ({}): con obligatorias, faltan esas; sin obligatorias, faltan todas', () => {
    expect(discoveryDataProgress({}, FIELDS_CON_OBLIGATORIOS)).toEqual({
      completed: 0,
      total: 4,
      missing: ['Presupuesto', 'Decisor'],
    });
    expect(discoveryDataProgress({}, FIELDS_SIN_OBLIGATORIOS)).toEqual({
      completed: 0,
      total: 3,
      missing: ['Quién es', 'Negocio', 'Presupuesto'],
    });
  });

  it('discovery_data null → como vacío, nunca revienta', () => {
    expect(discoveryDataProgress(null, FIELDS_CON_OBLIGATORIOS)).toEqual({
      completed: 0,
      total: 4,
      missing: ['Presupuesto', 'Decisor'],
    });
    expect(discoveryDataProgress(undefined, FIELDS_SIN_OBLIGATORIOS).total).toBe(3);
  });

  it('sin campos obligatorios (plantilla sembrada hoy): completo solo con TODOS respondidos', () => {
    const parcial = { who_is: 'Gerente', budget: '2M' };
    expect(discoveryDataProgress(parcial, FIELDS_SIN_OBLIGATORIOS)).toEqual({
      completed: 2,
      total: 3,
      missing: ['Negocio'],
    });
    const completo = { who_is: 'Gerente', business: 'Tienda', budget: '2M' };
    expect(discoveryDataProgress(completo, FIELDS_SIN_OBLIGATORIOS)).toEqual({
      completed: 3,
      total: 3,
      missing: [],
    });
  });

  it('forma antigua completed_sections/total_sections: se respeta tal cual', () => {
    expect(discoveryDataProgress({ completed_sections: 3, total_sections: 5 }, FIELDS_CON_OBLIGATORIOS)).toEqual({
      completed: 3,
      total: 5,
      missing: ['secciones pendientes (dato en formato antiguo, sin detalle)'],
    });
    expect(discoveryDataProgress({ completed_sections: 5, total_sections: 5 }, FIELDS_CON_OBLIGATORIOS)).toEqual({
      completed: 5,
      total: 5,
      missing: [],
    });
  });

  it('espacios en blanco no cuentan como respuesta (igual que discoveryProgress)', () => {
    const dd = { budget: '   ', decision_maker: 'CEO' };
    const progress = discoveryDataProgress(dd, FIELDS_CON_OBLIGATORIOS);
    expect(progress.missing).toEqual(['Presupuesto']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. Criterio 'discovery' estructurado (requirements[]) — requiredKeys intacto
// ═══════════════════════════════════════════════════════════════════════
describe("stageGateService — criterio 'discovery' (formato requirements[])", () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
  });

  it('con requiredKeys: sigue leyendo las claves top-level de discovery_data tal cual (sin tocar supabase)', async () => {
    const service = new StageGateService(120);
    const req: StageRequirement = { type: 'discovery', requiredKeys: ['budget', 'decision_maker'] };
    const opportunity = baseOpportunity({ budget: '2M', decision_maker: 'CEO' });

    const result = await service.evaluateRequirementPublic(req as StageRequirement, opportunity as never, [], 'op-1');

    expect(result.passed).toBe(true);
    expect(result.message).toBe('Discovery: secciones requeridas completas');
    // requiredKeys no necesita la plantilla: no debe consultar discovery_templates.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('con requiredKeys incompleto: sigue sin pasar (mensaje intacto, no lo toca este arreglo)', async () => {
    const service = new StageGateService(120);
    const req: StageRequirement = { type: 'discovery', requiredKeys: ['budget', 'decision_maker'] };
    const opportunity = baseOpportunity({ budget: '2M' });

    const result = await service.evaluateRequirementPublic(req, opportunity as never, [], 'op-1');

    expect(result.passed).toBe(false);
    // defaultMessage (req.message || req.label || genérico) ya ganaba aquí
    // antes de este arreglo — no es parte de la «forma real», se deja tal
    // cual (requiredKeys intacto), solo se congela con un test.
    expect(result.message).toBe('Requisito no cumplido: discovery');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sin requiredKeys: usa la plantilla real de discovery_templates y da mensaje honesto', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      chain({ data: table === 'discovery_templates' ? { sections: FIELDS_CON_OBLIGATORIOS } : null, error: null })
    );
    const service = new StageGateService(120);
    const req: StageRequirement = { type: 'discovery' };
    const opportunity = baseOpportunity({ who_is: 'Gerente', business: 'Tienda de calzado' });

    const result = await service.evaluateRequirementPublic(req, opportunity as never, [], 'op-1');

    expect(result.passed).toBe(false);
    expect(result.message).toBe('Discovery: 2 de 4 secciones completas (faltan: Presupuesto, Decisor)');
  });

  it('sin requiredKeys, discovery completo: ahora SÍ pasa (antes imposible con completed_sections/total_sections)', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) =>
      chain({ data: table === 'discovery_templates' ? { sections: FIELDS_CON_OBLIGATORIOS } : null, error: null })
    );
    const service = new StageGateService(120);
    const req: StageRequirement = { type: 'discovery' };
    const opportunity = baseOpportunity({ budget: '2M', decision_maker: 'CEO' });

    const result = await service.evaluateRequirementPublic(req, opportunity as never, [], 'op-1');

    expect(result.passed).toBe(true);
    expect(result.message).toBe('Discovery: 2 de 4 secciones completas');
  });

  it('sin requiredKeys y sin plantilla configurada: usa el template por defecto (10 campos, nada requerido)', async () => {
    (supabase.from as jest.Mock).mockImplementation(() => chain({ data: null, error: null }));
    const service = new StageGateService(120);
    const req: StageRequirement = { type: 'discovery' };
    const opportunity = baseOpportunity({});

    const result = await service.evaluateRequirementPublic(req, opportunity as never, [], 'op-1');

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Discovery: 0 de 10 secciones completas');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. Gate plano F2 (require_discovery: true) — antes imposible de pasar
// ═══════════════════════════════════════════════════════════════════════
describe("evaluateStageGate — gate plano 'require_discovery'", () => {
  it('discovery completo: el gate PASA (antes siempre 0/0, nunca pasaba)', async () => {
    const client = makeFakeClient({
      stages: { data: { exit_criteria: { require_discovery: true }, pipeline_id: 'p1' } },
      opportunities: { data: { id: 'op-1', discovery_data: { budget: '2M', decision_maker: 'CEO' }, customers: null } },
      discovery_templates: { data: { sections: FIELDS_CON_OBLIGATORIOS } },
    });

    const result = await evaluateStageGate(client, 120, { opportunityId: 'op-1', targetStageId: 'stage-1' });

    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('discovery incompleto: el gate NO pasa y el detalle es honesto', async () => {
    const client = makeFakeClient({
      stages: { data: { exit_criteria: { require_discovery: true }, pipeline_id: 'p1' } },
      opportunities: { data: { id: 'op-1', discovery_data: { who_is: 'Gerente' }, customers: null } },
      discovery_templates: { data: { sections: FIELDS_CON_OBLIGATORIOS } },
    });

    const result = await evaluateStageGate(client, 120, { opportunityId: 'op-1', targetStageId: 'stage-1' });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual([
      {
        type: 'discovery',
        label: 'Discovery',
        detail: 'Discovery: 1 de 4 secciones completas (faltan: Presupuesto, Decisor)',
      },
    ]);
  });

  it('discovery_data ausente (oportunidad recién creada): NO pasa, sin reventar', async () => {
    const client = makeFakeClient({
      stages: { data: { exit_criteria: { require_discovery: true }, pipeline_id: 'p1' } },
      opportunities: { data: { id: 'op-1', discovery_data: null, customers: null } },
      discovery_templates: { data: { sections: FIELDS_SIN_OBLIGATORIOS } },
    });

    const result = await evaluateStageGate(client, 120, { opportunityId: 'op-1', targetStageId: 'stage-1' });

    expect(result.ok).toBe(false);
    expect(result.missing[0].detail).toBe('Discovery: 0 de 3 secciones completas (faltan: Quién es, Negocio, Presupuesto)');
  });
});
