import type { SupabaseClient } from '@supabase/supabase-js';

/** Compuerta canónica de baja/consentimiento, compartida por humanos y agente. */
export async function canCallCustomer(
  orgId: number,
  customerId: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabase.rpc('fn_can_contact', {
    p_org: orgId,
    p_customer: customerId,
    p_channel: 'voice',
    p_purpose: 'utility',
  });
  if (error) {
    console.warn('[voiceAgent] fn_can_contact falló, se bloquea la llamada:', error.message);
    return false;
  }
  return data === true;
}
