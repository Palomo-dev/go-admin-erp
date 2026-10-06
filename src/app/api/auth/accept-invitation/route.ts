import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { estadoCuentaInvitacion } from '@/lib/auth/cuentaInvitacion';
import { buscarInvitacionVigentePorCodigo, normalizarCorreo, referenciaCodigo } from '@/lib/auth/invitaciones';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { LONGITUD_MINIMA_CONTRASENA } from '@/lib/auth/politicaContrasena';
import { validarContrasenaServidor } from '@/lib/auth/servidorAcceso';
import { errorDeCupo } from '@/lib/services/cupoPlanService';

/**
 * Acepta una invitación SIN sesión previa: crea la cuenta del invitado con la
 * contraseña que eligió. Existe porque Gmail/Outlook consumen el token del
 * correo por prefetch.
 *
 * El código de la invitación es la credencial: solo llega al navegador en el
 * enlace del correo del invitado o tras un `verifyOtp` correcto (GO-sec
 * 2026-09-28; antes `/auth/verify` lo entregaba a quien conociera el correo).
 *
 * SOLO para cuentas nuevas o huérfanas (ver `estadoCuentaInvitacion`). Si el
 * correo ya tiene una cuenta real, responde 409 y el asistente manda al
 * usuario a iniciar sesión: la aceptación se hace entonces con su propia
 * sesión vía `accept_invitation_atomic` (que comprueba que el correo de la
 * sesión sea el de la invitación).
 *
 * La cuenta se crea SIEMPRE con el correo de la invitación, nunca con uno del
 * body; si el body trae otro, se rechaza igual que un código inválido.
 */

/** Pública y crea cuentas: freno por IP antes de tocar la BD. */
const ACCEPT_IP_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

function invitacionNoValida() {
  return NextResponse.json({ error: 'Invitación no válida o vencida' }, { status: 404 });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body inválido (se espera JSON)' }, { status: 400 });
  }

  try {
    const inviteCode = body.inviteCode;
    const password = body.password;
    const email = typeof body.email === 'string' ? body.email : '';
    const firstName = typeof body.firstName === 'string' ? body.firstName : null;
    const lastName = typeof body.lastName === 'string' ? body.lastName : null;
    const phone = typeof body.phone === 'string' ? body.phone : null;

    // Política única (acceso v3, decisión v2-5): aquí solo el tipo y la
    // longitud, antes de tocar la base; el resto (distinta del correo, no
    // filtrada) cuando ya se sabe el correo invitado.
    if (typeof password !== 'string' || password.length < LONGITUD_MINIMA_CONTRASENA) {
      return NextResponse.json(
        { error: 'La contraseña no cumple la política', codigo: 'longitud' },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimits(
      [{ key: `invite:accept:ip:${ip}`, opts: ACCEPT_IP_LIMIT }],
      { store: getRateLimitStore() },
    );
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const admin = getSupabaseAdmin();

    // 1. Validar la invitación (vigente, código exacto en tiempo constante).
    const invitation = await buscarInvitacionVigentePorCodigo(admin, inviteCode);
    if (!invitation) {
      console.warn('accept-invitation: código no válido', referenciaCodigo(String(inviteCode ?? '')), 'ip:', ip);
      return invitacionNoValida();
    }

    const correoInvitado = normalizarCorreo(invitation.email);
    if (email && normalizarCorreo(email) !== correoInvitado) {
      console.warn('accept-invitation: el correo del body no es el invitado, invitación', invitation.id, 'ip:', ip);
      return invitacionNoValida();
    }

    const motivo = await validarContrasenaServidor(password, correoInvitado, 'accept-invitation');
    if (motivo) {
      return NextResponse.json({ error: 'La contraseña no cumple la política', codigo: motivo }, { status: 400 });
    }

    // 2. Estado de la cuenta: lo decide el servidor, nunca el cliente.
    const { estado, usuario } = await estadoCuentaInvitacion(admin, correoInvitado, {
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
      const metaAnterior = { ...(usuario.user_metadata ?? {}) } as Record<string, unknown>;
      delete metaAnterior.invitation_code;
      const { error: updateError } = await admin.auth.admin.updateUserById(usuario.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...metaAnterior,
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      });
      if (updateError) {
        console.error('Error fijando contraseña de cuenta huérfana:', updateError);
        return NextResponse.json({ error: 'No se pudo completar el registro' }, { status: 500 });
      }
    } else {
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email: correoInvitado,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
          phone,
          is_invitation: true,
          organization_id: invitation.organization_id,
        },
      });
      if (createError) {
        console.error('Error creando usuario:', createError);
        return NextResponse.json({ error: 'No se pudo completar el registro' }, { status: 500 });
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

    // 3. Perfil + membresía + marcar invitación como usada (transacción
    // atómica, FOR UPDATE: un solo uso). p_user_id porque va con la clave de
    // servicio (auth.uid() sería NULL); la función solo lo admite de ella.
    const { error: acceptError } = await admin.rpc('accept_invitation_atomic', {
      p_invite_code: invitation.code,
      p_first_name: firstName,
      p_last_name: lastName,
      p_phone: phone,
      p_user_id: userId,
    });

    // El plan ya no tiene sitio (disparador de cupo, auditoría 2026-10 P0-4):
    // la persona lo tiene que saber; el admin decide si compra usuarios o
    // libera uno. La cuenta creada arriba queda sin organización y la
    // invitación sigue pendiente para cuando haya sitio.
    const cupo = errorDeCupo(acceptError);
    if (cupo) {
      return NextResponse.json({ error: cupo.mensaje, code: cupo.codigo }, { status: 409 });
    }
    if (acceptError) {
      console.error('Error en accept_invitation_atomic:', acceptError);
      return NextResponse.json(
        { error: 'No se pudo completar el registro' },
        { status: 500 }
      );
    }

    console.log('✅ Invitación aceptada:', invitation.id);

    return NextResponse.json({
      success: true,
      organizationId: invitation.organization_id,
      organizationName: invitation.organization_name,
    });
  } catch (error) {
    console.error('Error en /api/auth/accept-invitation:', error);
    return NextResponse.json({ error: 'Error inesperado' }, { status: 500 });
  }
}
