// ============================================================
// Zona horaria en SERVIDOR (route handlers, server components) — 2026-09-30.
//
// Gemela en servidor de `useTimezoneFor` / `useFormatDate`: misma regla única
// (sucursal si tiene → organización → fallback del sistema) y la misma fuente
// de verdad, `fn_timezone_for(p_organization_id, p_branch_id)` en la base.
//
// El servidor no ve el selector del header: la sucursal la aporta el llamador
// (la del dato, o la que llegó en la petición y ya se validó contra la
// organización de la sesión). Sin sucursal → zona de la organización.
//
// La organización sale SIEMPRE del contexto de la sesión (`getServerOrgContext`
// / `withOrg`), nunca del body. Nunca lanza: un fallo de lectura devuelve el
// fallback con aviso, igual que `fn_timezone_for`.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_TIMEZONE, isUsableTimezone } from '@/lib/utils/dateCore';

export interface ContextoZonaServidor {
  supabase: SupabaseClient;
  organizationId: number;
}

export async function zonaHorariaEnServidor(
  ctx: ContextoZonaServidor,
  branchId?: number | null,
): Promise<string> {
  const sucursal = typeof branchId === 'number' && Number.isInteger(branchId) && branchId > 0 ? branchId : null;
  try {
    const { data, error } = await ctx.supabase.rpc('fn_timezone_for', {
      p_organization_id: ctx.organizationId,
      p_branch_id: sucursal,
    });
    if (!error && typeof data === 'string' && isUsableTimezone(data)) return data;
    console.warn('[zonaHorariaEnServidor] fallback', { org: ctx.organizationId, sucursal, error: error?.message });
  } catch (err) {
    console.warn('[zonaHorariaEnServidor] fallback', { org: ctx.organizationId, sucursal, error: String(err) });
  }
  return DEFAULT_TIMEZONE;
}
