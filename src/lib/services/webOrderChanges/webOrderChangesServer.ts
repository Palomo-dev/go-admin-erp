/**
 * Cambios de productos en pedidos web pagados (web_order_changes). SOLO servidor.
 *
 * Flujo: crear (cotiza con precios vigentes + reserva lo adicional) → aplicar
 *   · delta > 0: link de pago de la pasarela del pedido (Wompi o Bold) → el webhook confirma la
 *     sesión (confirmQrPayment) y aplica el cambio atómicamente (fn_web_order_change_aplicar).
 *   · delta < 0: reembolso parcial SIN cancelar el pedido (nota crédito, reembolso manual en la
 *     pasarela) o saldo a favor (credit_notes). Requiere además pos.refund.
 *   · delta = 0: se aplica directo.
 * La organización sale SIEMPRE de la sesión (withOrg); el pedido y el cambio se leen filtrando por ella.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { resolveLineTaxWith } from '@/lib/services/taxResolverCore';
import { impuestoVaSobreBase } from '@/lib/services/webOrderTotals';
import type { WebOrder } from '@/lib/services/webOrdersService';
import { crearNotaCreditoPedidoWeb } from '@/lib/services/webOrderCreditNote';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import { boldService } from '@/lib/services/integrations/bold';
import { MONEDA_RIELES_QR } from '@/lib/services/integrations/qrShared/cobroQrServidor';
import { zonaHorariaEnServidor } from '@/lib/utils/zonaHorariaServidor';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { WEB_ORDER_CHANGE_SOURCE } from '@/lib/services/integrations/qrShared/paymentConfirmation';
import { getMasterResend, getMasterResendKey, getResendClient } from '@/lib/services/crm/email/resendClient';
import { resolveSender } from '@/lib/services/crm/email/domainsService';
import { isEmailError } from '@/lib/services/crm/email/types';
import {
  cotizarCambio,
  bloqueoPorEstado,
  modoReembolso,
  pagoOriginalManual,
  sentidoDelta,
  CotizacionError,
  type LineaPedida,
} from './cotizarCambio';
import { correoCambio } from './plantillaCambio';

export const PERMISO_CAMBIO = 'pos.web_order.change';
export const PERMISO_REEMBOLSO = 'pos.refund';
/** Conectores que generan link de pago por monto. */
export const CONECTORES_LINK = ['wompi_co', 'bold_link'] as const;
const VIGENCIA_LINK_HORAS = 24;

export class CambioPedidoError extends Error {
  constructor(public status: number, public code: string, message?: string, public extra?: Record<string, unknown>) {
    super(message ?? code);
  }
}

type Fila = Record<string, unknown>;

export async function tienePermiso(ctx: ServerOrgContext, codigo: string): Promise<boolean> {
  if (ctx.isSuperAdmin || ctx.roleId === 1 || ctx.roleId === 2) return true;
  const { data, error } = await ctx.supabase.rpc('fn_tiene_permiso', { p_organization_id: ctx.organizationId, p_code: codigo });
  return !error && data === true;
}

export async function exigirPermiso(ctx: ServerOrgContext, codigo: string): Promise<void> {
  if (!(await tienePermiso(ctx, codigo))) throw new CambioPedidoError(403, 'SIN_PERMISO', `Requiere el permiso ${codigo}.`);
}

async function cargarPedido(db: SupabaseClient, organizationId: number, orderId: string): Promise<WebOrder & Fila> {
  const { data, error } = await db
    .from('web_orders')
    .select('*, items:web_order_items(*)')
    .eq('id', orderId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error || !data) throw new CambioPedidoError(404, 'PEDIDO_NO_ENCONTRADO', 'Pedido no encontrado');
  return data as WebOrder & Fila;
}

