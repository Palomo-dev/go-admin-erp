/**
 * Mock del modulo @/lib/supabase/admin.
 * Retorna el cliente mock compartido en lugar de crear un cliente real.
 */

import { mockSupabase } from './mockSupabaseClient';

/** Reemplazo de getSupabaseAdmin que retorna el mock. */
export function getSupabaseAdmin() {
  return mockSupabase;
}

export { mockSupabase };
