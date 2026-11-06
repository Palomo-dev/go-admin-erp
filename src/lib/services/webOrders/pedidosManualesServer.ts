/**
 * Pedidos online: pedido manual, reconstrucción de pedidos pagados y «Pagos sin pedido».
 * SOLO SERVIDOR. La organización sale SIEMPRE del contexto (`withOrg`), nunca del body.
 *
 * NO toca: webhooks de pasarelas, firmas, secretos ni credenciales (solo se leen con los servicios
 * existentes), checkout, Widget, PSE, configuración de pasarelas, `organization_domains` ni datos
 * de otras organizaciones. A la pasarela solo se le CONSULTA (`consultaPasarela.server.ts`); el
 * único llamado que crea algo allá es el link de pago del pedido manual, con el mismo
 * `createPaymentLink` de los cambios de pedido.
 *
 * El link del pedido manual NO registra sesión de cobro (`payment_qr_sessions`): si la tuviera,
 * el webhook insertaría un pago y `autoConfirmPaidOrder` otro. El vínculo link ↔ pedido queda en
 * `integration_object_mappings` (external_type 'payment_link') y el pago se registra al
 * reconstruirlo: la transacción trae su `payment_link_id` y se reconoce el pedido.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import { boldService } from '@/lib/services/integrations/bold';
import { MONEDA_RIELES_QR } from '@/lib/services/integrations/qrShared/cobroQrServidor';
import { webOrderServerConfirmation } from '@/lib/services/webOrderServerConfirmation';
import {
  CambioPedidoError,
  conexionesDeLink,
  exigirPermiso,
  lineasConPrecio,
  PERMISO_CAMBIO,
} from '@/lib/services/webOrderChanges/webOrderChangesServer';
import {
  consultarCobro,
  cobroDeEvento,
  DEPS_REALES,
  pasarelasConectadas,
  NOMBRE_PASARELA,
  type CobroPasarela,
  type ConexionPago,
  type DepsConsulta,
} from '@/lib/services/pagos/consultaPasarela.server';
import {
  decidirReconstruccion,
  generarNumeroPedidoWeb,
  montoCoincide,
  notaReconstruccion,
  organizacionDelNumero,
  sedeSugerida,
  totalesPedidoManual,
  PedidoManualError,
  type LineaManual,
  type PedidoExistente,
} from '@/lib/pos/pedidosWeb/pedidoManual';

/** Marcar pagado un pedido online: reconstruir y ver pagos sin pedido. */
export const PERMISO_RECONSTRUIR = 'pos.pedidos_web.marcar_pagado';
/** Crear un pedido manual: el mismo permiso que cambiar productos de un pedido online. */
export const PERMISO_PEDIDO_MANUAL = PERMISO_CAMBIO;

const VIGENCIA_LINK_HORAS = 48;
const CANALES = ['whatsapp', 'phone', 'website'] as const;
type Canal = (typeof CANALES)[number];
const ENTREGAS = ['pickup', 'delivery_own'] as const;

type Fila = Record<string, unknown>;

// ─── Tipos de entrada ───────────────────────────────────────────────────────

export interface ClienteManual {
  nombre: string;
  celular?: string | null;
  correo?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
}

export interface ItemPedido {
  product_id: number;
  quantity: number;
  /** Solo al reconstruir: el precio que se cobró (por defecto, el vigente). */
  unit_price?: number | null;
}

export interface PedidoManualBody {
  branch_id: number;
  cliente: ClienteManual;
  items: ItemPedido[];
  envio?: number | null;
  delivery_type?: (typeof ENTREGAS)[number];
  canal?: Canal;
  notas?: string | null;
  /** false: no generar link aunque haya pasarela. */
  generar_link?: boolean;
  connection_id?: string | null;
}

export interface ReconstruirBody extends Omit<PedidoManualBody, 'generar_link' | 'branch_id'> {
  branch_id?: number | null;
  connection_id: string;
  transaccion?: string | null;
  referencia?: string | null;
  valor: number;
  /** ISO o `YYYY-MM-DDTHH:mm` de la fecha del pago (confirmed_at). */
  fecha?: string | null;
  /** Sin prefijo WO-…: el usuario confirma en pantalla que el cobro es de esta tienda. */
  confirmar_tienda?: boolean;
}

