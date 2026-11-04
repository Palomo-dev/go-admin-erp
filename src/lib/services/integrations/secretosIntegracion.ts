/**
 * Lectura del valor real de una credencial de `integration_credentials`.
 *
 * `secret_ref` tiene dos formas:
 * - uuid de `vault.secrets` (lo que deja `fn_set_provider_secret`): el valor se lee con
 *   `fn_get_provider_secret(connection_id, purpose)`, que solo ejecuta service_role. Si el Vault
 *   no responde se devuelve '' (falla cerrado: nunca se usa el uuid como si fuera el secreto).
 * - cualquier otra cosa: el valor en claro de las credenciales anteriores a Vault (se usa tal cual
 *   mientras no se migren).
 *
 * Sin dependencias de servidor para poder importarlo desde servicios que también usa el
 * navegador; con el cliente del navegador el RPC está denegado y la lectura de un uuid da ''.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ¿`secret_ref` apunta a un secreto del Vault (y no es el valor en claro)? */
export function esReferenciaVault(secretRef: unknown): secretRef is string {
  return typeof secretRef === 'string' && FORMA_UUID.test(secretRef.trim());
}

/** Valor de la credencial `purpose` de la conexión, desde el Vault o en claro según su forma. */
export async function resolverSecreto(
  db: SupabaseClient,
  connectionId: string,
  purpose: string,
  secretRef: string | null | undefined,
): Promise<string> {
  if (!secretRef) return '';
  if (!esReferenciaVault(secretRef)) return secretRef;
  const { data, error } = await db.rpc('fn_get_provider_secret', {
    p_connection_id: connectionId,
    p_purpose: purpose,
  });
  if (error || typeof data !== 'string' || !data) {
    // Sin el valor: nunca el uuid. El mensaje no lleva el secreto.
    console.error(`[secretos] No se pudo leer «${purpose}» del Vault para la conexión ${connectionId}: ${error?.message ?? 'sin valor'}`);
    return '';
  }
  return data;
}
