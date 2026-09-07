import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient } from '@supabase/supabase-js';

/**
 * Acepta una invitación y crea/actualiza el usuario SIN requerir una sesión
 * previa. Esto elimina la dependencia del email de verificación de Supabase
 * (que Gmail/Outlook pueden consumir por prefetch).
 *
 * Flujo:
 * 1. Validar el código de invitación
 * 2. Si el usuario no existe en auth.users: crearlo con admin.createUser
 *    (con la contraseña elegida por el usuario)
 * 3. Si el usuario ya existe: actualizar su contraseña con admin.updateUserById
 * 4. Llamar a accept_invitation_atomic (crea perfil + membresía + marca usada)
 * 5. Retornar success para que el frontend haga login con email+password
 */
export async function POST(request: Request) {
  try {
    const {
      inviteCode,
      email,
      password,
      firstName,
      lastName,
      phone,
      isExistingUser,
    } = await request.json();

    if (!inviteCode || !email || !password) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (inviteCode, email, password)' },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const normalizedEmail = email.toLowerCase().trim();

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

    // Verificar que el email coincide
    if (invitation.email !== normalizedEmail) {
      return NextResponse.json(
        { error: 'El email no coincide con la invitación' },
        { status: 400 }
      );
    }

    // 2. Para usuarios NUEVOS: crear el usuario en auth.users con la contraseña
    let userId: string | undefined;

    if (!isExistingUser) {
      // Verificar si ya existe (puede haber sido creado por un inviteUserByEmail previo)
      const { data: userList } = await admin.auth.admin.listUsers();
      const existingUser = userList?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (existingUser) {
        // El usuario ya existe (creado por invitación anterior) — actualizar contraseña
        console.log('Usuario ya existe, actualizando contraseña:', existingUser.id);
        userId = existingUser.id;
        const { error: updateError } = await admin.auth.admin.updateUserById(
          existingUser.id,
          {
            password,
            email_confirm: true,
            user_metadata: {
              first_name: firstName,
              last_name: lastName,
              phone,
            },
          }
        );
        if (updateError) {
          console.error('Error actualizando usuario existente:', updateError);
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 }
          );
        }
      } else {
        // Usuario completamente nuevo — crear con admin.createUser
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
          },
        });
        if (createError) {
          console.error('Error creando usuario:', createError);
          return NextResponse.json(
            { error: createError.message },
            { status: 500 }
          );
        }
        userId = newUser.user?.id;
        console.log('✅ Usuario creado:', userId);
      }
    } else {
      // Usuario existente: actualizar metadata con admin API
      const { data: userList } = await admin.auth.admin.listUsers();
      const existingUser = userList?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );
      if (existingUser) {
        userId = existingUser.id;
        const { error: updateError } = await admin.auth.admin.updateUserById(
          existingUser.id,
          {
            user_metadata: {
              first_name: firstName,
              last_name: lastName,
              phone,
            },
          }
        );
        if (updateError) {
          console.error('Error actualizando usuario existente:', updateError);
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 }
          );
        }
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'No se pudo obtener el ID del usuario' },
        { status: 500 }
      );
    }

    // 3. Crear perfil + membresía + marcar invitación como usada (transacción atómica)
    // Pasar p_user_id porque usamos admin key (auth.uid() retorna NULL con service role)
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
  } catch (error: any) {
    console.error('Error en /api/auth/accept-invitation:', error);
    return NextResponse.json(
      { error: error.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}
