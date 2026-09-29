import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp, type RateLimitResult } from '@/lib/security/rateLimit';
import { resolveSelfOrigin } from '@/lib/security/requestOrigin';
import {
  getServerOrgContext,
  getServerOrgContextFor,
  requireOrgAdmin,
  OrgContextError,
  type ServerOrgContext,
} from '@/lib/utils/orgContext';
import {
  DIAS_VIGENCIA_INVITACION,
  generarCodigoInvitacion,
  normalizarCorreo,
} from '@/lib/auth/invitaciones';

/**
 * Crea (o reenvía) una invitación y manda el correo con el flujo nativo de
 * Supabase (`auth.admin.inviteUserByEmail`, plantilla «Invite user»), o con un
 * enlace mágico si el correo ya tiene cuenta. El invitado termina en
 * /auth/invite?invite_code=... (InvitationWizard).
 *
 * Dos modos, ambos solo para admins ACTIVOS de la organización:
 *
 * - CREAR: `{ email, roleId, branchId?, jobPositionId?, organizationId?, origin }`.
 *   La organización sale de la sesión (`getServerOrgContext`); si el body trae
 *   otra: 403 y queda registrado. El código lo genera el SERVIDOR con
 *   `crypto.randomBytes` (antes `Math.random()` en el navegador).
 * - REENVIAR: `{ invitationId, organizationId?, origin }`. La organización, el
 *   destinatario y el rol salen de la fila; el código se ROTA y la vigencia se
 *   renueva, así que un enlace anterior deja de servir.
 *
 * GO-sec (auditoría de acceso 2026-09-28): el código NUNCA vuelve al
 * navegador del admin — ni `inviteUrl` en la respuesta ni la columna en el
 * listado. Solo viaja en el correo al destinatario.
 *
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Rol 1 = Super Admin: no se asigna por invitación. */
const ROL_NO_INVITABLE = 1;

/**
 * Misma respuesta para «no existe», «ya no está pendiente» y «quien llama no
 * es de esa organización»: la ruta no confirma qué invitaciones existen.
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

function errorDeContexto(err: OrgContextError) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
}

function vence(): string {
  return new Date(Date.now() + DIAS_VIGENCIA_INVITACION * 24 * 3600_000).toISOString();
}

function numeroPositivo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Fila con la que se manda el correo. */
interface InvitacionParaEnviar {
  id: number;
  code: string;
  email: string;
  organization_id: number;
  role_id: number | null;
  organizationName: string;
}

const SELECT_INVITACION = 'id, code, email, organization_id, role_id, status, organizations!inner(name)';

