/// <reference types="jest" />
/**
 * F10 — plantillas de ROI por vertical y checklist de demo: cada plantilla
 * evalúa sin errores con sus valores por defecto usando el evaluador seguro.
 */
import { ROI_TEMPLATES, getRoiTemplate, defaultInputs, formatRoiSummary } from '@/lib/services/crm/roiTemplates';
import { evaluateFormula } from '@/lib/services/crm/roiEvaluator';
import { buildDemoChecklist, sanitizeChecklist, checklistProgress } from '@/lib/services/crm/demoChecklists';

describe('F10 roiTemplates', () => {
  it('cubre los 8 slugs de verticales sembrados (restaurantes … otros)', () => {
    expect(ROI_TEMPLATES.map((t) => t.slug).sort()).toEqual(['educacion', 'hoteleria', 'otros', 'restaurantes', 'retail', 'saas', 'salud', 'servicios']);
  });

  it.each(ROI_TEMPLATES.map((t) => [t.slug, t] as const))('%s evalúa sin errores con los valores por defecto y produce las 5 salidas', (_slug, t) => {
    const r = evaluateFormula(t.formula.operations, defaultInputs(t.inputs));
    expect(r.errors).toEqual({});
    expect(Object.keys(r.outputs).sort()).toEqual(['net_yearly', 'payback_months', 'roi_pct', 'savings_monthly', 'savings_yearly']);
    expect(r.outputs.savings_monthly).toBeGreaterThan(0);
  });

  it('un slug desconocido cae en la plantilla general; los inputs referidos por la fórmula existen', () => {
    expect(getRoiTemplate('inexistente').slug).toBe('otros');
    expect(getRoiTemplate(null).slug).toBe('otros');
    for (const t of ROI_TEMPLATES) {
      const keys = new Set(t.inputs.map((i) => i.key));
      for (const op of t.formula.operations) {
        for (const m of op.expression.matchAll(/inputs\.([a-z_]+)/g)) expect(keys.has(m[1])).toBe(true);
      }
    }
  });

  it('formatRoiSummary produce el resumen que va a la sección ROI', () => {
    const t = getRoiTemplate('otros');
    const r = evaluateFormula(t.formula.operations, { current_cost: 1000000, proposed_cost: 700000, investment: 1200000, annual_fee: 2400000 });
    const s = formatRoiSummary(r.outputs, t.outputs, 'COP');
    expect(s).toMatch(/Ahorro anual estimado: .*3[.,]600[.,]000/);
    expect(s).toMatch(/ROI 33.3 %/);
    expect(s).toMatch(/retorno en 12 meses/);
  });
});

describe('F10 demoChecklists', () => {
  it('cada vertical tiene apertura común + 3 pasos propios + cierre común, todo sin marcar', () => {
    const c = buildDemoChecklist('restaurantes');
    expect(c).toHaveLength(7);
    expect(c.every((i) => i.done === false)).toBe(true);
    expect(c.map((i) => i.label)).toContain('Inventario de insumos y merma');
    expect(buildDemoChecklist('zzz').map((i) => i.label)).toContain('Flujo principal del negocio de punta a punta');
  });

  it('sanitizeChecklist rechaza formas hostiles y acepta la forma canónica', () => {
    expect(sanitizeChecklist([{ label: ' a ', done: true }])).toEqual([{ label: 'a', done: true }]);
    expect(sanitizeChecklist([{ label: 'a', done: 'yes' }])).toBeNull();
    expect(sanitizeChecklist([{ label: '', done: true }])).toBeNull();
    expect(sanitizeChecklist('x')).toBeNull();
    expect(sanitizeChecklist(new Array(51).fill({ label: 'a', done: false }))).toBeNull();
    expect(sanitizeChecklist([null])).toBeNull();
  });

  it('checklistProgress', () => {
    expect(checklistProgress([{ label: 'a', done: true }, { label: 'b', done: false }])).toEqual({ done: 1, total: 2, percent: 50 });
    expect(checklistProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});
