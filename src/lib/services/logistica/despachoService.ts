/**
 * Lecturas de Logística: Por despachar, Seguimiento y el detalle del envío (Figma «21 Logística»
 * y «22 Logística»). Recibe el cliente Supabase (navegador con sesión o sesión del servidor):
 * RLS por pertenencia en `shipments`, `transport_events`, `delivery_attempts`,
 * `proof_of_delivery` y `courier_settlement_lines` (docs/logistica/FASE1-CIMIENTOS.md).
 *
 * SOLO LEE. Todo lo que mueve estado o dinero va por las RPC `logistica_*` a través de
 * `deliveryIntegrationService` (asignar, cambiar estado, entregar, novedad) — una sola ruta.
 * El código de entrega se pide con `logistica_codigo_entrega`, que solo responde a
 * administradores: si la base lo niega, la pantalla no lo muestra.
 *
 * Columnas verificadas por MCP el 2026-11-23 (proyecto taqjemqjtumhwptchcxk).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { canalDeEnvio, ESTADOS_POR_DESPACHAR, type FilaDespacho } from '@/lib/logistica/despacho';
import {
  ESTADOS_CON_NOVEDAD_ABIERTA,
  ESTADOS_EN_CURSO_SEGUIMIENTO,
  type FilaSeguimiento,
} from '@/lib/logistica/seguimiento';
import { ESTADOS_EN_RUTA } from '@/lib/logistica/misEnvios';

/** Tope de envíos que se traen a la bandeja (la bandeja trabaja en memoria: KPI, filtros y orden). */
export const MAX_FILAS_BANDEJA = 2000;
/** Tamaño de los lotes `in (…)` para no pasar el largo de URL de PostgREST. */
const LOTE_IN = 150;

export const COLUMNAS_ENVIO = [
  'id', 'organization_id', 'branch_id', 'source_type', 'source_id', 'shipment_number', 'tracking_number', 'status',
  'fulfillment_mode', 'created_at', 'updated_at', 'delivery_address', 'delivery_city', 'delivery_department',
  'delivery_contact_name', 'delivery_contact_phone', 'delivery_instructions', 'delivery_latitude', 'delivery_longitude',
  'expected_delivery_date', 'cod_collected_amount', 'cod_collected_method', 'cod_collected_at',
  'declared_value', 'shipping_fee', 'total_cost', 'currency', 'cod_amount', 'cod_status', 'payment_status',
  'driver_id', 'vehicle_id', 'assigned_at', 'failed_attempts', 'exception_reason', 'exception_detail',
  'delivery_code_required', 'carrier_id', 'metadata',
].join(', ');

const EMBEDS = [
  'customer:customers(full_name, phone)',
  'driver:driver_credentials!shipments_driver_id_fkey(id, full_name, phone)',
  'carrier:transport_carriers(name)',
  'branch:branches(name)',
].join(', ');

type Uno<T> = T | T[] | null | undefined;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const num = (v: unknown) => Number(v) || 0;
const texto = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

export interface EnvioCrudo {
  id: string;
  organization_id: number;
  branch_id: number | null;
  source_type: string;
  source_id: string | null;
  shipment_number: string;
  tracking_number: string | null;
  status: string;
  fulfillment_mode: string;
  created_at: string;
  updated_at: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_department: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
  delivery_instructions: string | null;
  delivery_latitude: number | string | null;
  delivery_longitude: number | string | null;
  expected_delivery_date: string | null;
  cod_collected_amount: number | string | null;
  cod_collected_method: string | null;
  cod_collected_at: string | null;
  declared_value: number | string | null;
  shipping_fee: number | string | null;
  total_cost: number | string | null;
  currency: string | null;
  cod_amount: number | string | null;
  cod_status: string | null;
  payment_status: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  assigned_at: string | null;
  failed_attempts: number | null;
  exception_reason: string | null;
  exception_detail: string | null;
  delivery_code_required: boolean | null;
  carrier_id: string | null;
  metadata: Record<string, unknown> | null;
  customer?: Uno<{ full_name: string | null; phone: string | null }>;
  driver?: Uno<{ id: string; full_name: string | null; phone: string | null }>;
  carrier?: Uno<{ name: string | null }>;
  branch?: Uno<{ name: string | null }>;
}