function nombreOrganizacion(fila: Record<string, unknown>): string {
  const orgRel = fila.organizations as { name?: string } | { name?: string }[] | null | undefined;
  return (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) || 'la organización';
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body inválido (se espera JSON)' }, { status: 400 });
  }

  try {
    const bodyOrigin = typeof body.origin === 'string' ? body.origin : '';
    const invitationId = body.invitationId != null ? numeroPositivo(body.invitationId) : null;
    const modoReenvio = body.invitationId != null;

    if (!bodyOrigin || (modoReenvio && !invitationId)) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (invitationId u email + roleId, y origin)' },
        { status: 400 }
      );
    }

    const ip = getClientIp(request);

    // El límite por IP va antes de tocar la BD. El del destinatario espera a
    // que se sepa quién llama, para que una sesión ajena no pueda agotar la
    // cubeta de un correo legítimo.
    const rlIp = await checkRateLimits([{ key: `invite:send:ip:${ip}`, opts: INVITE_IP_LIMIT }]);
    if (!rlIp.allowed) return demasiadasPeticiones(rlIp, ip);

    const admin = getSupabaseAdmin();

    let ctx: ServerOrgContext;
    let invitacion: InvitacionParaEnviar;

    if (modoReenvio) {
      // ─── REENVIAR: la fila manda ─────────────────────────────────────────
      const { data: fila, error } = await admin
        .from('invitations')
        .select(SELECT_INVITACION)
        .eq('id', invitationId)
        .maybeSingle();
      if (error) {
        console.error('Error buscando la invitación:', error);
        return NextResponse.json({ error: 'Error consultando la invitación' }, { status: 500 });
      }
      if (!fila || fila.status !== 'pending') {
        console.warn('Reenvío de invitación inexistente o no pendiente:', invitationId, 'ip:', ip);
        return invitacionNoValida();
      }
      const organizationId = fila.organization_id as number;

      // Regla 5: la organización sale del servidor; si el body trae otra, 403.
      if (body.organizationId != null && Number(body.organizationId) !== Number(organizationId)) {
        console.warn('Body con organización distinta a la de la invitación:', body.organizationId, '≠', organizationId, 'ip:', ip);
        return NextResponse.json({ error: 'La organización no coincide con la invitación' }, { status: 403 });
      }

      try {
        ctx = await getServerOrgContextFor(organizationId);
        requireOrgAdmin(ctx);
      } catch (err) {
        if (!(err instanceof OrgContextError)) throw err;
        if (err.statusCode === 401 || err.code === 'ADMIN_REQUIRED') return errorDeContexto(err);
        console.warn('Reenvío pedido desde fuera de la organización:', organizationId, err.code, 'ip:', ip);
        return invitacionNoValida();
      }

      const email = normalizarCorreo(fila.email as string);
      const rlEmail = await checkRateLimits([{ key: `invite:send:email:${email}`, opts: INVITE_EMAIL_LIMIT }]);
      if (!rlEmail.allowed) return demasiadasPeticiones(rlEmail, ip);

      // Código nuevo y vigencia renovada: el enlace anterior deja de servir.
      const code = generarCodigoInvitacion();
      const { data: actualizada, error: updError } = await admin
        .from('invitations')
        .update({ code, expires_at: vence() })
        .eq('id', invitationId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();
      if (updError || !actualizada) {
        console.error('No se pudo renovar la invitación:', invitationId, updError);
        return invitacionNoValida();
      }

      invitacion = {
        id: fila.id as number,
        code,
        email,
        organization_id: organizationId,
        role_id: (fila.role_id as number | null) ?? null,
        organizationName: nombreOrganizacion(fila),
      };
    } else {
      // ─── CREAR: la organización es la de la sesión ───────────────────────
      const email = typeof body.email === 'string' ? normalizarCorreo(body.email) : '';
      const roleId = numeroPositivo(body.roleId);
      const branchId = body.branchId != null && body.branchId !== '' ? numeroPositivo(body.branchId) : null;
      const jobPositionId =
        typeof body.jobPositionId === 'string' && body.jobPositionId !== '' ? body.jobPositionId : null;

      if (!EMAIL_RE.test(email) || !roleId || roleId === ROL_NO_INVITABLE) {
        return NextResponse.json({ error: 'Datos de la invitación inválidos' }, { status: 400 });
      }
      if ((body.branchId != null && body.branchId !== '' && !branchId) || (jobPositionId && !UUID_RE.test(jobPositionId))) {
        return NextResponse.json({ error: 'Datos de la invitación inválidos' }, { status: 400 });
      }

      try {
        ctx = await getServerOrgContext(request);
        requireOrgAdmin(ctx);
      } catch (err) {
        if (!(err instanceof OrgContextError)) throw err;
        return errorDeContexto(err);
      }
      const organizationId = ctx.organizationId;

      if (body.organizationId != null && Number(body.organizationId) !== Number(organizationId)) {
        console.warn('Body con organización distinta a la de la sesión:', body.organizationId, '≠', organizationId, 'usuario:', ctx.userId, 'ip:', ip);
        return NextResponse.json({ error: 'La organización no coincide con la sesión' }, { status: 403 });
      }

      const validacion = await validarDatosNuevos(admin, organizationId, email, roleId, branchId, jobPositionId);
      if (validacion) return validacion;

      const rlEmail = await checkRateLimits([{ key: `invite:send:email:${email}`, opts: INVITE_EMAIL_LIMIT }]);
      if (!rlEmail.allowed) return demasiadasPeticiones(rlEmail, ip);

      const { data: creada, error: insError } = await admin
        .from('invitations')
        .insert({
          email,
          code: generarCodigoInvitacion(),
          role_id: roleId,
          organization_id: organizationId,
          branch_id: branchId,
          job_position_id: jobPositionId,
          created_by: ctx.userId,
          expires_at: vence(),
          status: 'pending',
        })
        .select(SELECT_INVITACION)
        .single();
      if (insError || !creada) {
        console.error('Error creando la invitación:', insError);
        return NextResponse.json({ error: 'No se pudo crear la invitación' }, { status: 500 });
      }

      invitacion = {
        id: creada.id as number,
        code: creada.code as string,
        email,
        organization_id: organizationId,
        role_id: roleId,
        organizationName: nombreOrganizacion(creada),
      };
    }

    // ─── Envío ──────────────────────────────────────────────────────────────
    const safeOrigin = resolveSelfOrigin(request, bodyOrigin, 'Invitación');
    const enviado = await enviarCorreoInvitacion(admin, invitacion, safeOrigin, ctx.userId);
    if (!enviado) {
      return NextResponse.json(
        {
          error: 'La invitación quedó creada, pero no se pudo enviar el correo. Usa «Reenviar».',
          code: 'CORREO_NO_ENVIADO',
          invitationId: invitacion.id,
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ success: true, invitationId: invitacion.id });
  } catch (error: unknown) {
    console.error('Error en /api/auth/invite:', error);
    return NextResponse.json({ error: 'Error inesperado enviando la invitación' }, { status: 500 });
  }
}

