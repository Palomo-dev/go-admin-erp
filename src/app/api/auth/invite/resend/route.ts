import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { resolveSelfOrigin } from '@/lib/security/requestOrigin';
import { reenviarEnlaceInvitacion } from '@/lib/auth/invitaciones';

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
 *   destinatario o agotar la cuota de envío del proyecto. Con
 *   `RATE_LIMIT_STORE=db` el contador es persistente y atómico entre
 *   instancias (F0-SEC r2); si el backend falla, se bloquea (fail-closed).
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
    ], { store: getRateLimitStore() });
    if (!rl.allowed) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      console.warn('Reenvío bloqueado por rate limit:', rl.blockedKey, 'ip:', ip);
      return NextResponse.json(
        { error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      );
    }

    const safeOrigin = resolveSelfOrigin(request, origin, 'Reenvío');

    // Búsqueda (solo vigentes) y envío en el servicio compartido con
    // /auth/verify: el enlace va al buzón, nunca a quien hace la petición.
    const { enviado } = await reenviarEnlaceInvitacion(getSupabaseAdmin(), normalizedEmail, safeOrigin);
    console.log('Reenvío de invitación:', enviado ? 'enviado' : 'sin invitación vigente o fallido');
    return genericOk();
  } catch (error: unknown) {
    console.error('Error en /api/auth/invite/resend:', error);
    return genericOk();
  }
}
