import type { SupabaseClient } from '@supabase/supabase-js';
import { CrmHttpError } from './crmErrors';

/** Campos usados por los escritores de llamadas; updated_at no tiene trigger. */
export interface CallMutationSnapshot {
  id: string;
  organization_id: number;
  status: string;
  metadata: Record<string, unknown> | null;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  answered_by?: string | null;
  provider_call_sid?: string | null;
  customer_leg_sid?: string | null;
  agent_leg_sid?: string | null;
  user_id?: string | null;
  customer_id?: string | null;
  opportunity_id?: string | null;
  recording_enabled?: boolean | null;
  consent_given?: boolean | null;
  bridge_mode?: string | null;
  ring_seconds?: number | null;
  duration_source?: string | null;
  cost_amount?: number | null;
  cost_currency?: string | null;
}

const SNAPSHOT_COLUMNS = [
  'status', 'metadata', 'started_at', 'answered_at', 'ended_at',
  'duration_seconds', 'answered_by', 'provider_call_sid', 'customer_leg_sid',
  'agent_leg_sid', 'user_id', 'customer_id', 'opportunity_id',
  'recording_enabled', 'consent_given', 'bridge_mode', 'ring_seconds',
  'duration_source', 'cost_amount', 'cost_currency',
] as const;
export const CALL_FILTER_COLUMNS = ['id', 'organization_id', ...SNAPSHOT_COLUMNS] as const;

/** Snapshot único compartido también con las transacciones de conferencia. */
export function callMutationExpected(snapshot: CallMutationSnapshot): Record<string, unknown> {
  return Object.fromEntries(SNAPSHOT_COLUMNS.map((column) => [column, snapshot[column] ?? null]));
}

/** El SDK usa URLSearchParams; el presupuesto incluye TODOS los filtros juntos. */
export function assertLegacyFilterBudget(snapshot: object, columns: readonly string[], select = '*'): void {
  if (isAtomicCallRpcEnabled()) return;
  const query = new URLSearchParams({ select });
  for (const column of columns) {
    const value: unknown = Reflect.get(snapshot, column);
    if (value === undefined) continue;
    query.append(column, value === null ? 'is.null' : `eq.${column === 'metadata' ? JSON.stringify(value) : String(value)}`);
  }
  // Reserva margen para ruta, host y parámetros añadidos por PostgREST.
  if (query.toString().length > 6000) throw new CrmHttpError(503, 'crm_call_rpc_required', 'No se pudo guardar esta llamada temporalmente. Intenta de nuevo');
}

/** RPC aplicada y verificada por MCP; false es una salida de emergencia explícita. */
export function isAtomicCallRpcEnabled(): boolean {
  return process.env.CRM_CALL_ATOMIC_RPC_ENABLED !== 'false';
}

/**
 * UPDATE condicional de UNA fila. Ante un cambio concurrente se relee la llamada
 * y se recalcula el parche mediante el mismo productor (máquina de estados o
 * intención manual). No convierte las operaciones de varias tablas en una
 * transacción: esas necesitan una RPC.
 */
export async function mutateCallFromSnapshot<T extends CallMutationSnapshot>(
  client: SupabaseClient,
  initial: T,
  buildPatch: (fresh: T) => Record<string, unknown> | null,
): Promise<T> {
  let current = initial;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const patch = buildPatch(current);
    if (patch === null) return current;
    if (isAtomicCallRpcEnabled()) {
      const expected = callMutationExpected(current);
      const { data, error } = await client.rpc('fn_crm_callback_llamada', {
        p_org: initial.organization_id, p_call: initial.id, p_expected: expected, p_patch: patch,
      });
      if (error) throw error;
      const result = data as { stale?: unknown; call?: T } | null;
      if (typeof result?.stale !== 'boolean' || !result.call || result.call.id !== initial.id || result.call.organization_id !== initial.organization_id) {
        throw new Error('Respuesta inválida al guardar la llamada');
      }
      if (!result.stale) return result.call;
      current = result.call;
      continue;
    }
    // Una metadata extensa no cabe en los filtros GET de PostgREST. Evitar un
    // guardado parcial que impediría procesar el callback siguiente.
    assertLegacyFilterBudget({ ...current }, CALL_FILTER_COLUMNS);
    assertLegacyFilterBudget({ ...current, ...patch }, CALL_FILTER_COLUMNS);
    let update = client.from('calls')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', initial.id).eq('organization_id', initial.organization_id);
    for (const column of SNAPSHOT_COLUMNS) {
      const value = current[column];
      if (value === undefined) continue;
      update = value === null ? update.is(column, null)
        : update.eq(column, column === 'metadata' ? JSON.stringify(value) : value);
    }
    const { data, error } = await update.select('*').maybeSingle();
    if (error) throw error;
    if (data) return data as T;
    const { data: fresh, error: readError } = await client.from('calls').select('*')
      .eq('id', initial.id).eq('organization_id', initial.organization_id).maybeSingle();
    if (readError) throw readError;
    if (!fresh) throw new CrmHttpError(404, 'llamada_no_encontrada', 'Llamada no encontrada');
    current = fresh as T;
  }
  throw new CrmHttpError(409, 'llamada_cambiada', 'La llamada cambió mientras se guardaba. Intenta de nuevo');
}
