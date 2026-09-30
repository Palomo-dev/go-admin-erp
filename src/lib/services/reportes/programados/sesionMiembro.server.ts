/**
 * Sesión de un miembro para los envíos programados (decisión 11 del plan de
 * reportes v2). SOLO servidor y SOLO el cron de envíos.
 *
 * El cron no tiene la sesión de nadie. Para que cada destinatario reciba lo
 * que SU alcance le deja ver, se abre una sesión corta con `sub` = esa
 * persona: las RLS, las `fn_reporte_*` y `check_user_permission` se evalúan
 * como ella. Nada más se hace con ese cliente.
 *
 * Si el entorno tiene `SUPABASE_JWT_SECRET`, el JWT lo firma este servidor
 * (vida de 5 minutos, sin fila en Auth). Si no, Auth emite la sesión con la
 * clave de servicio y se cierra al terminar el envío. Sin ese segundo camino
 * el cron respondía 503 y el correo no salía.
 *
 * Claims: exactamente `role`, `aud`, `sub`, `iat`, `exp`. Ni organización,
 * ni sucursal, ni correo: ninguna política debe confiar en un claim que el
 * servidor escribió por su cuenta.
 */
import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readRealSecret } from '@/lib/security/secrets';
import { getServiceClient } from '@/lib/supabase/server-service';
import type { SesionDocumento } from '@/lib/documents/server/base';

export const TTL_SESION_ENVIO_SEGUNDOS = 300;
export const CLAIMS_SESION_ENVIO = ['role', 'aud', 'sub', 'iat', 'exp'] as const;

export class ErrorSesionEnvio extends Error {
  constructor(public readonly codigo: 'jwt_no_configurado' | 'supabase_no_configurado') {
    super(codigo);
  }
}

export interface SesionEnvio extends SesionDocumento {
  memberId: number;
  organizationName: string;
  /** Cierra la sesión corta creada para este envío. El JWT local no abre una. */
  cerrar?: () => Promise<void>;
}

export function firmarJwtMiembro(secreto: string, userId: string, ahoraMs: number = Date.now()): string {
  if (!secreto) throw new ErrorSesionEnvio('jwt_no_configurado');
  const iat = Math.floor(ahoraMs / 1000);
  const payload: Record<(typeof CLAIMS_SESION_ENVIO)[number], string | number> = {
    role: 'authenticated',
    aud: 'authenticated',
    sub: userId,
    iat,
    exp: iat + TTL_SESION_ENVIO_SEGUNDOS,
  };
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');
  const entrada = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${entrada}.${createHmac('sha256', secreto).update(entrada).digest('base64url')}`;
}

function clienteConToken(token: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new ErrorSesionEnvio('supabase_no_configurado');
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Sesión firmada por Auth cuando el entorno no tiene `SUPABASE_JWT_SECRET`.
 * Producción responde 503 y no manda el correo si solo existe el camino del
 * secreto. El enlace no se envía: se verifica aquí y se cierra al terminar.
 */
async function tokenPorAuth(userId: string): Promise<{ token: string; cerrar: () => Promise<void> }> {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  const email = data.user?.email;
  if (error || !email) throw new ErrorSesionEnvio('jwt_no_configurado');
  const link = await service.auth.admin.generateLink({ type: 'magiclink', email });
  const hash = link.data?.properties?.hashed_token;
  if (link.error || !hash) throw new ErrorSesionEnvio('jwt_no_configurado');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new ErrorSesionEnvio('supabase_no_configurado');
  const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const verificado = await auth.auth.verifyOtp({ type: 'magiclink', token_hash: hash });
  const token = verificado.data.session?.access_token;
  if (verificado.error || !token) throw new ErrorSesionEnvio('jwt_no_configurado');
  return {
    token,
    cerrar: async () => {
      await service.auth.admin.signOut(token, 'local').catch(() => undefined);
    },
  };
}

async function tokenDeMiembro(userId: string): Promise<{ token: string; cerrar?: () => Promise<void> }> {
  const secreto = readRealSecret('SUPABASE_JWT_SECRET', { min: 32 });
  if (secreto) return { token: firmarJwtMiembro(secreto, userId) };
  return tokenPorAuth(userId);
}

interface FilaMembresia {
  id: number;
  role_id: number;
  is_super_admin: boolean | null;
  organizations: { name: string | null } | { name: string | null }[] | null;
}

/**
 * Sesión del miembro activo `userId` en la organización, o null si ya no es
 * miembro activo. La membresía se lee con SU cliente (RLS propia).
 */
export async function sesionDeMiembro(organizationId: number, userId: string): Promise<SesionEnvio | null> {
  const { token, cerrar } = await tokenDeMiembro(userId);
  const supabase = clienteConToken(token);
  const { data, error } = await supabase
    .from('organization_members')
    .select('id, role_id, is_super_admin, organizations(name)')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw new Error(`No se pudo leer la membresía del destinatario: ${error.message}`);
  const m = data as FilaMembresia | null;
  if (!m) return null;
  const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
  return {
    userId,
    organizationId,
    roleId: m.role_id,
    isSuperAdmin: m.is_super_admin === true,
    memberId: m.id,
    organizationName: org?.name ?? '',
    supabase,
    cerrar,
  };
}
