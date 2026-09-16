import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { estadoCuentaInvitacion } from '@/lib/auth/cuentaInvitacion';

/**
 * Acepta una invitación SIN sesión previa: crea la cuenta del invitado con la
 * contraseña que eligió. Existe porque Gmail/Outlook consumen el token del
 * correo por prefetch y el enlace también puede abrirse copiado desde la
 * tabla de invitaciones.
 *
 * SOLO para cuentas nuevas o huérfanas (ver `estadoCuentaInvitacion`). Si el
 * correo ya tiene una cuenta real, responde 409 y el asistente manda al
 * usuario a iniciar sesión: la aceptación se hace entonces con su propia
 * sesión vía `accept_invitation_atomic` (que comprueba que el correo de la
 * sesión sea el de la invitación).
 *
 * Antes esta ruta aceptaba `isExistingUser` del cliente y, si el usuario ya
 * existía, LE CAMBIABA LA CONTRASEÑA con solo tener el código de invitación.
 * Cualquier administrador de cualquier organización podía invitar un correo
 * ajeno, copiar el enlace y quedarse con esa cuenta y todas sus
 * organizaciones. El estado lo decide ahora el servidor.
 */
export async function POST(request: Request) {
  try {
    const { inviteCode, email, password, firstName, lastName, phone } = await request.json();

    if (!inviteCode || !email || !password) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (inviteCode, email, password)' },
        { status: 400 }
      );
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const normalizedEmail = String(email).toLowerCase().trim();

    // 1. Validar la invitación
    const { data: inviteData, error: inviteError } = await admin.rpc(
      'validate_invitation_by_code',
      { invitation_code: inviteCode }
    );

    if (inviteError || !inviteData || inviteData.length === 0) {
      console.error('Error validando invitación:', inviteError);
      return NextResponse.json(
        { error: 'Código de invitación inválido o expirado' },
        { status: 400 }
      );
    }

    const invitation = inviteData[0];

    if (String(invitation.email).toLowerCase().trim() !== normalizedEmail) {
      return NextResponse.json(
        { error: 'El email no coincide con la invitación' },
        { status: 400 }
      );
    }

    // 2. Estado de la cuenta: lo decide el servidor, nunca el cliente.
    const { estado, usuario } = await estadoCuentaInvitacion(admin, normalizedEmail, {
      code: invitation.code,
      organization_id: invitation.organization_id,
    });

    if (estado === 'existente') {
      return NextResponse.json(
        {
          error: 'Este correo ya tiene una cuenta. Inicia sesión para aceptar la invitación.',
          code: 'CUENTA_EXISTENTE',
        },
        { status: 409 }
      );
    }

    let userId: string | undefined;

    if (estado === 'huerfana' && usuario) {
      // Cuenta creada por una invitación anterior que nunca se completó:
      // nadie la reclamó (sin perfil ni membresías), se le fija la contraseña.
      console.log('Cuenta huérfana de invitación, fijando contraseña:', usuario.id);
      userId = usuario.id;
      const { error: updateError } = await admin.auth.admin.updateUserById(usuario.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(usuario.user_metadata ?? {}),
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      });
      if (updateError) {
        console.error('Error fijando contraseña de cuenta huérfana:', updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      console.log('Creando nuevo usuario:', normalizedEmail);
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          phone,
          is_invitation: true,
          invitation_code: inviteCode,
          organization_id: invitation.organization_id,
        },
      });
      if (createError) {
        console.error('Error creando usuario:', createError);
        return NextResponse.json({ error: createError.message }, { status: 500 });
      }
      userId = newUser.user?.id;
      console.log('✅ Usuario creado:', userId);
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'No se pudo obtener el ID del usuario' },
        { status: 500 }
      );
    }

    // 3. Perfil + membresía + marcar invitación como usada (transacción atómica).
    // p_user_id porque va con la clave de servicio (auth.uid() sería NULL).
    const { data: acceptResult, error: acceptError } = await admin.rpc(
      'accept_invitation_atomic',
      {
        p_invite_code: inviteCode,
        p_first_name: firstName,
        p_last_name: lastName,
        p_phone: phone,
        p_user_id: userId,
      }
    );

    if (acceptError) {
      console.error('Error en accept_invitation_atomic:', acceptError);
      return NextResponse.json(
        { error: acceptError.message || 'No se pudo completar el registro' },
        { status: 500 }
      );
    }

    console.log('✅ Invitación aceptada exitosamente:', acceptResult);

    return NextResponse.json({
      success: true,
      organizationId: invitation.organization_id,
      organizationName: invitation.organization_name,
    });
  } catch (error) {
    console.error('Error en /api/auth/accept-invitation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error inesperado' },
      { status: 500 }
    );
  }
}
