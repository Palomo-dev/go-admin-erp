import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

/**
 * Envía una invitación usando el flujo nativo de Supabase
 * (supabase.auth.admin.inviteUserByEmail), lo que dispara el template de
 * correo "Invite user" configurado en el Dashboard. Después, fija la misma
 * contraseña temporal ('temp-password') que espera el flujo existente de
 * /auth/invite (InvitationWizard), para no modificar esa lógica ya probada.
 */
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
      resend = false,
    } = await request.json();

    if (!email || !invitationCode || !origin) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (email, invitationCode, origin)' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const normalizedEmail = email.toLowerCase();

    // Verificar si el usuario ya existe en auth.users (vía RPC check_email_exists)
    const { data: existsInAuth } = await admin.rpc('check_email_exists', {
      p_email: normalizedEmail,
    });

    const inviteUrl = `${origin}/auth/invite?invite_code=${invitationCode}`;

    if (existsInAuth && !resend) {
      return NextResponse.json(
        { error: 'already_exists', inviteUrl },
        { status: 200 }
      );
    }

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
      return NextResponse.json(
        { error: inviteError.message, inviteUrl },
        { status: 200 }
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
