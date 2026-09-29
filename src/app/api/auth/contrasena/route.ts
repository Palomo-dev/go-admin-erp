import { NextResponse } from 'next/server';
import { getServerUserClient } from '@/lib/supabase/server-user';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { clienteAnonimoServidor, validarContrasenaServidor } from '@/lib/auth/servidorAcceso';
import { checkRateLimits } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';

/**
 * POST /api/auth/contrasena — cambio de contraseña desde Perfil › Seguridad
 * (acceso v3, fase 5; docs/design/AUTH-ACCESO-V2.md §13.3).
 *
 * Antes el navegador comprobaba la actual con `signInWithPassword` y cambiaba
 * con `updateUser`, con la regla vieja de 8 caracteres. Ahora:
 *  - exige sesión verificada (`auth.getUser`);
 *  - comprueba la contraseña actual en el servidor, con límite por usuario
 *    (5 intentos cada 15 min: la actual no se puede adivinar desde aquí);
 *  - aplica la política única (10 caracteres, distinta del correo, no filtrada)
 *    y que la nueva no sea igual a la actual;
 *  - por defecto cierra las sesiones de los demás dispositivos.
 * Cuentas sin contraseña (solo Google) reciben `actual_incorrecta`: la definen
 * con «Olvidé mi contraseña».
 */
const LIMITE_USUARIO = { limit: 5, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const supabase = await getServerUserClient();
  const {
    data: { user },
    error: errUsuario,
  } = await supabase.auth.getUser();
  if (errUsuario || !user?.email) return NextResponse.json({ ok: false, codigo: 'sin_sesion' }, { status: 401 });

  let body: { actual?: unknown; nueva?: unknown; cerrarOtras?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, codigo: 'datos' }, { status: 400 });
  }
  const actual = typeof body.actual === 'string' ? body.actual : '';
  const nueva = typeof body.nueva === 'string' ? body.nueva : '';
  if (!actual || !nueva || actual.length > 1024 || nueva.length > 1024) {
    return NextResponse.json({ ok: false, codigo: 'datos' }, { status: 400 });
  }

  const rl = await checkRateLimits([{ key: `auth:contrasena:user:${user.id}`, opts: LIMITE_USUARIO }], {
    store: getRateLimitStore(),
  });
  if (!rl.allowed) return NextResponse.json({ ok: false, codigo: 'demasiadas' }, { status: 429 });

  if (nueva === actual) return NextResponse.json({ ok: false, codigo: 'igual_a_la_actual' }, { status: 400 });
  const motivo = await validarContrasenaServidor(nueva, user.email, 'contrasena');
  if (motivo) return NextResponse.json({ ok: false, codigo: motivo }, { status: 400 });

  // La actual se comprueba abriendo una sesión aparte, sin guardarla, que se cierra enseguida.
  const verificador = clienteAnonimoServidor();
  const { data: prueba, error: errActual } = await verificador.auth.signInWithPassword({ email: user.email, password: actual });
  if (errActual || !prueba.session || prueba.user?.id !== user.id) {
    return NextResponse.json({ ok: false, codigo: 'actual_incorrecta' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: nueva });
  if (error) {
    console.error('[contrasena] no se pudo actualizar la contraseña:', error.message);
    return NextResponse.json({ ok: false, codigo: 'inesperado' }, { status: 500 });
  }

  // Cerrar sesiones: con cerrarOtras (por defecto), 'others' desde la sesión de quien cambia cierra
  // todas las demás, incluida la de comprobación. Sin cerrarOtras, solo se cierra la de comprobación.
  const {
    data: { session: sesionActual },
  } = await supabase.auth.getSession();
  const cerrarOtras = body.cerrarOtras !== false && !!sesionActual?.access_token;
  const { error: errSalida } = cerrarOtras
    ? await admin.auth.admin.signOut(sesionActual!.access_token, 'others')
    : await admin.auth.admin.signOut(prueba.session.access_token, 'local');
  if (errSalida) console.warn('[contrasena] no se cerraron las sesiones previstas:', errSalida.message);
  return NextResponse.json({ ok: true });
}
