/**
 * GET|POST /api/cron/reservas-mesas — recordatorio de la reserva de mesa al cliente.
 *
 * Lo llama pg_cron cada 15 min (`fn_crm_cron_post('/api/cron/reservas-mesas')`,
 * migración D5; URL y secreto en Vault). `withCron` exige el secreto
 * (fail-closed).
 *
 * 1. `fn_reservas_mesa_recordatorios_reclamar(50)` marca y devuelve las
 *    reservas a recordar ya (solo sedes con `reminder_hours_before` y
 *    `send_customer_email`: opt-in desde la configuración de reservas).
 * 2. Envía el correo con el Resend de la plataforma. Si el envío falla, la
 *    reserva vuelve a quedar pendiente (`reminder_sent_at = NULL`) para el
 *    siguiente barrido.
 *
 * El aviso «no ha llegado» al equipo no pasa por aquí: lo hace la base
 * (`fn_reservas_mesa_avisos_retraso`, cada 5 min).
 */
import { NextResponse } from 'next/server';
import { withCron } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getMasterResend, getMasterResendKey } from '@/lib/services/crm/email/resendClient';
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import {
  correoRecordatorioReserva,
  enlaceGestionReserva,
  type DatosRecordatorio,
} from '@/lib/services/restaurante/recordatorioReserva';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Reclamada extends DatosRecordatorio {
  reservation_id: string;
  organization_id: number;
  customer_email: string;
}

async function hostsDeOrganizaciones(ids: number[]): Promise<Map<number, string | null>> {
  const service = getServiceClient();
  const [orgs, dominios] = await Promise.all([
    service.from('organizations').select('id, subdomain').in('id', ids),
    service
      .from('organization_domains')
      .select('organization_id, host, domain_type, status, is_primary, is_active')
      .in('organization_id', ids),
  ]);
  const porOrg = new Map<number, DominioDelSitio[]>();
  (dominios.data ?? []).forEach((d: DominioDelSitio & { organization_id: number }) => {
    const lista = porOrg.get(d.organization_id) ?? [];
    lista.push(d);
    porOrg.set(d.organization_id, lista);
  });
  const hosts = new Map<number, string | null>();
  (orgs.data ?? []).forEach((o: { id: number; subdomain: string | null }) => {
    hosts.set(o.id, hostSitio(porOrg.get(o.id) ?? [], o.subdomain));
  });
  return hosts;
}

async function procesar(): Promise<NextResponse> {
  if (!getMasterResendKey()) {
    // Sin proveedor no se reclama nada: las reservas siguen pendientes.
    return NextResponse.json({ enviados: 0, omitido: 'sin_resend' }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const service = getServiceClient();
  const { data, error } = await service.rpc('fn_reservas_mesa_recordatorios_reclamar', { p_limite: 50 });
  if (error) {
    console.error('[cron/reservas-mesas] reclamar', error.code);
    return NextResponse.json({ error: 'No se pudieron leer los recordatorios', code: 'ERROR_INTERNO' }, { status: 500 });
  }
  const reclamadas = (data ?? []) as Reclamada[];
  if (reclamadas.length === 0) return NextResponse.json({ enviados: 0 }, { headers: { 'Cache-Control': 'no-store' } });

  const hosts = await hostsDeOrganizaciones(Array.from(new Set(reclamadas.map((r) => r.organization_id))));
  const remitente = `${process.env.EMAIL_FROM_NAME || 'GO Admin'} <${process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}>`;
  let enviados = 0;
  const fallidas: string[] = [];

  for (const r of reclamadas) {
    const enlace = enlaceGestionReserva(hosts.get(r.organization_id) ?? null, r.manage_token);
    const correo = correoRecordatorioReserva(r, enlace);
    try {
      const { error: errEnvio } = await getMasterResend().emails.send({
        from: remitente,
        to: r.customer_email,
        subject: correo.asunto,
        html: correo.html,
        text: correo.texto,
      });
      if (errEnvio) throw new Error(errEnvio.name);
      enviados += 1;
    } catch (e) {
      console.warn('[cron/reservas-mesas] envío fallido', { reservation: r.reservation_id, error: e instanceof Error ? e.message : 'error' });
      fallidas.push(r.reservation_id);
    }
  }

  if (fallidas.length > 0) {
    await service.from('restaurant_reservations').update({ reminder_sent_at: null }).in('id', fallidas);
  }
  return NextResponse.json({ enviados, fallidos: fallidas.length }, { headers: { 'Cache-Control': 'no-store' } });
}

const manejar = async () => {
  try {
    return await procesar();
  } catch (err) {
    console.error('[cron/reservas-mesas]', err instanceof Error ? err.name : 'error');
    return NextResponse.json({ error: 'No se pudieron enviar los recordatorios', code: 'ERROR_INTERNO' }, { status: 500 });
  }
};

export const GET = withCron(manejar);
export const POST = withCron(manejar);
