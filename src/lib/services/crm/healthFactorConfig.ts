import { z } from 'zod';
import type { HealthConfigJson } from './healthBands';

/** Configuración por defecto; la puntuación siempre usa healthBands.scoreFromConfig. */
export const HEALTH_FACTOR_KEYS = ['recency', 'days_since_last_invoice', 'frequency', 'invoices_12m', 'ltv', 'revenue_12m', 'avg_ticket', 'activity', 'days_since_last_activity', 'receivables', 'overdue', 'overdue_ratio', 'overdue_balance'] as const;
export const DEFAULT_HEALTH_CONFIG: HealthConfigJson = {
  bands: { green: 70, yellow: 40, red: 0 },
  indicators: [
    { key: 'recency', label: 'Días desde la última factura', weight: 30, direction: 'lower_better', thresholds: [{ max: 7, score: 100 }, { max: 30, score: 70 }, { max: 60, score: 40 }, { max: 999, score: 10 }] },
    { key: 'frequency', label: 'Facturas en 12 meses', weight: 25, direction: 'higher_better', thresholds: [{ min: 10, score: 100 }, { min: 5, score: 75 }, { min: 2, score: 50 }, { min: 1, score: 25 }, { min: 0, score: 0 }] },
    { key: 'ltv', label: 'Ingresos en 12 meses', weight: 25, direction: 'higher_better', thresholds: [{ min: 1000000, score: 100 }, { min: 500000, score: 75 }, { min: 100000, score: 50 }, { min: 0, score: 20 }] },
    { key: 'avg_ticket', label: 'Ticket promedio en 12 meses', weight: 20, direction: 'higher_better', thresholds: [{ min: 100000, score: 100 }, { min: 50000, score: 70 }, { min: 20000, score: 40 }, { min: 0, score: 10 }] },
  ],
};
const threshold = z.object({ min: z.number().finite().min(0).optional(), max: z.number().finite().min(0).optional(), score: z.number().int().min(0).max(100) }).strict();
export const healthFactorConfigSchema = z.object({
  bands: z.object({ green: z.number().int().min(1).max(100), yellow: z.number().int().min(0).max(99), red: z.literal(0) }).strict(),
  indicators: z.array(z.object({ key: z.enum(HEALTH_FACTOR_KEYS), label: z.string().trim().min(1).max(100), weight: z.number().int().min(0).max(100), direction: z.enum(['higher_better', 'lower_better']), thresholds: z.array(threshold).min(1).max(20) }).strict()).min(1).max(13),
}).strict().superRefine((config, ctx) => {
  if (config.bands.green <= config.bands.yellow) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bands'], message: 'bandas_invalidas' });
  if (config.indicators.reduce((sum, i) => sum + i.weight, 0) !== 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['indicators'], message: 'pesos_invalidos' });
  if (new Set(config.indicators.map(i => i.key)).size !== config.indicators.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['indicators'], message: 'indicadores_duplicados' });
  config.indicators.forEach((i, index) => {
    const boundary = i.direction === 'lower_better' ? 'max' : 'min';
    const opposite = boundary === 'max' ? 'min' : 'max';
    if (i.thresholds.some(t => t[boundary] === undefined || t[opposite] !== undefined) || new Set(i.thresholds.map(t => t[boundary])).size !== i.thresholds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['indicators', index, 'thresholds'], message: 'umbrales_invalidos' });
  });
});
export interface HealthFactorSettings {
  config: HealthConfigJson;
  updated_at: string | null;
  refresh_interval_hours: number;
  is_active: boolean;
}
