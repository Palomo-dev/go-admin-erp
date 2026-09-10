/**
 * Cliente Supabase de usuario para route handlers / server components.
 *
 * Usa `@supabase/ssr` con las cookies de la petición (sesión del usuario,
 * RLS aplicado). Es el cliente que expone `getServerOrgContext().supabase`.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getServerUserClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // En Server Components no se pueden escribir cookies; ignorar.
          }
        },
      },
    }
  );
}
