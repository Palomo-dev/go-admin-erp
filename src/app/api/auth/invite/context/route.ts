import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { estadoCuentaInvitacion } from '@/lib/auth/cuentaInvitacion';
import { checkRateLimits, getClientIp } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';

/** Pública (se abre desde el correo, sin sesión): freno por IP. */
const CONTEXT_IP_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 };

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
 * Antes el asistente lo deducía en el navegador a partir de la sesión y del
 * perfil, y sin sesión (enlace copiado desde la tabla, token consumido por
 * el prefetch del correo) trataba a un usuario existente como nuevo: le
 * pedía todos los datos y una contraseña nueva… y la API se la cambiaba.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim();
  if (!code || code.length > 128) {
    return NextResponse.json({ error: 'Código de invitación requerido' }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimits([{ key: `invite:context:ip:${ip}`, opts: CONTEXT_IP_LIMIT }]);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Demasiadas solicitudes. Intenta en unos minutos.' }, { status: 429 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('validate_invitation_by_code', { invitation_code: code });
  if (error) {
    console.error('[invite/context] validate_invitation_by_code:', error);
    return NextResponse.json({ error: 'No se pudo validar la invitación' }, { status: 500 });
  }
  const invitacion = Array.isArray(data) ? data[0] : null;
  if (!invitacion) {
    return NextResponse.json({ error: 'Invitación inválida o expirada' }, { status: 404 });
  }

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
      code: invitacion.code,
      role_id: invitacion.role_id,
      organization_id: invitacion.organization_id,
      organization_name: invitacion.organization_name || 'Organización',
      role_name: invitacion.role_name || 'Usuario',
    },
    account_state: estado,
  });
}
