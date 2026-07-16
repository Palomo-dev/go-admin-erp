import { createClient } from '@supabase/supabase-js';
import { config } from './config';

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
  },
});

/**
 * Autentica el agente como un usuario válido de la organización.
 * La sesión resultante trae en el JWT el claim organization_id, requerido
 * por las políticas RLS de printers/print_jobs/print_agents.
 */
export async function signInAgent(): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({
    email: config.agentEmail,
    password: config.agentPassword,
  });

  if (error) {
    throw new Error(`No se pudo autenticar el agente: ${error.message}`);
  }
}
