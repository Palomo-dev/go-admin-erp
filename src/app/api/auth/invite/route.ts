import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp, type RateLimitResult } from '@/lib/security/rateLimit';
import { resolveSelfOrigin } from '@/lib/security/requestOrigin';
import {
  getServerOrgContextFor,
  requireOrgAdmin,
  OrgContextError,
  type ServerOrgContext,
} from '@/lib/utils/orgContext';

/**
 * Envía una invitación usando el flujo nativo de Supabase
 * (supabase.auth.admin.inviteUserByEmail), lo que dispara el template de
 * correo "Invite user" configurado en el Dashboard. El invitado termina en
 * /auth/invite?invite_code=... (InvitationWizard), donde fija su contraseña.
 *
 * Seguridad — la ruta usa la service role y manda correo, así que del body no
 * se cree nada que se pueda contrastar:
 *
 * - La organización, el destinatario y el rol salen de la fila de
 *   `invitations` que identifica `invitationCode`, no del body. Si el body
 *   trae otra organización: 403 y queda registrado (regla 4 del proyecto).
 * - El llamante tiene que ser admin ACTIVO de la organización de esa
 *   invitación (`getServerOrgContextFor` + `requireOrgAdmin`). Antes bastaba
 *   con tener sesión —lo único que exigía el middleware—, así que cualquier
 *   usuario de cualquier organización podía invitar a cualquier correo a
 *   cualquier organización... y, por la rama de "usuario huérfano", borrar
 *   usuarios de auth.users.
 * - El `origin` del body alimenta el enlace del correo: solo se acepta si
 *   coincide con el de la propia petición (mismo criterio que el reenvío).
 * - Rate limit por IP y por destinatario: cada petición manda un correo.
 */

/**
 * 30 invitaciones / 15 min por IP: holgado para dar de alta un equipo entero
 * desde una oficina (IP compartida) y aun así corta el envío masivo.
 * El freno que protege al destinatario es el de abajo, no este.
 */
const INVITE_IP_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };
/** 3 correos / 15 min al mismo destinatario. */
const INVITE_EMAIL_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

/**
 * Misma respuesta para "el código no existe", "está vencido o ya usado", "el
 * correo no es el de la invitación" y "quien llama no es de esa organización".
 * Distinguirlos convertiría la ruta en un oráculo: una sesión cualquiera
 * podría comprobar qué códigos de invitación son válidos en la plataforma.
 * El motivo real queda en los logs del servidor.
 */
function invitacionNoValida() {
  return NextResponse.json({ error: 'Invitación no válida o vencida' }, { status: 404 });
}

