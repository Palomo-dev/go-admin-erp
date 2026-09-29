import { supabase, signInWithEmail } from '@/lib/supabase/config';
import { codigoDeErrorAuth, type CodigoErrorLogin } from '@/lib/auth/codigosAcceso';

/**
 * Inicio de sesión con correo y contraseña (acceso v3, docs/design/AUTH-ACCESO-V2.md
 * §12 y §13).
 *
 * Devuelve CÓDIGOS, no textos: la pantalla los traduce (namespace
 * `acceso.login`). Un único código para credenciales malas — no se distingue
 * «el usuario no existe» de «la contraseña no es» (enumeración, §4.2) — y la
 * pantalla ya no ofrece «Crear cuenta» cuando solo falla la contraseña.
 */

export { codigoDeErrorAuth, type CodigoErrorLogin };

export interface OrganizacionDeUsuario {
  id: number;
  name: string;
  type_id: { name: string };
  role_id?: number;
  plan_id: { id: number; name: string };
  status?: string;
  logo_url?: string;
}

export interface ErrorLogin {
  codigo: CodigoErrorLogin;
  /** ISO: hasta cuándo dura el bloqueo por intentos (solo con `bloqueado`). */
  bloqueadoHasta?: string;
}

export type ResultadoLogin =
  | { ok: true; userId: string; email: string }
  | { ok: false; error: ErrorLogin };

/**
 * Abre la sesión con correo y contraseña y la deja en el cliente (cookie de
 * siempre). No decide a dónde ir: eso es `destinoTrasLogin`.
 */
export async function iniciarSesionConCorreo(email: string, password: string): Promise<ResultadoLogin> {
  try {
    const { data, error } = await signInWithEmail(email.trim(), password);
    if (error) {
      const codigo = (error as { codigoAcceso?: CodigoErrorLogin }).codigoAcceso ?? codigoDeErrorAuth(error);
      return {
        ok: false,
        error: { codigo, bloqueadoHasta: (error as { bloqueadoHasta?: string }).bloqueadoHasta },
      };
    }
    if (!data?.session || !data.user) return { ok: false, error: { codigo: 'inesperado' } };
    const { error: setError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setError) return { ok: false, error: { codigo: 'inesperado' } };
    return { ok: true, userId: data.user.id, email: data.user.email || email };
  } catch (err) {
    console.error('[acceso] Error inesperado al iniciar sesión:', err);
    return { ok: false, error: { codigo: 'inesperado' } };
  }
}

/**
 * Qué hacer según cuántas organizaciones tiene la persona (decisión v2-9, R4):
 *  - 0 → selección en estado vacío (crear o unirse con código; R12);
 *  - 1 → se activa esa y se entra sin preguntar;
 *  - 2 o más → el selector único `/auth/select-organization`.
 */
export type DecisionOrganizacion =
  | { tipo: 'ninguna' }
  | { tipo: 'una'; organizacion: OrganizacionDeUsuario }
  | { tipo: 'varias' };

export function decidirOrganizacion(organizaciones: OrganizacionDeUsuario[]): DecisionOrganizacion {
  if (organizaciones.length === 0) return { tipo: 'ninguna' };
  if (organizaciones.length === 1) return { tipo: 'una', organizacion: organizaciones[0] };
  return { tipo: 'varias' };
}

/**
 * Usuario sin organizaciones: si tiene una invitación pendiente, el servidor
 * le manda el enlace a su correo (el código nunca llega al navegador por esta
 * vía: una sesión no prueba el buzón). Devuelve true si ya se redirigió a la
 * pantalla de «revisa tu correo».
 */
export async function enlaceDeInvitacionEnviado(email: string): Promise<boolean> {
  try {
    // Viene del asistente con su enlace (redirectTo=/auth/invite?invite_code=…):
    // proceedWithLogin lo devuelve allí, no hace falta otro correo.
    if (sessionStorage.getItem('redirectTo')?.startsWith('/auth/invite')) return false;
    const res = await fetch('/api/auth/invite/pendiente', { method: 'POST', cache: 'no-store' });
    if (!res.ok) return false;
    const { enlaceEnviado } = (await res.json()) as { enlaceEnviado?: boolean };
    if (!enlaceEnviado) return false;
    await supabase.auth.signOut();
    window.location.replace(`/auth/verify/failed?estado=reenviado&email=${encodeURIComponent(email)}`);
    return true;
  } catch (err) {
    console.error('[acceso] No se pudo consultar la invitación pendiente:', err);
    return false;
  }
}

/**
 * Organizaciones activas de la persona (membresías activas). La principal
 * (`profiles.last_org_id`) la ordena la pantalla de selección.
 */
export async function getUserOrganizations(userId: string): Promise<OrganizacionDeUsuario[]> {
  const { data: ownedOrgs, error: ownedError } = await supabase
    .from('organization_members')
    .select(`
      user_id,
      organization_id,
      role_id,
      is_active,
      organizations!inner(
        id,
        name,
        type_id,
        status,
        logo_url,
        organization_types(
          name
        ),
        subscriptions(
          plan_id,
          status,
          plans(
            id,
            name
          )
        )
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (ownedError) {
    console.error('Error obteniendo organizaciones:', ownedError);
    throw new Error('organizaciones');
  }

  type Suscripcion = { plan_id?: number | null; status?: string | null; plans?: { id?: number; name?: string } | null };
  type Miembro = {
    organization_id: number;
    role_id?: number;
    organizations?: {
      id?: number;
      name?: string;
      status?: string;
      logo_url?: string | null;
      organization_types?: { name?: string } | null;
      subscriptions?: Suscripcion[] | null;
    } | null;
  };

  return ((ownedOrgs || []) as unknown as Miembro[]).map((member) => {
    const subscriptions = member.organizations?.subscriptions || [];
    const activeSub = subscriptions.find((s) => s.status === 'active') || subscriptions[0];
    return {
      id: member.organizations?.id || member.organization_id,
      name: member.organizations?.name || '—',
      type_id: { name: member.organizations?.organization_types?.name || '' },
      role_id: member.role_id,
      plan_id: {
        id: activeSub?.plans?.id || activeSub?.plan_id || 0,
        name: activeSub?.plans?.name || 'Free',
      },
      status: member.organizations?.status || 'active',
      logo_url: member.organizations?.logo_url || undefined,
    };
  });
}

/**
 * Reenvía el correo de confirmación de la cuenta. La respuesta es la misma
 * exista o no la cuenta (el servidor limita por IP y por correo).
 */
export async function reenviarConfirmacion(email: string): Promise<{ ok: boolean; espera?: boolean }> {
  try {
    const res = await fetch('/api/auth/reenviar-confirmacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (res.status === 429) return { ok: false, espera: true };
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
