/**
 * Credenciales de integraciones de logística (transportadoras, Effi y Dropi) en el Vault.
 *
 * Generaliza carrierCredentials.server.ts a cualquier conector con `settings_schema`:
 * - guardar: cada campo secreto va con `fn_set_provider_secret(conexión, propósito = clave, valor)`;
 *   `integration_credentials.secret_ref` queda con el uuid de vault.secrets.
 * - leer: `fn_get_provider_secret(conexión, propósito)`; solo service_role puede ejecutarla, así
 *   que esto corre únicamente en el servidor. Un `secret_ref` que no sea uuid (valor en claro) NO
 *   se usa: para estas integraciones solo vale el Vault.
 * - estado: qué secretos hay y su prefijo (key_prefix), nunca el valor.
 *
 * Alcance (4-nov-2026): SOLO credenciales nuevas de transportadoras, Effi y Dropi. Las pasarelas
 * de pago (Wompi y demás) no pasan por aquí.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

const FORMA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertServidor(): void {
  if (typeof window !== 'undefined') throw new Error('integrationCredentials.server solo corre en el servidor');
}

export class CredencialesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredencialesError';
  }
}

/** Guarda cada secreto en el Vault. `credentialType` por defecto: 'secret'. */
export async function guardarSecretos(
  db: SupabaseClient,
  connectionId: string,
  secretos: Record<string, string>,
): Promise<string[]> {
  assertServidor();
  const guardados: string[] = [];
  for (const [proposito, valor] of Object.entries(secretos)) {
    if (!valor) continue;
    const { error } = await db.rpc('fn_set_provider_secret', {
      p_connection_id: connectionId,
      p_purpose: proposito,
      p_value: valor,
      p_credential_type: 'secret',
    });
    // Solo el propósito y el mensaje de Postgres: nunca el valor.
    if (error) throw new CredencialesError(`No se pudo guardar «${proposito}» en el Vault: ${error.message}`);
    guardados.push(proposito);
  }
  return guardados;
}

/** Lee del Vault los secretos pedidos. Uno sin valor en el Vault no aparece en el resultado. */
export async function leerSecretos(
  db: SupabaseClient,
  connectionId: string,
  propositos: readonly string[],
): Promise<Record<string, string>> {
  assertServidor();
  if (propositos.length === 0) return {};
  const { data: filas, error } = await db
    .from('integration_credentials')
    .select('purpose, secret_ref')
    .eq('connection_id', connectionId)
    .eq('status', 'active')
    .in('purpose', propositos as string[]);
  if (error) throw new CredencialesError(`integration_credentials: ${error.message}`);
  const salida: Record<string, string> = {};
  for (const fila of (filas ?? []) as { purpose: string; secret_ref: string | null }[]) {
    if (!fila.secret_ref || !FORMA_UUID.test(fila.secret_ref)) continue; // solo Vault
    const { data, error: err } = await db.rpc('fn_get_provider_secret', { p_connection_id: connectionId, p_purpose: fila.purpose });
    if (err) throw new CredencialesError(`No se pudo leer «${fila.purpose}» del Vault: ${err.message}`);
    if (typeof data === 'string' && data) salida[fila.purpose] = data;
  }
  return salida;
}

/** Estado seguro para la UI: propósito → { prefijo, actualizado }. Sin valores. */
export async function estadoSecretos(
  db: SupabaseClient,
  connectionId: string,
): Promise<Record<string, { prefijo: string | null; enVault: boolean; actualizado: string | null }>> {
  assertServidor();
  const { data, error } = await db
    .from('integration_credentials')
    .select('purpose, secret_ref, key_prefix, rotated_at, updated_at')
    .eq('connection_id', connectionId)
    .eq('status', 'active');
  if (error) throw new CredencialesError(`integration_credentials: ${error.message}`);
  const salida: Record<string, { prefijo: string | null; enVault: boolean; actualizado: string | null }> = {};
  for (const f of (data ?? []) as { purpose: string; secret_ref: string | null; key_prefix: string | null; rotated_at: string | null; updated_at: string | null }[]) {
    salida[f.purpose] = {
      prefijo: f.key_prefix ?? null,
      enVault: !!f.secret_ref && FORMA_UUID.test(f.secret_ref),
      actualizado: f.rotated_at ?? f.updated_at ?? null,
    };
  }
  return salida;
}
