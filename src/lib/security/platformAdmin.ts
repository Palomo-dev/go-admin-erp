/**
 * Administrador de la PLATAFORMA (GO Admin), no de una organización cliente.
 *
 * `platform_admins` tiene RLS activa y ninguna política: consultarla con el
 * cliente del usuario siempre devuelve vacío, así que la verificación que
 * hacían las rutas de PayFac nunca autorizaba a nadie (auditoría 2026-09-23).
 * La única puerta es la función SECURITY DEFINER `fn_is_platform_admin()`
 * (usa `auth.uid()` de la sesión y `status = 'active'`), ejecutable por
 * `authenticated`. Se llama con el cliente de la sesión: ni service role ni un
 * id de usuario que venga del cliente.
 *
 * Fail-closed: error de la RPC, excepción o cualquier valor distinto de `true`
 * cuenta como «no».
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { OrgContextError } from '@/lib/utils/orgContextError';

export interface PlatformAdminContext {
  userId: string;
  supabase: SupabaseClient;
}

/** ¿El usuario de la sesión de `supabase` es admin activo de la plataforma? */
export async function isPlatformAdmin(supabase: Pick<SupabaseClient, 'rpc'>): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('fn_is_platform_admin');
    if (error) {
      console.warn('[platformAdmin] fn_is_platform_admin falló; se deniega', error.message);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn('[platformAdmin] fn_is_platform_admin lanzó; se deniega', err instanceof Error ? err.message : String(err));
    return false;
  }
}

/** Usuario de la sesión (401 si no hay). */
export async function requireSessionUser(): Promise<PlatformAdminContext> {
  const supabase = await getServerUserClient();
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user;
  if (error || !user) throw new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED');
  return { userId: user.id, supabase };
}

/** Sesión + admin de plataforma, o 401/403 `PLATFORM_ADMIN_REQUIRED`. */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const ctx = await requireSessionUser();
  if (!(await isPlatformAdmin(ctx.supabase))) {
    console.warn('[platformAdmin] acceso de plataforma denegado', { userId: ctx.userId });
    throw new OrgContextError('Acceso restringido a administradores de plataforma', 403, 'PLATFORM_ADMIN_REQUIRED');
  }
  return ctx;
}

type RouteParams = { params: Promise<Record<string, string | string[] | undefined>> };

export type PlatformRouteHandler = (ctx: PlatformAdminContext, req: Request, routeParams?: RouteParams) => Promise<Response>;

/** Envuelve un handler exigiendo sesión + admin de plataforma (401/403 JSON). */
export function withPlatformAdmin(handler: PlatformRouteHandler) {
  return async (req: Request, routeParams: RouteParams): Promise<Response> => {
    try {
      const ctx = await requirePlatformAdmin();
      return await handler(ctx, req, routeParams);
    } catch (err) {
      if (err instanceof OrgContextError) {
        return new Response(JSON.stringify({ error: err.message, code: err.code }), {
          status: err.statusCode,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    }
  };
}