/** Lo que se lee del pedido web para la promesa y el canal. */
export interface PedidoWebResumen {
  id: string;
  order_number: string | null;
  source: string | null;
  total: number | string | null;
  is_scheduled: boolean | null;
  scheduled_at: string | null;
  estimated_delivery_at: string | null;
  /** Estado de pago y del pedido (Envíos: «Pagado» y «pedido anulado» salen del pedido). */
  payment_status?: string | null;
  status?: string | null;
}

export async function enLotes<T>(ids: readonly string[], leer: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const salida: T[] = [];
  for (let i = 0; i < unicos.length; i += LOTE_IN) salida.push(...(await leer(unicos.slice(i, i + LOTE_IN))));
  return salida;
}

/** Pedidos web de un conjunto de envíos (promesa y canal), en lotes. */
export async function pedidosWebDe(db: SupabaseClient, organizationId: number, ids: readonly string[]): Promise<Map<string, PedidoWebResumen>> {
  const filas = await enLotes(ids, async (lote) => {
    const { data, error } = await db
      .from('web_orders')
      .select('id, order_number, source, total, is_scheduled, scheduled_at, estimated_delivery_at, payment_status, status')
      .eq('organization_id', organizationId)
      .in('id', lote);
    if (error) throw error;
    return (data ?? []) as PedidoWebResumen[];
  });
  return new Map(filas.map((p) => [p.id, p]));
}

/** Hora prometida: la programada por el cliente, si no la estimada al confirmar. */
export function promesaDePedido(p: PedidoWebResumen | null | undefined): string | null {
  if (!p) return null;
  if (p.is_scheduled && p.scheduled_at) return p.scheduled_at;
  return p.estimated_delivery_at ?? null;
}

/** Barrio del envío: lo guardan el pedido web (`delivery_neighborhood`) y la venta POS (`barrio`). */
export function barrioDeEnvio(e: Pick<EnvioCrudo, 'metadata' | 'delivery_department'>): string | null {
  const m = e.metadata ?? {};
  return texto(m.delivery_neighborhood) ?? texto(m.barrio) ?? null;
}

/** Número del pedido o venta que originó el envío. */
export function pedidoDeEnvio(e: Pick<EnvioCrudo, 'metadata' | 'source_type' | 'shipment_number'>, pedido?: PedidoWebResumen | null): string | null {
  const m = e.metadata ?? {};
  return texto(pedido?.order_number) ?? texto(m.web_order_number) ?? (e.source_type === 'sale' ? e.shipment_number : null);
}

/** Convierte una fila de `shipments` (con su pedido) en una fila de la bandeja. */
export function aFilaDespacho(e: EnvioCrudo, pedido: PedidoWebResumen | null): FilaDespacho {
  const cliente = uno(e.customer);
  const driver = uno(e.driver);
  const valor = num(e.declared_value) || num(pedido?.total) || num((e.metadata ?? {}).web_order_total) || num((e.metadata ?? {}).pos_total);
  return {
    id: e.id,
    numero: e.shipment_number,
    status: e.status,
    modo: e.fulfillment_mode,
    branchId: e.branch_id,
    canal: canalDeEnvio(e.source_type, pedido?.source),
    pedido: pedidoDeEnvio(e, pedido),
    pedidoWebId: e.source_type === 'web_order' ? e.source_id : null,
    creado: e.created_at,
    cliente: texto(e.delivery_contact_name) ?? texto(cliente?.full_name),
    telefono: texto(e.delivery_contact_phone) ?? texto(cliente?.phone),
    direccion: texto(e.delivery_address),
    ciudad: texto(e.delivery_city),
    barrio: barrioDeEnvio(e),
    instrucciones: texto(e.delivery_instructions),
    promesa: promesaDePedido(pedido),
    fechaEsperada: e.expected_delivery_date,
    valor,
    moneda: e.currency ? e.currency.trim() : null,
    contraentrega: num(e.cod_amount),
    codStatus: e.cod_status,
    // El pago lo dice el pedido: el envío de la tienda queda en «pending» aunque el pedido esté pagado.
    pagado: pedido?.payment_status === 'paid' || e.payment_status === 'paid',
    domiciliarioId: e.driver_id,
    domiciliario: texto(driver?.full_name),
    vehiculoId: e.vehicle_id,
    asignado: e.assigned_at,
    intentosFallidos: num(e.failed_attempts),
    motivoNovedad: e.exception_reason,
    codigoRequerido: e.delivery_code_required === true,
  };
}

