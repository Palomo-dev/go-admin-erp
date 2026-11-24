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
 * Marca (2026-11-09): el correo lleva el logo público de la organización y el color principal
 * del sitio web (o, si falta, el de la organización) en la cabecera y el botón. Cancelado y
 * rechazado conservan el rojo.
 *
 * Remitente (2026-11-18): sale del dominio verificado de la organización (`resolveSender` de
 * `email_domains`, igual que el correo de cambios del pedido): «<nombre visible o nombre de la org>
 * <pedidos@dominio>» con su API key y el Reply-To de los ajustes de avisos o, si no hay, el del
 * dominio. Sin dominio verificado, o si `resolveSender` falla por cualquier motivo (NO_SENDER
 * incluido), el remitente de siempre (EMAIL_FROM_ADDRESS con la key maestra): el aviso no deja
 * de salir por el remitente.
 *
 * Nunca lanza: un correo que no sale no puede tumbar un cambio de estado. La
 * organización la pone quien llama desde la sesión (`withOrg`) o desde el
 * propio pedido (server-to-server con secreto); el pedido se lee SIEMPRE
 * filtrando por esa organización.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'crypto';
import { getMasterResend, getMasterResendKey, getResendClient } from '@/lib/services/crm/email/resendClient';
import { resolveSender } from '@/lib/services/crm/email/domainsService';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { formatEstimateInTz } from '@/lib/utils/dateDisplay';
import { avisarClientePedido, avisarNovedadPedido, nombreTipoOrg, type PedidoParaAviso } from '@/lib/services/avisosClienteService';
import { motivoNovedadCliente, rubroDeTipoOrg, type CanalAviso, type DatosAviso } from '@/lib/pos/pedidosWeb/avisosCliente';
import { datosEnvioParaAviso, envioDelPedidoWeb } from '@/lib/services/logistica/avisosEnvioService';
import { formatPlainDate } from '@/lib/utils/dateDisplay';
import { hostPublicoOrg } from '@/lib/website/urlPublicaOrg.server';
import { remitenteComprador } from '@/lib/services/remitenteCompradores';

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

/** Enlace de seguimiento. `host` ya es el de `hostSitio` / `fn_url_publica_org`, sin esquema. */
export function urlSeguimiento(
  org: { id: number; host: string | null },
  pedido: { id: string; order_number: string },
): string | null {
  if (!org.host) return null;
  const t = tokenSeguimiento(org.id, pedido.id);
  return `https://${org.host}/pedido/${encodeURIComponent(pedido.order_number)}${t ? `?t=${t}` : ''}`;
}

export interface CorreoEstadoPedido {
  asunto: string;
  html: string;
  text: string;
}

/** Marca del negocio para el correo: logo público y color principal. */
export interface MarcaCorreo {
  logoUrl?: string | null;
  color?: string | null;
}

/** Estados que conservan su rojo aunque el negocio tenga color propio. */
const ESTADOS_EN_ROJO: ReadonlySet<EstadoConAviso> = new Set(['cancelled', 'rejected']);

/** `#RGB` o `#RRGGBB` → `#RRGGBB` en mayúsculas. Cualquier otra cosa → null (nunca llega al CSS). */
export function normalizarColor(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].split('').map((d) => d + d).join('') : m[1];
  return `#${hex.toUpperCase()}`;
}

/** Solo una URL absoluta `https:`: una ruta interna de storage o un `data:` no se muestran. */
export function logoPublico(valor: string | null | undefined): string | null {
  const v = (valor ?? '').trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}

/** Contraste WCAG contra el blanco. */
function contrasteConBlanco(hex: string): number {
  return 1.05 / (luminancia(hex) + 0.05);
}

