/**
 * Envío del correo de una invitación a la organización — SERVIDOR.
 *
 * Extraído de `/api/auth/invite` para que lo reutilice la invitación al portal
 * del empleado de RR. HH. (`/api/hrm/empleados/invitar`): un solo camino para
 * mandar el correo (`inviteUserByEmail` o enlace mágico si ya tiene cuenta).
 * El código de la invitación solo viaja en el enlace del correo.
 *
 * Revisión 2026-11-15 (empleado siempre con usuario): el alta de RR. HH. crea
 * el usuario sin contraseña antes de invitarlo (`esCuentaPreparadaPorRrhh`).
 * A esa cuenta se le manda la invitación nativa (`inviteUserByEmail` la
 * reenvía a un usuario sin confirmar) y, si falla, el enlace mágico.
 * `renovarInvitacion` es el único reenvío: rota el código y renueva la
 * vigencia (lo usan `/api/auth/invite` y el reenvío de RR. HH.).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarUsuarioAuthPorEmail, esCuentaPreparadaPorRrhh } from './cuentaInvitacion';
import { DIAS_VIGENCIA_INVITACION, generarCodigoInvitacion } from './invitaciones';
import { errorDeCupo, type ErrorCupo } from '@/lib/services/cupoPlanService';

/** Fila con la que se manda el correo. */
export interface InvitacionParaEnviar {
  id: number;
  code: string;
  email: string;
  organization_id: number;
  role_id: number | null;
  organizationName: string;
}

/**
 * Manda el correo de la invitación. `true` si salió.
 * Metadatos de auth.users: todo sale de la invitación y de la sesión, nada del
 * body, y sin el código (rota al reenviar y no debe quedar guardado en el JWT).
 */
export async function enviarCorreoInvitacion(
  admin: SupabaseClient,
  invitacion: InvitacionParaEnviar,
  origin: string,
  invitedBy: string,
): Promise<boolean> {
  const { email, organization_id: organizationId, organizationName } = invitacion;
  const inviteUrl = `${origin}/auth/invite?invite_code=${encodeURIComponent(invitacion.code)}`;
  const inviteMetadata = {
    organization_id: organizationId,
    organization_name: organizationName,
    role_id: invitacion.role_id,
    is_invitation: true,
    invited_by: invitedBy,
  };

  const enlaceMagico = async (): Promise<boolean> => {
    const { createClient } = await import('@supabase/supabase-js');
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error } = await anonClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: inviteUrl,
        data: { organization_id: organizationId, organization_name: organizationName },
      },
    });
    if (error) {
      console.error('Error enviando Magic Link:', error);
      return false;
    }
    return true;
  };

  // ¿Ya existe en auth.users? (RPC check_email_exists)
  const { data: existsInAuth } = await admin.rpc('check_email_exists', { p_email: email });

  // Si existe puede ser:
  // A) Un usuario real con perfil y membresía → enlace mágico.
  // B) Un usuario huérfano creado por una invitación anterior de ESTA
  //    organización que nunca completó (sin perfil ni membresía) → se borra y
  //    se re-invita con inviteUserByEmail para que reciba type=invite.
  if (existsInAuth) {
    const existingUser = await buscarUsuarioAuthPorEmail(admin, email).catch(() => null);

    // Cuenta que preparó el alta de RR. HH. y nadie ha usado: invitación nativa.
    if (existingUser && esCuentaPreparadaPorRrhh(existingUser, organizationId)) {
      const { error: invitarError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: inviteUrl,
        data: { ...inviteMetadata, hr_alta: true },
      });
      if (!invitarError) return true;
      console.warn('Invitación nativa a cuenta preparada por RR. HH. no salió; se manda enlace mágico:', invitarError.message);
      return enlaceMagico();
    }

    const meta = (existingUser?.user_metadata ?? {}) as Record<string, unknown>;
    // `deleteUser` es lo más destructivo del fichero: además de «es huérfano»
    // se exige que el huérfano sea DE ESTA organización.
    const esHuerfanoDeLaOrg =
      !!existingUser &&
      meta.is_invitation === true &&
      String(meta.organization_id ?? '') === String(organizationId);

    if (esHuerfanoDeLaOrg && existingUser) {
      const { data: profile } = await admin.from('profiles').select('id').eq('id', existingUser.id).maybeSingle();
      const { data: membership } = await admin
        .from('organization_members')
        .select('id')
        .eq('user_id', existingUser.id)
        .limit(1)
        .maybeSingle();

      if (!profile && !membership) {
        console.log('🗑️ Eliminando usuario huérfano:', existingUser.id);
        const { error: deleteError } = await admin.auth.admin.deleteUser(existingUser.id);
        if (!deleteError) {
          const { error: reinviteError } = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: inviteUrl,
            data: inviteMetadata,
          });
          if (reinviteError) {
            console.error('Error re-invitando usuario huérfano:', reinviteError);
            return false;
          }
          return true;
        }
        console.error('Error eliminando usuario huérfano:', deleteError);
        // Si falla la eliminación, cae al enlace mágico.
      }
    }
    return enlaceMagico();
  }

  // Usuario nuevo: inviteUserByEmail (manda el correo).
  // No fijar contraseña temporal: updateUserById invalida el token del correo.
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteUrl,
    data: inviteMetadata,
  });
  if (inviteError) {
    console.error('Error enviando invitación:', inviteError);
    if (inviteError.message.includes('already been registered') || inviteError.message.includes('already registered')) {
      return enlaceMagico();
    }
    return false;
  }
  return true;
}

/** Estados desde los que se puede reenviar: pendiente (vigente o vencida) o ya marcada vencida. */
export const ESTADOS_REENVIABLES = ['pending', 'expired'] as const;

export type ResultadoRenovacion =
  | { ok: true; code: string }
  | { ok: false; cupo: ErrorCupo | null };

/**
 * Rota el código y renueva la vigencia de una invitación pendiente o vencida:
 * el enlace anterior deja de servir. Una vencida vuelve a `pending` y vuelve a
 * ocupar cupo (lo comprueba `trg_cupo_plan_invitacion`). Quien llama ya
 * comprobó que la invitación es de su organización.
 */
export async function renovarInvitacion(admin: SupabaseClient, invitationId: number): Promise<ResultadoRenovacion> {
  const code = generarCodigoInvitacion();
  const { data, error } = await admin
    .from('invitations')
    .update({
      code,
      expires_at: new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 24 * 3600_000).toISOString(),
      status: 'pending',
    })
    .eq('id', invitationId)
    .in('status', [...ESTADOS_REENVIABLES])
    .select('id')
    .maybeSingle();
  if (error || !data) return { ok: false, cupo: errorDeCupo(error) };
  return { ok: true, code };
}
