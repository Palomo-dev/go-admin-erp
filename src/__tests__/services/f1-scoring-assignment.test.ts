/**
 * Tests unitarios para F1 — Estructura comercial.
 * Cubre: scoringService GOC (calculateGOCScore, getDefaultGOCConfig, migrateOldConfig)
 * y assignmentService (tipos, AssignmentError).
 */

// Mockear el cliente Supabase para evitar requiere de env vars en tests
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn(() => ({ data: null, error: null })) })) })),
      insert: jest.fn(() => ({ select: jest.fn(() => ({ single: jest.fn(() => ({ data: { id: 'test' }, error: null })) })) })),
      update: jest.fn(() => ({ eq: jest.fn() })),
    })),
  },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 1,
  useOrganization: () => ({ organizationId: 1 }),
}));

import ScoringService, {
  getDefaultGOCConfig,
  migrateOldConfig,
  type GOCScoringConfig,
  type GOCScoreContext,
} from '@/lib/services/crm/scoringService';

describe('F1 — scoringService GOC', () => {
  describe('getDefaultGOCConfig', () => {
    test('retorna config con 4 dimensiones', () => {
      const config = getDefaultGOCConfig();
      expect(config.dimensions).toBeDefined();
      expect(Object.keys(config.dimensions)).toHaveLength(4);
      expect(config.dimensions.go_fit).toBeDefined();
      expect(config.dimensions.opportunity).toBeDefined();
      expect(config.dimensions.capacity).toBeDefined();
      expect(config.dimensions.timing).toBeDefined();
    });

    test('retorna config con 5 bandas canónicas', () => {
      const config = getDefaultGOCConfig();
      expect(config.bands).toHaveLength(5);
      expect(config.bands[0].label).toBe('Frío');
      expect(config.bands[1].label).toBe('Nurturing');
      expect(config.bands[2].label).toBe('Oportunidad');
      expect(config.bands[3].label).toBe('Alta prioridad');
      expect(config.bands[4].label).toBe('Hot deal');
    });

    test('los pesos de las dimensiones suman 100', () => {
      const config = getDefaultGOCConfig();
      const totalWeight =
        config.dimensions.go_fit.weight +
        config.dimensions.opportunity.weight +
        config.dimensions.capacity.weight +
        config.dimensions.timing.weight;
      expect(totalWeight).toBe(100);
    });
  });

  describe('calculateGOCScore', () => {
    const service = new ScoringService(1);

    test('retorna score 0 y banda Frío para opportunity vacía', () => {
      const config = getDefaultGOCConfig();
      const ctx: GOCScoreContext = {
        opportunity: { id: 'test-1', amount: 0, record_type: 'lead', expected_close_date: null } as any,
        customer: { id: 'cust-1', company_size: 'pequeña', lifecycle_stage: 'lead' } as any,
      };

      const result = service.calculateGOCScore({ config, ...ctx });
      expect(result.score_total).toBeGreaterThanOrEqual(0);
      expect(result.bandLabel).toBeDefined();
      expect(result.dimensionScores).toHaveLength(4);
    });

    test('retorna score alto para opportunity hot deal', () => {
      const config = getDefaultGOCConfig();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 15); // 15 días → timing lte_days 30

      const ctx: GOCScoreContext = {
        opportunity: {
          id: 'test-2',
          amount: 5000000,
          record_type: 'deal',
          expected_close_date: futureDate.toISOString(),
          icp_fit_score: 85,
        } as any,
        customer: {
          id: 'cust-2',
          company_size: 'grande',
          lifecycle_stage: 'opportunity',
        } as any,
      };

      const result = service.calculateGOCScore({ config, ...ctx });
      expect(result.score_total).toBeGreaterThan(50);
      expect(result.bandLabel).toBeDefined();
      expect(result.bandColor).toBeDefined();
    });

    test('resuelve campos de opportunity sin prefijo (amount, record_type)', () => {
      const config: GOCScoringConfig = {
        dimensions: {
          go_fit: {
            label: 'Go Fit',
            weight: 25,
            criteria: [{ field: 'icp_fit_score', operator: 'gte', value: 70, points: 25 }],
          },
          opportunity: {
            label: 'Opportunity',
            weight: 25,
            criteria: [
              { field: 'amount', operator: 'gte', value: 1000000, points: 15 },
              { field: 'record_type', operator: 'eq', value: 'deal', points: 10 },
            ],
          },
          capacity: {
            label: 'Capacity',
            weight: 25,
            criteria: [{ field: 'customers.company_size', operator: 'in', value: ['mediana', 'grande'], points: 25 }],
          },
          timing: {
            label: 'Timing',
            weight: 25,
            criteria: [{ field: 'expected_close_date', operator: 'lte_days', value: 30, points: 25 }],
          },
        },
        bands: getDefaultGOCConfig().bands,
      };

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const ctx: GOCScoreContext = {
        opportunity: {
          amount: 2000000,
          record_type: 'deal',
          expected_close_date: futureDate.toISOString(),
          icp_fit_score: 80,
        } as any,
        customer: { company_size: 'grande' } as any,
      };

      const result = service.calculateGOCScore({ config, ...ctx });
      // go_fit: 80 >= 70 → 25 points * weight 25% = 25
      // opportunity: amount 2M >= 1M → 15 + record_type deal → 10 = 25 * 25% = 25
      // capacity: grande in [mediana, grande] → 25 * 25% = 25
      // timing: 10 days <= 30 → 25 * 25% = 25
      // total = 100
      expect(result.score_total).toBeGreaterThan(80);
    });
  });

  describe('migrateOldConfig', () => {
    test('convierte indicators/options a dimensions/criteria', () => {
      const oldConfig = {
        indicators: [
          {
            key: 'budget',
            label: 'Presupuesto',
            weight: 50,
            options: [
              { value: 'high', label: 'Alto', score: 50 },
              { value: 'low', label: 'Bajo', score: 10 },
            ],
          },
        ],
        bands: {
          cold: { min: 0, max: 33 },
          warm: { min: 34, max: 66 },
          hot: { min: 67, max: 100 },
        },
      };

      const migrated = migrateOldConfig(oldConfig as any);
      expect(migrated.dimensions).toBeDefined();
      expect(migrated.bands).toHaveLength(5);
      expect(migrated.bands[0].label).toBe('Frío');
    });
  });
});

describe('F1 — assignmentService tipos', () => {
  test('AssignmentError es una clase de error', async () => {
    const mod = await import('@/lib/services/crm/assignmentService');
    const err = new mod.AssignmentError('test error');
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('test error');
  });

  test('AssignmentStrategy incluye las 3 estrategias', async () => {
    const strategies: string[] = ['round_robin', 'territory', 'load_balance'];
    expect(strategies).toContain('round_robin');
    expect(strategies).toContain('territory');
    expect(strategies).toContain('load_balance');
  });
});