/**
 * Validaciones de una invitación nueva contra la organización de la sesión.
 * Devuelve la respuesta de error, o null si todo está bien.
 */
async function validarDatosNuevos(
  admin: SupabaseClient,
  organizationId: number,
  email: string,
  roleId: number,
  branchId: number | null,
  jobPositionId: string | null,
): Promise<NextResponse | null> {
  const invalido = () => NextResponse.json({ error: 'Datos de la invitación inválidos' }, { status: 400 });

  const { data: rol } = await admin.from('roles').select('id').eq('id', roleId).maybeSingle();
  if (!rol) return invalido();

  if (branchId) {
    const { data: sucursal } = await admin
      .from('branches')
      .select('id')
      .eq('id', branchId)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();
    if (!sucursal) return invalido();
  }

  if (jobPositionId) {
    const { data: cargo } = await admin
      .from('job_positions')
      .select('id')
      .eq('id', jobPositionId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!cargo) return invalido();
  }

  const { data: pendiente } = await admin
    .from('invitations')
    .select('id')
    .eq('email', email)
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle();
  if (pendiente) {
    return NextResponse.json({ error: 'Ya existe una invitación activa para este correo', code: 'YA_INVITADO' }, { status: 409 });
  }

  const { data: perfil } = await admin.from('profiles').select('id').eq('email', email).limit(1).maybeSingle();
  if (perfil) {
    const { data: miembro } = await admin
      .from('organization_members')
      .select('id')
      .eq('user_id', perfil.id)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (miembro) {
      return NextResponse.json({ error: 'Este usuario ya es miembro de la organización', code: 'YA_MIEMBRO' }, { status: 409 });
    }
  }
  return null;
}

/**
 * Manda el correo de la invitación. `true` si salió.
 * Metadatos de auth.users: todo sale de la invitación y de la sesión, nada del
 * body, y sin el código (rota al reenviar y no debe quedar guardado en el JWT).
 */
async function enviarCorreoInvitacion(
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