function demasiadasPeticiones(rl: RateLimitResult & { blockedKey?: string }, ip: string) {
  const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
  console.warn('Invitación bloqueada por rate limit:', rl.blockedKey, 'ip:', ip);
  return NextResponse.json(
    { error: 'Demasiadas invitaciones seguidas. Intenta de nuevo en unos minutos.' },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body inválido (se espera JSON)' }, { status: 400 });
  }

  try {
    const email = typeof body.email === 'string' ? body.email : '';
    const invitationCode = typeof body.invitationCode === 'string' ? body.invitationCode : '';
    const bodyOrigin = typeof body.origin === 'string' ? body.origin : '';

    if (!email || !invitationCode || !bodyOrigin) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (email, invitationCode, origin)' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const ip = getClientIp(request);

    // El límite por IP va antes de tocar la BD: es el que frena el barrido de
    // códigos. El del destinatario espera a que se sepa quién llama, para que
    // una sesión ajena no pueda agotar la cubeta de un correo legítimo.
    const rlIp = await checkRateLimits([{ key: `invite:send:ip:${ip}`, opts: INVITE_IP_LIMIT }]);
    if (!rlIp.allowed) return demasiadasPeticiones(rlIp, ip);

    const admin = getSupabaseAdmin();

    // ─── 1. La invitación es la fuente de verdad ────────────────────────────
    // `code` no es único en el esquema, así que se coge la más reciente en vez
    // de dejar que `maybeSingle()` reviente con PGRST116.
    const { data: invitation, error: invitationError } = await admin
      .from('invitations')
      .select('code, email, organization_id, role_id, status, expires_at, organizations!inner(name)')
      .eq('code', invitationCode)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (invitationError) {
      console.error('Error buscando la invitación:', invitationError);
      return NextResponse.json({ error: 'Error consultando la invitación' }, { status: 500 });
    }

    if (!invitation) {
      console.warn('Invitación inexistente:', invitationCode, 'ip:', ip);
      return invitacionNoValida();
    }

    // `status = 'pending'` NO implica vigente: una invitación caducada conserva
    // ese estado (misma trampa que arregló el reenvío). `expires_at IS NULL` se
    // trata como "no vence".
    const vigente =
      invitation.status === 'pending' &&
      (invitation.expires_at == null ||
        new Date(invitation.expires_at).getTime() > Date.now());

    if (!vigente) {
      console.warn(
        'Invitación no vigente:', invitationCode,
        'status:', invitation.status, 'expires_at:', invitation.expires_at
      );
      return invitacionNoValida();
    }

    if (String(invitation.email).toLowerCase() !== normalizedEmail) {
      console.warn(
        'El correo del body no es el de la invitación:',
        normalizedEmail, '≠', invitation.email, 'ip:', ip
      );
      return invitacionNoValida();
    }

    const organizationId = invitation.organization_id as number;

    // Regla 4: la organización sale del servidor. El body ya no decide nada,
    // pero si trae una distinta se responde 403 y se deja constancia.
    if (body.organizationId != null && Number(body.organizationId) !== Number(organizationId)) {
      console.warn(
        'Body con organización distinta a la de la invitación:',
        body.organizationId, '≠', organizationId, 'ip:', ip
      );
      return NextResponse.json(
        { error: 'La organización no coincide con la invitación' },
        { status: 403 }
      );
    }

    // ─── 2. Autorización: admin activo de ESA organización ──────────────────
    let ctx: ServerOrgContext;
    try {
      ctx = await getServerOrgContextFor(organizationId);
      requireOrgAdmin(ctx);
    } catch (err) {
      if (!(err instanceof OrgContextError)) throw err;

      if (err.statusCode === 401) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
      }
      // Miembro de la org pero sin rol para invitar: 403 explícito, que no le
      // dice nada que no supiera ya.
      if (err.code === 'ADMIN_REQUIRED') {
        return NextResponse.json({ error: err.message, code: err.code }, { status: 403 });
      }
      // De fuera de la organización: respuesta genérica, para no confirmarle
      // que el código de invitación es bueno.
      console.warn(
        'Invitación pedida desde fuera de la organización:',
        organizationId, err.code, 'ip:', ip
      );
      return invitacionNoValida();
    }

    // ─── 3. Ya con el llamante autorizado, el límite por destinatario ───────
    const rlEmail = await checkRateLimits([
      { key: `invite:send:email:${normalizedEmail}`, opts: INVITE_EMAIL_LIMIT },
    ]);
    if (!rlEmail.allowed) return demasiadasPeticiones(rlEmail, ip);

    // PostgREST devuelve el embed to-one como objeto; se contempla el array por
    // si el join pasara a to-many.
    const orgRel = invitation.organizations as { name?: string } | { name?: string }[] | null;
    const organizationName =
      (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) || 'la organización';

    const safeOrigin = resolveSelfOrigin(request, bodyOrigin, 'Invitación');
    const inviteUrl = `${safeOrigin}/auth/invite?invite_code=${encodeURIComponent(invitation.code)}`;

    /**
     * Metadatos que quedan en auth.users: todo sale de la invitación y de la
     * sesión, nada del body. `invited_by` es quien de verdad hizo la llamada.
     */
    const inviteMetadata = {
      organization_id: organizationId,
      organization_name: organizationName,
      role_id: invitation.role_id,
      invitation_code: invitation.code,
      is_invitation: true,
      invited_by: ctx.userId,
    };

    // ─── 4. Envío ───────────────────────────────────────────────────────────
    // Verificar si el usuario ya existe en auth.users (vía RPC check_email_exists)
    const { data: existsInAuth } = await admin.rpc('check_email_exists', {
      p_email: normalizedEmail,
    });

    // Si el usuario ya existe en auth.users, puede ser:
    // A) Un usuario real con perfil y membresía → usar signInWithOtp (magiclink)
    // B) Un usuario huérfano creado por inviteUserByEmail de una invitación anterior
    //    que nunca completó (sin perfil, sin membresía) → eliminarlo y re-invitar
    //    con inviteUserByEmail para que reciba type=invite y pueda completar su registro.
    if (existsInAuth) {
      // OJO: listUsers() sin paginar devuelve solo la primera página (50), así
      // que en un proyecto grande esta rama no encuentra al huérfano y se cae
      // al magic link de abajo, que también sirve. No hay filtro por correo en
      // la admin API.
      const { data: userList } = await admin.auth.admin.listUsers();
      const existingUser = userList?.users?.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      const meta = (existingUser?.user_metadata ?? {}) as Record<string, unknown>;
      // `deleteUser` sobre auth.users es lo más destructivo del fichero, así
      // que además de "es huérfano" se exige que el huérfano sea DE ESTA
      // organización: con solo `is_invitation`, un admin podía borrar el
      // usuario a medio invitar de otro tenant que compartiera el correo.
      const esHuerfanoDeLaOrg =
        !!existingUser &&
        meta.is_invitation === true &&
        String(meta.organization_id ?? '') === String(organizationId);

      if (esHuerfanoDeLaOrg && existingUser) {
        // Confirmar que no tiene perfil ni membresía en ninguna organización.
        const { data: profile } = await admin
          .from('profiles')
          .select('id')
          .eq('id', existingUser.id)
          .maybeSingle();

        const { data: membership } = await admin
          .from('organization_members')
          .select('id')
          .eq('user_id', existingUser.id)
          .limit(1)
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
              { redirectTo: inviteUrl, data: inviteMetadata }
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
            invitation_code: invitation.code,
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
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo: inviteUrl, data: inviteMetadata }
    );

    if (inviteError) {
      console.error('Error enviando invitación:', inviteError);
      // Si el usuario ya existe, usar el magic link como fallback
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
            data: { invitation_code: invitation.code },
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
  } catch (error: unknown) {
    console.error('Error en /api/auth/invite:', error);
    const message = error instanceof Error && error.message
      ? error.message
      : 'Error inesperado enviando la invitación';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