export interface ResultadoBandeja {
  filas: FilaDespacho[];
  /** true si había más envíos de los que se trajeron (MAX_FILAS_BANDEJA). */
  recortada: boolean;
}

/** Envíos por despachar de la organización (y de la sede, si se elige una). */
export async function listarPorDespachar(
  db: SupabaseClient,
  p: { organizationId: number; branchId?: number | null },
): Promise<ResultadoBandeja> {
  let q = db
    .from('shipments')
    .select(`${COLUMNAS_ENVIO}, ${EMBEDS}`, { count: 'exact' })
    .eq('organization_id', p.organizationId)
    .in('status', [...ESTADOS_POR_DESPACHAR])
    .order('created_at', { ascending: true })
    .range(0, MAX_FILAS_BANDEJA - 1);
  if (p.branchId) q = q.eq('branch_id', p.branchId);
  const { data, error, count } = await q;
  if (error) throw error;
  const envios = (data ?? []) as unknown as EnvioCrudo[];
  const pedidos = await pedidosWebDe(
    db,
    p.organizationId,
    envios.filter((e) => e.source_type === 'web_order' && e.source_id).map((e) => e.source_id as string),
  );
  return {
    filas: envios.map((e) => aFilaDespacho(e, e.source_id ? pedidos.get(e.source_id) ?? null : null)),
    recortada: (count ?? envios.length) > envios.length,
  };
}

/** Domiciliarios activos de la organización (para el aviso «no hay domiciliarios»). */
export async function contarDomiciliariosActivos(db: SupabaseClient, organizationId: number, branchId?: number | null): Promise<number> {
  let q = db.from('driver_credentials').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true);
  // Un domiciliario sin sede atiende todas las sedes.
  if (branchId) q = q.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export interface EnvioDeCargaConDomiciliario {
  driver_id: string;
  status: string;
  delivered_at: string | null;
  cod_status: string | null;
  cod_collected_amount: number | string | null;
  cod_amount: number | string | null;
}

/**
 * Envíos de los domiciliarios para calcular su carga (`cargaDelDia`, domiciliarios.ts): los que
 * están en ruta o con novedad, y los entregados desde `desdeInstante` (inicio del día en la zona).
 */
export async function enviosDeDomiciliarios(db: SupabaseClient, organizationId: number, desdeInstante: string): Promise<EnvioDeCargaConDomiciliario[]> {
  const enRuta = [...ESTADOS_EN_RUTA, 'failed_attempt'].join(',');
  const { data, error } = await db
    .from('shipments')
    .select('driver_id, status, delivered_at, cod_status, cod_collected_amount, cod_amount')
    .eq('organization_id', organizationId)
    .not('driver_id', 'is', null)
    .or(`status.in.(${enRuta}),delivered_at.gte.${desdeInstante},cod_status.eq.collected`)
    .limit(MAX_FILAS_BANDEJA);
  if (error) throw error;
  return (data ?? []) as EnvioDeCargaConDomiciliario[];
}

// ── Seguimiento ───────────────────────────────────────────────────────────────

interface EventoUltimo {
  reference_id: string;
  event_time: string;
  description: string | null;
  provider_status: string | null;
}

