/**
 * Correo al cliente cuando cambia el estado de su pedido web (paquete E).
 *
 * SOLO servidor. Port de `goadmin-websites/lib/email/send-order-status-email.ts`
 * (el ERP no puede importar del repo del sitio): mismos estados, mismos textos
 * y el enlace de seguimiento con el MISMO token que emite el sitio
 * (`goadmin-websites/lib/orders/tokenSeguimiento.ts`: HMAC-SHA256 de
 * `<organization_id>:<order_id>`, base64url, 32 caracteres; secreto
 * `ORDER_TRACKING_SECRET` o, si falta, derivado de la service role). Si los dos
 * repos no calculan el mismo token, el enlace abre el seguimiento sin datos
 * personales: no rompe nada, pero hay que mantenerlos iguales.
 *
 * Nunca lanza: un correo que no sale no puede tumbar un cambio de estado. La
 * organización la pone quien llama desde la sesión (`withOrg`) o desde el
 * propio pedido (server-to-server con secreto); el pedido se lee SIEMPRE
 * filtrando por esa organización.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'crypto';
import { getMasterResend, getMasterResendKey } from '@/lib/services/crm/email/resendClient';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';

/** Estados que avisan al cliente. `pending` no: ese correo lo manda el sitio al crear el pedido. */
export const ESTADOS_CON_AVISO = ['confirmed', 'preparing', 'ready', 'in_delivery', 'delivered', 'cancelled', 'rejected'] as const;
export type EstadoConAviso = (typeof ESTADOS_CON_AVISO)[number];

const ESTADOS: Record<EstadoConAviso, { titulo: string; mensaje: string; color: string }> = {
  confirmed: { titulo: 'Pedido confirmado', mensaje: 'Tu pedido ha sido confirmado y pronto comenzaremos a prepararlo.', color: '#3B82F6' },
  preparing: { titulo: 'Estamos preparando tu pedido', mensaje: 'Nuestro equipo ya está trabajando en tu pedido.', color: '#8B5CF6' },
  ready: { titulo: '¡Tu pedido está listo!', mensaje: 'Tu pedido está listo para recoger o saldrá pronto.', color: '#10B981' },
  in_delivery: { titulo: 'Tu pedido va en camino', mensaje: 'Un repartidor está llevando tu pedido a la dirección indicada.', color: '#3B82F6' },
  delivered: { titulo: '¡Pedido entregado!', mensaje: 'Tu pedido ha sido entregado. ¡Esperamos que lo disfrutes!', color: '#059669' },
  cancelled: { titulo: 'Pedido cancelado', mensaje: 'Lamentamos informarte que tu pedido ha sido cancelado.', color: '#EF4444' },
  rejected: { titulo: 'No pudimos aceptar tu pedido', mensaje: 'El negocio no pudo aceptar tu pedido. Si ya pagaste, te devolveremos el dinero.', color: '#EF4444' },
};

export function esEstadoConAviso(estado: string | null | undefined): estado is EstadoConAviso {
  return !!estado && (ESTADOS_CON_AVISO as readonly string[]).includes(estado);
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function secretoSeguimiento(): Buffer | null {
  const propio = process.env.ORDER_TRACKING_SECRET;
  if (propio && propio.length >= 16) return Buffer.from(propio);
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole) return createHash('sha256').update(`seguimiento-pedido:${serviceRole}`).digest();
  return null;
}

/** Token de seguimiento: el mismo algoritmo que goadmin-websites/lib/orders/tokenSeguimiento.ts. */
export function tokenSeguimiento(organizationId: number, orderId: string): string | null {
  const s = secretoSeguimiento();
  if (!s) return null;
  return createHmac('sha256', s).update(`${organizationId}:${orderId}`).digest('base64url').slice(0, 32);
}

/** Origen público del sitio de la organización (dominio propio o subdominio de la plataforma). */
export function origenSitio(org: { custom_domain?: string | null; subdomain?: string | null }): string {
  if (org.custom_domain) return `https://${org.custom_domain}`;
  if (org.subdomain) return `https://${org.subdomain}.goadmin.io`;
  return '';
}

export function urlSeguimiento(
  org: { id: number; custom_domain?: string | null; subdomain?: string | null },
  pedido: { id: string; order_number: string },
): string | null {
  const origen = origenSitio(org);
  if (!origen) return null;
  const t = tokenSeguimiento(org.id, pedido.id);
  return `${origen}/pedido/${encodeURIComponent(pedido.order_number)}${t ? `?t=${t}` : ''}`;
}

export interface CorreoEstadoPedido {
  asunto: string;
  html: string;
  text: string;
}

