/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * aiUsageStatsService — F0-REG r2 (QA r1 medios 11 y 12).
 *  - el inicio de mes y el día de `by_day` se cortan en la zona horaria de la
 *    organización, nunca en UTC ni con `.slice(0, 10)` sobre el timestamptz;
 *  - el costo lee `coalesce(cost_amount, metadata.cost_amount)`;
 *  - RPC `fn_ai_usage_month` primero; si PostgREST dice que no existe
 *    (migración 39 sin aplicar) se agrega en Node y se avisa si se truncó.
 * Corre igual con TZ=UTC y TZ=America/Bogota (npm run test:tz-all).
 */

import {
  monthStartInTz,
  rowCostUsd,
  isMissingFunctionError,
  getAiUsageMonth,
  getCommUsageMonth,
  isUnknownTimeZoneError,
  FALLBACK_ROW_LIMIT,
} from '@/lib/services/crm/aiUsageStatsService';

describe('monthStartInTz', () => {
  it('el mes empieza el día 1 a las 00:00 de la zona de la org (no en UTC)', () => {
    // 2026-09-30T23:30 en Bogotá = 2026-10-01T04:30Z: para la org sigue siendo septiembre.
    const now = new Date('2026-10-01T04:30:00.000Z');
    expect(monthStartInTz('America/Bogota', now)).toBe('2026-09-01T00:00:00.000-05:00');
    // `offsetMinutesToISO(0)` escribe "-00:00" (válido en RFC 3339; Postgres lo lee como UTC).
    expect(monthStartInTz('UTC', now)).toMatch(/^2026-10-01T00:00:00\.000[+-]00:00$/);
    expect(monthStartInTz('Europe/Madrid', now)).toBe('2026-10-01T00:00:00.000+02:00');
  });
});

describe('rowCostUsd', () => {
  it('prefiere la columna y cae a metadata.cost_amount', () => {
    expect(rowCostUsd({ cost_amount: 0.5, metadata: { cost_amount: 9 } })).toBe(0.5);
    expect(rowCostUsd({ cost_amount: '0.25', metadata: null })).toBe(0.25);
    expect(rowCostUsd({ cost_amount: null, metadata: { cost_amount: 0.75 } })).toBe(0.75);
    expect(rowCostUsd({ cost_amount: null, metadata: { cost_amount: 'x' } })).toBe(0);
    expect(rowCostUsd({ metadata: null })).toBe(0);
  });
});

