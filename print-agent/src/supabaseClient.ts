import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from './config';

// Node < 22 no trae WebSocket nativo; se usa el paquete `ws` como transporte
// de Realtime para funcionar en cualquier versión de Node/Electron.
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
  },
  realtime: {
    transport: WebSocket as any,
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
