/**
 * Helpers de autorizacion para los route handlers de Open Finance.
 *
 * Centraliza la resolucion del organization_id activo del usuario autenticado
 * a partir de la sesion de Supabase, evitando duplicar la logica en cada ruta
 * y garantizando que todas las operaciones queden scopeadas por organizacion.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Obtiene el organization_id activo del usuario desde `organization_members`.
 * @param supabase Cliente de Supabase con la sesion del usuario
 * @param userId  ID del usuario autenticado
 * @returns organization_id activo o null si no se encuentra
 */
export async function getActiveOrganizationId(
  supabase: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return Number(data.organization_id);
}