/** Envíos en curso o con novedad, con su último evento (Seguimiento › Por resolver). */
export async function listarSeguimiento(
  db: SupabaseClient,
  p: { organizationId: number; branchId?: number | null },
): Promise<FilaSeguimiento[]> {
  let q = db
    .from('shipments')
    .select(`${COLUMNAS_ENVIO}, ${EMBEDS}`)
    .eq('organization_id', p.organizationId)
    .in('status', [...ESTADOS_EN_CURSO_SEGUIMIENTO, ...ESTADOS_CON_NOVEDAD_ABIERTA])
    .order('updated_at', { ascending: true })
    .range(0, MAX_FILAS_BANDEJA - 1);
  if (p.branchId) q = q.eq('branch_id', p.branchId);
  const { data, error } = await q;
  if (error) throw error;
  const envios = (data ?? []) as unknown as EnvioCrudo[];
  const ids = envios.map((e) => e.id);

  const [pedidos, eventos, reprogramados] = await Promise.all([
    pedidosWebDe(db, p.organizationId, envios.filter((e) => e.source_type === 'web_order' && e.source_id).map((e) => e.source_id as string)),
    enLotes(ids, async (lote) => {
      const { data: ev, error: errEv } = await db
        .from('transport_events')
        .select('reference_id, event_time, description, provider_status')
        .eq('reference_type', 'shipment')
        .in('reference_id', lote)
        .order('event_time', { ascending: false });
      if (errEv) throw errEv;
      return (ev ?? []) as EventoUltimo[];
    }),
    enLotes(
      envios.filter((e) => e.status === 'failed_attempt').map((e) => e.id),
      async (lote) => {
        const { data: at, error: errAt } = await db
          .from('delivery_attempts')
          .select('shipment_id, reschedule_date, attempt_number')
          .in('shipment_id', lote)
          .order('attempt_number', { ascending: false });
        if (errAt) throw errAt;
        return (at ?? []) as { shipment_id: string; reschedule_date: string | null }[];
      },
    ),
  ]);

  const ultimo = new Map<string, EventoUltimo>();
  for (const ev of eventos) if (!ultimo.has(ev.reference_id)) ultimo.set(ev.reference_id, ev);
  const reprog = new Map<string, string | null>();
  for (const a of reprogramados) if (!reprog.has(a.shipment_id)) reprog.set(a.shipment_id, a.reschedule_date);

  return envios.map((e) => {
    const pedido = e.source_id ? pedidos.get(e.source_id) ?? null : null;
    const ev = ultimo.get(e.id);
    const cliente = uno(e.customer);
    const ultimoMovimiento = [ev?.event_time, e.updated_at, e.created_at].filter((x): x is string => !!x).sort().pop() ?? e.created_at;
    return {
      id: e.id,
      numero: e.shipment_number,
      status: e.status,
      modo: e.fulfillment_mode,
      pedido: pedidoDeEnvio(e, pedido),
      pedidoWebId: e.source_type === 'web_order' ? e.source_id : null,
      canal: canalDeEnvio(e.source_type, pedido?.source),
      cliente: texto(e.delivery_contact_name) ?? texto(cliente?.full_name),
      telefono: texto(e.delivery_contact_phone) ?? texto(cliente?.phone),
      direccion: texto(e.delivery_address),
      ciudad: texto(e.delivery_city),
      barrio: barrioDeEnvio(e),
      transportadora: e.fulfillment_mode === 'own' ? null : texto(uno(e.carrier)?.name) ?? e.fulfillment_mode,
      guia: e.fulfillment_mode === 'own' ? null : texto(e.tracking_number),
      sede: texto(uno(e.branch)?.name),
      domiciliario: texto(uno(e.driver)?.full_name),
      promesa: promesaDePedido(pedido),
      ultimoMovimiento,
      ultimoEvento: texto(ev?.provider_status) ?? texto(ev?.description),
      motivoNovedad: e.exception_reason,
      detalleNovedad: texto(e.exception_detail),
      intentosFallidos: num(e.failed_attempts),
      reprogramado: reprog.get(e.id) ?? null,
    };
  });
}