/** Dependencias (las pruebas inyectan mocks; nunca se llama a una API real). */
export interface DepsPedidos {
  db: SupabaseClient;
  consulta: DepsConsulta;
  autoConfirmar: (orderId: string) => Promise<{ saleId: string; stockErrors: string[] }>;
  crearLink: typeof crearLinkPedido;
  ahora: () => number;
}

const depsReales = (): DepsPedidos => ({
  db: getServiceClient(),
  consulta: DEPS_REALES,
  autoConfirmar: (id) => webOrderServerConfirmation.autoConfirmPaidOrder(id),
  crearLink: crearLinkPedido,
  ahora: () => Date.now(),
});

function texto(v: unknown, max: number): string | null {
  const t = String(v ?? '').trim();
  return t ? t.slice(0, max) : null;
}

function errorDeLogica(e: unknown): never {
  if (e instanceof PedidoManualError) throw new CambioPedidoError(400, e.code, e.message);
  throw e;
}

// ─── Lectura de apoyo ───────────────────────────────────────────────────────

async function sedeDeLaOrg(db: SupabaseClient, organizationId: number, branchId: unknown): Promise<number> {
  const id = Number(branchId);
  if (!Number.isInteger(id) || id <= 0) throw new CambioPedidoError(400, 'SEDE_REQUERIDA', 'Elige la tienda (sede) del pedido.');
  const { data } = await db.from('branches').select('id').eq('id', id).eq('organization_id', organizationId).maybeSingle();
  if (!data) throw new CambioPedidoError(400, 'SEDE_INVALIDA', 'La sede no es de la organización.');
  return id;
}

/** IVA incluido en el precio: el del impuesto por defecto de la organización (como la tienda). */
async function impuestoIncluido(db: SupabaseClient, organizationId: number): Promise<boolean> {
  const { data } = await db
    .from('organization_taxes')
    .select('tax_included')
    .eq('organization_id', organizationId)
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return (data as Fila | null)?.tax_included === true;
}

async function lineasDelPedido(db: SupabaseClient, organizationId: number, items: ItemPedido[], incluido: boolean): Promise<LineaManual[]> {
  if (!Array.isArray(items) || items.length === 0) throw new CambioPedidoError(400, 'SIN_ITEMS', 'Agrega al menos un producto.');
  const vigentes = await lineasConPrecio(db, organizationId, items.map((i) => ({ product_id: Number(i.product_id), quantity: Number(i.quantity) })), incluido);
  return vigentes.map((l, i) => {
    const propio = items[i]?.unit_price;
    return {
      product_id: l.product_id,
      nombre: l.nombre,
      sku: l.sku ?? null,
      quantity: l.quantity,
      unit_price: propio !== undefined && propio !== null && Number.isFinite(Number(propio)) ? Number(propio) : l.precio,
      tasa: l.tasa,
    };
  });
}

function filaPedido(
  organizationId: number,
  branchId: number,
  orderNumber: string,
  body: Pick<PedidoManualBody, 'cliente' | 'delivery_type' | 'canal' | 'notas'>,
  totales: ReturnType<typeof totalesPedidoManual>,
): Fila {
  const nombre = texto(body.cliente?.nombre, 120);
  if (!nombre) throw new CambioPedidoError(400, 'CLIENTE_REQUERIDO', 'Escribe el nombre del cliente.');
  const entrega = ENTREGAS.includes(body.delivery_type as (typeof ENTREGAS)[number]) ? body.delivery_type! : 'pickup';
  const canal = CANALES.includes(body.canal as Canal) ? body.canal! : 'whatsapp';
  const direccion = texto(body.cliente?.direccion, 300);
  return {
    organization_id: organizationId,
    branch_id: branchId,
    order_number: orderNumber,
    status: 'pending',
    source: canal,
    subtotal: totales.subtotal,
    tax_total: totales.tax_total,
    discount_total: 0,
    delivery_fee: totales.delivery_fee,
    total: totales.total,
    delivery_type: entrega,
    delivery_address: direccion ? { address: direccion, ...(texto(body.cliente?.ciudad, 80) ? { city: texto(body.cliente?.ciudad, 80) } : {}) } : {},
    payment_status: 'pending',
    customer_name: nombre,
    customer_phone: texto(body.cliente?.celular, 30),
    customer_email: texto(body.cliente?.correo, 160)?.toLowerCase() ?? null,
    customer_notes: texto(body.notas, 1000),
  };
}

