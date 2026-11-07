/**
 * Credenciales de Booking.com y Expedia (channel manager) — Frente INT, 2026-11-07.
 *
 * Antes `bookingConnectionService` / `expediaConnectionService` / `*AuthService` escribían y leían
 * `integration_credentials.value_encrypted`, columna que NO existe (la real es `secret_ref`,
 * verificado por MCP), con propósitos (`hotel_id`, `machine_client_id`, `eqc_username`…) que el
 * CHECK de `purpose` rechaza. Resultado: ninguna conexión API de OTA podía guardarse ni leerse.
 *
 * Ahora:
 *  - los identificadores que NO son secretos (hotel de Booking, propiedad de Expedia) van en
 *    `integration_connections.settings` (`hotel_id`, `property_id`);
 *  - los secretos van a la bóveda con `fn_set_provider_secret` y un propósito que el CHECK
 *    actual admite (no hace falta migración): usuario/cliente → `public_key`,
 *    clave/secreto → `private_key`, token → `access_token`;
 *  - la lectura es dual (`resolverSecretos`): bóveda o valor en claro.
 * Recibe el cliente service role (`clients.secrets()`), creado por la ruta DESPUÉS de comprobar
 * que la conexión es de la organización de la sesión.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverSecretos } from './secretosConexion';

export type CanalOta = 'booking' | 'expedia';

/** Propósito lógico del servicio → propósito guardado (admitido por el CHECK actual). */
export const PROPOSITO_GUARDADO: Record<CanalOta, Record<string, string>> = {
  booking: { machine_client_id: 'public_key', machine_client_secret: 'private_key', access_token: 'access_token' },
  expedia: { eqc_username: 'public_key', eqc_password: 'private_key', access_token: 'access_token' },
};

/** Identificador no secreto que vive en `settings`. */
export const CLAVE_PROPIEDAD: Record<CanalOta, 'hotel_id' | 'property_id'> = { booking: 'hotel_id', expedia: 'property_id' };

const TIPO: Record<string, string> = { public_key: 'api_key', private_key: 'secret', access_token: 'oauth_access' };

export async function guardarCredencialesOta(
  secrets: SupabaseClient,
  connectionId: string,
  canal: CanalOta,
  valores: Record<string, string | undefined>,
): Promise<void> {
  for (const [logico, guardado] of Object.entries(PROPOSITO_GUARDADO[canal])) {
    const valor = (valores[logico] ?? '').trim();
    if (!valor) continue;
    const { error } = await secrets.rpc('fn_set_provider_secret', {
      p_connection_id: connectionId,
      p_purpose: guardado,
      p_value: valor,
      p_credential_type: TIPO[guardado] ?? 'secret',
    });
    // Solo el propósito y el mensaje de Postgres: nunca el valor.
    if (error) throw new Error(`No se pudo guardar «${logico}» en la bóveda: ${error.message}`);
  }
}

/** Propósito lógico → valor (bóveda o en claro). Los que falten no aparecen. */
export async function leerCredencialesOta(
  secrets: SupabaseClient,
  connectionId: string,
  canal: CanalOta,
): Promise<Record<string, string>> {
  const { data, error } = await secrets
    .from('integration_credentials')
    .select('purpose, secret_ref')
    .eq('connection_id', connectionId)
    .eq('status', 'active');
  if (error) throw new Error(`integration_credentials: ${error.message}`);
  const filas = ((data as { purpose: string; secret_ref: string | null }[] | null) ?? []);
  const valores = await resolverSecretos(secrets, connectionId, filas);
  const salida: Record<string, string> = {};
  for (const [logico, guardado] of Object.entries(PROPOSITO_GUARDADO[canal])) {
    const v = valores[guardado] || valores[logico];
    if (v) salida[logico] = v;
  }
  return salida;
}

/** Identificador de la propiedad desde `settings` de la conexión. */
export function propiedadDeSettings(canal: CanalOta, settings: unknown): string {
  const s = settings && typeof settings === 'object' && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
  const v = s[CLAVE_PROPIEDAD[canal]];
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/**
 * ¿GO Admin tiene cuenta de proveedor de conectividad con la OTA? Booking y Expedia entregan las
 * credenciales de máquina al PROVEEDOR de conectividad, no al hotel. Sin ellas en el servidor, el
 * modo API no puede funcionar y la pantalla lo dice (no se simula).
 */
export function cuentaDeSocioConfigurada(canal: CanalOta): boolean {
  if (canal === 'booking') return !!process.env.BOOKING_MACHINE_CLIENT_ID && !!process.env.BOOKING_MACHINE_CLIENT_SECRET;
  return !!process.env.EXPEDIA_EQC_USERNAME && !!process.env.EXPEDIA_EQC_PASSWORD;
}