/** Entregados en los últimos 30 días (para «Entregas al primer intento»). */
export async function entregadosDesde(db: SupabaseClient, organizationId: number, desdeInstante: string, branchId?: number | null) {
  let q = db
    .from('shipments')
    .select('failed_attempts')
    .eq('organization_id', organizationId)
    .eq('status', 'delivered')
    .gte('delivered_at', desdeInstante)
    .limit(5000);
  if (branchId) q = q.eq('branch_id', branchId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as { failed_attempts: number | null }[];
}

/** Avisos al cliente desde un instante (KPI «Avisos al cliente hoy»). */
export async function avisosDesde(db: SupabaseClient, organizationId: number, desdeInstante: string) {
  const { data, error } = await db
    .from('web_order_notices')
    .select('channel, status')
    .eq('organization_id', organizationId)
    .gte('created_at', desdeInstante)
    .limit(5000);
  if (error) throw error;
  const filas = (data ?? []) as { channel: string; status: string }[];
  return {
    total: filas.length,
    fallidosWhatsApp: filas.filter((f) => f.channel === 'whatsapp' && f.status === 'failed').length,
  };
}

// ── Detalle ───────────────────────────────────────────────────────────────────

export interface ItemEnvio {
  id: string;
  description: string | null;
  sku: string | null;
  qty: number;
  unit_value: number | null;
  total_value: number | null;
}

export interface EventoEnvio {
  id: string;
  event_type: string;
  event_time: string;
  canonical_status: string | null;
  reason_code: string | null;
  description: string | null;
  provider_status: string | null;
  location_text: string | null;
  actor_type: string;
}

export interface IntentoEnvio {
  id: string;
  attempt_number: number;
  attempted_at: string;
  status: string;
  failure_reason_code: string | null;
  failure_reason_text: string | null;
  driver_notes: string | null;
  reschedule_date: string | null;
  photo_urls: string[] | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PruebaEnvio {
  id: string;
  delivered_at: string;
  recipient_name: string;
  recipient_doc_type: string | null;
  recipient_doc_number: string | null;
  recipient_relationship: string | null;
  signature_url: string | null;
  photo_urls: string[] | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  delivery_code_verified: boolean;
  cod_collected_amount: number | null;
  cod_collected_method: string | null;
}

export interface LineaCuadreEnvio {
  settlement_id: string;
  status: string;
  received_amount: number | null;
}

export interface DetalleEnvio {
  envio: EnvioCrudo;
  fila: FilaDespacho;
  items: ItemEnvio[];
  eventos: EventoEnvio[];
  intentos: IntentoEnvio[];
  prueba: PruebaEnvio | null;
  cuadre: LineaCuadreEnvio | null;
  vehiculo: { id: string; plate: string | null; vehicle_type: string; ownership?: string | null } | null;
  domiciliario: { id: string; full_name: string | null; phone: string | null; vehicle_type: string | null; is_external: boolean } | null;
}

/** Todo lo que pinta el detalle del envío. `null` si no existe o la sesión no lo ve (RLS). */
export async function obtenerDetalleEnvio(db: SupabaseClient, organizationId: number, shipmentId: string): Promise<DetalleEnvio | null> {
  const { data, error } = await db
    .from('shipments')
    .select(`${COLUMNAS_ENVIO}, ${EMBEDS}`)
    .eq('organization_id', organizationId)
    .eq('id', shipmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const envio = data as unknown as EnvioCrudo;

  const [pedidos, items, eventos, intentos, prueba, cuadre, vehiculo, domiciliario] = await Promise.all([
    envio.source_type === 'web_order' && envio.source_id ? pedidosWebDe(db, organizationId, [envio.source_id]) : Promise.resolve(new Map<string, PedidoWebResumen>()),
    db.from('shipment_items').select('id, description, sku, qty, unit_value, total_value').eq('shipment_id', shipmentId).order('created_at'),
    db
      .from('transport_events')
      .select('id, event_type, event_time, canonical_status, reason_code, description, provider_status, location_text, actor_type')
      .eq('reference_type', 'shipment')
      .eq('reference_id', shipmentId)
      .order('event_time', { ascending: true }),
    db
      .from('delivery_attempts')
      .select('id, attempt_number, attempted_at, status, failure_reason_code, failure_reason_text, driver_notes, reschedule_date, photo_urls, latitude, longitude')
      .eq('shipment_id', shipmentId)
      .order('attempt_number', { ascending: true }),
    db
      .from('proof_of_delivery')
      .select('id, delivered_at, recipient_name, recipient_doc_type, recipient_doc_number, recipient_relationship, signature_url, photo_urls, latitude, longitude, notes, delivery_code_verified, cod_collected_amount, cod_collected_method')
      .eq('shipment_id', shipmentId)
      .order('delivered_at', { ascending: false })
      .limit(1),
    db
      .from('courier_settlement_lines')
      .select('settlement_id, status, received_amount')
      .eq('shipment_id', shipmentId)
      .neq('status', 'cancelled')
      .limit(1),
    envio.vehicle_id ? db.from('vehicles').select('id, plate, vehicle_type, ownership').eq('id', envio.vehicle_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    envio.driver_id
      ? db.from('driver_credentials').select('id, full_name, phone, vehicle_type, is_external').eq('id', envio.driver_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [items, eventos, intentos, prueba, cuadre, vehiculo, domiciliario]) if (r.error) throw r.error;

  const pedido = envio.source_id ? pedidos.get(envio.source_id) ?? null : null;
  return {
    envio,
    fila: aFilaDespacho(envio, pedido),
    items: ((items.data ?? []) as ItemEnvio[]).map((i) => ({ ...i, qty: num(i.qty) })),
    eventos: (eventos.data ?? []) as EventoEnvio[],
    intentos: (intentos.data ?? []) as IntentoEnvio[],
    prueba: ((prueba.data ?? []) as PruebaEnvio[])[0] ?? null,
    cuadre: ((cuadre.data ?? []) as LineaCuadreEnvio[])[0] ?? null,
    vehiculo: (vehiculo.data as DetalleEnvio['vehiculo']) ?? null,
    domiciliario: (domiciliario.data as DetalleEnvio['domiciliario']) ?? null,
  };
}

export interface CodigoEntrega {
  requerido: boolean;
  codigo: string | null;
  intentosFallidos: number;
  verificadoEn: string | null;
}

/**
 * Código de entrega (solo administradores: `fn_caja_puede(org, 'logistica.codigo_entrega.ver')`
 * dentro de la RPC). Si la base lo niega o el envío no lo lleva, devuelve null: la pantalla
 * simplemente no lo muestra. Nunca se decide en el navegador quién lo ve.
 */
export async function leerCodigoEntrega(db: SupabaseClient, shipmentId: string): Promise<CodigoEntrega | null> {
  const { data, error } = await db.rpc('logistica_codigo_entrega', { p_shipment_id: shipmentId });
  if (error || !data) return null;
  const r = data as { requerido?: boolean; codigo?: string | null; intentos_fallidos?: number; verificado_en?: string | null };
  if (!r.requerido) return null;
  return { requerido: true, codigo: r.codigo ?? null, intentosFallidos: num(r.intentos_fallidos), verificadoEn: r.verificado_en ?? null };
}

/** Reinicia el código (bloqueado tras 5 errores). Solo administradores; la base decide. */
export async function reiniciarCodigoEntrega(db: SupabaseClient, shipmentId: string): Promise<void> {
  const { error } = await db.rpc('logistica_codigo_entrega_reiniciar', { p_shipment_id: shipmentId });
  if (error) throw error;
}

/**
 * Envíos completos con sus ítems para imprimir guías con `shipmentLabelPrinter` (el mismo
 * generador de Envíos): una consulta por lote, no una por envío.
 */
export async function enviosParaGuias(
  db: SupabaseClient,
  organizationId: number,
  ids: readonly string[],
): Promise<{ envio: Record<string, unknown>; items: ItemEnvio[] }[]> {
  const envios = await enLotes(ids, async (lote) => {
    const { data, error } = await db
      .from('shipments')
      .select('*, customer:customers(id, full_name, phone, email)')
      .eq('organization_id', organizationId)
      .in('id', lote);
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  });
  const items = await enLotes(ids, async (lote) => {
    const { data, error } = await db
      .from('shipment_items')
      .select('id, shipment_id, description, sku, qty, unit_value, total_value')
      .in('shipment_id', lote);
    if (error) throw error;
    return (data ?? []) as (ItemEnvio & { shipment_id: string })[];
  });
  const orden = new Map(ids.map((id, i) => [id, i]));
  return envios
    .sort((a, b) => (orden.get(String(a.id)) ?? 0) - (orden.get(String(b.id)) ?? 0))
    .map((envio) => ({ envio, items: items.filter((i) => i.shipment_id === envio.id).map((i) => ({ ...i, qty: num(i.qty) })) }));
}

/** La fila de bandeja del envío de un pedido web (para asignar desde Pedidos online). */
export async function filaDespachoDePedidoWeb(db: SupabaseClient, organizationId: number, webOrderId: string): Promise<FilaDespacho | null> {
  const { data, error } = await db
    .from('shipments')
    .select(`${COLUMNAS_ENVIO}, ${EMBEDS}`)
    .eq('organization_id', organizationId)
    .eq('source_type', 'web_order')
    .eq('source_id', webOrderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const envio = data as unknown as EnvioCrudo;
  const pedidos = await pedidosWebDe(db, organizationId, [webOrderId]);
  return aFilaDespacho(envio, pedidos.get(webOrderId) ?? null);
}
