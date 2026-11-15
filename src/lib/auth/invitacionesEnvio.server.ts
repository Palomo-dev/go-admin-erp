/**
 * Envío del correo de una invitación a la organización — SERVIDOR.
 *
 * Extraído de `/api/auth/invite` para que lo reutilice la invitación al portal
 * del empleado de RR. HH. (`/api/hrm/empleados/invitar`): un solo camino para
 * mandar el correo (`inviteUserByEmail` o enlace mágico si ya tiene cuenta).
 * El código de la invitación solo viaja en el enlace del correo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

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
    // OJO: listUsers() sin paginar devuelve solo la primera página (50); si no
    // aparece el huérfano, cae al enlace mágico, que también sirve.
    const { data: userList } = await admin.auth.admin.listUsers();
    const existingUser = userList?.users?.find((u) => u.email?.toLowerCase() === email);
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
