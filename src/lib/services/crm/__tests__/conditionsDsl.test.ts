/**
 * DSL de condiciones de FASE-08 §2.4: allow-list de campos, operadores sin
 * coerción numérica forzada, normalización del formato legacy y trazas.
 */

import {
  evaluateConditionTree,
  normalizeConditions,
  validateConditions,
  applyOperator,
  isConditionFieldAllowed,
  type RuleContext,
} from '@/lib/services/crm/automation/conditionsDsl';

const NOW = new Date('2026-09-09T12:00:00.000Z');

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    orgId: 125,
    now: NOW,
    opportunity: { id: 'opp-1', amount: 5_000_000, status: 'open', temperature: 'warm', icp_band: 'B', last_contact_at: '2026-09-05T12:00:00.000Z' },
    customer: { id: 'cus-1', email: 'cliente@ejemplo.com', phone: null, tags: ['vip'], lifecycle_stage: 'lead' },
    stage: { id: 'stg-1', name: 'Propuesta', is_won: false, is_lost: false },
    pipeline: { id: 'pip-1', pipeline_type: 'sales' },
    consent: { email: 'opted_in', whatsapp: 'opted_out' },
    event: { event_type: 'opportunity.stage_changed', payload: { to_stage_id: 'stg-1' } },
    ...overrides,
  };
}

describe('conditionsDsl', () => {
  it('un grupo AND vacío (regla sin condiciones) es verdadero', () => {
    expect(evaluateConditionTree(null, ctx()).result).toBe(true);
    expect(evaluateConditionTree([], ctx()).result).toBe(true);
    expect(evaluateConditionTree({ op: 'and', rules: [] }, ctx()).result).toBe(true);
  });

  it('normaliza el formato legacy (array plano) a un grupo AND', () => {
    const legacy = [{ field: 'opportunity.amount', operator: 'gte', value: 1 }];
    expect(normalizeConditions(legacy)).toEqual({ op: 'and', rules: legacy });
  });

  it('evalúa AND / OR anidados', () => {
    const node = {
      op: 'and',
      rules: [
        { field: 'opportunity.amount', operator: 'gte', value: 1_000_000 },
        { op: 'or', rules: [
          { field: 'opportunity.icp_band', operator: 'in', value: ['A', 'B'] },
          { field: 'stage.name', operator: 'eq', value: 'Cerrado' },
        ] },
      ],
    };
    expect(evaluateConditionTree(node, ctx()).result).toBe(true);
  });

  it('un campo fuera de la allow-list es FALSO y deja traza (no lee el contexto)', () => {
    const { result, trace } = evaluateConditionTree(
      { op: 'and', rules: [{ field: 'customer.password', operator: 'eq', value: 'x' }] },
      ctx(),
    );
    expect(result).toBe(false);
    expect(trace[0]).toEqual(expect.objectContaining({ reason: 'field_not_allowed' }));
    expect(isConditionFieldAllowed('customer.password')).toBe(false);
    expect(isConditionFieldAllowed('event.payload.to_stage_id')).toBe(true);
  });

  it('gte no fuerza Number(): un texto no numérico no pasa como 0', () => {
    expect(applyOperator('gte', 'muchísimo', 0, NOW)).toBe(false);
    expect(applyOperator('gte', 5, 5, NOW)).toBe(true);
    expect(applyOperator('gt', null, 0, NOW)).toBe(false);
  });

  it('operadores de fecha y within_days', () => {
    expect(applyOperator('before', '2026-09-01T00:00:00Z', '2026-09-09T00:00:00Z', NOW)).toBe(true);
    expect(applyOperator('after', '2026-09-10T00:00:00Z', '2026-09-09T00:00:00Z', NOW)).toBe(true);
    expect(applyOperator('within_days', '2026-09-05T12:00:00Z', 7, NOW)).toBe(true);
    expect(applyOperator('within_days', '2026-08-01T12:00:00Z', 7, NOW)).toBe(false);
  });

  it('contains funciona con arreglos y con texto', () => {
    expect(applyOperator('contains', ['vip', 'b2b'], 'vip', NOW)).toBe(true);
    expect(applyOperator('not_contains', 'Cliente Perdido', 'perdido', NOW)).toBe(false);
  });

  it('lee el consentimiento y `has_email` derivados del contexto', () => {
    const c = ctx();
    expect(evaluateConditionTree({ op: 'and', rules: [{ field: 'consent.whatsapp', operator: 'eq', value: 'opted_out' }] }, c).result).toBe(true);
    expect(evaluateConditionTree({ op: 'and', rules: [{ field: 'customer.has_phone', operator: 'eq', value: true }] }, c).result).toBe(false);
    expect(evaluateConditionTree({ op: 'and', rules: [{ field: 'customer.has_email', operator: 'eq', value: true }] }, c).result).toBe(true);
  });

  it('validateConditions detecta campos y operadores no permitidos', () => {
    const issues = validateConditions({ op: 'and', rules: [
      { field: 'opportunity.amount', operator: 'gte', value: 1 },
      { field: 'secret.token', operator: 'eq', value: 'x' },
      { field: 'opportunity.amount', operator: 'sql_injection', value: 'x' },
    ] });
    expect(issues).toHaveLength(2);
    expect(issues.join(' ')).toMatch(/secret.token/);
    expect(issues.join(' ')).toMatch(/sql_injection/);
  });
});