async function cargarCambio(db: SupabaseClient, organizationId: number, changeId: string): Promise<Fila> {
  const { data } = await db
    .from('web_order_changes')
    .select('*')
    .eq('id', changeId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (!data) throw new CambioPedidoError(404, 'CAMBIO_NO_ENCONTRADO', 'Cambio no encontrado');
  return data as Fila;
}

/** Precio vigente (product_prices) y datos de cada producto de la organización. */
async function lineasConPrecio(
  db: SupabaseClient,
  organizationId: number,
  pedidas: Array<{ product_id: number; quantity: number }>,
  impuestoIncluido: boolean,
): Promise<LineaPedida[]> {
  const ids = Array.from(new Set(pedidas.map((p) => Number(p.product_id)).filter((n) => Number.isInteger(n) && n > 0)));
  if (ids.length === 0) throw new CambioPedidoError(400, 'SIN_ITEMS', 'Agrega al menos un producto.');
  const { data: productos } = await db
    .from('products')
    .select('id, name, sku, status, organization_id')
    .in('id', ids)
    .eq('organization_id', organizationId);
  const porId = new Map(((productos as Fila[] | null) ?? []).map((p) => [Number(p.id), p]));
  const ahora = new Date().toISOString();
  const { data: precios } = await db
    .from('product_prices')
    .select('product_id, price, effective_from, effective_to')
    .in('product_id', ids)
    .lte('effective_from', ahora)
    .order('effective_from', { ascending: false });
  const precioPorId = new Map<number, number>();
  for (const p of (precios as Fila[] | null) ?? []) {
    const id = Number(p.product_id);
    if (precioPorId.has(id)) continue;
    if (p.effective_to && String(p.effective_to) <= ahora) continue;
    precioPorId.set(id, Number(p.price) || 0);
  }

  const lineas: LineaPedida[] = [];
  for (const pedida of pedidas) {
    const prod = porId.get(Number(pedida.product_id));
    if (!prod) throw new CambioPedidoError(400, 'PRODUCTO_INVALIDO', `Producto ${pedida.product_id} no es de la organización.`);
    if (prod.status && !['active', 'activo'].includes(String(prod.status))) {
      throw new CambioPedidoError(400, 'PRODUCTO_INACTIVO', `${prod.name} no está activo.`);
    }
    const precio = precioPorId.get(Number(pedida.product_id));
    if (precio === undefined) throw new CambioPedidoError(400, 'SIN_PRECIO', `${prod.name} no tiene precio vigente.`);
    const qty = Number(pedida.quantity);
    const imp = await resolveLineTaxWith(db, {
      productId: Number(pedida.product_id),
      organizationId,
      taxIncluded: impuestoIncluido,
      qty,
      unitPrice: precio,
    });
    lineas.push({
      product_id: Number(pedida.product_id),
      quantity: qty,
      precio,
      tasa: imp.tax_rate,
      nombre: String(prod.name ?? ''),
      sku: (prod.sku as string | null) ?? null,
    });
  }
  return lineas;
}

function errorDeRpc(message: string): CambioPedidoError {
  const codigos: Record<string, [number, string]> = {
    PEDIDO_DESPACHADO: [409, 'El pedido ya salió o se entregó: usa una devolución.'],
    PEDIDO_NO_PAGADO: [409, 'Solo se cambian pedidos pagados.'],
    PEDIDO_CERRADO: [409, 'El pedido está cerrado.'],
    PEDIDO_DE_MESA: [409, 'Los pedidos de mesa se cambian en la cuenta de la mesa.'],
    CAMBIO_ABIERTO: [409, 'Este pedido ya tiene un cambio en curso.'],
    CAMBIO_CERRADO: [409, 'El cambio ya fue cancelado o venció.'],
    PEDIDO_NO_MODIFICABLE: [409, 'El pedido ya no se puede modificar.'],
    SALDO_SIN_CLIENTE: [400, 'El saldo a favor requiere un cliente en el pedido.'],
    ITEM_INVALIDO: [400, 'Hay productos inválidos.'],
  };
  for (const [code, [status, msg]] of Object.entries(codigos)) {
    if (message.includes(code)) return new CambioPedidoError(status, code, msg);
  }
  return new CambioPedidoError(500, 'ERROR_BD', message);
}

// ─── Crear ──────────────────────────────────────────────────────────────────

export interface CrearCambioBody {
  items: Array<{ product_id: number; quantity: number }>;
  envio?: number | null;
  motivo?: string | null;
  /** Solo cotizar, sin reservar ni guardar. */
  soloCotizar?: boolean;
}

export async function crearCambio(ctx: ServerOrgContext, orderId: string, body: CrearCambioBody, db: SupabaseClient = getServiceClient()) {
  await exigirPermiso(ctx, PERMISO_CAMBIO);
  const pedido = await cargarPedido(db, ctx.organizationId, orderId);
  const bloqueo = bloqueoPorEstado(pedido as { status: string; payment_status: string; table_session_id?: string | null });
  if (bloqueo) throw errorDeRpc(bloqueo);
  if ((pedido.items ?? []).some((it) => !it.product_id)) {
    // Una línea sin producto (libre) no se puede recotizar ni mover de inventario.
    throw new CambioPedidoError(409, 'LINEA_SIN_PRODUCTO', 'El pedido tiene líneas sin producto del catálogo.');
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
    throw new CambioPedidoError(400, 'SIN_ITEMS', 'Agrega entre 1 y 100 productos.');
  }
  const sobreBase = impuestoVaSobreBase(pedido);
  const lineas = await lineasConPrecio(db, ctx.organizationId, body.items, !sobreBase);
  let cot;
  try {
    cot = cotizarCambio(pedido, lineas, { nuevo: body.envio ?? null });
  } catch (e) {
    if (e instanceof CotizacionError) throw new CambioPedidoError(400, e.code, e.message);
    throw e;
  }
  if (body.soloCotizar) return { cotizacion: cot, change: null };

  const { data, error } = await db.rpc('fn_web_order_change_crear', {
    p_order_id: pedido.id,
    p_user: ctx.userId,
    p_items: cot.items,
    p_totales: cot.totales,
    p_motivo: (body.motivo ?? '').toString().slice(0, 500) || null,
  });
  if (error) throw errorDeRpc(error.message);
  const r = data as { ok: boolean; error?: string; shortages?: unknown; change_id?: string };
  if (!r.ok) throw new CambioPedidoError(409, r.error ?? 'STOCK_INSUFICIENTE', 'No hay stock suficiente para el cambio.', { shortages: r.shortages });
  return { cotizacion: cot, change: await cargarCambio(db, ctx.organizationId, String(r.change_id)) };
}

// ─── Pasarela del link ──────────────────────────────────────────────────────

interface ConexionLink {
  id: string;
  connectorCode: (typeof CONECTORES_LINK)[number];
}

/** Conexiones de la org que generan link: la del método del pago original primero. */
export async function conexionesDeLink(db: SupabaseClient, organizationId: number, metodoPedido?: string | null): Promise<ConexionLink[]> {
  const { data: conectores } = await db.from('integration_connectors').select('id, code').in('code', CONECTORES_LINK as unknown as string[]);
  const codigoPorConector = new Map(((conectores as Fila[] | null) ?? []).map((c) => [String(c.id), String(c.code)]));
  if (codigoPorConector.size === 0) return [];
  const { data: conexiones } = await db
    .from('integration_connections')
    .select('id, connector_id, status')
    .eq('organization_id', organizationId)
    .eq('status', 'connected')
    .in('connector_id', Array.from(codigoPorConector.keys()));
  const lista: ConexionLink[] = ((conexiones as Fila[] | null) ?? []).map((c) => ({
    id: String(c.id),
    connectorCode: codigoPorConector.get(String(c.connector_id)) as ConexionLink['connectorCode'],
  }));
  if (metodoPedido) {
    const { data: opm } = await db
      .from('organization_payment_methods')
      .select('integration_connection_id')
      .eq('organization_id', organizationId)
      .eq('payment_method_code', metodoPedido)
      .maybeSingle();
    const preferida = (opm as Fila | null)?.integration_connection_id;
    if (preferida) lista.sort((a, b) => (a.id === preferida ? -1 : b.id === preferida ? 1 : 0));
  }
  // Sin conexión propia del método: los métodos de Wompi (card, nequi, pse…) prefieren Wompi.
  if (!metodoPedido || lista[0]?.connectorCode !== 'bold_link') {
    lista.sort((a, b) => (a.connectorCode === b.connectorCode ? 0 : a.connectorCode === 'wompi_co' ? -1 : 1));
  }
  return lista;
}

/** Color de marca para el correo: el de la tienda web y, si no hay, el de la organización. */
export async function colorDeMarca(db: SupabaseClient, organizationId: number): Promise<string | null> {
  const { data: web } = await db.from('website_settings').select('primary_color').eq('organization_id', organizationId).limit(1).maybeSingle();
  const deWeb = (web as Fila | null)?.primary_color;
  if (deWeb) return String(deWeb);
  const { data: org } = await db.from('organizations').select('primary_color').eq('id', organizationId).maybeSingle();
  return ((org as Fila | null)?.primary_color as string | null) ?? null;
}

async function nombreNegocio(db: SupabaseClient, organizationId: number): Promise<string> {
  const { data } = await db.from('organizations').select('name').eq('id', organizationId).maybeSingle();
  return String((data as Fila | null)?.name ?? '');
}

async function crearLinkDiferencia(
  ctx: ServerOrgContext,
  db: SupabaseClient,
  pedido: WebOrder & Fila,
  cambio: Fila,
  connectionId?: string | null,
): Promise<Fila> {
  const conexiones = await conexionesDeLink(db, ctx.organizationId, pedido.payment_method as string | null);
  const conexion = connectionId ? conexiones.find((c) => c.id === connectionId) : conexiones[0];
  if (!conexion) {
    throw new CambioPedidoError(412, 'SIN_PASARELA_LINK', 'Conecta Wompi o Bold para cobrar la diferencia con link de pago.');
  }
  const monto = Math.round(Number(cambio.delta_total) * 100) / 100;
  const negocio = await nombreNegocio(db, ctx.organizationId);
  const reference = `CHG-${String(cambio.id).slice(0, 8)}-${Date.now().toString(36)}`.toUpperCase();
  const vence = new Date(Date.now() + VIGENCIA_LINK_HORAS * 3600 * 1000).toISOString();
  const descripcion = `Diferencia por cambio de productos · Pedido ${pedido.order_number}`;

  let externalId: string;
  let url: string;
  let providerCode: string;
  let connectorCode: string;
  if (conexion.connectorCode === 'wompi_co') {
    const creds = await wompiService.getCredentials(conexion.id, db);
    if (!creds) throw new CambioPedidoError(412, 'WOMPI_SIN_CREDENCIALES', 'La conexión de Wompi no tiene credenciales activas.');
    const link = await wompiService.createPaymentLink(creds, {
      name: `${negocio || 'Tienda'} · ${pedido.order_number}`,
      description: descripcion,
      amount_in_cents: Math.round(monto * 100),
      currency: MONEDA_RIELES_QR,
      expires_at: vence,
      sku: reference,
    });
    if (!link) throw new CambioPedidoError(502, 'WOMPI_LINK_FALLO', 'Wompi no generó el link de pago.');
    externalId = link.id;
    url = link.url;
    providerCode = 'wompi_link';
    connectorCode = 'wompi_co';
  } else {
    const link = await boldService.createPaymentLink(conexion.id, {
      amount: Math.round(monto),
      currency: MONEDA_RIELES_QR,
      reference,
      description: descripcion,
      expires_in: VIGENCIA_LINK_HORAS * 3600,
      metadata: { reference, source: WEB_ORDER_CHANGE_SOURCE, sourceId: String(cambio.id), organizationId: ctx.organizationId },
    } as Parameters<typeof boldService.createPaymentLink>[1]);
    if (!link) throw new CambioPedidoError(502, 'BOLD_LINK_FALLO', 'Bold no generó el link de pago.');
    externalId = link.id;
    url = link.link_url;
    providerCode = 'bold_link';
    connectorCode = 'bold';
  }

  const sesion = await createQrSession({
    organizationId: ctx.organizationId,
    branchId: (pedido.branch_id as number | null) ?? undefined,
    providerCode,
    connectorCode,
    integrationConnectionId: conexion.id,
    reference,
    externalQrId: externalId,
    qrImageUrl: url,
    amount: monto,
    currency: MONEDA_RIELES_QR,
    source: WEB_ORDER_CHANGE_SOURCE,
    sourceId: String(cambio.id),
    customerLabel: String(pedido.customer_name ?? '').slice(0, 80) || undefined,
    expiresAt: vence,
    createdBy: ctx.userId,
  });
  if (!sesion) throw new CambioPedidoError(500, 'SESION_FALLO', 'Link generado pero no se registró la sesión de pago.');

  const { data: actualizado, error } = await db
    .from('web_order_changes')
    .update({
      estado: 'pending_payment',
      payment_link_url: url,
      provider_code: providerCode,
      integration_connection_id: conexion.id,
      provider_reference: reference,
      qr_session_id: sesion.id,
      expires_at: vence,
      updated_at: new Date().toISOString(),
    })
    .eq('id', String(cambio.id))
    .eq('organization_id', ctx.organizationId)
    .eq('estado', 'draft')
    .select('*')
    .maybeSingle();
  if (error || !actualizado) throw new CambioPedidoError(409, 'CAMBIO_CAMBIO_DE_ESTADO', 'El cambio cambió de estado mientras se generaba el link.');
  return actualizado as Fila;
}

// ─── Aplicar ────────────────────────────────────────────────────────────────

export interface AplicarCambioBody {
  /** Diferencia a favor: 'refund' (reembolso parcial, sin cancelar) o 'customer_credit' (saldo a favor). */
  reembolso?: 'refund' | 'customer_credit' | null;
  /** Pasarela elegida para el link (por defecto la del pago original). */
  connection_id?: string | null;
}

/**
 * Gancho de factura electrónica (Factus): nota crédito/débito electrónica del cambio.
 * PREPARADO, NO ACTIVO: solo deja constancia en web_order_changes.factus_document.
 * Para activarlo: emitir con el servicio de Factus cuando FACTUS_NOTAS_CAMBIO=on.
 */
export async function ganchoFactusCambio(db: SupabaseClient, cambio: Fila, tipo: 'credito' | 'debito'): Promise<void> {
  const activo = process.env.FACTUS_NOTAS_CAMBIO === 'on';
  await db
    .from('web_order_changes')
    .update({ factus_document: { tipo, estado: activo ? 'pendiente_emision' : 'no_activo', registrado_at: new Date().toISOString() } })
    .eq('id', String(cambio.id));
}

export async function aplicarCambio(ctx: ServerOrgContext, changeId: string, body: AplicarCambioBody, db: SupabaseClient = getServiceClient()) {
  await exigirPermiso(ctx, PERMISO_CAMBIO);
  const cambio = await cargarCambio(db, ctx.organizationId, changeId);
  if (cambio.estado === 'applied') return { cambio, accion: 'ya_aplicado' as const };
  if (cambio.estado !== 'draft') throw new CambioPedidoError(409, 'CAMBIO_NO_BORRADOR', `El cambio está ${String(cambio.estado)}.`);
  const pedido = await cargarPedido(db, ctx.organizationId, String(cambio.web_order_id));
  const sentido = sentidoDelta(Number(cambio.delta_total));

  if (sentido === 'cobrar') {
    const conLink = await crearLinkDiferencia(ctx, db, pedido, cambio, body.connection_id);
    await ganchoFactusCambio(db, conLink, 'debito');
    return { cambio: conLink, accion: 'link' as const };
  }

  let modo: 'manual' | 'customer_credit' | null = null;
  if (sentido === 'devolver') {
    await exigirPermiso(ctx, PERMISO_REEMBOLSO);
    try {
      modo = modoReembolso(pedido as { customer_id?: string | null }, body.reembolso ?? 'refund');
    } catch (e) {
      if (e instanceof CotizacionError) throw errorDeRpc(e.code);
      throw e;
    }
  }

  const { error } = await db.rpc('fn_web_order_change_aplicar', {
    p_change_id: changeId,
    p_user: ctx.userId,
    p_payment_id: null,
    p_refund_mode: modo,
    p_provider_reference: null,
  });
  if (error) throw errorDeRpc(error.message);

  if (sentido === 'devolver' && modo === 'manual') {
    // Reembolso parcial: nota crédito por la diferencia, SIN cancelar el pedido. El stock ya lo movió
    // la función SQL. El dinero vuelve por el panel de la pasarela (o a mano si el pago fue MANUAL).
    const monto = Math.abs(Number(cambio.delta_total));
    const nc = await crearNotaCreditoPedidoWeb(db, pedido, {
      isFullRefund: false,
      monto,
      motivo: `Nota crédito por cambio de productos - Pedido ${pedido.order_number}${pagoOriginalManual(pedido) ? ' (pago original MANUAL)' : ''}`,
    });
    if (nc.creditNoteId) {
      await db.from('web_order_changes').update({ credit_note_id: nc.creditNoteId }).eq('id', changeId);
    }
    await ganchoFactusCambio(db, cambio, 'credito');
  }
  return { cambio: await cargarCambio(db, ctx.organizationId, changeId), accion: 'aplicado' as const };
}

// ─── Cancelar / listar / reembolso hecho / correo ───────────────────────────

export async function cancelarCambio(ctx: ServerOrgContext, changeId: string, db: SupabaseClient = getServiceClient()) {
  await exigirPermiso(ctx, PERMISO_CAMBIO);
  await cargarCambio(db, ctx.organizationId, changeId);
  const { data, error } = await db.rpc('fn_web_order_change_cancelar', { p_change_id: changeId, p_user: ctx.userId, p_estado: 'cancelled' });
  if (error) throw errorDeRpc(error.message);
  await desactivarLinkCambio(db, changeId);
  return data;
}

/**
 * Apaga el link de pago de un cambio cancelado o vencido.
 * - Wompi: PATCH /payment_links/{id} {active:false} → marca link_disabled_at.
 * - Bold: su API de links no tiene endpoint para anular (solo crear y consultar); el link muere en
 *   su expiration_date (la misma vigencia del cambio). Si alguien paga antes, el webhook lo registra
 *   como pago tardío (fn_web_order_change_pago_tardio) con alerta en el pedido.
 * Nunca lanza: un fallo de la pasarela no debe bloquear la cancelación.
 */
export async function desactivarLinkCambio(db: SupabaseClient, changeId: string): Promise<'desactivado' | 'no_soportado' | 'fallo' | 'sin_link'> {
  try {
    const { data: c } = await db
      .from('web_order_changes')
      .select('id, provider_code, integration_connection_id, qr_session_id, link_disabled_at')
      .eq('id', changeId)
      .maybeSingle();
    const cambio = c as Fila | null;
    if (!cambio || !cambio.qr_session_id || cambio.link_disabled_at) return 'sin_link';
    if (cambio.provider_code !== 'wompi_link') return 'no_soportado';
    const { data: s } = await db.from('payment_qr_sessions').select('external_qr_id').eq('id', String(cambio.qr_session_id)).maybeSingle();
    const linkId = (s as Fila | null)?.external_qr_id;
    if (!linkId || !cambio.integration_connection_id) return 'sin_link';
    const creds = await wompiService.getCredentials(String(cambio.integration_connection_id), db);
    if (!creds) return 'fallo';
    const ok = await wompiService.deactivatePaymentLink(creds, String(linkId));
    if (!ok) return 'fallo';
    await db.from('web_order_changes').update({ link_disabled_at: new Date().toISOString() }).eq('id', changeId);
    return 'desactivado';
  } catch (e) {
    console.error('[CambioPedido] desactivarLinkCambio:', e instanceof Error ? e.message : e);
    return 'fallo';
  }
}

export async function listarCambios(ctx: ServerOrgContext, orderId: string, db: SupabaseClient = getServiceClient()) {
  await cargarPedido(db, ctx.organizationId, orderId);
  const base = 'id, estado, delta_total, subtotal_delta, tax_delta, shipping_delta, payment_link_url, provider_code, provider_reference, expires_at, paid_at, refund_mode, refund_status, credit_note_id, customer_credit_id, items_before, items_after, motivo, created_at, applied_at, cancelled_at, link_disabled_at, late_payment_at, alerta';
  const leer = (cols: string) => db
    .from('web_order_changes')
    .select(cols)
    .eq('web_order_id', orderId)
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(50);
  let { data, error } = await leer(`${base}, email_sent_at, email_sent_count, email_sent_to_masked`);
  if (error && COLUMNA_FALTANTE.has(String((error as { code?: string }).code ?? ''))) {
    console.warn('[CambioPedido] faltan las columnas email_* de web_order_changes; se listan sin rastro de correo.');
    ({ data, error } = await leer(base));
  }
  return {
    cambios: (data as unknown as Fila[] | null) ?? [],
    pasarelas: (await conexionesDeLink(db, ctx.organizationId, null)).map((c) => ({ id: c.id, code: c.connectorCode })),
    negocio: await nombreNegocio(db, ctx.organizationId),
    puedeCambiar: await tienePermiso(ctx, PERMISO_CAMBIO),
    puedeReembolsar: await tienePermiso(ctx, PERMISO_REEMBOLSO),
  };
}

/** Marca hecho el reembolso manual (el dinero ya se devolvió desde la pasarela). */
export async function marcarReembolsoHecho(ctx: ServerOrgContext, changeId: string, db: SupabaseClient = getServiceClient()) {
  await exigirPermiso(ctx, PERMISO_REEMBOLSO);
  const { data, error } = await db
    .from('web_order_changes')
    .update({ refund_status: 'done', updated_at: new Date().toISOString() })
    .eq('id', changeId)
    .eq('organization_id', ctx.organizationId)
    .eq('refund_status', 'manual_pending')
    .select('id')
    .maybeSingle();
  if (error || !data) throw new CambioPedidoError(409, 'SIN_REEMBOLSO_PENDIENTE', 'No hay reembolso manual pendiente.');
  return data;
}

export async function enviarCorreoCambio(ctx: ServerOrgContext, changeId: string, db: SupabaseClient = getServiceClient()) {
  await exigirPermiso(ctx, PERMISO_CAMBIO);
  const cambio = await cargarCambio(db, ctx.organizationId, changeId);
  if (cambio.estado !== 'pending_payment' || !cambio.payment_link_url) {
    throw new CambioPedidoError(409, 'SIN_LINK', 'El cambio no tiene un link de pago vigente.');
  }
  const pedido = await cargarPedido(db, ctx.organizationId, String(cambio.web_order_id));
  const correo = String(pedido.customer_email ?? '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new CambioPedidoError(400, 'SIN_CORREO', 'El pedido no tiene correo del cliente.');
  if (!getMasterResendKey()) throw new CambioPedidoError(503, 'SIN_PROVEEDOR_CORREO', 'El envío de correos no está configurado.');
  const negocio = await nombreNegocio(db, ctx.organizationId);
  const zona = await zonaHorariaEnServidor({ supabase: db, organizationId: ctx.organizationId }, (pedido.branch_id as number | null) ?? null);
  const plantilla = correoCambio({
    negocio,
    numeroPedido: String(pedido.order_number),
    nombreCliente: String(pedido.customer_name ?? ''),
    montoTexto: new Intl.NumberFormat('es-CO', { style: 'currency', currency: MONEDA_RIELES_QR, maximumFractionDigits: 0 }).format(Number(cambio.delta_total)),
    url: String(cambio.payment_link_url),
    vence: cambio.expires_at ? new Date(String(cambio.expires_at)).toLocaleString('es-CO', { timeZone: zona }) : null,
    colorMarca: await colorDeMarca(db, ctx.organizationId).catch(() => null),
  });
  const envio = await remitenteCambio(db, ctx.organizationId, negocio);
  const { data: enviado, error } = await envio.cliente.emails.send({
    from: envio.from,
    to: correo,
    subject: plantilla.asunto,
    html: plantilla.html,
    text: plantilla.text,
    ...(envio.replyTo ? { replyTo: envio.replyTo } : {}),
  });
  if (error) throw new CambioPedidoError(502, 'CORREO_FALLO', 'No se pudo enviar el correo.');
  return registrarEnvioCorreo(ctx, db, cambio, pedido, {
    messageId: (enviado as { id?: string } | null)?.id ?? null,
    destinoMasked: enmascararCorreo(correo),
    dominio: envio.dominio,
    zona,
  });
}

/** l***@dominio.com: primera letra del local-part y el dominio completo. */
export function enmascararCorreo(correo: string): string {
  const [local, dominio] = correo.trim().split('@');
  if (!local || !dominio) return '***';
  return `${local[0]}***@${dominio.toLowerCase()}`;
}

export interface RemitenteCambio {
  cliente: { emails: { send: (p: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } };
  from: string;
  replyTo: string | null;
  /** Dominio desde el que sale; `null` = respaldo de la plataforma. */
  dominio: string | null;
}

const limpiarNombre = (n: string) => n.replace(/[<>"]/g, '').trim();

/**
 * Remitente del correo del cambio. Reutiliza `resolveSender` del CRM (email_domains verificados
 * de la org, con su from_email —hoy pedidos@<dominio>— y su reply_to). Si la org no tiene dominio
 * verificado y su política lo permite, sale desde la plataforma (EMAIL_FROM_ADDRESS), con el reply-to
 * de la tienda si está registrado. Con política «block» lanza REMITENTE_BLOQUEADO. No crea ni modifica dominios.
 */
export async function remitenteCambio(db: SupabaseClient, organizationId: number, negocio: string): Promise<RemitenteCambio> {
  // Igual que el resto del sistema (CRM, documentos): un error de resolveSender no se salta.
  // Si la política de la org es «block» y no hay dominio verificado, resolveSender lanza NO_SENDER
  // y NO se envía desde la plataforma.
  let s: Awaited<ReturnType<typeof resolveSender>>;
  try {
    s = await resolveSender(organizationId, { kind: 'transactional', orgName: negocio }, db);
  } catch (e) {
    if (isEmailError(e) && e.code === 'NO_SENDER') {
      throw new CambioPedidoError(422, 'REMITENTE_BLOQUEADO', 'La tienda exige enviar desde su propio dominio verificado y no tiene uno activo.');
    }
    console.error('[CambioPedido] no se pudo resolver el remitente:', e instanceof Error ? e.message : e);
    throw new CambioPedidoError(502, 'REMITENTE_FALLO', 'No se pudo preparar el remitente del correo.');
  }
  if (s.mode === 'org' && s.domain && s.fromEmail) {
    const nombre = limpiarNombre(negocio || s.domain.from_name || '');
    return {
      cliente: getResendClient(s.apiKey) as unknown as RemitenteCambio['cliente'],
      from: nombre ? `${nombre} <${s.fromEmail}>` : s.fromEmail,
      replyTo: s.replyTo,
      dominio: s.domain.domain,
    };
  }
  let replyTo: string | null = null;
  try {
    const { data } = await db.from('email_domains').select('reply_to, is_default').eq('organization_id', organizationId);
    const filas = ((data as Fila[] | null) ?? []).filter((f) => typeof f.reply_to === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.reply_to)));
    replyTo = String((filas.find((f) => f.is_default) ?? filas[0])?.reply_to ?? '') || null;
  } catch {
    replyTo = null;
  }
  return {
    cliente: getMasterResend() as unknown as RemitenteCambio['cliente'],
    from: `${limpiarNombre(negocio || process.env.EMAIL_FROM_NAME || 'GO Admin')} <${process.env.EMAIL_FROM_ADDRESS || 'notificaciones@goadmin.io'}>`,
    replyTo,
    dominio: null,
  };
}

const COLUMNA_FALTANTE = new Set(['42703', 'PGRST204']);

const FUNCION_FALTANTE = new Set(['42883', 'PGRST202']);

/**
 * Rastro del envío. Camino normal: fn_web_order_change_registrar_correo (atómica: contador +1 en SQL,
 * nota interna con coalesce(internal_notes,'') || nota y ops_audit_log). Si la función no existe
 * (42883/PGRST202) NO se escriben notas desde el código: se intenta guardar las columnas email_* (si
 * existen) y se deja el registro en ops_audit_log, con un aviso en el log. Nunca lanza: el correo ya salió.
 */
async function registrarEnvioCorreo(
  ctx: ServerOrgContext,
  db: SupabaseClient,
  cambio: Fila,
  pedido: WebOrder & Fila,
  d: { messageId: string | null; destinoMasked: string; dominio: string | null; zona: string },
) {
  const base = { ok: true as const, email_message_id: d.messageId, email_sent_to_masked: d.destinoMasked, from_domain: d.dominio };
  try {
    const { data, error } = await db.rpc('fn_web_order_change_registrar_correo', {
      p_change_id: String(cambio.id),
      p_organization_id: ctx.organizationId,
      p_message_id: d.messageId,
      p_to_masked: d.destinoMasked,
      p_user: ctx.userId,
      p_from_domain: d.dominio,
      p_timezone: d.zona,
    });
    if (!error) {
      const r = (data ?? {}) as Fila;
      return { ...base, email_sent_at: String(r.email_sent_at ?? new Date().toISOString()), email_sent_count: Number(r.email_sent_count ?? 1), rastro: true };
    }
    const code = String((error as { code?: string }).code ?? '');
    if (FUNCION_FALTANTE.has(code)) console.warn('[CambioPedido] falta fn_web_order_change_registrar_correo (migración 20261028230000); rastro parcial sin nota interna.');
    else console.warn('[CambioPedido] no se pudo registrar el envío del correo:', (error as { message?: string }).message ?? code);
  } catch (e) {
    console.warn('[CambioPedido] no se pudo registrar el envío del correo:', e instanceof Error ? e.message : e);
  }
  return respaldoRastro(ctx, db, cambio, pedido, d, base);
}

async function respaldoRastro(
  ctx: ServerOrgContext,
  db: SupabaseClient,
  cambio: Fila,
  pedido: WebOrder & Fila,
  d: { messageId: string | null; destinoMasked: string; dominio: string | null },
  base: { ok: true; email_message_id: string | null; email_sent_to_masked: string; from_domain: string | null },
) {
  const enviadoEn = new Date().toISOString();
  const veces = Number(cambio.email_sent_count ?? 0) + 1;
  let rastro = true;
  try {
    const { error } = await db
      .from('web_order_changes')
      .update({ email_sent_at: enviadoEn, email_sent_count: veces, email_message_id: d.messageId, email_sent_to_masked: d.destinoMasked })
      .eq('id', String(cambio.id))
      .eq('organization_id', ctx.organizationId);
    if (error) {
      rastro = false;
      const code = String((error as { code?: string }).code ?? '');
      if (COLUMNA_FALTANTE.has(code)) console.warn('[CambioPedido] faltan las columnas email_* de web_order_changes (migración 20261028230000); el correo salió sin rastro.');
      else console.warn('[CambioPedido] no se pudo guardar el rastro del correo:', (error as { message?: string }).message ?? code);
    }
  } catch (e) {
    rastro = false;
    console.warn('[CambioPedido] no se pudo guardar el rastro del correo:', e instanceof Error ? e.message : e);
  }
  try {
    const { error: eAudit } = await db.from('ops_audit_log').insert({
      organization_id: ctx.organizationId,
      branch_id: (pedido.branch_id as number | null) ?? null,
      user_id: ctx.userId,
      entity_type: 'web_orders',
      entity_id: String(pedido.id),
      action: 'WEB_ORDER_CHANGE_EMAIL_SENT',
      metadata: { change_id: cambio.id, to_masked: d.destinoMasked, message_id: d.messageId, from_domain: d.dominio, count: veces },
    });
    if (eAudit) console.warn('[CambioPedido] no se pudo registrar el envío en ops_audit_log:', eAudit.message);
  } catch (e) {
    console.warn('[CambioPedido] no se pudo registrar el envío en ops_audit_log:', e instanceof Error ? e.message : e);
  }
  return { ...base, email_sent_at: enviadoEn, email_sent_count: veces, rastro };
}

export function respuestaError(err: unknown): Response {
  if (err instanceof CambioPedidoError) {
    return new Response(JSON.stringify({ error: err.message, code: err.code, ...(err.extra ?? {}) }), {
      status: err.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  console.error('[webOrderChanges] error', err instanceof Error ? err.message : err);
  return new Response(JSON.stringify({ error: 'Error interno', code: 'ERROR_INTERNO' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
}
