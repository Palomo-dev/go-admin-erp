/**
 * F14 — soporte común de las rutas `/api/crm/revenue/*`.
 *
 * Convierte cada error en su respuesta JSON: contexto de organización
 * (401/403/400), rango de fechas (400), insumos inválidos (400), RPC o lectura
 * fallida (502 con el nombre de la función) y lo demás 500. Nunca 200 con `[]`.
 */

import { NextResponse } from 'next/server';
import { OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { todayInTz } from '@/lib/utils/dateDisplay';
import { DateRangeError, resolveDateRange, type DateRange } from './dateRange';
import { RevenueOsError } from './rpc';
import { RevenueInputsValidationError } from './revenueInputs';
import { getOrgTimezoneServer } from '../revenueOsService';

export function jsonOk<T>(data: T, extra: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ success: true, data, ...extra }, { status });
}

export function jsonFail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

export function revenueRouteError(error: unknown, tag: string) {
  if (error instanceof OrgContextError) return jsonFail(error.statusCode, error.message, { code: error.code });
  if (error instanceof DateRangeError) return jsonFail(error.statusCode, error.message, { code: error.code });
  if (error instanceof RevenueInputsValidationError) {
    return jsonFail(error.statusCode, error.message, { code: error.code, field: error.field });
  }
  if (error instanceof RevenueOsError) {
    console.error(`[${tag}] RPC/lectura fallida:`, error.message);
    return jsonFail(error.statusCode, `No se pudieron calcular las métricas (${error.message})`, { code: error.code });
  }
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[${tag}] error:`, message);
  return jsonFail(500, message);
}

/** Zona horaria, día de hoy y rango validado a partir de la query string. La organización sale de `ctx`. */
export async function resolveRequestRange(
  ctx: ServerOrgContext,
  request: Request,
): Promise<{ timezone: string; today: string; range: DateRange }> {
  const sp = new URL(request.url).searchParams;
  const timezone = await getOrgTimezoneServer(ctx.organizationId, ctx.supabase);
  const today = todayInTz(timezone);
  const range = resolveDateRange(sp.get('start'), sp.get('end'), today);
  return { timezone, today, range };
}

/** Lee el body JSON tolerando cuerpos vacíos o inválidos (→ `{}`). */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
