import type { SupabaseClient } from '@supabase/supabase-js';
import { hasWonData } from './opportunityStageData';

/** ¿La fila trae un cierre ganado con datos de venta de verdad? */
function isRealWonClose(row: Record<string, unknown>): boolean {
  if (row.status !== 'won') return false;
  const w = row.win_data;
  return Boolean(w && typeof w === 'object' && hasWonData(w as Record<string, unknown>));
}

/** ¿La fila trae un cierre perdido con motivo de verdad? */
function isRealLostClose(row: Record<string, unknown>): boolean {
  if (row.status !== 'lost') return false;
  const r = row.loss_reason ?? row.loss_reason_value;
  return Boolean(r && String(r).trim());
}

/**
 * Red de seguridad post-trigger (F9-01) — ya NO es la garantía de la invariante.
 *
 * Desde la migración de la ronda 3, `fn_sync_status_from_stage` deriva `status`
 * de `is_won`/`is_lost`, no toca `closed_at` y no cierra sin datos de cierre, de
 * modo que en el camino normal esta función no encuentra nada que corregir (un
 * solo UPDATE). Se conserva por si alguna instalación corre la función antigua.
 *
 * F9-35 — dos reglas que antes no tenía y por las que pisaba a otros escritores:
 *
 * 1. **No revierte un cierre ajeno legítimo.** Si entre el UPDATE y la relectura
 *    otro proceso cerró la oportunidad con datos de cierre válidos, esa escritura
 *    gana: se registra y se devuelve la fila tal cual.
 * 2. **Guarda optimista.** El UPDATE correctivo lleva `updated_at` igual que el
 *    principal (`:eq('updated_at')`), así que si alguien escribió en medio no
 *    casa ninguna fila y no se pisa nada. Se comprueba el resultado: si no se
 *    aplicó, se relee y se devuelve el estado real (nunca se inventa).
 *
 * El UPDATE correctivo NO toca `stage_id`, así que no vuelve a disparar el
 * trigger de sincronización.
 */
export async function reconcileStatus(
  supabase: SupabaseClient,
  orgId: number,
  id: string,
  stageInfo: { is_won: boolean; is_lost: boolean },
  now: string,
  fallback: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const expected = stageInfo.is_won ? 'won' : stageInfo.is_lost ? 'lost' : 'open';
  const { data } = await supabase.from('opportunities').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  const row = (data as Record<string, unknown> | null) ?? fallback;
  const status = (row.status as string | null) ?? null;
  const closedAt = (row.closed_at as string | null) ?? null;
  const needsFix = status !== expected || (expected === 'open' && closedAt !== null) || (expected !== 'open' && closedAt === null);
  if (!needsFix) return row;

  // (1) Cierre ajeno con datos válidos: no es un desajuste del trigger, es otro
  // escritor que ganó la carrera. Revertirlo borraría su cierre (F9-35).
  if (expected === 'open' && (isRealWonClose(row) || isRealLostClose(row))) {
    console.warn(
      `[opportunityStageService] ${id} fue cerrada (${status}) por otro proceso entre el UPDATE y la relectura; ` +
      'no se revierte. El cambio de etapa se aplicó, el estado de cierre es el del otro escritor.'
    );
    return row;
  }

  console.warn(
    `[opportunityStageService] estado incoherente en ${id} tras el cambio de etapa: ` +
    `status=${status} (esperado ${expected}); se corrige con guarda optimista.`
  );
  const guard = (row.updated_at as string | null) ?? null;
  if (!guard) {
    // Sin `updated_at` no hay guarda posible: escribir a ciegas es justo el
    // fallo que se está corrigiendo. Se informa y no se toca la fila.
    console.warn(`[opportunityStageService] ${id} no tiene updated_at; no se corrige sin guarda optimista.`);
    return row;
  }
  const fix: Record<string, unknown> = { status: expected, closed_at: expected === 'open' ? null : closedAt ?? now };
  // (2) misma guarda optimista que el UPDATE principal
  const { data: fixed, error } = await supabase
    .from('opportunities')
    .update(fix)
    .eq('id', id)
    .eq('organization_id', orgId)
    .eq('updated_at', guard)
    .select('*')
    .maybeSingle();
  if (error) {
    console.warn(`[opportunityStageService] la corrección de estado de ${id} falló: ${error.message}`);
    return row;
  }
  if (fixed) return fixed as Record<string, unknown>;

  // Nadie casó la guarda: alguien escribió en medio. Se devuelve lo que hay.
  console.warn(`[opportunityStageService] la corrección de estado de ${id} no se aplicó (otro escritor ganó); se relee.`);
  const { data: after } = await supabase.from('opportunities').select('*').eq('id', id).eq('organization_id', orgId).maybeSingle();
  return (after as Record<string, unknown> | null) ?? row;
}
