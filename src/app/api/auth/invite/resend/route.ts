import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';

/**
 * Reenvía un magic link a un usuario con invitación pendiente.
 *
 * Se usa cuando el magic link original fue consumido por email prefetch
 * (Gmail/Outlook abren el link automáticamente al recibir el correo,
 * consumiendo el token antes de que el usuario haga clic).
 *
 * Seguridad — la ruta es PÚBLICA (excluida del middleware en src/middleware.ts)
 * y cada petición dispara un correo vía signInWithOtp:
 * - Rate limit por IP y por correo destino: sin él se puede bombardear a un
 *   destinatario o agotar la cuota de envío del proyecto.
 * - Respuesta uniforme: siempre 200 con el mismo mensaje, exista o no la
 *   invitación y falle o no el envío. Antes se devolvía 404 "No hay
 *   invitaciones pendientes" y 200 en el caso bueno, lo que permitía
 *   enumerar qué correos tienen invitación pendiente en la plataforma.
 *   El detalle real queda solo en los logs del servidor.
 * - El `origin` del body alimenta el `emailRedirectTo` del magic link, así que
 *   solo se acepta si coincide con el origin de la propia petición.
 *
 * Flujo:
 * 1. Recibe email + origin
 * 2. Verifica que haya invitación pendiente para ese email
 * 3. Reenvía magic link con signInWithOtp (mismo flujo que invite/route.ts)
 */

/** 5 reenvíos / 15 min por IP: cubre reintentos legítimos, corta el abuso. */
const IP_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
/** 3 correos / 15 min al mismo destinatario, aunque el atacante rote de IP. */
const EMAIL_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Respuesta única para todos los desenlaces posibles (hay invitación, no la
 * hay, está vencida, el envío falló). No revela nada sobre el destinatario.
 */
function genericOk() {
  return NextResponse.json({
    success: true,
    message: 'Si existe una invitación pendiente, te enviamos el enlace.',
  });
}

/**
 * El magic link redirige a `origin`, así que un origin arbitrario del body
 * convertiría el correo en un enlace de phishing con nuestro remitente.
 * Solo se acepta el del propio sitio; si no se puede determinar (p. ej. sin
 * headers de proxy), se acepta el del body como antes.
 */
function resolveOrigin(request: Request, bodyOrigin: string): string {
  const headerOrigin = request.headers.get('origin');
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  const selfOrigin = headerOrigin || (forwardedHost ? `${forwardedProto}://${forwardedHost}` : null);

  if (!selfOrigin) return bodyOrigin;
  if (bodyOrigin === selfOrigin) return bodyOrigin;

  console.warn('Reenvío: origin del body no coincide con el de la petición:', bodyOrigin, '≠', selfOrigin);
  return selfOrigin;
}

export async function POST(request: Request) {
  // El body mal formado es un error del cliente, no un caso que revele nada
  // sobre el destinatario: se responde 400 sin pasar por la respuesta uniforme.
  let body: { email?: unknown; origin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido (se espera JSON)' }, { status: 400 });
  }

  try {
    const { email, origin } = body as { email?: string; origin?: string };

    if (!email || !origin || typeof email !== 'string' || typeof origin !== 'string') {
      return NextResponse.json(
        { error: 'Faltan datos requeridos (email, origin)' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Formato inválido: no gasta cuota de rate limit por email ni toca la BD,
    // pero tampoco distingue casos (un correo mal formado no existe en ningún
    // sitio, así que la respuesta uniforme no filtra nada).
    if (!EMAIL_RE.test(normalizedEmail)) {
      return genericOk();
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimits([
      { key: `invite:resend:ip:${ip}`, opts: IP_LIMIT },
      { key: `invite:resend:email:${normalizedEmail}`, opts: EMAIL_LIMIT },
    ]);
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      console.warn('Reenvío bloqueado por rate limit:', rl.blockedKey, 'ip:', ip);
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const safeOrigin = resolveOrigin(request, origin);

    const admin = getSupabaseAdmin();

    // Buscar invitación pendiente para este email
    // NOTA: la tabla invitations NO tiene organization_name, hay que traerlo
    // via join con organizations. Si se incluye organization_name en el select
    // directo, Postgres retorna 42703 (column does not exist) y el reenvío
    // falla con 500 → el usuario nunca recibe el magic link.
    // `status = 'pending'` NO implica vigente: una invitación caducada conserva
    // ese estado. Sin filtrar por expires_at, pedir el reenvío revivía una
    // invitación vencida con un magic link nuevo y válido.
    // `expires_at IS NULL` se trata como "no vence" (hoy no hay ninguna así).
    const { data: pendingInvite, error: inviteError } = await admin
      .from('invitations')
      .select('code, organization_id, role_id, organizations!inner(name)')
      .eq('email', normalizedEmail)
      .eq('status', 'pending')
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inviteError) {
      console.error('Error buscando invitación pendiente:', inviteError);
      return genericOk();
    }

    if (!pendingInvite) {
      console.log('Reenvío: no hay invitación pendiente vigente para', normalizedEmail);
      return genericOk();
    }

    const inviteUrl = `${safeOrigin}/auth/invite?invite_code=${pendingInvite.code}`;
    // PostgREST devuelve el embed to-one como objeto, pero se contempla el array
    // por si el join se convierte en to-many. El fallback cubre ambas ramas.
    const orgRel = pendingInvite.organizations as { name?: string } | { name?: string }[] | null;
    const organizationName =
      (Array.isArray(orgRel) ? orgRel[0]?.name : orgRel?.name) || 'la organización';

    // Reenviar magic link (mismo flujo que invite/route.ts para usuarios existentes)
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
          invitation_code: pendingInvite.code,
          organization_id: pendingInvite.organization_id,
          organization_name: organizationName,
        },
      },
    });

    if (otpError) {
      console.error('Error reenviando Magic Link:', otpError);
      return genericOk();
    }

    console.log('📧 Magic Link reenviado a:', normalizedEmail, 'para invitación:', pendingInvite.code);
    return genericOk();
  } catch (error: any) {
    console.error('Error en /api/auth/invite/resend:', error);
    return genericOk();
  }
}
