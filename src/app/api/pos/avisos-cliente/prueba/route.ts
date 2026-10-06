import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getMasterResend, getMasterResendKey } from '@/lib/services/crm/email/resendClient';
import { MOMENTOS_AVISO, type MomentoAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { armarVistaPrevia } from '@/lib/services/avisosVistaPrevia';

/**
 * POST /api/pos/avisos-cliente/prueba — «Enviarme una prueba»: manda la
 * vista previa del momento al correo de la SESIÓN (nunca a una dirección del
 * body). El texto lo arma el servidor con la misma función del envío real.
 */
export const POST = withOrg(async (ctx, request) => {
  const body = await readOrgBody<{ momento?: unknown }>(ctx, request, { route: 'pos/avisos-cliente/prueba' });
  const momento = typeof body?.momento === 'string' ? (body.momento as MomentoAviso) : null;
  if (!momento || !(MOMENTOS_AVISO as readonly string[]).includes(momento)) {
    return NextResponse.json({ error: 'Momento inválido', codigo: 'datos_invalidos' }, { status: 400 });
  }
  const { data } = await ctx.supabase.auth.getUser();
  const correo = data.user?.email;
  if (!correo) return NextResponse.json({ error: 'Tu usuario no tiene correo', codigo: 'sin_correo' }, { status: 422 });
  if (!getMasterResendKey()) return NextResponse.json({ error: 'Correo no configurado', codigo: 'sin_proveedor' }, { status: 503 });

  const vista = await armarVistaPrevia(getSupabaseAdmin(), ctx.supabase, ctx.organizationId, momento).catch(() => null);
  if (!vista) return NextResponse.json({ error: 'No se pudo armar la prueba', codigo: 'error' }, { status: 500 });

  const { error } = await getMasterResend().emails.send({
    from: `${process.env.EMAIL_FROM_NAME || 'GO Admin'} <${process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}>`,
    to: correo,
    subject: `[Prueba] ${vista.asunto}`,
    text: vista.texto,
  });
  if (error) return NextResponse.json({ error: 'El proveedor no aceptó el correo', codigo: 'proveedor' }, { status: 502 });
  return NextResponse.json({ ok: true, para: correo });
});
