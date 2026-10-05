/**
 * Cliente Supabase de usuario para route handlers / server components.
 *
 * Usa `@supabase/ssr` con las cookies de la petición (sesión del usuario,
 * RLS aplicado). Es el cliente que expone `getServerOrgContext().supabase`.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function getServerUserClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const host = ((await headers()).get('host') ?? '').split(':')[0];
  const dominioCompartido = host === 'goadmin.io' || host.endsWith('.goadmin.io');
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Misma cookie y mismo formato que el cliente del navegador (config.ts):
      // JSON plano y, en producción, `domain=.goadmin.io`. Con el formato por
      // defecto («base64-…») y sin dominio, una renovación de sesión en el
      // servidor dejaba una segunda cookie con el mismo nombre que el
      // middleware tomaba por corrupta (bucle «corrupted-session»).
      cookieEncoding: 'raw',
      cookieOptions: dominioCompartido ? { domain: '.goadmin.io', path: '/', sameSite: 'lax', secure: true } : undefined,
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
