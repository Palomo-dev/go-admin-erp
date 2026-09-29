import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { getSelfOrigin } from '@/lib/security/requestOrigin';
import { clienteAnonimoServidor, demasiadasSolicitudes, normalizarCorreoAcceso } from '@/lib/auth/servidorAcceso';

/**
 * POST /api/auth/reenviar-confirmacion — pública (aún no hay sesión).
 *
 * Reenvía el correo de confirmación de la cuenta. Respuesta UNIFORME: 200 con
 * `{ ok: true }` exista o no la cuenta, esté o no confirmada (decisión v2-6,
 * docs/design/AUTH-ACCESO-V2.md §4.2). Antes el login reenviaba desde el
 * navegador en cada intento con el correo sin confirmar y pintaba el
 * resultado. Límite por IP y por correo destino (cada llamada es un correo).
 */
const LIMITE_IP = { limit: 5, windowMs: 15 * 60 * 1000 };
const LIMITE_CORREO = { limit: 3, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const correo = normalizarCorreoAcceso(body.email);
  if (!correo) return NextResponse.json({ ok: false, codigo: 'correo' }, { status: 400 });

  const ip = getClientIp(request);
  const rl = await checkRateLimits(
    [
      { key: `auth:reenviar-confirmacion:ip:${ip}`, opts: LIMITE_IP },
      { key: `auth:reenviar-confirmacion:correo:${correo}`, opts: LIMITE_CORREO },
    ],
    { store: getRateLimitStore() },
  );
  if (!rl.allowed) return demasiadasSolicitudes(rl.resetAt);

  const origin = getSelfOrigin(request);
  try {
    const { error } = await clienteAnonimoServidor().auth.resend({
      type: 'signup',
      email: correo,
      options: origin ? { emailRedirectTo: `${origin}/auth/callback` } : undefined,
    });
    // El error (cuenta inexistente, ya confirmada, límite de Supabase) no se
    // devuelve: solo se registra sin el correo.
    if (error) console.info('[reenviar-confirmacion] Auth respondió:', error.status ?? '', error.code ?? error.message);
  } catch (err) {
    console.error('[reenviar-confirmacion] error inesperado:', err);
  }
  return NextResponse.json({ ok: true });
}