describe('isMissingFunctionError', () => {
  it('reconoce la respuesta de PostgREST cuando la RPC no existe', () => {
    expect(isMissingFunctionError({ code: 'PGRST202', message: 'Could not find the function public.fn_ai_usage_month' })).toBe(true);
    expect(isMissingFunctionError({ code: '42883', message: 'function does not exist' })).toBe(true);
    expect(isMissingFunctionError({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });
});

function fakeSb(opts: { rpc?: (name: string, args: any) => any; rows?: any[]; rowsError?: any }) {
  const rpcCalls: any[] = [];
  const sb: any = {
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      return opts.rpc ? opts.rpc(name, args) : { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    },
    from: () => {
      const q: any = {
        select: () => q, eq: () => q, gte: () => q, order: () => q,
        limit: async () => ({ data: opts.rows ?? [], error: opts.rowsError ?? null }),
      };
      return q;
    },
  };
  return { sb, rpcCalls };
}

describe('getAiUsageMonth', () => {
  it('usa la RPC cuando existe y normaliza su jsonb', async () => {
    const { sb, rpcCalls } = fakeSb({
      rpc: () => ({ data: { spent_usd: '1.5', spent_credits: 7, rows: 3, by_model: [{ model: 'm', credits: 7, cost_usd: 1.5, tokens: 100, calls: 2 }], by_day: [{ day: '2026-09-15', credits: 7, cost_usd: 1.5 }] }, error: null }),
    });
    const r = await getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000-05:00', 'America/Bogota');
    expect(rpcCalls[0]).toEqual({ name: 'fn_ai_usage_month', args: { p_org: 7, p_since: '2026-09-01T00:00:00.000-05:00', p_tz: 'America/Bogota' } });
    expect(r).toMatchObject({ source: 'rpc', truncated: false, spent_usd: 1.5, spent_credits: 7, rows: 3 });
    expect(r.by_model[0]).toEqual({ model: 'm', credits: 7, cost_usd: 1.5, tokens: 100, calls: 2 });
    expect(r.by_day[0]).toEqual({ day: '2026-09-15', credits: 7, cost_usd: 1.5 });
  });

  it('sin la RPC (mig. 39 sin aplicar) agrega en Node con coalesce y días en la zona de la org', async () => {
    const { sb } = fakeSb({
      rows: [
        // 2026-09-15T23:30 Bogotá = 2026-09-16T04:30Z → debe contar como el 15.
        { model: 'gpt', credits_consumed: 3, total_tokens: 30, cost_amount: 0.3, metadata: { cost_amount: 99 }, created_at: '2026-09-16T04:30:00.000Z' },
        { model: 'gpt', credits_consumed: 2, total_tokens: 20, cost_amount: null, metadata: { cost_amount: 0.2 }, created_at: '2026-09-16T12:00:00.000Z' },
        // Reembolso y refund_failed: no son llamadas.
        { model: 'gpt', credits_consumed: -2, total_tokens: 0, cost_amount: 0, metadata: { cost_amount: 0 }, created_at: '2026-09-16T12:01:00.000Z' },
        { model: 'gpt', credits_consumed: 0, total_tokens: 0, cost_amount: 0, metadata: {}, created_at: '2026-09-16T12:02:00.000Z' },
      ],
    });
    const r = await getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000-05:00', 'America/Bogota');
    expect(r.source).toBe('fallback');
    expect(r.truncated).toBe(false);
    expect(r.spent_usd).toBeCloseTo(0.5, 6);
    expect(r.spent_credits).toBe(3);
    expect(r.by_model).toEqual([{ model: 'gpt', credits: 3, cost_usd: 0.5, tokens: 50, calls: 2 }]);
    expect(r.by_day.map((d) => d.day)).toEqual(['2026-09-15', '2026-09-16']);
    expect(r.by_day[0]).toEqual({ day: '2026-09-15', credits: 3, cost_usd: 0.3 });
  });

  it('avisa cuando el respaldo alcanzó su tope de filas', async () => {
    const rows = Array.from({ length: FALLBACK_ROW_LIMIT }, () => ({ model: 'm', credits_consumed: 1, total_tokens: 1, cost_amount: 0, metadata: {}, created_at: '2026-09-10T12:00:00.000Z' }));
    const { sb } = fakeSb({ rows });
    const r = await getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000Z', 'UTC');
    expect(r.truncated).toBe(true);
    expect(r.spent_credits).toBe(FALLBACK_ROW_LIMIT);
  });

  it('un error de la RPC que no sea "no existe" se propaga (no se enmascara con el respaldo)', async () => {
    const { sb } = fakeSb({ rpc: () => ({ data: null, error: { code: '57014', message: 'statement timeout' } }) });
    await expect(getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000Z', 'UTC')).rejects.toThrow(/fn_ai_usage_month/);
  });

  // QA r2 medio 2: Intl (ICU) y pg_timezone_names no son el mismo catálogo.
  // Una zona válida para Node pero no para Postgres no puede dar 500.
  it('22023 (zona no reconocida por Postgres) → reintento con UTC, 2 llamadas al RPC, mismo p_since', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sb, rpcCalls } = fakeSb({
      rpc: (_n, args) =>
        args.p_tz === 'UTC'
          ? { data: { spent_usd: 2, spent_credits: 4, rows: 1, by_model: [], by_day: [{ day: '2026-09-15', credits: 4, cost_usd: 2 }] }, error: null }
          : { data: null, error: { code: '22023', message: 'time zone "Marte/Fobos" not recognized' } },
    });
    const r = await getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000-05:00', 'Marte/Fobos');
    expect(r).toMatchObject({ source: 'rpc', spent_usd: 2, spent_credits: 4 });
    expect(rpcCalls).toHaveLength(2);
    expect(rpcCalls[0].args).toEqual({ p_org: 7, p_since: '2026-09-01T00:00:00.000-05:00', p_tz: 'Marte/Fobos' });
    expect(rpcCalls[1].args).toEqual({ p_org: 7, p_since: '2026-09-01T00:00:00.000-05:00', p_tz: 'UTC' });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('22023 con la zona ya en UTC no reintenta: se propaga (no es un problema de zona)', async () => {
    const { sb, rpcCalls } = fakeSb({ rpc: () => ({ data: null, error: { code: '22023', message: 'time zone "UTC" not recognized' } }) });
    await expect(getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000Z', 'UTC')).rejects.toThrow(/fn_ai_usage_month/);
    expect(rpcCalls).toHaveLength(1);
  });

  it('isUnknownTimeZoneError reconoce 22023 y el mensaje de Postgres, y nada más', () => {
    expect(isUnknownTimeZoneError({ code: '22023', message: 'time zone "X" not recognized' })).toBe(true);
    expect(isUnknownTimeZoneError({ message: 'time zone "X" not recognized' })).toBe(true);
    expect(isUnknownTimeZoneError({ code: '22023', message: 'invalid value for parameter' })).toBe(false);
    expect(isUnknownTimeZoneError({ code: '57014', message: 'statement timeout' })).toBe(false);
    expect(isUnknownTimeZoneError({ code: 'PGRST202', message: 'Could not find the function' })).toBe(false);
    expect(isUnknownTimeZoneError(null)).toBe(false);
  });
});

describe('getCommUsageMonth', () => {
  it('respaldo por canal con coalesce', async () => {
    const { sb } = fakeSb({
      rows: [
        { channel: 'sms', credits_used: 1, cost_amount: 0.05, metadata: {} },
        { channel: 'sms', credits_used: 1, cost_amount: null, metadata: { cost_amount: 0.05 } },
        { channel: 'whatsapp', credits_used: 2, cost_amount: null, metadata: {} },
      ],
    });
    const r = await getCommUsageMonth(sb, 7, '2026-09-01T00:00:00.000Z');
    expect(r.source).toBe('fallback');
    expect(r.spent_usd).toBeCloseTo(0.1, 6);
    expect(r.by_channel).toEqual([
      { channel: 'sms', credits: 2, cost_usd: 0.1, count: 2 },
      { channel: 'whatsapp', credits: 2, cost_usd: 0, count: 1 },
    ]);
  });
});
