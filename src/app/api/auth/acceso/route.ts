import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { getServiceClient } from '@/lib/supabase/server-service';
import { clienteAnonimoServidor, demasiadasSolicitudes, normalizarCorreoAcceso } from '@/lib/auth/servidorAcceso';
import { codigoDeErrorAuth } from '@/lib/auth/codigosAcceso';
import { bloqueoVigente, clavesDeAcceso, limpiarFallos, registrarFallo } from '@/lib/auth/bloqueoAcceso';

/**
 * POST /api/auth/acceso — inicio de sesión con correo y contraseña. Pública.
 *
 * Acceso v3, fase 5 (docs/design/AUTH-ACCESO-V2.md §12.4): el login deja de
 * hablar con Auth desde el navegador para que el servidor cuente los fallos y
 * bloquee 15 minutos tras 5 fallos por cuenta + IP (o 20 por IP). Respuestas:
 *  - 200 `{ ok: true, session }`: el navegador la fija con `setSession`, como antes;
 *  - 401 `credenciales`: un único mensaje, exista o no la cuenta;
 *  - 403 `sin_confirmar`: solo llega quien acertó la contraseña;
 *  - 429 `bloqueado` con `bloqueadoHasta`, o `demasiadas` (límite general por IP).
 * Si el contador no responde, falla cerrado (`inesperado`, 503): no se abre la
 * puerta sin poder contar.
 *
 * Límite honesto: quien llame a Auth de Supabase directamente con la clave
 * anónima no pasa por aquí (le quedan los límites propios de Supabase).
 */
const LIMITE_GENERAL_IP = { limit: 60, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return NextResponse.json({ ok: false, codigo: 'credenciales' }, { status: 400 });
  }
  const correo = normalizarCorreoAcceso(body.email);
  const contrasena = typeof body.password === 'string' ? body.password : '';
  if (!correo || !contrasena || contrasena.length > 1024) {
    return NextResponse.json({ ok: false, codigo: 'credenciales' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimits([{ key: `auth:acceso:ip:${ip}`, opts: LIMITE_GENERAL_IP }], { store: getRateLimitStore() });
  if (!rl.allowed) return demasiadasSolicitudes(rl.resetAt);

  const claves = clavesDeAcceso(correo, ip);
  const servicio = getServiceClient();

  try {
    const bloqueo = await bloqueoVigente(servicio, claves);
    if (bloqueo) {
      return demasiadasSolicitudes(bloqueo, { codigo: 'bloqueado', bloqueadoHasta: bloqueo.toISOString() });
    }

    const { data, error } = await clienteAnonimoServidor().auth.signInWithPassword({ email: correo, password: contrasena });

    if (error || !data.session) {
      const codigo = codigoDeErrorAuth(error);
      if (codigo === 'credenciales') {
        const nuevo = await registrarFallo(servicio, claves);
        if (nuevo) return demasiadasSolicitudes(nuevo, { codigo: 'bloqueado', bloqueadoHasta: nuevo.toISOString() });
        return NextResponse.json({ ok: false, codigo }, { status: 401 });
      }
      if (codigo === 'sin_confirmar') return NextResponse.json({ ok: false, codigo }, { status: 403 });
      if (codigo === 'demasiadas') return NextResponse.json({ ok: false, codigo }, { status: 429 });
      console.warn('[acceso] Auth respondió un error no previsto:', error?.status ?? '', error?.code ?? '');
      return NextResponse.json({ ok: false, codigo: 'inesperado' }, { status: 502 });
    }

    await limpiarFallos(servicio, claves);
    return NextResponse.json({ ok: true, session: data.session });
  } catch (err) {
    console.error('[acceso] error inesperado (el contador de intentos no respondió o Auth falló):', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, codigo: 'inesperado' }, { status: 503 });
  }
}
