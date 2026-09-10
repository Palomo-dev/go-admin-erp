import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';

/**
 * Envía una invitación usando el flujo nativo de Supabase
 * (supabase.auth.admin.inviteUserByEmail), lo que dispara el template de
 * correo "Invite user" configurado en el Dashboard. Después, fija la misma
 * contraseña temporal ('temp-password') que espera el flujo existente de
 * /auth/invite (InvitationWizard), para no modificar esa lógica ya probada.
 *
 * Seguridad: la ruta exige sesión (el middleware la protege, no está en
 * shouldSkipRoute), pero cada petición manda un correo, así que lleva rate
 * limit por IP y por destinatario para que una sesión cualquiera no pueda
 * bombardear una dirección ni agotar la cuota de envío.
 * PENDIENTE: tampoco valida que quien llama pertenezca a `organizationId` ni
 * que `invitationCode` exista en `invitations`; eso se sigue aparte.
 */

/**
 * 30 invitaciones / 15 min por IP: holgado para dar de alta un equipo entero
 * desde una oficina (IP compartida) y aun así corta el envío masivo.
 * El freno que protege al destinatario es el de abajo, no este.
 */
const INVITE_IP_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };
/** 3 correos / 15 min al mismo destinatario. */
const INVITE_EMAIL_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  try {
    const {
      email,
      organizationId,
      organizationName,
      roleId,
      invitationCode,
      invitedBy,
      origin,
    } = await request.json();

    if (!email || !invitationCode || !origin) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (email, invitationCode, origin)' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const normalizedEmail = email.toLowerCase();

    const ip = getClientIp(request);
    const rl = await checkRateLimits([
      { key: `invite:send:ip:${ip}`, opts: INVITE_IP_LIMIT },
      { key: `invite:send:email:${normalizedEmail}`, opts: INVITE_EMAIL_LIMIT },
    ]);
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      console.warn('Invitación bloqueada por rate limit:', rl.blockedKey, 'ip:', ip);
      return NextResponse.json(
        { error: 'Demasiadas invitaciones seguidas. Intenta de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    // Verificar si el usuario ya existe en auth.users (vía RPC check_email_exists)
    const { data: existsInAuth } = await admin.rpc('check_email_exists', {
      p_email: normalizedEmail,
    });

    const inviteUrl = `${origin}/auth/invite?invite_code=${encodeURIComponent(invitationCode)}`;

    // Si el usuario ya existe en auth.users, puede ser:
    // A) Un usuario real con perfil y membresía → usar signInWithOtp (magiclink)
    // B) Un usuario huérfano creado por inviteUserByEmail de una invitación anterior
    //    que nunca completó (sin perfil, sin membresía) → eliminarlo y re-invitar
    //    con inviteUserByEmail para que reciba type=invite y pueda completar su registro.
    if (existsInAuth) {
      // Buscar el usuario en auth.users para verificar si es huérfano
      const { data: userList } = await admin.auth.admin.listUsers();
      const existingUser = userList?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      const isOrphan = existingUser && (
        // Creado por invitación previa (is_invitation en metadata)
        (existingUser.user_metadata as any)?.is_invitation === true
      ) && existingUser.id;

      if (isOrphan && existingUser) {
        // Verificar que NO tenga perfil ni membresía (confirmar que es huérfano)
        const { data: profile } = await admin
          .from('profiles')
          .select('id')
          .eq('id', existingUser.id)
          .maybeSingle();

        const { data: membership } = await admin
          .from('organization_members')
          .select('id')
          .eq('user_id', existingUser.id)
          .maybeSingle();

        if (!profile && !membership) {
          // Es un usuario huérfano: eliminarlo y re-invitar con inviteUserByEmail
          console.log('🗑️ Eliminando usuario huérfano:', existingUser.id, normalizedEmail);
          const { error: deleteError } = await admin.auth.admin.deleteUser(existingUser.id);
          if (deleteError) {
            console.error('Error eliminando usuario huérfano:', deleteError);
            // Si falla la eliminación, caer al flujo de magiclink como fallback
          } else {
            console.log('✅ Usuario huérfano eliminado, re-invitando con inviteUserByEmail...');
            // Re-invitar con inviteUserByEmail (type=invite)
            const { error: reinviteError } = await admin.auth.admin.inviteUserByEmail(
              normalizedEmail,
              {
                redirectTo: inviteUrl,
                data: {
                  organization_id: organizationId,
                  organization_name: organizationName,
                  role_id: roleId,
                  invitation_code: invitationCode,
                  is_invitation: true,
                  invited_by: invitedBy,
                },
              }
            );
            if (reinviteError) {
              console.error('Error re-invitando usuario huérfano:', reinviteError);
              return NextResponse.json(
                { error: reinviteError.message, inviteUrl },
                { status: 400 }
              );
            }
            console.log('📧 Invitación re-enviada a usuario huérfano:', normalizedEmail);
            return NextResponse.json({ success: true, inviteUrl });
          }
        }
      }

      // Usuario real (con perfil/membresía) o no se pudo eliminar: usar magiclink
      const { createClient } = await import('@supabase/supabase-js');
      const anonClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { error: otpError } = await anonClient.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: inviteUrl,
          data: {
            invitation_code: invitationCode,
            organization_id: organizationId,
            organization_name: organizationName,
          },
        },
      });

      if (otpError) {
        console.error('Error enviando Magic Link:', otpError);
        return NextResponse.json({
          success: false,
          error: otpError.message,
          inviteUrl,
          message: 'No se pudo enviar el email automáticamente. Comparte el link manualmente.',
        }, { status: 500 });
      }

      console.log('📧 Magic Link email sent to existing user:', normalizedEmail);
      return NextResponse.json({ success: true, inviteUrl });
    }

    // Usuario nuevo: usar inviteUserByEmail (envía email automáticamente)
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        redirectTo: inviteUrl,
        data: {
          organization_id: organizationId,
          organization_name: organizationName,
          role_id: roleId,
          invitation_code: invitationCode,
          is_invitation: true,
          invited_by: invitedBy,
        },
      }
    );

    if (inviteError) {
      console.error('Error enviando invitación:', inviteError);
      // Si el usuario ya existe, usar resetPasswordForEmail como fallback
      if (inviteError.message.includes('already been registered') || inviteError.message.includes('already registered')) {
        const { createClient } = await import('@supabase/supabase-js');
        const anonClient = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        );
        const { error: otpError } = await anonClient.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo: inviteUrl,
            data: { invitation_code: invitationCode },
          },
        });
        if (!otpError) {
          console.log('📧 Magic Link sent as fallback to:', normalizedEmail);
          return NextResponse.json({ success: true, inviteUrl });
        }
      }
      return NextResponse.json(
        { error: inviteError.message, inviteUrl },
        { status: 400 }
      );
    }

    // No fijar contraseña temporal: updateUserById invalida el token de invitación
    // que Supabase envía por email. El flujo correcto es:
    // 1. Usuario clickea link del email → /auth/verify?token=...&type=invite
    // 2. verifyOtp establece sesión automáticamente
    // 3. Redirect a /auth/invite?invite_code=... donde completa su perfil y contraseña

    return NextResponse.json({ success: true, inviteUrl });
  } catch (error: any) {
    console.error('Error en /api/auth/invite:', error);
    return NextResponse.json(
      { error: error.message || 'Error inesperado enviando la invitación' },
      { status: 500 }
    );
  }
}
