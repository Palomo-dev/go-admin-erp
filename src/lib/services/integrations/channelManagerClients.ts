/**
 * Clientes Supabase que reciben los servicios del channel manager
 * (Booking.com y Expedia) por inyección.
 *
 * Antes cada servicio importaba el cliente browser `@/lib/supabase/config`
 * a nivel de módulo: dentro de un route handler no hay sesión, así que todo
 * corría como `anon` y sin comprobar la organización. Ahora la ruta decide
 * con qué cliente trabaja el servicio:
 *
 * - `db`: el cliente de SESIÓN (`ctx.supabase` de `withOrg`). Todas las
 *   lecturas y escrituras del dominio (reservas, clientes, logs de sync,
 *   mapeos, conexiones) pasan por RLS como el usuario.
 * - `secrets`: fábrica perezosa del cliente service-role. SOLO para
 *   `integration_credentials`, que los miembros sin rol de administrador no
 *   pueden leer. La ruta únicamente construye los servicios DESPUÉS de haber
 *   comprobado que la conexión pertenece a la organización de la sesión.
 *
 * Módulo hoja: solo tipos, sin crear clientes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ChannelManagerClients {
  /** Cliente con la sesión del usuario (RLS). */
  db: SupabaseClient;
  /** Cliente service-role, creado bajo demanda, solo para credenciales. */
  secrets: () => SupabaseClient;
}
