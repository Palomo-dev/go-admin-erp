import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { estadoCuentaInvitacion } from '@/lib/auth/cuentaInvitacion';
import { buscarInvitacionVigentePorCodigo } from '@/lib/auth/invitaciones';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';
import { getRateLimitStore } from '@/lib/security/rateLimitStore';

export const dynamic = 'force-dynamic';

/** Pública (se abre desde el correo, sin sesión): freno por IP. */
const CONTEXT_IP_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };

/**
 * Misma respuesta para «sin código», «formato inválido», «no existe»,
 * «usada», «revocada» y «vencida»: la ruta no es un oráculo de códigos.
 */
function invitacionNoValida() {
  return NextResponse.json({ error: 'Invitación inválida o expirada' }, { status: 404 });
}

/**
 * GET /api/auth/invite/context?code=...
 *
 * Datos que necesita el asistente de invitación ANTES de pintar nada:
 * la invitación (correo, organización, rol) y, sobre todo, el estado de la
 * cuenta del correo invitado, decidido en el servidor:
 *
 *   nueva     → asistente completo: nombre + contraseña.
 *   huerfana  → igual que nueva (la cuenta la creó una invitación anterior
 *               que no se terminó; nadie la ha reclamado).
 *   existente → SOLO confirmar. Sin contraseña, sin datos. Y solo con sesión
 *               propia: enlace mágico o inicio de sesión.
 *
 * Solo responde a quien ya tiene el código (el enlace del correo). No devuelve
 * el código: el navegador ya lo tiene en la URL y no hay por qué repetirlo.
 * El correo completo sí, porque el asistente inicia sesión con él tras crear
 * la cuenta; quien tiene el enlace es el destinatario.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimits(
    [{ key: `invite:context:ip:${ip}`, opts: CONTEXT_IP_LIMIT }],
    { store: getRateLimitStore() },
  );
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.' }, { status: 429 });
  }

  const code = request.nextUrl.searchParams.get('code')?.trim();

  const admin = getSupabaseAdmin();
  let invitacion;
  try {
    invitacion = await buscarInvitacionVigentePorCodigo(admin, code);
  } catch (error) {
    console.error('[invite/context] validate_invitation_by_code:', error);
    return NextResponse.json({ error: 'No se pudo validar la invitación' }, { status: 500 });
  }
  if (!invitacion) return invitacionNoValida();

  let estado: 'nueva' | 'huerfana' | 'existente' = 'nueva';
  try {
    ({ estado } = await estadoCuentaInvitacion(admin, invitacion.email, {
      code: invitacion.code,
      organization_id: invitacion.organization_id,
    }));
  } catch (err) {
    // Ante la duda, el camino seguro: exigir sesión propia.
    console.error('[invite/context] estadoCuentaInvitacion:', err);
    estado = 'existente';
  }

  return NextResponse.json({
    invitation: {
      id: invitacion.id,
      email: invitacion.email,
      role_id: invitacion.role_id,
      organization_id: invitacion.organization_id,
      organization_name: invitacion.organization_name || 'Organización',
      role_name: invitacion.role_name || 'Usuario',
    },
    account_state: estado,
  });
}
