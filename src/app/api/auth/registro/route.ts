import { NextResponse, after } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';
import { getSelfOrigin } from '@/lib/security/requestOrigin';
import {
  clienteAnonimoServidor,
  demasiadasSolicitudes,
  normalizarCorreoAcceso,
  validarContrasenaServidor,
} from '@/lib/auth/servidorAcceso';
import { enviarAvisoCuentaExistente } from '@/lib/auth/avisoCuentaExistente';

/**
 * POST /api/auth/registro — paso 1 del registro («Tu cuenta»). Pública.
 *
 * Acceso v3 (decisiones v2-5, v2-6, v2-8 y v2-11; docs/design/AUTH-ACCESO-V2.md §13):
 * - Crea SOLO la cuenta, sin confirmar (`email_confirm: false`) aunque el
 *   proyecto tenga la confirmación apagada, y manda el correo de confirmación.
 *   La organización, la sucursal, el plan y la tarjeta se piden después de
 *   confirmar (/auth/signup/organizacion).
 * - Respuesta UNIFORME: `{ ok: true }` exista o no el correo. Si ya existía, al
 *   dueño del correo le llega el aviso «ya tienes una cuenta» y no se crea nada.
 * - Política única de contraseña en el servidor (10 caracteres, distinta del
 *   correo, no filtrada).
 * - Términos y Privacidad obligatorios: se guarda la fecha de aceptación.
 * - Límite por IP y por correo destino (cada llamada puede mandar un correo).
 */
const LIMITE_IP = { limit: 10, windowMs: 15 * 60 * 1000 };
const LIMITE_CORREO = { limit: 3, windowMs: 60 * 60 * 1000 };
const IDIOMAS = ['es', 'en', 'fr', 'pt'];
const VERSION_TERMINOS = '2026-09-29';

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, codigo: 'datos' }, { status: 400 });
  }

  const correo = normalizarCorreoAcceso(body.correo);
  const nombre = texto(body.nombre, 80);
  const apellido = texto(body.apellido, 80);
  const telefono = texto(body.telefono, 30);
  const idioma = IDIOMAS.includes(String(body.idioma)) ? String(body.idioma) : 'es';
  if (!correo) return NextResponse.json({ ok: false, codigo: 'correo' }, { status: 400 });
  if (!nombre || !apellido) return NextResponse.json({ ok: false, codigo: 'nombre' }, { status: 400 });
  if (body.terminos !== true) return NextResponse.json({ ok: false, codigo: 'terminos' }, { status: 400 });

  const ip = getClientIp(request);
  const rl = await checkRateLimits(
    [
      { key: `auth:registro:ip:${ip}`, opts: LIMITE_IP },
      { key: `auth:registro:correo:${correo}`, opts: LIMITE_CORREO },
    ],
    { store: getRateLimitStore() },
  );
  if (!rl.allowed) return demasiadasSolicitudes(rl.resetAt);

  const motivo = await validarContrasenaServidor(body.password, correo, 'registro');
  if (motivo) return NextResponse.json({ ok: false, codigo: motivo }, { status: 400 });

  const origin = getSelfOrigin(request) ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const admin = getSupabaseAdmin();

  try {
    const { data: existe, error: errExiste } = await admin.rpc('check_email_exists', { p_email: correo });
    if (errExiste) throw errExiste;

    if (existe) {
      // El correo sale después de responder: el formulario no espera al SMTP.
      after(() => enviarAvisoCuentaExistente(correo, origin, idioma).then(() => undefined));
      return NextResponse.json({ ok: true });
    }

    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email: correo,
      password: body.password as string,
      email_confirm: false,
      user_metadata: {
        first_name: nombre,
        last_name: apellido,
        phone: telefono || null,
        preferred_language: idioma,
        terms_accepted_at: new Date().toISOString(),
        terms_version: VERSION_TERMINOS,
        registro: 'v3',
      },
    });
    if (errCrear || !creado.user) {
      // Carrera con otro registro del mismo correo: se responde igual.
      if (/already|registered|exists/i.test(errCrear?.message ?? '')) {
        after(() => enviarAvisoCuentaExistente(correo, origin, idioma).then(() => undefined));
        return NextResponse.json({ ok: true });
      }
      throw errCrear ?? new Error('sin usuario');
    }

    // Perfil desde ya (idioma y teléfono); la organización llega tras confirmar.
    const { error: errPerfil } = await admin.from('profiles').upsert(
      {
        id: creado.user.id,
        email: correo,
        first_name: nombre,
        last_name: apellido,
        phone: telefono || null,
        preferred_language: idioma,
        auth_provider: 'email',
        status: 'active',
      },
      { onConflict: 'id' },
    );
    if (errPerfil) console.warn('[registro] No se pudo crear el perfil (se crea al confirmar):', errPerfil.message);

    // La cuenta ya existe: se responde ya y el correo de confirmación sale después.
    // Esperar al SMTP dejaba el botón girando más de un minuto aunque todo saliera bien.
    after(async () => {
      const inicio = Date.now();
      const { error: errCorreo } = await clienteAnonimoServidor().auth.resend({
        type: 'signup',
        email: correo,
        options: origin ? { emailRedirectTo: `${origin}/auth/signup/organizacion` } : undefined,
      });
      if (errCorreo) console.error('[registro] No se pudo enviar el correo de confirmación:', errCorreo.status ?? '', errCorreo.message);
      else console.info(`[registro] Correo de confirmación enviado en ${Date.now() - inicio} ms`);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[registro] Error inesperado:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, codigo: 'inesperado' }, { status: 500 });
  }
}