/** Arma el correo (puro: se testea sin red). */
export function armarCorreoEstado(datos: {
  estado: EstadoConAviso;
  numeroPedido: string;
  nombreCliente: string;
  nombreNegocio: string;
  urlSeguimiento: string | null;
  /** Ya formateadas en la zona de la org con su día ("hoy, 14:26", "mié 11 nov, 14:26"). */
  listoAprox?: string | null;
  entregaAprox?: string | null;
  motivo?: string | null;
  marca?: MarcaCorreo | null;
  /** Una tienda no «prepara»: alista para el envío o para recoger. */
  rubro?: DatosAviso['rubro'];
  conEnvio?: boolean;
  /**
   * Logística Fase 1 (Figma 2805:5220): domiciliario (primer nombre), código de entrega (solo en
   * contraentrega, «en camino») y «Pagas al recibir».
   */
  envio?: { domiciliario?: string | null; codigo?: string | null; pagaAlRecibir?: string | null } | null;
}): CorreoEstadoPedido {
  const estadoBase = { ...ESTADOS[datos.estado] };
  if (datos.estado === 'confirmed' && datos.rubro === 'tienda') {
    estadoBase.mensaje = datos.conEnvio
      ? 'Tu pedido ha sido confirmado y pronto lo alistaremos para el envío.'
      : 'Tu pedido ha sido confirmado y pronto lo alistaremos para que lo recojas.';
  }
  const colorMarca = ESTADOS_EN_ROJO.has(datos.estado) ? null : normalizarColor(datos.marca?.color);
  const c = { ...estadoBase, color: colorMarca ?? estadoBase.color };
  // Un color de marca muy claro (amarillo, crema) no se lee como texto sobre blanco ni con letra blanca encima.
  const legible = contrasteConBlanco(c.color) >= 3;
  const colorTitulo = legible ? c.color : '#333333';
  const textoBoton = legible ? '#FFFFFF' : '#111111';
  const logo = logoPublico(datos.marca?.logoUrl);
  const negocio = datos.nombreNegocio.trim();
  const filas = [
    ['Pedido', escapar(datos.numeroPedido)],
    ['Estado', escapar(c.titulo)],
    ...(datos.listoAprox ? [['Listo aprox.', escapar(datos.listoAprox)]] : []),
    ...(datos.entregaAprox ? [['Entrega aprox.', escapar(datos.entregaAprox)]] : []),
    ...(datos.motivo ? [['Motivo', escapar(datos.motivo)]] : []),
    ...(datos.envio?.domiciliario ? [['Te lo lleva', escapar(datos.envio.domiciliario)]] : []),
    ...(datos.envio?.codigo ? [['Código de entrega', escapar(datos.envio.codigo)]] : []),
  ]
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#666;font-size:13px;">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#333;">${v}</td></tr>`)
    .join('');
  const boton = datos.urlSeguimiento
    ? `<div style="text-align:center;margin-top:24px;"><a href="${escapar(datos.urlSeguimiento)}" style="display:inline-block;background:${c.color};color:${textoBoton};padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver estado de mi pedido</a></div>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
<div style="background:${c.color}1A;border-top:4px solid ${c.color};padding:32px;text-align:center;border-radius:8px 8px 0 0;">
${logo ? `<img src="${escapar(logo)}" alt="${escapar(negocio || 'Logo')}" style="display:block;margin:0 auto 16px;max-height:56px;max-width:200px;height:auto;border:0;">` : ''}
<h1 style="margin:0;color:${colorTitulo};font-size:22px;">${escapar(c.titulo)}</h1>
${negocio ? `<p style="margin:8px 0 0;color:#666;font-size:13px;">${escapar(negocio)}</p>` : ''}
</div>
<div style="padding:24px;">
<p style="color:#333;font-size:15px;">Hola <strong>${escapar(datos.nombreCliente || 'cliente')}</strong>,</p>
<p style="color:#666;font-size:14px;">${escapar(c.mensaje)}</p>
<div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:20px 0;"><table style="width:100%;border-collapse:collapse;">${filas}</table></div>
${datos.envio?.pagaAlRecibir ? `<div style="background:#FEFCE8;border:1px solid #FDE68A;border-radius:8px;padding:12px 16px;margin:0 0 20px;"><p style="margin:0;color:#333;font-size:14px;font-weight:600;">Pagas al recibir: ${escapar(datos.envio.pagaAlRecibir)}</p><p style="margin:4px 0 0;color:#666;font-size:12px;">Efectivo, datáfono o transferencia.${datos.envio.codigo ? ' Dale el código de entrega a quien te entregue.' : ''}</p></div>` : ''}
${boton}
</div></div>`;
  const text = [
    `Hola ${datos.nombreCliente || 'cliente'},`,
    c.mensaje,
    `Pedido ${datos.numeroPedido}: ${c.titulo}`,
    datos.listoAprox ? `Listo aprox.: ${datos.listoAprox}` : '',
    datos.entregaAprox ? `Entrega aprox.: ${datos.entregaAprox}` : '',
    datos.motivo ? `Motivo: ${datos.motivo}` : '',
    datos.envio?.domiciliario ? `Te lo lleva: ${datos.envio.domiciliario}` : '',
    datos.envio?.codigo ? `Código de entrega: ${datos.envio.codigo}` : '',
    datos.envio?.pagaAlRecibir ? `Pagas al recibir: ${datos.envio.pagaAlRecibir}` : '',
    datos.urlSeguimiento ? `Seguimiento: ${datos.urlSeguimiento}` : '',
  ].filter(Boolean).join('\n');
  const asunto = `${c.titulo} — Pedido ${datos.numeroPedido}${negocio ? ` · ${negocio}` : ''}`;
  return { asunto, html, text };
}

