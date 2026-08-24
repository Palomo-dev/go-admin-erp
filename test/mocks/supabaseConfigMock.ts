/**
 * Mock del modulo @/lib/supabase/config.
 * Exporta `supabase` como el cliente mock compartido.
 */

import { mockSupabase } from './mockSupabaseClient';

/** Cliente mock en lugar del cliente real del navegador. */
export const supabase = mockSupabase;

export { mockSupabase };
