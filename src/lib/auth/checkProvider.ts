import { supabase } from '@/lib/supabase/config';

/**
 * Verifica si un email está registrado con un proveedor OAuth (google, azure, etc.)
 * Retorna el nombre del proveedor o null si el usuario no existe o usa email/password.
 */
export async function checkAuthProvider(email: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .rpc('get_auth_provider_by_email', { p_email: email });

    if (error || !data) return null;

    if (data && data !== 'email') {
      return data;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Retorna un mensaje legible para el proveedor OAuth.
 */
export function getProviderLabel(provider: string): string {
  const labels: Record<string, string> = {
    google: 'Google',
    azure: 'Microsoft',
    github: 'GitHub',
    facebook: 'Facebook',
  };
  return labels[provider] || provider;
}