/**
 * Logo y color del negocio. El color sale primero del sitio web (`website_settings.primary_color`,
 * lo que el cliente ve en la tienda) y, si no hay, de la organización. Si la lectura falla, el
 * correo sale con los colores de siempre: la marca nunca impide el aviso.
 */
export async function marcaDelNegocio(
  db: SupabaseClient,
  organizationId: number,
  org: { logo_url?: string | null; primary_color?: string | null },
): Promise<MarcaCorreo> {
  let colorSitio: string | null = null;
  try {
    const { data } = await db
      .from('website_settings')
      .select('primary_color')
      .eq('organization_id', organizationId)
      .maybeSingle();
    colorSitio = normalizarColor(data?.primary_color);
  } catch {
    colorSitio = null;
  }
  return {
    logoUrl: logoPublico(org.logo_url),
    color: colorSitio ?? normalizarColor(org.primary_color),
  };
}

interface ClienteCorreo {
  emails: { send: (p: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> };
}

interface RemitenteAviso {
  cliente: ClienteCorreo;
  from: string;
  replyTo: string | null;
}

const limpiarNombre = (n: string) => n.replace(/[<>"]/g, '').trim();

/**
 * El remitente de siempre con la key maestra, para organizaciones sin dominio propio: el nombre del
 * negocio y la dirección de respaldo para compradores (`remitenteComprador`): nunca «GO Admin».
 * `null` si no hay key maestra.
 */
function remitenteDeSiempre(negocio: string, responderA: string | null): RemitenteAviso | null {
  if (!getMasterResendKey()) return null;
  return {
    cliente: getMasterResend() as unknown as ClienteCorreo,
    from: remitenteComprador(negocio),
    replyTo: responderA,
  };
}

/**
 * Remitente del aviso: el dominio verificado de la org si `resolveSender` lo da (modo `org`);
 * si devuelve el global o lanza (NO_SENDER incluido), el de siempre.
 */
async function remitenteAviso(
  db: SupabaseClient,
  organizationId: number,
  extra: { nombreOrg: string; nombreVisible: string | null; responderA: string | null },
): Promise<RemitenteAviso | null> {
  const negocio = extra.nombreVisible || extra.nombreOrg || '';
  try {
    const s = await resolveSender(organizationId, { kind: 'transactional', orgName: negocio }, db);
    if (s.mode === 'org' && s.fromEmail && s.apiKey) {
      const nombre = limpiarNombre(negocio || s.domain?.from_name || '');
      return {
        cliente: getResendClient(s.apiKey) as unknown as ClienteCorreo,
        from: nombre ? `${nombre} <${s.fromEmail}>` : s.fromEmail,
        replyTo: extra.responderA ?? s.replyTo,
      };
    }
  } catch (err) {
    console.warn('[orderStatusEmail] Sin dominio propio para el aviso; sale con el remitente de siempre', {
      organizationId,
      err: err instanceof Error ? err.message : err,
    });
  }
  return remitenteDeSiempre(negocio, extra.responderA);
}

/**
 * Envía un aviso de estado ya armado. Nunca lanza: devuelve `{ ok: false }` si no hay proveedor
 * o Resend lo rechaza.
 */
export async function enviarAvisoEstado(
  db: SupabaseClient,
  organizationId: number,
  extra: { nombreOrg: string; nombreVisible: string | null; responderA: string | null },
  mensaje: { to: string; subject: string; html: string; text: string },
  log: { orderId?: string; estado?: string } = {},
): Promise<{ ok: boolean; id?: string | null; error?: string | null }> {
  try {
    const remitente = await remitenteAviso(db, organizationId, extra);
    if (!remitente) return { ok: false, error: 'sin_proveedor' };
    const { data, error } = await remitente.cliente.emails.send({
      from: remitente.from,
      ...mensaje,
      ...(remitente.replyTo ? { replyTo: remitente.replyTo } : {}),
    });
    if (error) {
      const nombre = (error as { name?: string }).name ?? 'proveedor';
      console.warn('[orderStatusEmail] Resend no envió el aviso de estado', { ...log, error: nombre });
      return { ok: false, error: nombre };
    }
    return { ok: true, id: (data as { id?: string } | null)?.id ?? null };
  } catch (err) {
    console.warn('[orderStatusEmail] Error enviando el aviso de estado', { ...log, err: err instanceof Error ? err.message : err });
    return { ok: false, error: 'proveedor' };
  }
}

/**
 * Envía los avisos del estado ACTUAL del pedido. Devuelve si salió el correo
 * (para logs). `organizationId` sale de la sesión o del propio pedido, nunca
 * de un body. Qué canales salen lo deciden los ajustes de la organización
 * (`avisosClienteService`); sin esos ajustes (migración pendiente), el correo
 * de siempre en cada estado con aviso.
 */
export async function enviarCorreoEstadoPedido(
  db: SupabaseClient,
  organizationId: number,
  orderId: string,
  opciones: { actor?: string | null; soloCanal?: CanalAviso | null } = {},
): Promise<boolean> {
  try {
    const { data: pedido, error } = await db
      .from('web_orders')
      .select('id, organization_id, branch_id, order_number, status, customer_id, customer_email, customer_name, customer_phone, estimated_ready_at, estimated_delivery_at, cancellation_reason, total, payment_status, delivery_type')
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (error || !pedido) return false;

    const { data: org } = await db
      .from('organizations')
      .select('id, name, logo_url, primary_color, organization_types(name)')
      .eq('id', organizationId)
      .maybeSingle();
    if (!org) return false;
    const marca = await marcaDelNegocio(db, organizationId, org);
    const url = urlSeguimiento({ id: organizationId, host: await hostPublicoOrg(db, organizationId) }, pedido);

    const r = await avisarClientePedido(db, organizationId, pedido as PedidoParaAviso, {
      negocio: org.name ?? '',
      url,
      actor: opciones.actor ?? null,
      soloCanal: opciones.soloCanal ?? null,
      estadoConAvisoLegado: (e) => esEstadoConAviso(e),
      datosEnvio: (momento) => datosEnvioParaAviso(db, organizationId, orderId, momento),
      enviarCorreo: async (extra) => {
        const estado = esEstadoConAviso(pedido.status) ? pedido.status : null;
        if (!estado) return { ok: false, error: 'estado_sin_aviso' };
        const zona = await getOrganizationTimezone(organizationId, db);
        // Antes de entregar se promete listo y entrega; en camino, solo la entrega.
        const conListo = ['confirmed', 'preparing'].includes(pedido.status);
        const conEntrega = conListo || pedido.status === 'in_delivery';
        const negocio = extra.nombreVisible || org.name || '';
        const correo = armarCorreoEstado({
          estado,
          numeroPedido: pedido.order_number,
          nombreCliente: pedido.customer_name ?? '',
          nombreNegocio: negocio,
          urlSeguimiento: url,
          listoAprox: conListo ? formatEstimateInTz(pedido.estimated_ready_at, zona) || null : null,
          entregaAprox: conEntrega ? formatEstimateInTz(pedido.estimated_delivery_at, zona) || null : null,
          rubro: rubroDeTipoOrg(nombreTipoOrg(org)),
          conEnvio: !!pedido.delivery_type && pedido.delivery_type !== 'pickup',
          motivo: ['cancelled', 'rejected'].includes(pedido.status) ? pedido.cancellation_reason : null,
          marca,
          envio: extra.datos
            ? { domiciliario: extra.datos.conductor ?? null, codigo: extra.datos.codigoEntrega ?? null, pagaAlRecibir: extra.datos.pagaAlRecibir ?? null }
            : null,
        });
        return enviarAvisoEstado(db, organizationId, { nombreOrg: org.name ?? '', ...extra }, {
          to: pedido.customer_email as string,
          subject: extra.asunto || correo.asunto,
          html: correo.html,
          text: extra.texto || correo.text,
        }, { orderId, estado: pedido.status });
      },
    });
    return r.email === 'sent';
  } catch (err) {
    console.warn('[orderStatusEmail] Error enviando el aviso de estado', { orderId, err: err instanceof Error ? err.message : err });
    return false;
  }
}

/** Correo de la novedad de entrega (puro). Mismo esqueleto y marca que el de estado. */
export function armarCorreoNovedad(datos: {
  numeroPedido: string;
  nombreCliente: string;
  nombreNegocio: string;
  motivo: string | null;
  nuevoIntento: string | null;
  urlSeguimiento: string | null;
  marca?: MarcaCorreo | null;
}): CorreoEstadoPedido {
  const color = normalizarColor(datos.marca?.color) ?? '#D97706';
  const legible = contrasteConBlanco(color) >= 3;
  const textoBoton = legible ? '#FFFFFF' : '#111111';
  const negocio = datos.nombreNegocio.trim();
  const logo = logoPublico(datos.marca?.logoUrl);
  const nombre = datos.nombreCliente.trim().split(/\s+/)[0] || 'cliente';
  const motivo = motivoNovedadCliente(datos.motivo);
  const siguiente = datos.nuevoIntento ? `Lo intentamos de nuevo ${datos.nuevoIntento}.` : 'Te contactamos para acordar una nueva entrega.';
  const boton = datos.urlSeguimiento
    ? `<div style="text-align:center;margin-top:24px;"><a href="${escapar(datos.urlSeguimiento)}" style="display:inline-block;background:${color};color:${textoBoton};padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Cambiar dirección u hora</a></div>`
    : '';
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
<div style="background:${color}1A;border-top:4px solid ${color};padding:32px;text-align:center;border-radius:8px 8px 0 0;">
${logo ? `<img src="${escapar(logo)}" alt="${escapar(negocio || 'Logo')}" style="display:block;margin:0 auto 16px;max-height:56px;max-width:200px;height:auto;border:0;">` : ''}
<h1 style="margin:0;color:${legible ? color : '#333333'};font-size:22px;">No pudimos entregar tu pedido</h1>
${negocio ? `<p style="margin:8px 0 0;color:#666;font-size:13px;">${escapar(negocio)}</p>` : ''}
</div>
<div style="padding:24px;">
<p style="color:#333;font-size:15px;">Hola <strong>${escapar(nombre)}</strong>,</p>
<p style="color:#666;font-size:14px;">Pasamos a entregar tu pedido ${escapar(datos.numeroPedido)} y no pudimos: ${escapar(motivo)}. ${escapar(siguiente)}</p>
<p style="color:#666;font-size:14px;">Si quieres cambiar la dirección o la hora, respóndenos este correo.</p>
${boton}
</div></div>`;
  const text = [
    `Hola ${nombre},`,
    `Pasamos a entregar tu pedido ${datos.numeroPedido} y no pudimos: ${motivo}.`,
    siguiente,
    datos.urlSeguimiento ? `Cambiar dirección u hora: ${datos.urlSeguimiento}` : 'Si quieres cambiar la dirección o la hora, respóndenos este correo.',
  ].join('\n');
  return { asunto: `No pudimos entregar tu pedido ${datos.numeroPedido}${negocio ? ` · ${negocio}` : ''}`, html, text };
}

/**
 * Aviso «novedad» de un pedido web (logística Fase 1): lo llama quien registró la novedad
 * (`logistica_registrar_novedad` devuelve `aviso: 'novedad'`). Organización de la sesión o del
 * pedido, nunca de un body. Devuelve si salió el correo. Nunca lanza.
 */
/**
 * Aviso de «pedido confirmado» cuando lo confirma la pasarela (`/auto-confirm`), no una persona.
 *
 * Hasta el 2026-11-24 este camino no avisaba nada: los pedidos pagados con Mercado Pago, Bold o
 * Wompi se confirmaban solos y el cliente no recibía el aviso del ERP. El correo no se repite: la
 * tienda web ya manda «Pago confirmado» desde el webhook (`web_order_email_log`, tipo
 * `pedido_pagado`); aquí salen los demás canales (WhatsApp, según los ajustes de avisos).
 * Una sola vez por pedido (los webhooks se reintentan): si ya hay un aviso «confirmado» registrado,
 * no se manda otro. La organización sale del propio pedido. Nunca lanza.
 */
export async function avisarPagoConfirmadoPasarela(db: SupabaseClient, orderId: string): Promise<void> {
  try {
    const { data: pedido } = await db
      .from('web_orders')
      .select('id, organization_id, status, payment_status')
      .eq('id', orderId)
      .maybeSingle();
    if (!pedido?.organization_id || pedido.payment_status !== 'paid' || pedido.status !== 'confirmed') return;
    const organizationId = Number(pedido.organization_id);
    const { data: previos } = await db
      .from('web_order_notices')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('web_order_id', orderId)
      .eq('moment', 'confirmado')
      .limit(1);
    if (previos && previos.length > 0) return;
    await enviarCorreoEstadoPedido(db, organizationId, orderId, { soloCanal: 'whatsapp' });
  } catch (err) {
    console.warn('[orderStatusEmail] No se pudo avisar la confirmación por pasarela', { orderId, err: err instanceof Error ? err.message : err });
  }
}

export async function enviarAvisoNovedadPedido(
  db: SupabaseClient,
  organizationId: number,
  orderId: string,
  opciones: { actor?: string | null } = {},
): Promise<boolean> {
  try {
    const { data: pedido } = await db
      .from('web_orders')
      .select('id, organization_id, branch_id, order_number, status, customer_id, customer_email, customer_name, customer_phone, estimated_ready_at, estimated_delivery_at, cancellation_reason, total, payment_status, delivery_type')
      .eq('id', orderId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!pedido) return false;
    const { data: org } = await db.from('organizations').select('id, name, logo_url, primary_color').eq('id', organizationId).maybeSingle();
    if (!org) return false;
    const envio = await envioDelPedidoWeb(db, organizationId, orderId);
    const marca = await marcaDelNegocio(db, organizationId, org);
    const url = urlSeguimiento({ id: organizationId, host: await hostPublicoOrg(db, organizationId) }, pedido);
    // `expected_delivery_date` es un `date`: se formatea sin convertir de zona.
    const nuevoIntento = envio?.fechaEstimada ? `el ${formatPlainDate(envio.fechaEstimada, { weekday: 'short', day: 'numeric', month: 'short' })}` : null;
    const r = await avisarNovedadPedido(db, organizationId, pedido as PedidoParaAviso, {
      negocio: org.name ?? '',
      actor: opciones.actor ?? null,
      novedad: { motivo: envio?.motivo ?? null, nuevoIntento, url },
      enviarCorreo: async (extra) => {
        const correo = armarCorreoNovedad({
          numeroPedido: pedido.order_number,
          nombreCliente: pedido.customer_name ?? '',
          nombreNegocio: extra.nombreVisible || org.name || '',
          motivo: envio?.motivo ?? null,
          nuevoIntento,
          urlSeguimiento: url,
          marca,
        });
        return enviarAvisoEstado(db, organizationId, { nombreOrg: org.name ?? '', ...extra }, {
          to: pedido.customer_email as string,
          subject: extra.asunto || correo.asunto,
          html: correo.html,
          text: extra.texto || correo.text,
        }, { orderId, estado: 'novedad' });
      },
    });
    return r.email === 'sent';
  } catch (err) {
    console.warn('[orderStatusEmail] Error enviando el aviso de novedad', { orderId, err: err instanceof Error ? err.message : err });
    return false;
  }
}
