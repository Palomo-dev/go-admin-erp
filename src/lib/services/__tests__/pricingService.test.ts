/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * pricingService — F0 (REG r1): precio unitario desde provider_pricing con
 * cache de 5 min; estimateCost nunca inventa precios.
 */

import {
  getUnitCost,
  estimateCost,
  clearPricingCache,
  __setPricingClientFactory,
  PRICING_CACHE_TTL_MS,
  units,
  round6,
} from '@/lib/services/crm/pricingService';

type Row = { provider: string; sku: string; unit_cost_usd: number; valid_from: string };

function fakeClient(rows: Row[], onQuery?: () => void) {
  const from = () => {
    const filters: Record<string, unknown> = {};
    const q: any = {
      select: () => q,
      eq: (col: string, val: unknown) => { filters[col] = val; return q; },
      lte: () => q,
      or: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: async () => {
        onQuery?.();
        const hit = rows.find((r) => r.provider === filters.provider && r.sku === filters.sku);
        return { data: hit ? { unit_cost_usd: hit.unit_cost_usd, valid_from: hit.valid_from } : null, error: null };
      },
    };
    return q;
  };
  return { from } as any;
}

const ROWS: Row[] = [
  { provider: 'openai', sku: 'gpt_5_6_luna_in', unit_cost_usd: 0.2, valid_from: '2026-01-01' },
  { provider: 'twilio', sku: 'voice_out_co_mobile', unit_cost_usd: 0.0377, valid_from: '2026-01-01' },
  { provider: 'elevenlabs', sku: 'scribe', unit_cost_usd: 0.22, valid_from: '2026-01-01' },
];

beforeEach(() => {
  clearPricingCache();
  jest.useRealTimers();
});
afterEach(() => {
  __setPricingClientFactory(null);
});

describe('getUnitCost', () => {
  it('devuelve el precio de provider_pricing', async () => {
    __setPricingClientFactory(() => fakeClient(ROWS));
    expect(await getUnitCost('openai', 'gpt_5_6_luna_in')).toBe(0.2);
  });

  it('devuelve null si no hay sku (no inventa)', async () => {
    __setPricingClientFactory(() => fakeClient(ROWS));
    expect(await getUnitCost('openai', 'no_existe')).toBeNull();
  });

  it('cachea 5 minutos y consulta de nuevo al expirar', async () => {
    let queries = 0;
    __setPricingClientFactory(() => fakeClient(ROWS, () => { queries += 1; }));
    const t0 = 1_800_000_000_000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(t0);
    await getUnitCost('twilio', 'voice_out_co_mobile');
    await getUnitCost('twilio', 'voice_out_co_mobile');
    expect(queries).toBe(1);
    spy.mockReturnValue(t0 + PRICING_CACHE_TTL_MS - 1);
    await getUnitCost('twilio', 'voice_out_co_mobile');
    expect(queries).toBe(1);
    spy.mockReturnValue(t0 + PRICING_CACHE_TTL_MS + 1);
    await getUnitCost('twilio', 'voice_out_co_mobile');
    expect(queries).toBe(2);
    spy.mockRestore();
  });

  it('tolera errores del cliente (tabla ausente) devolviendo null', async () => {
    const failing: any = {};
    for (const m of ['select', 'eq', 'lte', 'order', 'limit']) failing[m] = () => failing;
    failing.maybeSingle = async () => ({ data: null, error: { code: '42P01', message: 'relation does not exist' } });
    __setPricingClientFactory(() => ({ from: () => failing }) as any);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getUnitCost('meta', 'wa_utility_co')).toBeNull();
    warn.mockRestore();
  });
});

describe('estimateCost', () => {
  it('suma quantity * unit_cost por línea', async () => {
    __setPricingClientFactory(() => fakeClient(ROWS));
    const est = await estimateCost([
      { provider: 'twilio', sku: 'voice_out_co_mobile', quantity: 10 },
      { provider: 'elevenlabs', sku: 'scribe', quantity: 0.5 },
    ]);
    expect(est.complete).toBe(true);
    expect(est.lines[0].cost_usd).toBeCloseTo(0.377, 6);
    expect(est.lines[1].cost_usd).toBeCloseTo(0.11, 6);
    expect(est.total_usd).toBeCloseTo(0.487, 6);
  });

  it('marca complete=false y cost 0 en líneas sin precio', async () => {
    __setPricingClientFactory(() => fakeClient(ROWS));
    const est = await estimateCost([{ provider: 'meta', sku: 'wa_marketing_co', quantity: 100 }]);
    expect(est.complete).toBe(false);
    expect(est.lines[0].priced).toBe(false);
    expect(est.total_usd).toBe(0);
  });

  it('cantidades negativas o NaN cuentan como 0', async () => {
    __setPricingClientFactory(() => fakeClient(ROWS));
    const est = await estimateCost([{ provider: 'openai', sku: 'gpt_5_6_luna_in', quantity: -3 }]);
    expect(est.lines[0].quantity).toBe(0);
    expect(est.total_usd).toBe(0);
  });
});

describe('helpers', () => {
  it('units convierte a unidades facturables', () => {
    expect(units.minutes(61)).toBe(2);
    expect(units.hours(1800)).toBe(0.5);
    expect(units.char1k(2500)).toBe(2.5);
    expect(units.tokens1m(500_000)).toBe(0.5);
  });
  it('round6 redondea a 6 decimales', () => {
    expect(round6(0.1234567)).toBe(0.123457);
  });
});
