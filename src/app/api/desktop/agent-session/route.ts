import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/desktop/agent-session
 *
 * Entrega al agente de impresión (Go Admin Desktop o print-agent) un
 * "código de vinculación" de un solo uso para que abra SU PROPIA sesión de
 * Supabase, en vez de reutilizar el refresh token de la sesión web.
 *
 * Por qué: Supabase rota los refresh tokens. Cuando el proceso principal de
 * Electron y el navegador embebido compartían el mismo token, el primero que
 * refrescaba dejaba al otro con un token revocado; al reutilizarlo fuera de
 * la ventana de gracia (10 s) Supabase revocaba la familia completa. En menos
 * de una hora el agente dejaba de latir en silencio y la web del Desktop
 * caía en `refresh_token_not_found`.
 *
 * El código es el `hashed_token` de un magic link generado con la clave de
 * servicio para el correo del usuario de la sesión (nunca otro): el agente lo
 * canjea con `verifyOtp({ token_hash, type: 'magiclink' })` y recibe una
 * familia de tokens independiente. No se envía ningún correo. Caduca según
 * el tiempo de vida de OTP del proyecto y sirve una sola vez.
 */
export const POST = withOrg(async (ctx) => {
  if (!ctx.userEmail) {
    return NextResponse.json({ error: 'La sesión no tiene correo asociado' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: ctx.userEmail,
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[desktop/agent-session] generateLink falló:', error?.message);
    return NextResponse.json({ error: 'No se pudo generar el código de vinculación' }, { status: 500 });
  }

  return NextResponse.json({
    token_hash: tokenHash,
    email: ctx.userEmail,
    organization_id: ctx.organizationId,
    organization_name: ctx.organizationName,
  });
});