async function insertarItems(db: SupabaseClient, orderId: string, items: ReturnType<typeof totalesPedidoManual>['items']): Promise<string | null> {
  const { error } = await db.from('web_order_items').insert(items.map((i) => ({ ...i, web_order_id: orderId })));
  return error ? error.message : null;
}

// ─── Link de pago (patrón de los cambios de pedido) ─────────────────────────

export interface LinkPedido {
  url: string;
  externalId: string;
  proveedor: 'wompi_co' | 'bold_link';
  connectionId: string;
}

/** Link de pago Wompi o Bold por el total del pedido, con la referencia = número del pedido. */
export async function crearLinkPedido(
  db: SupabaseClient,
  organizationId: number,
  pedido: { id: string; order_number: string; total: number },
  connectionId?: string | null,
): Promise<LinkPedido | null> {
  const conexiones = await conexionesDeLink(db, organizationId);
  const conexion = connectionId ? conexiones.find((c) => c.id === connectionId) : conexiones[0];
  if (!conexion) return null;
  const { data: org } = await db.from('organizations').select('name').eq('id', organizationId).maybeSingle();
  const negocio = String((org as Fila | null)?.name ?? '') || 'Tienda';
  const vence = new Date(Date.now() + VIGENCIA_LINK_HORAS * 3600 * 1000).toISOString();
  const descripcion = `Pedido ${pedido.order_number}`;
  if (conexion.connectorCode === 'wompi_co') {
    const creds = await wompiService.getCredentials(conexion.id, db);
    if (!creds) return null;
    const link = await wompiService.createPaymentLink(creds, {
      name: `${negocio} · ${pedido.order_number}`,
      description: descripcion,
      amount_in_cents: Math.round(Number(pedido.total) * 100),
      currency: MONEDA_RIELES_QR,
      expires_at: vence,
      sku: pedido.order_number,
    });
    return link ? { url: link.url, externalId: link.id, proveedor: 'wompi_co', connectionId: conexion.id } : null;
  }
  const link = await boldService.createPaymentLink(conexion.id, {
    amount: Math.round(Number(pedido.total)),
    currency: MONEDA_RIELES_QR,
    reference: pedido.order_number,
    description: descripcion,
    expires_in: VIGENCIA_LINK_HORAS * 3600,
    metadata: { reference: pedido.order_number, source: 'web_order_manual', sourceId: pedido.id, organizationId },
  } as Parameters<typeof boldService.createPaymentLink>[1]);
  return link ? { url: link.link_url, externalId: link.id, proveedor: 'bold_link', connectionId: conexion.id } : null;
}

// ─── 1 · Pedido manual ──────────────────────────────────────────────────────

