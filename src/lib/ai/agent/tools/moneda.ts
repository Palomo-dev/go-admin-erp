/**
 * GO Assistant — conversión entre monedas.
 *
 * Política (decidida el 2026-09-15): **tasa del día de openexchangerates**, la
 * que el cron del ERP guarda en `currency_rates`. Nada de tasas fijas por
 * organización. Todo lo que se ESCRIBE (ventas, compras, precios) va en la
 * moneda de la organización; si el usuario dicta "20 dólares" en una
 * organización que factura en pesos, el modelo convierte con esta herramienta
 * ANTES de proponer nada y la tarjeta enseña la tasa usada y su fecha.
 *
 * Solo lee. `risk: low`, sin confirmación.
 */

import { convertAmount, ConversionError, formatMoney } from '@/lib/ai/assistant/orgCurrency';
import { todayInTz } from '@/lib/utils/dateDisplay';
import type { ToolContext, ToolDefinition, ToolPreview, ToolResult } from '../types';

const READ_PREVIEW: ToolPreview = {
  title: 'Conversión de moneda',
  summary: 'Consulta de solo lectura.',
  lines: [],
  warnings: [],
  estimatedCredits: 0,
  reversible: true,
};

interface ConvertirArgs {
  amount: number;
  from: string;
  to?: string;
  date?: string;
}

/** "Hoy" en la zona de la organización, nunca en UTC (regla de fechas del repo). */
async function hoyDeLaOrganizacion(ctx: ToolContext): Promise<string> {
  const { data } = await ctx.supabase.from('organizations').select('timezone').eq('id', ctx.organizationId).maybeSingle();
  const tz = (data as { timezone: string | null } | null)?.timezone;
  return todayInTz(tz || undefined);
}

export const convertirMoneda: ToolDefinition<ConvertirArgs> = {
  name: 'convertir_moneda',
  description:
    'Convierte un importe entre monedas con la tasa de cambio del día (openexchangerates). Úsala SIEMPRE que el usuario mencione un importe en una moneda distinta a la de la organización antes de registrar una venta, compra o precio: todo se registra en la moneda de la organización. Devuelve el importe convertido, la tasa y la fecha de la tasa.',
  parameters: {
    type: 'object',
    properties: {
      amount: { type: 'number', description: 'Importe a convertir.' },
      from: { type: 'string', description: 'Moneda de origen, ISO 4217 (USD, EUR, MXN…).' },
      to: { type: 'string', description: 'Moneda de destino. Omítela para convertir a la moneda de la organización.' },
      date: { type: 'string', description: 'Fecha de la tasa, YYYY-MM-DD. Omítela para usar la de hoy.' },
    },
    required: ['amount', 'from'],
    additionalProperties: false,
  },
  risk: 'low',
  permissions: [],
  minLevel: 'read',
  requiredModule: null,
  availableInVoice: true,

  parseArgs(raw: unknown): ConvertirArgs | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const amount = Number(obj.amount);
    const from = typeof obj.from === 'string' ? obj.from.trim().toUpperCase() : '';
    if (!Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(from)) return null;
    const args: ConvertirArgs = { amount, from };
    if (typeof obj.to === 'string' && /^[A-Za-z]{3}$/.test(obj.to.trim())) args.to = obj.to.trim().toUpperCase();
    if (typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date.trim())) args.date = obj.date.trim();
    return args;
  },

  async preview(): Promise<ToolPreview> {
    return READ_PREVIEW;
  },

  async execute(ctx: ToolContext, args: ConvertirArgs): Promise<ToolResult> {
    const to = args.to ?? ctx.currency;
    const date = args.date ?? (await hoyDeLaOrganizacion(ctx));
    try {
      const c = await convertAmount(ctx.supabase, args.amount, args.from, to, date);
      const aviso = c.stale ? ` (no había tasa del ${date}; se usó la del ${c.rateDate})` : '';
      return {
        ok: true,
        message: `${formatMoney(c.amount, c.from)} = ${formatMoney(c.result, c.to)} a tasa ${c.rate.toLocaleString('es-CO', {
          maximumFractionDigits: 6,
        })} ${c.to}/${c.from} del ${c.rateDate}${aviso}.`,
        data: {
          amount: c.amount,
          from: c.from,
          to: c.to,
          result: c.result,
          rate: c.rate,
          rate_date: c.rateDate,
          stale: c.stale,
          source: 'openexchangerates',
        },
      };
    } catch (err) {
      if (err instanceof ConversionError) {
        return { ok: false, errorCode: err.code, message: err.message };
      }
      return { ok: false, errorCode: 'query_error', message: `No pude consultar la tasa: ${err instanceof Error ? err.message : ''}` };
    }
  },
};

export const MONEDA_TOOLS = [convertirMoneda];
