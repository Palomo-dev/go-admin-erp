/**
 * GO Assistant — conversión entre monedas.
 *
 * Política: tasa del día de openexchangerates (`currency_rates`, base USD).
 * Los valores de referencia salen de la tabla real del 2026-09-15:
 * COP 3104.558190, EUR 0.866620 → 20 USD = 62 091,1638 COP y
 * 100 EUR = 358 237,5424 COP.
 */

import { convertAmount, ConversionError } from '@/lib/ai/assistant/orgCurrency';
import { convertirMoneda } from '@/lib/ai/agent/tools/moneda';
import { getRegistry, resetRegistry } from '@/lib/ai/agent/toolRegistry';
import type { ToolContext } from '@/lib/ai/agent/types';

/** `currency_rates` falsa: {code → [{rate_date, rate}]} ordenada desc por fecha. */
function ratesClient(tabla: Record<string, Array<{ rate_date: string; rate: number }>>, timezone = 'America/Bogota') {
  return {
    from(nombre: string) {
      if (nombre === 'organizations') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone } }) }) }) };
      }
      let code = '';
      let hasta = '';
      const q = {
        select: () => q,
        eq: (col: string, v: string) => {
          if (col === 'code') code = v;
          return q;
        },
        lte: (_c: string, v: string) => {
          hasta = v;
          return q;
        },
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const fila = (tabla[code] ?? []).filter((r) => r.rate_date <= hasta).sort((a, b) => (a.rate_date < b.rate_date ? 1 : -1))[0];
          return { data: fila ?? null };
        },
      };
      return q;
    },
  };
}

const TABLA = {
  COP: [
    { rate_date: '2026-09-15', rate: 3104.55819 },
    { rate_date: '2026-09-12', rate: 3100 },
  ],
  EUR: [{ rate_date: '2026-09-15', rate: 0.86662 }],
};

const ctx = (client: unknown): ToolContext => ({
  organizationId: 125,
  branchId: null,
  userId: 'u',
  supabase: client as ToolContext['supabase'],
  capabilities: { level: 'read', enabledTools: null, permissions: new Set(), isAdmin: false, activeModules: new Set(), undoWindowMinutes: 15, bulkMaxRows: 500 },
  locale: 'es-CO',
  currency: 'COP',
  channel: 'text',
  conversationId: null,
});

beforeEach(() => resetRegistry());

describe('convertAmount — tasa del día, base USD', () => {
  it('USD → COP con la tasa del día', async () => {
    const c = await convertAmount(ratesClient(TABLA) as never, 20, 'usd', 'cop', '2026-09-15');
    expect(c.result).toBeCloseTo(62091.1638, 3);
    expect(c.rateDate).toBe('2026-09-15');
    expect(c.stale).toBe(false);
  });

  it('EUR → COP pasa por USD', async () => {
    const c = await convertAmount(ratesClient(TABLA) as never, 100, 'EUR', 'COP', '2026-09-15');
    expect(c.result).toBeCloseTo(358237.5424, 3);
    expect(c.rate).toBeCloseTo(3104.55819 / 0.86662, 6);
  });

  it('COP → USD es la inversa', async () => {
    const c = await convertAmount(ratesClient(TABLA) as never, 62091.1638, 'COP', 'USD', '2026-09-15');
    expect(c.result).toBeCloseTo(20, 3);
  });

  it('sin tasa ese día usa la última anterior y lo marca como stale', async () => {
    const c = await convertAmount(ratesClient(TABLA) as never, 1, 'USD', 'COP', '2026-09-14');
    expect(c.rate).toBe(3100);
    expect(c.rateDate).toBe('2026-09-12');
    expect(c.stale).toBe(true);
  });

  it('misma moneda: tasa 1 sin consultar', async () => {
    const c = await convertAmount(ratesClient({}) as never, 5, 'COP', 'COP', '2026-09-15');
    expect(c).toMatchObject({ result: 5, rate: 1, stale: false });
  });

  it('moneda sin tasa → error con código estable, no un NaN', async () => {
    await expect(convertAmount(ratesClient(TABLA) as never, 1, 'USD', 'XYZ', '2026-09-15')).rejects.toBeInstanceOf(ConversionError);
    await expect(convertAmount(ratesClient(TABLA) as never, 1, 'USD', 'XYZ', '2026-09-15')).rejects.toMatchObject({ code: 'no_rate' });
  });

  it('la fecha la pone el llamador: nada de derivar "hoy" en UTC aquí', async () => {
    await expect(convertAmount(ratesClient(TABLA) as never, 1, 'USD', 'COP', 'hoy')).rejects.toBeInstanceOf(ConversionError);
  });
});

describe('convertir_moneda — herramienta', () => {
  it('está registrada, es de lectura y sin módulo', () => {
    expect(getRegistry().has('convertir_moneda')).toBe(true);
    expect(convertirMoneda.risk).toBe('low');
    expect(convertirMoneda.requiredModule).toBeNull();
    expect(convertirMoneda.availableInVoice).toBe(true);
  });

  it('parsea y normaliza; rechaza importes negativos y códigos raros', () => {
    expect(convertirMoneda.parseArgs({ amount: '20', from: 'usd', to: 'cop', date: '2026-09-15' })).toEqual({
      amount: 20,
      from: 'USD',
      to: 'COP',
      date: '2026-09-15',
    });
    expect(convertirMoneda.parseArgs({ amount: -1, from: 'USD' })).toBeNull();
    expect(convertirMoneda.parseArgs({ amount: 1, from: 'dólares' })).toBeNull();
    expect(convertirMoneda.parseArgs({ amount: 1, from: 'USD', date: 'mañana' })).toEqual({ amount: 1, from: 'USD' });
  });

  it('sin `to` convierte a la moneda de la organización y dice la tasa y su fecha', async () => {
    const r = await convertirMoneda.execute(ctx(ratesClient(TABLA)), { amount: 20, from: 'USD', date: '2026-09-15' });
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({ to: 'COP', rate_date: '2026-09-15', source: 'openexchangerates' });
    expect(r.message).toContain('2026-09-15');
    expect(r.message).toContain('COP/USD');
  });

  it('el error de tasa llega en español con código', async () => {
    const r = await convertirMoneda.execute(ctx(ratesClient(TABLA)), { amount: 1, from: 'GBP', date: '2026-09-15' });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('no_rate');
    expect(r.message).toContain('GBP');
  });
});