export async function crearPedidoManual(ctx: ServerOrgContext, body: PedidoManualBody, deps: DepsPedidos = depsReales()) {
  await exigirPermiso(ctx, PERMISO_PEDIDO_MANUAL);
  const { db } = deps;
  const org = ctx.organizationId;
  const branchId = await sedeDeLaOrg(db, org, body?.branch_id);
  const incluido = await impuestoIncluido(db, org);
  const lineas = await lineasDelPedido(
    db,
    org,
    (body.items ?? []).map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
    incluido,
  );
  let totales: ReturnType<typeof totalesPedidoManual>;
  try {
    totales = totalesPedidoManual(lineas, { envio: body.delivery_type === 'delivery_own' ? body.envio : 0, impuestoIncluido: incluido });
  } catch (e) {
    errorDeLogica(e);
  }
  const orderNumber = generarNumeroPedidoWeb(org, deps.ahora());
  const fila = { ...filaPedido(org, branchId, orderNumber, body, totales), internal_notes: `[Pedido manual] ${ctx.userEmail ?? ctx.userId}` };
  const { data: pedido, error } = await db.from('web_orders').insert(fila).select('id, order_number, total').single();
  if (error || !pedido) throw new CambioPedidoError(500, 'PEDIDO_FALLO', `No se pudo crear el pedido: ${error?.message ?? 'sin datos'}`);
  const orderId = String((pedido as Fila).id);

  // Líneas y reserva de stock: lo mismo que la tienda; si falla, el pedido se cancela.
  const errItems = await insertarItems(db, orderId, totales.items);
  if (errItems) {
    await db.from('web_orders').update({ status: 'cancelled', cancellation_reason: 'Error al guardar los ítems del pedido manual', cancelled_at: new Date().toISOString() }).eq('id', orderId).eq('organization_id', org);
    throw new CambioPedidoError(500, 'PEDIDO_SIN_LINEAS', 'No se pudieron guardar los productos del pedido.');
  }
  const { data: reserva, error: errReserva } = await db.rpc('reserve_stock_for_web_order', {
    p_organization_id: org,
    p_branch_id: branchId,
    p_order_id: orderId,
    p_items: totales.items.map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
  });
  const r = (reserva ?? {}) as { ok?: boolean; shortages?: unknown };
  if (errReserva || r.ok === false) {
    await db.from('web_orders').update({ status: 'cancelled', cancellation_reason: 'Stock insuficiente al reservar (pedido manual)', cancelled_at: new Date().toISOString() }).eq('id', orderId).eq('organization_id', org);
    throw new CambioPedidoError(409, errReserva ? 'RESERVA_NO_DISPONIBLE' : 'STOCK_INSUFICIENTE', 'No hay stock suficiente en la sede.', { shortages: r.shortages ?? [] });
  }

  // Link de pago si la organización tiene Wompi o Bold conectado.
  let link: LinkPedido | null = null;
  let aviso: string | null = null;
  if (body.generar_link !== false) {
    try {
      link = await deps.crearLink(db, org, { id: orderId, order_number: orderNumber, total: totales.total }, body.connection_id);
      if (!link) aviso = 'SIN_PASARELA_LINK';
    } catch (e) {
      console.error('[pedidoManual] link de pago', e instanceof Error ? e.message : e);
      aviso = 'LINK_FALLO';
    }
    if (link) {
      const { error: eMap } = await db.from('integration_object_mappings').insert({
        connection_id: link.connectionId,
        external_type: 'payment_link',
        external_id: link.externalId,
        internal_table: 'web_orders',
        internal_id: orderId,
        metadata: { order_number: orderNumber, url: link.url, proveedor: link.proveedor },
      });
      if (eMap) console.error('[pedidoManual] vínculo del link:', eMap.message);
      await db
        .from('web_orders')
        .update({ internal_notes: `${fila.internal_notes} · Link de pago ${NOMBRE_PASARELA[link.proveedor]}: ${link.url}` })
        .eq('id', orderId)
        .eq('organization_id', org);
    }
  }
  return { pedido: { id: orderId, order_number: orderNumber, total: totales.total }, link: link ? { url: link.url, proveedor: link.proveedor } : null, aviso };
}

// ─── 2 · Reconstruir un pedido pagado ───────────────────────────────────────

async function conexionDeLaOrg(db: SupabaseClient, organizationId: number, connectionId: string): Promise<ConexionPago> {
  const conexiones = await pasarelasConectadas(db, organizationId);
  const c = conexiones.find((x) => x.id === connectionId);
  if (!c) throw new CambioPedidoError(400, 'PASARELA_INVALIDA', 'Elige una pasarela conectada de la organización.');
  return c;
}

