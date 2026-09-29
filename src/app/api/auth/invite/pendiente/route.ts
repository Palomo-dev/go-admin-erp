import { NextResponse } from 'next/server';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { getSelfOrigin } from '@/lib/security/requestOrigin';
import { reenviarEnlaceInvitacion } from '@/lib/auth/invitaciones';

/**
 * POST /api/auth/invite/pendiente — con sesión.
 *
 * Tras iniciar sesión con contraseña, un usuario sin organizaciones puede
 * tener una invitación pendiente. Antes el navegador leía el CÓDIGO de esa
 * invitación directamente de `invitations` (política del invitado) y saltaba
 * al asistente. Pero el proyecto confirma los correos al registrarse, así que
 * una sesión NO prueba que se controle el buzón: quien registrara un correo
 * ajeno sin cuenta habría recibido el código.
 *
 * Ahora el servidor manda el enlace AL BUZÓN y solo dice si lo mandó. El
 * código nunca sale de aquí.
 */

/** 3 envíos / 15 min por usuario: cada uno es un correo. */
const USER_LIMIT = { limit: 3, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const supabase = await getServerUserClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return NextResponse.json({ error: 'No hay sesión activa' }, { status: 401 });
  }

  const origin = getSelfOrigin(request);
  if (!origin) {
    return NextResponse.json({ enlaceEnviado: false });
  }

  const rl = await checkRateLimits(
    [{ key: `invite:pendiente:user:${user.id}`, opts: USER_LIMIT }],
    { store: getRateLimitStore() },
  );
  if (!rl.allowed) {
    console.warn('invite/pendiente bloqueado por rate limit:', user.id, 'ip:', getClientIp(request));
    return NextResponse.json({ error: 'Demasiados intentos. Intenta en unos minutos.' }, { status: 429 });
  }

  try {
    const { enviado } = await reenviarEnlaceInvitacion(getSupabaseAdmin(), user.email, origin);
    return NextResponse.json({ enlaceEnviado: enviado });
  } catch (err) {
    console.error('[invite/pendiente] error:', err);
    return NextResponse.json({ enlaceEnviado: false });
  }
}
