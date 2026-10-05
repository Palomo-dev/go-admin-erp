/**
 * Correo al agendar una reunión. No deshace el evento si el envío falla.
 * El cliente entra solo cuando `customers.email` es una dirección.
 * El responsable es el vendedor de la oportunidad; si no hay, quien quedó
 * asignado al evento.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { decisionCorreoOperativo, veredictoCorreoOperativo } from '@/lib/services/cuentaCorreo';
import { sendEmail, type SendEmailActor } from '@/lib/services/crm/email/sendService';
import { EmailError } from '@/lib/services/crm/email/types';
import { buildIcs } from '@/lib/services/crm/meetingsIcs';
import { formatDateTimeInTz, formatTimeInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import {
  correoValido,
  destinatariosReunion,
  textoReunion,
  type AvisoReunion,
  type RolCorreoReunion,
} from './reunionCorreo';

export interface ReunionParaCorreo {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start_at: string;
  end_at: string;
  timezone?: string | null;
  assigned_to?: string | null;
  customer_id?: string | null;
  opportunity_id?: string | null;
  attendees?: readonly string[] | null;
}

const FALLIDOS = new Set(['failed', 'bounced', 'complained']);

function cuandoDe(inicio: string, fin: string, zona: string): string {
  const desde = new Date(inicio);
  const hasta = new Date(fin);
  if (Number.isNaN(desde.getTime())) return inicio;
  const mismoDia = !Number.isNaN(hasta.getTime()) && toPlainDate(desde, zona) === toPlainDate(hasta, zona);
  if (mismoDia) return `${formatDateTimeInTz(desde, zona)}–${formatTimeInTz(hasta, zona)}`;
  return `${formatDateTimeInTz(desde, zona)} – ${formatDateTimeInTz(hasta, zona)}`;
}

async function correoDeUsuario(db: SupabaseClient, orgId: number, userId: string | null): Promise<{ correo: string | null; nombre?: string }> {
  if (!userId) return { correo: null };
  const { data: miembro, error: errorMiembro } = await db
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (errorMiembro || !miembro) return { correo: null };
  const { data: perfil, error } = await db.from('profiles').select('email, first_name, last_name').eq('id', userId).maybeSingle();
  if (error || !perfil) return { correo: null };
  const fila = perfil as { email?: string | null; first_name?: string | null; last_name?: string | null };
  const nombre = [fila.first_name, fila.last_name].map((parte) => (parte ?? '').trim()).filter(Boolean).join(' ');
  return { correo: correoValido(fila.email), nombre: nombre || undefined };
}

export async function notificarReunion(
  orgId: number,
  actor: SendEmailActor,
  evento: ReunionParaCorreo,
  supabase: SupabaseClient,
): Promise<AvisoReunion> {
  const aviso: AvisoReunion = { cliente: false, responsable: false };
  try {
    // Si la lectura falla, el aviso sale: quien agenda ya pasó el control de acceso.
    const decision = decisionCorreoOperativo(await veredictoCorreoOperativo(supabase, orgId));
    if (decision === 'omitir') return aviso;
    let correoCliente: string | null = null;
    let nombreCliente: string | null = null;
    if (evento.customer_id) {
      const { data, error } = await supabase
        .from('customers')
        .select('email, full_name')
        .eq('id', evento.customer_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) console.error('[reunion] cliente', error.message);
      const fila = data as { email?: string | null; full_name?: string | null } | null;
      correoCliente = correoValido(fila?.email);
      nombreCliente = (fila?.full_name ?? '').trim() || null;
    }

    let responsableId = evento.assigned_to ?? null;
    if (evento.opportunity_id) {
      const { data, error } = await supabase
        .from('opportunities')
        .select('salesperson_id')
        .eq('id', evento.opportunity_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) console.error('[reunion] responsable', error.message);
      const vendedor = (data as { salesperson_id?: string | null } | null)?.salesperson_id ?? null;
      if (vendedor) responsableId = vendedor;
    }
    const responsable = await correoDeUsuario(supabase, orgId, responsableId);
    const destinatarios = destinatariosReunion({
      correoCliente,
      correoResponsable: responsable.correo,
      otros: evento.attendees,
    });
    if (destinatarios.length === 0) return aviso;

    let zona = (evento.timezone ?? '').trim();
    if (!zona) {
      const { getOrganizationTimezone } = await import('@/lib/services/organizationTimezoneService');
      zona = await getOrganizationTimezone(orgId, supabase);
    }
    const organizador = responsable.correo ?? correoValido(actor.userEmail);
    const ics = organizador
      ? buildIcs({
          uid: evento.id,
          title: evento.title,
          description: evento.description,
          location: evento.location,
          startAt: evento.start_at,
          endAt: evento.end_at,
          organizerEmail: organizador,
          organizerName: responsable.nombre,
          attendees: destinatarios.map((d) => d.correo),
        })
      : null;
    const copia = textoReunion({
      titulo: evento.title,
      cuando: cuandoDe(evento.start_at, evento.end_at, zona),
      zona,
      cliente: nombreCliente,
      lugar: evento.location,
      agenda: evento.description,
      conArchivo: Boolean(ics),
    });
    const adjunto = ics
      ? [{ filename: 'reunion.ics', content_base64: Buffer.from(ics, 'utf8').toString('base64'), content_type: 'text/calendar' }]
      : undefined;
    const relatedType = evento.opportunity_id ? 'opportunity' : evento.customer_id ? 'customer' : undefined;
    const relatedId = evento.opportunity_id ?? evento.customer_id ?? undefined;

    for (const destino of destinatarios) {
      const salio = await enviarUno(orgId, actor, supabase, {
        eventoId: evento.id,
        destino,
        copia,
        adjunto,
        customerId: destino.rol === 'cliente' ? evento.customer_id ?? null : null,
        relatedType,
        relatedId,
      });
      if (destino.rol === 'cliente') aviso.cliente = salio;
      if (destino.rol === 'responsable') aviso.responsable = salio;
    }
    return aviso;
  } catch (err) {
    console.error('[reunion] aviso', err instanceof Error ? err.name : 'error');
    return aviso;
  }
}

async function enviarUno(
  orgId: number,
  actor: SendEmailActor,
  supabase: SupabaseClient,
  envio: {
    eventoId: string;
    destino: { correo: string; rol: RolCorreoReunion };
    copia: { asunto: string; texto: string; html: string };
    adjunto?: { filename: string; content_base64: string; content_type: string }[];
    customerId: string | null;
    relatedType?: string;
    relatedId?: string;
  },
): Promise<boolean> {
  try {
    const resultado = await sendEmail(orgId, actor, {
      to: [envio.destino.correo],
      to_customer_id: envio.customerId,
      subject: envio.copia.asunto,
      content: { html: envio.copia.html, text: envio.copia.texto },
      attachments: envio.adjunto,
      related_type: envio.relatedType,
      related_id: envio.relatedId,
      kind: 'transactional',
      client_request_id: `reunion:${envio.eventoId}:${envio.destino.rol}:${envio.destino.correo}`,
      strict_variables: false,
      avisoMiembro: envio.destino.rol === 'responsable',
    }, supabase);
    const duplicado = resultado.warnings.includes('duplicate_client_request');
    if (duplicado && FALLIDOS.has(resultado.message.status)) return false;
    return true;
  } catch (err) {
    console.error('[reunion] correo', envio.destino.rol, err instanceof EmailError ? err.code : 'error');
    return false;
  }
}
