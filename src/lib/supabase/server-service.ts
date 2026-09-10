/**
 * Cliente Supabase con service role (SOLO servidor).
 *
 * Único punto de creación del cliente service-role para route handlers,
 * webhooks, jobs y el ws-server. Nunca importar desde código de cliente.
 *
 * - Singleton por proceso (lazy): no falla en build time si faltan las env.
 * - `persistSession: false` / `autoRefreshToken: false`: sin estado de sesión.
 * - Lanza si falta `SUPABASE_SERVICE_ROLE_KEY` (fail-closed).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let serviceClient: SupabaseClient | null = null;

/** Lanza si se ejecuta en el navegador (protección contra imports accidentales). */
export function assertServerOnly(): void {
  if (typeof window !== 'undefined') {
    throw new Error('getServiceClient() solo puede usarse en el servidor');
  }
}

/**
 * Devuelve el cliente service-role (singleton por proceso).
 */
export function getServiceClient(): SupabaseClient {
  assertServerOnly();
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (service role)');
  }

  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return serviceClient;
}
