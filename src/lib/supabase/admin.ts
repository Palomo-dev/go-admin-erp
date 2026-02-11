import { createClient } from '@supabase/supabase-js';

/**
 * Supabase Admin Client (lazy init)
 * Se inicializa solo cuando se llama, evitando errores en build time
 * cuando las variables de entorno no están disponibles.
 * Usa SUPABASE_SERVICE_ROLE_KEY para operaciones sin sesión de usuario (webhooks, API routes).
 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
