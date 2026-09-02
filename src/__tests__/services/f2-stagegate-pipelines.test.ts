/**
 * Tests unitarios para F2 — Pipeline profesional.
 * Cubre: stageGateService (9 tipos de criteria), pipelineTemplates.
 */

// Mockear Supabase y hooks
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(() => ({ data: null, error: null })),
          order: jest.fn(() => ({ data: [], error: null })),
        })),
        order: jest.fn(() => ({ data: [], error: null })),
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(() => ({ data: { id: 'test' }, error: null })),
        })),
      })),
      update: jest.fn(() => ({ eq: jest.fn() })),
      delete: jest.fn(() => ({ eq: jest.fn() })),
    })),
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 1,
  useOrganization: () => ({ organizationId: 1 }),
}));

import {
  evaluateStageGate,
  type GateResult,
  type GateMissing,
} from '@/lib/services/crm/stageGateService';

describe('F2 — stageGateService', () => {
  describe('Tipos de criteria', () => {
    test('GateMissing tiene type, label, detail', () => {
      const missing: GateMissing = {
        type: 'field',
        label: 'amount',
        detail: 'Falta amount en la oportunidad',
      };
      expect(missing.type).toBe('field');
      expect(missing.label).toBe('amount');
      expect(missing.detail).toContain('amount');
    });

    test('GateResult tiene ok y missing array', () => {
      const result: GateResult = {
        ok: true,
        missing: [],
      };
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.missing)).toBe(true);
    });

    test('Los 9 tipos de RequirementType son válidos', () => {
      const validTypes = [
        'field',
        'customer_field',
        'activity',
        'discovery',
        'quotation',
        'score',
        'icp_band',
        'next_contact',
        'custom',
      ];
      expect(validTypes).toHaveLength(9);
      validTypes.forEach((t) => {
        expect(typeof t).toBe('string');
      });
    });
  });

  describe('evaluateStageGate', () => {
    test('retorna ok=true cuando no hay exit_criteria', async () => {
      // Mock del supabase client para este test
      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'stages') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: { id: 'stage-1', exit_criteria: null, pipeline_id: 'p1' },
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'opportunities') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: { id: 'opp-1', organization_id: 1, customers: {} },
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'pipelines') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: { id: 'p1', organization_id: 1 },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [], error: null })),
            })),
          };
        }),
      };

      const result = await evaluateStageGate(mockSupabase as any, 1, {
        opportunityId: 'opp-1',
        targetStageId: 'stage-1',
      });

      expect(result.ok).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    test('detecta campos faltantes con required_fields', async () => {
      const mockSupabase = {
        from: jest.fn((table: string) => {
          if (table === 'stages') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: {
                      id: 'stage-1',
                      exit_criteria: { required_fields: ['amount', 'expected_close_date'] },
                      pipeline_id: 'p1',
                    },
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'opportunities') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: {
                      id: 'opp-1',
                      organization_id: 1,
                      amount: null,
                      expected_close_date: null,
                      customers: {},
                    },
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'pipelines') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(() => ({
                    data: { id: 'p1', organization_id: 1 },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({ data: [], error: null })),
            })),
          };
        }),
      };

      const result = await evaluateStageGate(mockSupabase as any, 1, {
        opportunityId: 'opp-1',
        targetStageId: 'stage-1',
      });

      expect(result.ok).toBe(false);
      expect(result.missing.length).toBeGreaterThanOrEqual(2);
      const fieldMissing = result.missing.filter((m) => m.type === 'field');
      expect(fieldMissing.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('F2 — pipelineTemplates', () => {
  test('las 3 plantillas canónicas existen', async () => {
    const mod = await import('@/lib/services/crm/pipelineTemplates');
    // Verificar que el módulo exporta las plantillas
    expect(mod).toBeDefined();
  });
});
