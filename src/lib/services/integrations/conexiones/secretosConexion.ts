/**
 * Lectura de secretos de una conexión en sus DOS formas (Frente INT, 2026-11-07).
 *
 * Hoy conviven:
 *  - la forma «de hoy»: `integration_credentials.secret_ref` guarda el valor tal cual (Wompi en
 *    4 organizaciones, 16 filas, ninguna con forma de uuid; verificado por MCP el 2026-11-07);
 *  - la bóveda: `secret_ref` guarda el uuid de `vault.secrets` y el valor se lee con
 *    `fn_get_provider_secret` (solo `service_role` puede ejecutarla).
 *
 * Regla para no romper lo que funciona: una fila cuyo `secret_ref` NO tiene forma de uuid se
 * devuelve exactamente igual que antes, sin llamar a ninguna RPC. Solo un uuid se busca en la
 * bóveda; si la bóveda no devuelve nada (cliente sin permiso, secreto inexistente) se devuelve
 * el valor guardado, que es lo mismo que pasaba antes de este módulo.
 *
 * Sin dependencias de servidor: recibe el cliente. Quien llama decide con cuál (service role
 * solo después de validar la organización).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿El `secret_ref` apunta a la bóveda? */
export function esReferenciaDeBoveda(secretRef: unknown): secretRef is string {
  return typeof secretRef === 'string' && FORMA_UUID.test(secretRef);
}

export interface FilaSecreto {
  purpose: string;
  secret_ref: string | null;
}

/**
 * Valor real de una fila: el de la bóveda si `secret_ref` es un uuid y la bóveda responde;
 * si no, el `secret_ref` tal cual (comportamiento de hoy).
 */
export async function valorDeSecreto(db: SupabaseClient, connectionId: string, fila: FilaSecreto): Promise<string> {
  const crudo = typeof fila.secret_ref === 'string' ? fila.secret_ref : '';
  if (!esReferenciaDeBoveda(crudo)) return crudo;
  try {
    const { data, error } = await db.rpc('fn_get_provider_secret', { p_connection_id: connectionId, p_purpose: fila.purpose });
    if (!error && typeof data === 'string' && data) return data;
  } catch {
    // Sin permiso o sin red: se conserva el comportamiento anterior.
  }
  return crudo;
}

/**
 * Propósito → valor para todas las filas dadas. Si ninguna fila es de la bóveda no hace ninguna
 * llamada: es exactamente el mapa que se armaba antes.
 */
export async function resolverSecretos(
  db: SupabaseClient,
  connectionId: string,
  filas: readonly FilaSecreto[],
): Promise<Record<string, string>> {
  const salida: Record<string, string> = {};
  for (const f of filas) {
    if (f.purpose in salida) continue; // la primera fila del propósito gana, igual que `find`
    salida[f.purpose] = await valorDeSecreto(db, connectionId, f);
  }
  return salida;
}

/** Máscara para la UI: prefijo reconocible y últimos 4. Nunca el valor completo. */
export function enmascararSecreto(valor: string): string {
  const v = valor.trim();
  if (v.length <= 8) return `··${v.slice(-2)}`;
  const prefijo = /^[a-z]+_(?:test|prod)_/i.exec(v)?.[0] ?? /^[a-z]{2,8}_/i.exec(v)?.[0] ?? '';
  return `${prefijo}··${v.slice(-4)}`;
}
