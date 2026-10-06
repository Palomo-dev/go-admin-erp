/**
 * POST /api/pos/reservas-mesas/[id]/aviso — avisa al cliente por correo de la
 * decisión del equipo sobre su reserva (Figma 1807:25): confirmada, o
 * rechazada con su motivo y, opcionalmente, otra hora.
 *
 * Body: { otraHora?: 'HH:MM' }.
 *
 * - La organización sale de la sesión (`withOrg`) y la reserva se lee filtrada
 *   por ella (un id ajeno → 404). El correo se arma con el estado GUARDADO,
 *   nunca con uno que mande el navegador: si la reserva no está confirmada ni
 *   cancelada no se envía nada.
 * - Service role solo después de validar la pertenencia (como
 *   `/api/web-orders/[id]/aviso-estado`).
 * - Respeta «Confirmación por correo al cliente» de la sede
 *   (`send_customer_email`).
 */
import { NextResponse } from 'next/server';
import { withOrg, readOrgBody } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getMasterResend, getMasterResendKey } from '@/lib/services/crm/email/resendClient';
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import { correoAvisoReserva, tipoAviso } from '@/lib/services/restaurante/avisoReserva';
import { enlaceGestionReserva } from '@/lib/services/restaurante/recordatorioReserva';

export const dynamic = 'force-dynamic';

const SIN_CACHE = { 'Cache-Control': 'private, no-store' };

export const POST = withOrg(async (ctx, request, routeParams) => {
  const body = await readOrgBody<{ otraHora?: unknown }>(ctx, request, { route: 'pos/reservas-mesas/aviso' });
  const params = (await routeParams?.params) ?? {};
  const id = typeof params.id === 'string' ? params.id : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Reserva inválida' }, { status: 400, headers: SIN_CACHE });
  const otraHora = typeof body?.otraHora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.otraHora) ? body.otraHora : null;

  const db = getServiceClient();
  const { data: r } = await db
    .from('restaurant_reservations')
    .select(
      'id, organization_id, branch_id, customer_name, customer_email, party_size, reservation_date, reservation_time, status, cancellation_reason, manage_token, restaurant_table:restaurant_tables(name, zone), branches!restaurant_reservations_branch_id_fkey(name, address, city)',
    )
    .eq('id', id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404, headers: SIN_CACHE });

  const tipo = tipoAviso(r.status as string);
  if (!tipo) return NextResponse.json({ success: true, enviado: false, motivo: 'estado' }, { headers: SIN_CACHE });
  if (!r.customer_email) return NextResponse.json({ success: true, enviado: false, motivo: 'sin_correo' }, { headers: SIN_CACHE });
  if (!getMasterResendKey()) return NextResponse.json({ success: true, enviado: false, motivo: 'sin_resend' }, { headers: SIN_CACHE });

  const [{ data: ajustes }, { data: org }, { data: dominios }] = await Promise.all([
    db.rpc('fn_ajustes_reserva', { p_org: ctx.organizationId, p_branch: r.branch_id }),
    db.from('organizations').select('name, subdomain').eq('id', ctx.organizationId).maybeSingle(),
    db.from('organization_domains').select('host, domain_type, status, is_primary, is_active').eq('organization_id', ctx.organizationId),
  ]);
  const fila = (Array.isArray(ajustes) ? ajustes[0] : ajustes) as { send_customer_email?: boolean; policy_text?: string | null } | null;
  if (fila && fila.send_customer_email === false) {
    return NextResponse.json({ success: true, enviado: false, motivo: 'apagado' }, { headers: SIN_CACHE });
  }

  const host = hostSitio((dominios ?? []) as DominioDelSitio[], (org as { subdomain?: string | null } | null)?.subdomain ?? null);
  const sede = r.branches as unknown as { name?: string; address?: string | null; city?: string | null } | null;
  const mesa = r.restaurant_table as unknown as { name?: string; zone?: string | null } | null;
  const correo = correoAvisoReserva(
    {
      id: r.id as string,
      customer_name: r.customer_name as string,
      party_size: r.party_size as number,
      reservation_date: r.reservation_date as string,
      reservation_time: r.reservation_time as string,
      status: r.status as string,
      cancellation_reason: (r.cancellation_reason as string | null) ?? null,
      mesa: mesa?.name ? [mesa.name, mesa.zone].filter(Boolean).join(' · ') : null,
      sede: sede?.name ?? null,
      sede_direccion: [sede?.address, sede?.city].filter(Boolean).join(', ') || null,
      organizacion: (org as { name?: string } | null)?.name ?? '',
      politica: fila?.policy_text ?? null,
    },
    tipo,
    {
      enlaceGestion: enlaceGestionReserva(host, (r.manage_token as string | null) ?? null),
      enlaceReservar: host ? `https://${host}/` : null,
      otraHora,
    },
  );

  const remitente = `${process.env.EMAIL_FROM_NAME || 'GO Admin'} <${process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}>`;
  try {
    const { error } = await getMasterResend().emails.send({
      from: remitente,
      to: r.customer_email as string,
      subject: correo.asunto,
      html: correo.html,
      text: correo.texto,
    });
    if (error) throw new Error(error.name);
  } catch (e) {
    console.warn('[pos/reservas-mesas/aviso] envío fallido', { reservation: id, error: e instanceof Error ? e.message : 'error' });
    return NextResponse.json({ success: false, enviado: false, motivo: 'envio' }, { status: 502, headers: SIN_CACHE });
  }
  return NextResponse.json({ success: true, enviado: true, tipo }, { headers: SIN_CACHE });
});
