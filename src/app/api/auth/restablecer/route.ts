import { NextResponse } from 'next/server';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { verificarTokenAcceso } from '@/lib/auth/verificarTokenAcceso';
import { esSesionDeEnlaceReciente } from '@/lib/auth/sesionEnlace';
import { validarContrasenaServidor } from '@/lib/auth/servidorAcceso';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';

/**
 * /api/auth/restablecer — contraseña nueva SIN la actual (R8, decisión v2-5).
 *
 * Solo con una sesión abierta desde un enlace del correo en la última hora
 * (recuperación, invitación, enlace mágico): lo prueba el `amr` del token
 * verificado. Con una sesión normal (contraseña, Google) responde 403
 * `enlace_vencido` y la pantalla ofrece pedir un enlace nuevo; el cambio con
 * la contraseña actual va por Perfil › Seguridad (/api/auth/contrasena).
 *
 * La política única (10 caracteres, distinta del correo, no filtrada) se
 * comprueba aquí; `cerrarOtras` cierra las sesiones de los demás dispositivos.
 *
 * GET → `{ permitido }` para que la pantalla pinte el formulario o el estado
 * «el enlace venció».
 */
const LIMITE_USUARIO = { limit: 10, windowMs: 15 * 60 * 1000 };

async function sesionDelEnlace() {
  const supabase = await getServerUserClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { estado: 'sin_sesion' as const };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const veredicto = await verificarTokenAcceso(session?.access_token);
  if (veredicto.estado !== 'valido' || veredicto.claims.sub !== user.id) return { estado: 'sin_sesion' as const };
  if (!esSesionDeEnlaceReciente(veredicto.claims.amr)) return { estado: 'no_enlace' as const, user };
  return { estado: 'ok' as const, user, accessToken: session!.access_token };
}

export async function GET() {
  const s = await sesionDelEnlace();
  return NextResponse.json({ permitido: s.estado === 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const s = await sesionDelEnlace();
  if (s.estado === 'sin_sesion') return NextResponse.json({ ok: false, codigo: 'enlace_vencido' }, { status: 401 });
  if (s.estado === 'no_enlace') {
    console.warn('[restablecer] intento con una sesión que no viene de un enlace del correo:', s.user.id);
    return NextResponse.json({ ok: false, codigo: 'enlace_vencido' }, { status: 403 });
  }

  let body: { password?: unknown; cerrarOtras?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const rl = await checkRateLimits([{ key: `auth:restablecer:user:${s.user.id}`, opts: LIMITE_USUARIO }], {
    store: getRateLimitStore(),
  });
  if (!rl.allowed) return NextResponse.json({ ok: false, codigo: 'demasiadas' }, { status: 429 });

  const motivo = await validarContrasenaServidor(body.password, s.user.email, 'restablecer');
  if (motivo) return NextResponse.json({ ok: false, codigo: motivo }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(s.user.id, { password: body.password as string });
  if (error) {
    console.error('[restablecer] no se pudo actualizar la contraseña:', error.message);
    return NextResponse.json({ ok: false, codigo: 'inesperado' }, { status: 500 });
  }

  if (body.cerrarOtras !== false) {
    const { error: errSalida } = await admin.auth.admin.signOut(s.accessToken, 'others');
    if (errSalida) console.warn('[restablecer] no se cerraron las otras sesiones:', errSalida.message);
  }
  return NextResponse.json({ ok: true });
}
