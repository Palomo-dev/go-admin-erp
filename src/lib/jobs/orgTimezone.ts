import type { SupabaseClient } from '@supabase/supabase-js';
import type { JobLogger } from './types';
import { DEFAULT_TIMEZONE } from '@/lib/utils/timezone';
import { todayInTz, toPlainDate } from '@/lib/utils/dateDisplay';

/**
 * Zona horaria de las organizaciones para los jobs de servidor (F0-JOBS r3, N-7).
 *
 * `getOrganizationTimezone` (servicio canónico) usa el cliente de NAVEGADOR y
 * no sirve en el runner ni en el productor (service_role). Aquí se lee
 * `organizations.timezone` (text NOT NULL, verificada por MCP 2026-09-15) con
 * el cliente que reciba el job y se valida con `Intl`; una zona inválida cae a
 * `DEFAULT_TIMEZONE` (regla 6 de fechas: nunca cableada, solo como fallback).
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Zonas de varias organizaciones en una sola consulta; las que falten o sean inválidas no aparecen. */
export async function loadOrgTimezones(orgIds: readonly number[], sb: SupabaseClient): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (orgIds.length === 0) return out;
  const { data, error } = await sb.from('organizations').select('id, timezone').in('id', [...orgIds]);
  if (error) throw new Error(`organizations.timezone: ${error.message}`);
  for (const r of (data ?? []) as Array<{ id: number; timezone: unknown }>) {
    if (isValidTimezone(r.timezone)) out.set(r.id, r.timezone);
  }
  return out;
}

/**
 * Zona de UNA organización. Como el servicio canónico, un fallo de lectura o
 * una zona inválida caen a `DEFAULT_TIMEZONE` con aviso en el log: un job de
 * limpieza no debe morir por no poder leer la zona.
 */
export async function getOrgTimezoneForJob(orgId: number, sb: SupabaseClient, log?: Pick<JobLogger, 'warn'>): Promise<string> {
  try {
    const tz = await loadOrgTimezones([orgId], sb);
    const found = tz.get(orgId);
    if (found) return found;
    log?.warn('org_timezone_fallback', { org_id: orgId, timezone: DEFAULT_TIMEZONE });
  } catch (err) {
    log?.warn('org_timezone_fallback', { org_id: orgId, timezone: DEFAULT_TIMEZONE, error: err instanceof Error ? err.message : String(err) });
  }
  return DEFAULT_TIMEZONE;
}

/**
 * Día calendario (`YYYY-MM-DD`) de la organización para el instante `now`
 * (`toPlainDate` de `dateDisplay.ts`; sin `now` ⇒ `todayInTz`). Nunca
 * `toISOString().slice(0,10)` (regla 1 de fechas).
 */
export function orgDay(timezone: string, now?: Date): string {
  return now ? toPlainDate(now, timezone) : todayInTz(timezone);
}
