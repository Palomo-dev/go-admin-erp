/**
 * Cliente Supabase de usuario para route handlers / server components.
 *
 * Usa `@supabase/ssr` con las cookies de la petición (sesión del usuario,
 * RLS aplicado). Es el cliente que expone `getServerOrgContext().supabase`.
 *
 * SIN REFRESCO NI ESCRITURA DE SESIÓN (paquete 5-nov, A4). Mismo principio que
 * `middleware.ts` (getValidatedSession): el refresh es solo del cliente
 * (`auth-manager.ts`). Antes, si el access token había vencido, este cliente
 * renovaba la sesión con el refresh token de la cookie y la reescribía desde el
 * route handler; varias rutas `withOrg` a la vez (p. ej. tras cambiar de
 * organización, o los bloques de /importar/lote) + el navegador rotaban el
 * MISMO refresh token → «refresh_token_already_used» y sesión revocada.
 *
 * Ahora: el servidor ve la sesión SIN `refresh_token` (no puede renovar) y
 * `setAll` no escribe nada. Con el token vencido `auth.getUser()` falla → 401,
 * y el navegador renueva y reintenta. Las rutas que usan este cliente solo leen
 * `user` y `session.access_token` (auditado: auth/contrasena, auth/restablecer,
 * auth/invite/pendiente, me/organizaciones, become-seller, platformAdmin,
 * marketingOAuthCallback, orgContext/withOrg).
 */

import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

type CookieLeida = { name: string; value: string };

const COOKIE_SESION = /^sb-[a-z0-9]+-auth-token(?:\.(\d+))?$/i;

function decodificar(valor: string): string | null {
  let v = valor;
  try {
    if (v.startsWith('%7B')) v = decodeURIComponent(v);
  } catch {
    return null;
  }
  if (v.startsWith('base64-')) {
    try {
      const b64 = v.slice(7).replace(/-/g, '+').replace(/_/g, '/');
      v = Buffer.from(b64, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  return v;
}

/**
 * Une los trozos de la cookie de sesión y le quita el `refresh_token`, para
 * que el cliente de servidor no pueda renovar la sesión. Exportada para tests.
 */
export function cookiesSinRefresco(todas: readonly CookieLeida[]): CookieLeida[] {
  const otras: CookieLeida[] = [];
  const sesion = new Map<string, { base?: string; trozos: Map<number, string> }>();
  for (const c of todas) {
    const m = COOKIE_SESION.exec(c.name);
    if (!m) {
      otras.push(c);
      continue;
    }
    const base = m[1] === undefined ? c.name : c.name.slice(0, c.name.lastIndexOf('.'));
    const e = sesion.get(base) ?? { trozos: new Map<number, string>() };
    if (m[1] === undefined) e.base = c.value;
    else e.trozos.set(Number(m[1]), c.value);
    sesion.set(base, e);
  }
  for (const [nombre, e] of sesion) {
    let crudo = e.base;
    if (crudo === undefined) {
      const partes: string[] = [];
      for (let i = 0; e.trozos.has(i); i++) partes.push(e.trozos.get(i)!);
      crudo = partes.join('');
    }
    const json = decodificar(crudo ?? '');
    if (!json) continue;
    try {
      const s = JSON.parse(json) as Record<string, unknown>;
      if (!s || typeof s !== 'object' || typeof s.access_token !== 'string') continue;
      const { refresh_token: _descartado, ...resto } = s;
      void _descartado;
      otras.push({ name: nombre, value: JSON.stringify({ ...resto, refresh_token: '' }) });
    } catch {
      // Cookie ilegible: sin sesión (el middleware ya responde 401 en /api/*).
    }
  }
  return otras;
}

export async function getServerUserClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const host = ((await headers()).get('host') ?? '').split(':')[0];
  const dominioCompartido = host === 'goadmin.io' || host.endsWith('.goadmin.io');
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Mismo formato que el cliente del navegador (config.ts). Ya no se
      // escribe la cookie desde aquí, pero se mantiene por coherencia.
      cookieEncoding: 'raw',
      cookieOptions: dominioCompartido ? { domain: '.goadmin.io', path: '/', sameSite: 'lax', secure: true } : undefined,
      auth: { autoRefreshToken: false, detectSessionInUrl: false },
      cookies: {
        getAll: () => cookiesSinRefresco(cookieStore.getAll()),
        // No-op a propósito (A4): el servidor nunca renueva ni reescribe la
        // sesión del navegador.
        setAll: () => undefined,
      },
    }
  );
}