/** Pedidos que ya usan este cobro (número, transacción o link), de cualquier organización. */
async function pedidosDelCobro(db: SupabaseClient, conexion: ConexionPago, cobro: CobroPasarela): Promise<PedidoExistente[]> {
  const encontrados = new Map<string, PedidoExistente>();
  const campos = 'id, organization_id, order_number, payment_status, payment_reference';
  const agregar = (filas: Fila[] | null) => {
    for (const f of filas ?? []) {
      encontrados.set(String(f.id), {
        id: String(f.id),
        organization_id: Number(f.organization_id),
        order_number: String(f.order_number),
        payment_status: (f.payment_status as string | null) ?? null,
        payment_reference: (f.payment_reference as string | null) ?? null,
      });
    }
  };
  if (cobro.referencia) {
    const { data } = await db.from('web_orders').select(campos).eq('order_number', cobro.referencia).limit(5);
    agregar(data as Fila[] | null);
  }
  if (cobro.transaccionId) {
    const { data } = await db.from('web_orders').select(campos).eq('payment_reference', cobro.transaccionId).limit(5);
    agregar(data as Fila[] | null);
  }
  if (cobro.paymentLinkId) {
    const { data: vinculos } = await db
      .from('integration_object_mappings')
      .select('internal_id')
      .eq('connection_id', conexion.id)
      .eq('external_type', 'payment_link')
      .eq('external_id', cobro.paymentLinkId)
      .eq('internal_table', 'web_orders')
      .is('deleted_at', null)
      .limit(5);
    const ids = ((vinculos as Fila[] | null) ?? []).map((v) => String(v.internal_id));
    if (ids.length > 0) {
      const { data } = await db.from('web_orders').select(campos).in('id', ids);
      agregar(data as Fila[] | null);
    }
  }
  return Array.from(encontrados.values());
}

async function cobroVerificado(db: SupabaseClient, conexion: ConexionPago, body: Pick<ReconstruirBody, 'transaccion' | 'referencia' | 'valor'>, deps: DepsConsulta): Promise<CobroPasarela> {
  if (!conexion.consultable) throw new CambioPedidoError(501, 'PASARELA_SIN_CONSULTA', `${NOMBRE_PASARELA[conexion.connectorCode]} todavía no se puede consultar.`);
  const cobro = await consultarCobro(db, conexion, { transaccionId: body.transaccion, referencia: body.referencia }, deps);
  if (cobro.estado === 'sin_credenciales') throw new CambioPedidoError(412, 'PASARELA_SIN_CREDENCIALES', 'La conexión no tiene credenciales activas.');
  if (cobro.estado === 'no_soportada') throw new CambioPedidoError(400, 'CONSULTA_NO_SOPORTADA', 'Esta pasarela solo se consulta por ID de transacción.');
  if (cobro.estado === 'error') throw new CambioPedidoError(502, 'PASARELA_NO_RESPONDE', 'La pasarela no respondió. Intenta de nuevo.');
  if (cobro.estado === 'no_encontrada') throw new CambioPedidoError(404, 'COBRO_NO_ENCONTRADO', 'La pasarela no tiene un cobro con esa referencia o ID.');
  if (cobro.estado !== 'aprobada') throw new CambioPedidoError(409, 'COBRO_NO_APROBADO', `El cobro está ${cobro.estadoPasarela ?? cobro.estado}: solo se reconstruyen cobros aprobados.`, { cobro });
  if (cobro.moneda && cobro.moneda !== MONEDA_RIELES_QR) throw new CambioPedidoError(409, 'MONEDA_DISTINTA', `El cobro está en ${cobro.moneda}.`, { cobro });
  if (!montoCoincide(cobro.montoCentavos, Number(body.valor))) {
    throw new CambioPedidoError(409, 'MONTO_DISTINTO', 'El valor no coincide con el cobro de la pasarela.', { cobro, valorPasarela: (cobro.montoCentavos ?? 0) / 100 });
  }
  return cobro;
}