/** Arma el correo (puro: se testea sin red). */
export function armarCorreoEstado(datos: {
  estado: EstadoConAviso;
  numeroPedido: string;
  nombreCliente: string;
  nombreNegocio: string;
  urlSeguimiento: string | null;
  horaEstimada?: string | null;
  motivo?: string | null;
}): CorreoEstadoPedido {
  const c = ESTADOS[datos.estado];
  const negocio = datos.nombreNegocio.trim();
  const filas = [
    ['Pedido', escapar(datos.numeroPedido)],
    ['Estado', escapar(c.titulo)],
    ...(datos.horaEstimada ? [['Hora estimada', escapar(datos.horaEstimada)]] : []),
    ...(datos.motivo ? [['Motivo', escapar(datos.motivo)]] : []),
  ]
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;font-size:13px;">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#333;">${v}</td></tr>`)
    .join('');
  const boton = datos.urlSeguimiento
    ? `<div style="text-align:center;margin-top:24px;"><a href="${escapar(datos.urlSeguimiento)}" style="display:inline-block;background:${c.color};color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver estado de mi pedido</a></div>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
<div style="background:${c.color}10;padding:32px;text-align:center;border-radius:8px 8px 0 0;">
<h1 style="margin:0;color:${c.color};font-size:22px;">${escapar(c.titulo)}</h1>
${negocio ? `<p style="margin:8px 0 0;color:#666;font-size:13px;">${escapar(negocio)}</p>` : ''}
</div>
<div style="padding:24px;">
<p style="color:#333;font-size:15px;">Hola <strong>${escapar(datos.nombreCliente || 'cliente')}</strong>,</p>
<p style="color:#666;font-size:14px;">${escapar(c.mensaje)}</p>
<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:20px 0;"><table style="width:100%;border-collapse:collapse;">${filas}</table></div>
${boton}
</div></div>`;
  const text = [
    `Hola ${datos.nombreCliente || 'cliente'},`,
    c.mensaje,
    `Pedido ${datos.numeroPedido}: ${c.titulo}`,
    datos.horaEstimada ? `Hora estimada: ${datos.horaEstimada}` : '',
    datos.motivo ? `Motivo: ${datos.motivo}` : '',
    datos.urlSeguimiento ? `Seguimiento: ${datos.urlSeguimiento}` : '',
  ].filter(Boolean).join('\n');
  const asunto = `${c.titulo} — Pedido ${datos.numeroPedido}${negocio ? ` · ${negocio}` : ''}`;
  return { asunto, html, text };
}

/**
 * Envía el aviso del estado ACTUAL del pedido. Devuelve si salió (para logs).
 * `organizationId` sale de la sesión o del propio pedido, nunca de un body.
 */
export async function enviarCorreoEstadoPedido(
  db: SupabaseClient,
  organizationId: number,
  orderId: string,
): Promise<boolean> {
  try {
    if (!getMasterResendKey()) return false;
    const { data: pedido, error } = await db
      .from('web_orders')
      .select('id, organization_id, order_number, status, customer_email, customer_name, estimated_ready_at, estimated_delivery_at, cancellation_reason')
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error || !pedido || !pedido.customer_email || !esEstadoConAviso(pedido.status)) return false;

    const { data: org } = await db
      .from('organizations')
      .select('id, name, subdomain, custom_domain')
      .eq('id', organizationId)
      .maybeSingle();
    if (!org) return false;

    const zona = await getOrganizationTimezone(organizationId, db);
    const estimada = pedido.status === 'in_delivery' ? pedido.estimated_delivery_at : pedido.estimated_ready_at;
    const correo = armarCorreoEstado({
      estado: pedido.status,
      numeroPedido: pedido.order_number,
      nombreCliente: pedido.customer_name ?? '',
      nombreNegocio: org.name ?? '',
      urlSeguimiento: urlSeguimiento(org, pedido),
      horaEstimada: ['confirmed', 'preparing', 'in_delivery'].includes(pedido.status) && estimada
        ? formatTimeInTz(estimada, zona)
        : null,
      motivo: ['cancelled', 'rejected'].includes(pedido.status) ? pedido.cancellation_reason : null,
    });
    const remitente = `${(org.name || process.env.EMAIL_FROM_NAME || 'GO Admin').replace(/[<>"]/g, '')} <${process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}>`;
    const { error: envioError } = await getMasterResend().emails.send({
      from: remitente,
      to: pedido.customer_email,
      subject: correo.asunto,
      html: correo.html,
      text: correo.text,
    });
    if (envioError) {
      console.warn('[orderStatusEmail] Resend no envió el aviso de estado', { orderId, estado: pedido.status, error: envioError.name });
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[orderStatusEmail] Error enviando el aviso de estado', { orderId, err: err instanceof Error ? err.message : err });
    return false;
  }
}