function fechaDelPago(body: { fecha?: string | null }, cobro: CobroPasarela): string {
  const d = new Date(String(body.fecha || cobro.fecha || ''));
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function sugerirSede(db: SupabaseClient, organizationId: number, productos: number[]): Promise<number | null> {
  if (productos.length === 0) return null;
  const { data: sedes } = await db.from('branches').select('id').eq('organization_id', organizationId).eq('is_active', true);
  const ids = ((sedes as Fila[] | null) ?? []).map((s) => Number(s.id));
  if (ids.length === 0) return null;
  const { data } = await db.from('stock_levels').select('branch_id, product_id, qty_on_hand, qty_reserved').in('branch_id', ids).in('product_id', productos);
  return sedeSugerida(
    productos,
    ((data as Fila[] | null) ?? []).map((e) => ({ branch_id: Number(e.branch_id), product_id: Number(e.product_id), disponible: Number(e.qty_on_hand) - Number(e.qty_reserved ?? 0) })),
  );
}

/** Paso previo: consulta y dice qué pasaría, SIN escribir nada. */
export async function verificarCobro(ctx: ServerOrgContext, body: ReconstruirBody, deps: DepsPedidos = depsReales()) {
  await exigirPermiso(ctx, PERMISO_RECONSTRUIR);
  const conexion = await conexionDeLaOrg(deps.db, ctx.organizationId, String(body.connection_id ?? ''));
  const cobro = await cobroVerificado(deps.db, conexion, body, deps.consulta);
  const decision = decidirReconstruccion({
    organizationId: ctx.organizationId,
    referencia: cobro.referencia,
    transaccionId: String(cobro.transaccionId),
    existentes: await pedidosDelCobro(deps.db, conexion, cobro),
  });
  const productos = (body.items ?? []).map((i) => Number(i.product_id)).filter((n) => Number.isInteger(n) && n > 0);
  const sugerida = decision.tipo === 'crear_nuevo' ? await sugerirSede(deps.db, ctx.organizationId, productos) : null;
  return { cobro, decision: { tipo: decision.tipo, ...(decision.tipo === 'rechazar' ? { code: decision.code } : {}) }, sede_sugerida: sugerida };
}

export async function reconstruirPedido(ctx: ServerOrgContext, body: ReconstruirBody, deps: DepsPedidos = depsReales()) {
  await exigirPermiso(ctx, PERMISO_RECONSTRUIR);
  const { db } = deps;
  const org = ctx.organizationId;
  const conexion = await conexionDeLaOrg(db, org, String(body?.connection_id ?? ''));
  const cobro = await cobroVerificado(db, conexion, body, deps.consulta);
  const tx = String(cobro.transaccionId);
  const decision = decidirReconstruccion({ organizationId: org, referencia: cobro.referencia, transaccionId: tx, existentes: await pedidosDelCobro(db, conexion, cobro) });
  const confirmadoEn = fechaDelPago(body, cobro);
  const nota = notaReconstruccion({
    proveedor: NOMBRE_PASARELA[conexion.connectorCode],
    transaccionId: tx,
    referenciaOriginal: decision.tipo === 'crear_nuevo' ? decision.notaOriginal || null : null,
  });

  if (decision.tipo === 'ya_existe') return { estado: 'ya_existia' as const, pedido: decision.pedido, cobro };
  if (decision.tipo === 'rechazar') {
    throw new CambioPedidoError(409, decision.code, decision.code === 'OTRA_ORGANIZACION'
      ? 'La referencia es de otra tienda (prefijo WO-…): reconstrúyelo desde esa organización.'
      : 'Ese cobro ya tiene pedido en otra organización.');
  }

  let orderId: string;
  let orderNumber: string;
  if (decision.tipo === 'completar') {
    // Pedido que existe sin pagar (p. ej. el manual con link): se marca pagado ESE pedido.
    const { data: actual } = await db.from('web_orders').select('id, total, order_number').eq('id', decision.pedido.id).eq('organization_id', org).maybeSingle();
    if (!actual) throw new CambioPedidoError(404, 'PEDIDO_NO_ENCONTRADO', 'Pedido no encontrado');
    if (!montoCoincide(cobro.montoCentavos, Number((actual as Fila).total))) {
      throw new CambioPedidoError(409, 'MONTO_DISTINTO_PEDIDO', `El cobro no coincide con el total del pedido ${(actual as Fila).order_number}.`);
    }
    const { data: marcado, error } = await db
      .from('web_orders')
      .update({ payment_status: 'paid', payment_reference: tx, payment_method: cobro.metodo, updated_at: new Date().toISOString() })
      .eq('id', decision.pedido.id)
      .eq('organization_id', org)
      .neq('payment_status', 'paid')
      .select('id, order_number')
      .maybeSingle();
    if (error) throw new CambioPedidoError(500, 'PEDIDO_FALLO', error.message);
    if (!marcado) return { estado: 'ya_existia' as const, pedido: decision.pedido, cobro };
    orderId = decision.pedido.id;
    orderNumber = decision.pedido.order_number;
  } else {
    if (decision.tipo === 'crear_nuevo' && body.confirmar_tienda !== true) {
      const productos = (body.items ?? []).map((i) => Number(i.product_id)).filter((n) => Number.isInteger(n) && n > 0);
      throw new CambioPedidoError(409, 'CONFIRMAR_TIENDA', 'El cobro no trae el prefijo WO-… de la tienda: confírmalo antes de crear el pedido.', {
        sede_sugerida: await sugerirSede(db, org, productos),
        referencia: cobro.referencia,
      });
    }
    const branchId = await sedeDeLaOrg(db, org, body.branch_id);
    const incluido = await impuestoIncluido(db, org);
    const lineas = await lineasDelPedido(db, org, body.items ?? [], incluido);
    let totales: ReturnType<typeof totalesPedidoManual>;
    try {
      totales = totalesPedidoManual(lineas, { envio: body.envio, impuestoIncluido: incluido });
    } catch (e) {
      errorDeLogica(e);
    }
    if (!montoCoincide(Math.round(totales.total * 100), Number(body.valor))) {
      throw new CambioPedidoError(409, 'TOTAL_NO_CUADRA', 'La suma de productos y envío no da el valor cobrado: ajusta precios o envío.', { total: totales.total, valor: Number(body.valor) });
    }
    orderNumber = decision.tipo === 'crear' ? decision.orderNumber : generarNumeroPedidoWeb(org, deps.ahora());
    const fila = {
      ...filaPedido(org, branchId, orderNumber, { ...body, canal: body.canal ?? (decision.tipo === 'crear' ? 'website' : 'whatsapp') }, totales),
      payment_status: 'paid',
      payment_reference: tx,
      payment_method: cobro.metodo,
      confirmed_at: confirmadoEn,
      internal_notes: nota,
    };
    const { data: creado, error } = await db.from('web_orders').insert(fila).select('id').single();
    if (error || !creado) throw new CambioPedidoError(500, 'PEDIDO_FALLO', `No se pudo crear el pedido: ${error?.message ?? 'sin datos'}`);
    orderId = String((creado as Fila).id);
    // Dos reconstrucciones a la vez del mismo cobro: gana la más antigua, la otra se borra
    // (aún no tiene venta, ni líneas, ni pagos).
    const { data: gemelos } = await db.from('web_orders').select('id, created_at').eq('organization_id', org).eq('payment_reference', tx).order('created_at', { ascending: true });
    const primero = ((gemelos as Fila[] | null) ?? [])[0];
    if (primero && String(primero.id) !== orderId) {
      await db.from('web_orders').delete().eq('id', orderId).eq('organization_id', org).is('sale_id', null);
      return { estado: 'ya_existia' as const, pedido: { id: String(primero.id), organization_id: org, order_number: orderNumber, payment_status: 'paid', payment_reference: tx }, cobro };
    }
    const errItems = await insertarItems(db, orderId, totales.items);
    if (errItems) {
      // Sin líneas no hay pedido: se borra para que se pueda reintentar (sin venta ni pagos).
      await db.from('web_orders').delete().eq('id', orderId).eq('organization_id', org).is('sale_id', null);
      throw new CambioPedidoError(500, 'PEDIDO_SIN_LINEAS', 'No se pudieron guardar los productos; no se creó el pedido.');
    }
  }

  // Igual que el cron de reconciliación: venta, stock, factura y pago del pedido.
  const avisos: string[] = [];
  let saleId: string | null = null;
  try {
    const r = await deps.autoConfirmar(orderId);
    saleId = r.saleId || null;
    avisos.push(...(r.stockErrors ?? []));
  } catch (e) {
    avisos.push(`Confirmación pendiente: ${e instanceof Error ? e.message : String(e)} (el cron de reconciliación la reintenta).`);
  }
  // `autoConfirmPaidOrder` pone la hora actual; el pedido reconstruido conserva la del pago.
  await db.from('web_orders').update({ confirmed_at: confirmadoEn }).eq('id', orderId).eq('organization_id', org);
  return {
    estado: decision.tipo === 'completar' ? ('completado' as const) : ('creado' as const),
    pedido: { id: orderId, order_number: orderNumber },
    venta: saleId,
    cobro,
    avisos,
  };
}

// ─── 3 · Pagos sin pedido ───────────────────────────────────────────────────

export interface PagoSinPedido {
  cobro: CobroPasarela;
  conexion: { id: string; nombre: string; proveedor: string };
  /** Sin prefijo WO-…: la tienda se confirma al reconstruir. */
  sinPrefijo: boolean;
  registradoEn: string;
}

/**
 * Cobros APROBADOS que llegaron por webhook (integration_events de las conexiones de pago de la
 * organización) y no tienen pedido. Los que traen el prefijo de otra organización (comercio
 * compartido) no se muestran. Wompi no publica un listado de transacciones: lo anterior a los
 * eventos registrados se reconstruye con la referencia o el ID del panel de la pasarela.
 */
export async function pagosSinPedido(ctx: ServerOrgContext, opciones: { dias?: number } = {}, deps: DepsPedidos = depsReales()): Promise<PagoSinPedido[]> {
  await exigirPermiso(ctx, PERMISO_RECONSTRUIR);
  const { db } = deps;
  const org = ctx.organizationId;
  const conexiones = await pasarelasConectadas(db, org);
  if (conexiones.length === 0) return [];
  const porId = new Map(conexiones.map((c) => [c.id, c]));
  const dias = Math.min(Math.max(Number(opciones.dias) || 90, 1), 365);
  const desde = new Date(deps.ahora() - dias * 86400000).toISOString();
  const { data: eventos, error } = await db
    .from('integration_events')
    .select('connection_id, created_at, payload')
    .in('connection_id', Array.from(porId.keys()))
    .eq('direction', 'inbound')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw new CambioPedidoError(500, 'EVENTOS_FALLO', error.message);

  // Un cobro por transacción (el evento más reciente), solo aprobados y de esta organización.
  const vistos = new Map<string, PagoSinPedido>();
  for (const e of (eventos as Fila[] | null) ?? []) {
    const conexion = porId.get(String(e.connection_id));
    if (!conexion) continue;
    const cobro = cobroDeEvento(conexion.connectorCode, (e.payload ?? {}) as Fila);
    if (!cobro?.transaccionId || vistos.has(cobro.transaccionId)) continue;
    vistos.set(cobro.transaccionId, { cobro, conexion: { id: conexion.id, nombre: conexion.nombre, proveedor: conexion.connectorCode }, sinPrefijo: organizacionDelNumero(cobro.referencia) === null, registradoEn: String(e.created_at) });
  }
  const candidatos = Array.from(vistos.values()).filter((p) => p.cobro.estado === 'aprobada' && (p.sinPrefijo || organizacionDelNumero(p.cobro.referencia) === org));
  if (candidatos.length === 0) return [];

  // Con pedido: por número o por transacción (en cualquier organización: no duplicar).
  const refs = Array.from(new Set(candidatos.map((p) => p.cobro.referencia).filter(Boolean))) as string[];
  const txs = candidatos.map((p) => String(p.cobro.transaccionId));
  const usados = { refs: new Set<string>(), txs: new Set<string>() };
  for (let i = 0; i < refs.length; i += 200) {
    const { data } = await db.from('web_orders').select('order_number').in('order_number', refs.slice(i, i + 200));
    for (const f of (data as Fila[] | null) ?? []) usados.refs.add(String(f.order_number));
  }
  for (let i = 0; i < txs.length; i += 200) {
    const { data } = await db.from('web_orders').select('payment_reference').in('payment_reference', txs.slice(i, i + 200));
    for (const f of (data as Fila[] | null) ?? []) usados.txs.add(String(f.payment_reference));
  }
  // Un cobro de link de pago (pedido manual) no coincide por número ni por transacción mientras el
  // pedido siga pendiente: aparece aquí y «Reconstruir» completa ese mismo pedido (por el link).
  return candidatos.filter((p) => !(p.cobro.referencia && usados.refs.has(p.cobro.referencia)) && !usados.txs.has(String(p.cobro.transaccionId)));
}
