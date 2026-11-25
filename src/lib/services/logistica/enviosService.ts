/**
 * Logística › Envíos (Figma «21 Logística», secciones 11 y 12): lecturas del historial completo y
 * escritura del formulario «Nuevo envío / Editar».
 *
 * Lecturas con el cliente de la sesión (RLS por pertenencia en `shipments`, `web_orders`, `sales`,
 * `proof_of_delivery`). El valor y el estado de pago de cada fila salen del PEDIDO que originó el
 * envío (web_orders / sales, una consulta por lote, no N+1): los envíos de la tienda guardan
 * `payment_status = 'pending'` y a veces `declared_value` vacío aunque el pedido esté pagado.
 *
 * Escrituras: un envío manual se crea con `shipmentsService.createShipment` (el mismo insert de
 * siempre, con la RLS de logística) y sus líneas con `shipmentsService.addShipmentItem`; un envío
 * de un pedido web va por la ÚNICA ruta `deliveryIntegrationService.createShipmentFromWebOrder`;
 * asignar domiciliario por `logistica_asignar_domiciliario`. Los estados NO se escriben aquí: van
 * por las RPC `logistica_*`.
 *
 * Columnas verificadas por MCP el 2026-11-24 (proyecto taqjemqjtumhwptchcxk): `shipments` no tiene
 * `trip_id` (el viaje va en metadata.trip_id); `shipping_zone_id` → shipping_zones; `sales` no
 * tiene número propio.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { canalDeEnvio } from '@/lib/logistica/despacho';
import {
  COLUMNAS_ENVIO,
  aFilaDespacho,
  enLotes,
  pedidosWebDe,
  type EnvioCrudo,
  type PedidoWebResumen,
} from '@/lib/services/logistica/despachoService';
import { shipmentsService, type ShipmentWithDetails } from '@/lib/services/shipmentsService';
import { deliveryIntegrationService } from '@/lib/services/deliveryIntegrationService';
import { webOrdersService } from '@/lib/services/webOrdersService';
import {
  camposEditables,
  fulfillmentDeModo,
  type CampoEnvio,
  type DatosFormularioEnvio,
  type FilaEnvio,
  type LineaPaquete,
} from '@/lib/logistica/envios';

/** Tope de envíos del periodo que se traen (la lista filtra, cuenta y pagina en memoria). */
export const MAX_FILAS_ENVIOS = 2000;

const COLUMNAS_EXTRA = ['weight_kg', 'delivered_at', 'dispatched_at', 'picked_at', 'shipping_zone_id', 'notes', 'insurance_fee', 'customer_id'].join(', ');

const EMBEDS_ENVIOS = [
  'customer:customers(full_name, phone)',
  'driver:driver_credentials!shipments_driver_id_fkey(id, full_name, phone, vehicle_type)',
  'carrier:transport_carriers(name)',
  'branch:branches(name)',
  'zone:shipping_zones(name)',
].join(', ');

type Uno<T> = T | T[] | null | undefined;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const num = (v: unknown) => Number(v) || 0;
const numONulo = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const texto = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
};

export interface EnvioCrudoHistorial extends EnvioCrudo {
  weight_kg: number | string | null;
  delivered_at: string | null;
  dispatched_at: string | null;
  picked_at: string | null;
  shipping_zone_id: string | null;
  notes: string | null;
  insurance_fee: number | string | null;
  customer_id: string | null;
  driver?: Uno<{ id: string; full_name: string | null; phone: string | null; vehicle_type: string | null }>;
  zone?: Uno<{ name: string | null }>;
}

/** Lo que se lee de la venta POS que originó un envío. */
export interface VentaResumen {
  id: string;
  total: number | string | null;
  payment_status: string | null;
  status: string | null;
}

const ANULADOS = new Set(['cancelled', 'canceled', 'voided', 'void', 'anulada', 'refunded']);

/** Convierte un envío (con su pedido o su venta y su prueba) en una fila de Envíos. */
export function aFilaEnvio(
  e: EnvioCrudoHistorial,
  pedido: PedidoWebResumen | null,
  venta: VentaResumen | null,
  prueba: { recipient_name: string | null; photo_urls: string[] | null } | null,
): FilaEnvio {
  const base = aFilaDespacho(e, pedido);
  const meta = e.metadata ?? {};
  const driver = uno(e.driver);
  const propio = e.fulfillment_mode === 'own';
  // El valor del pedido manda (el mismo total que cobró el checkout o el POS).
  const valor = num(pedido?.total) || num(venta?.total) || num(e.declared_value) || num(meta.web_order_total) || num(meta.pos_total);
  const pagoPedido = pedido?.payment_status ?? venta?.payment_status ?? (e.source_id ? null : e.payment_status);
  const estadoPedido = pedido?.status ?? venta?.status ?? null;
  return {
    ...base,
    canal: canalDeEnvio(e.source_type, pedido?.source),
    valor,
    pagado: pagoPedido === 'paid',
    sourceType: e.source_type,
    sourceId: e.source_id,
    guia: propio ? null : texto(e.tracking_number),
    transportadora: propio ? null : texto(uno(e.carrier)?.name),
    transportadoraId: propio ? null : e.carrier_id,
    vehiculoTipo: texto(driver?.vehicle_type),
    sede: texto(uno(e.branch)?.name),
    zonaId: e.shipping_zone_id,
    zona: texto(uno(e.zone)?.name),
    viajeId: texto(meta.trip_id),
    salio: e.dispatched_at ?? e.picked_at ?? null,
    entregado: e.delivered_at,
    actualizado: e.updated_at,
    pesoKg: numONulo(e.weight_kg),
    costoEnvio: num(e.shipping_fee),
    pagoPedido,
    pedidoAnulado: !!estadoPedido && ANULADOS.has(estadoPedido.toLowerCase()),
    recibio: texto(prueba?.recipient_name),
    recibioConFoto: (prueba?.photo_urls?.length ?? 0) > 0,
  };
}

export interface ResultadoEnvios {
  filas: FilaEnvio[];
  /** true si el periodo tenía más envíos de los que se trajeron (MAX_FILAS_ENVIOS). */
  recortada: boolean;
}

/** Ventas POS de un conjunto de envíos, en lotes. */
async function ventasDe(db: SupabaseClient, organizationId: number, ids: readonly string[]): Promise<Map<string, VentaResumen>> {
  const filas = await enLotes(ids, async (lote) => {
    const { data, error } = await db.from('sales').select('id, total, payment_status, status').eq('organization_id', organizationId).in('id', lote);
    if (error) throw error;
    return (data ?? []) as VentaResumen[];
  });
  return new Map(filas.map((v) => [v.id, v]));
}

/** Quién recibió los envíos entregados (para «recibió Ana · foto»), en lotes. */
async function pruebasDe(db: SupabaseClient, ids: readonly string[]) {
  const filas = await enLotes(ids, async (lote) => {
    const { data, error } = await db.from('proof_of_delivery').select('shipment_id, recipient_name, photo_urls, delivered_at').in('shipment_id', lote).order('delivered_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as { shipment_id: string; recipient_name: string | null; photo_urls: string[] | null }[];
  });
  const m = new Map<string, { recipient_name: string | null; photo_urls: string[] | null }>();
  for (const p of filas) if (!m.has(p.shipment_id)) m.set(p.shipment_id, p);
  return m;
}

/**
 * Envíos de la organización (y de la sede, si se elige una) creados en el periodo
 * [`desde`, `hasta`), instantes ya convertidos desde la zona de la organización.
 */
export async function listarEnvios(
  db: SupabaseClient,
  p: { organizationId: number; branchId?: number | null; desde: string; hasta: string },
): Promise<ResultadoEnvios> {
  let q = db
    .from('shipments')
    .select(`${COLUMNAS_ENVIO}, ${COLUMNAS_EXTRA}, ${EMBEDS_ENVIOS}`, { count: 'exact' })
    .eq('organization_id', p.organizationId)
    .gte('created_at', p.desde)
    .lt('created_at', p.hasta)
    .order('created_at', { ascending: false })
    .range(0, MAX_FILAS_ENVIOS - 1);
  if (p.branchId) q = q.eq('branch_id', p.branchId);
  const { data, error, count } = await q;
  if (error) throw error;
  const envios = (data ?? []) as unknown as EnvioCrudoHistorial[];
  const de = (tipos: readonly string[]) => envios.filter((e) => tipos.includes(e.source_type) && e.source_id).map((e) => e.source_id as string);
  const [pedidos, ventas, pruebas] = await Promise.all([
    pedidosWebDe(db, p.organizationId, de(['web_order'])),
    ventasDe(db, p.organizationId, de(['sale'])),
    pruebasDe(db, envios.filter((e) => e.status === 'delivered').map((e) => e.id)),
  ]);
  return {
    filas: envios.map((e) =>
      aFilaEnvio(
        e,
        e.source_type === 'web_order' && e.source_id ? pedidos.get(e.source_id) ?? null : null,
        e.source_type === 'sale' && e.source_id ? ventas.get(e.source_id) ?? null : null,
        pruebas.get(e.id) ?? null,
      ),
    ),
    recortada: (count ?? envios.length) > envios.length,
  };
}

// ── Opciones de filtros y del formulario ───────────────────────────────────────

export interface OpcionEnvio {
  id: string;
  nombre: string;
  detalle?: string | null;
}

export interface OpcionesEnvios {
  domiciliarios: OpcionEnvio[];
  transportadoras: OpcionEnvio[];
  viajes: OpcionEnvio[];
  zonas: OpcionEnvio[];
  paradas: OpcionEnvio[];
}

/** Domiciliarios, transportadoras, viajes (de hoy en adelante), zonas y paradas activas. */
export async function opcionesEnvios(db: SupabaseClient, organizationId: number): Promise<OpcionesEnvios> {
  const [dom, transportadoras, viajes, zonas, paradas] = await Promise.all([
    db.from('driver_credentials').select('id, full_name, vehicle_type').eq('organization_id', organizationId).eq('is_active', true).order('full_name'),
    shipmentsService.getCarriers(organizationId).catch(() => []),
    shipmentsService.getTrips(organizationId).catch(() => []),
    db.from('shipping_zones').select('id, name').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    shipmentsService.getStops(organizationId).catch(() => []),
  ]);
  return {
    domiciliarios: ((dom.data ?? []) as { id: string; full_name: string | null; vehicle_type: string | null }[]).map((d) => ({
      id: d.id,
      nombre: d.full_name ?? '—',
      detalle: d.vehicle_type,
    })),
    transportadoras: (transportadoras as { id: string; name: string }[]).map((c) => ({ id: c.id, nombre: c.name })),
    viajes: (viajes as { id: string; trip_code: string; transport_routes?: { name?: string } | null }[]).map((v) => ({
      id: v.id,
      nombre: v.trip_code,
      detalle: v.transport_routes?.name ?? null,
    })),
    zonas: ((zonas.data ?? []) as { id: string; name: string }[]).map((z) => ({ id: z.id, nombre: z.name })),
    paradas: (paradas as { id: string; name: string; city?: string | null }[]).map((s) => ({ id: s.id, nombre: s.name, detalle: s.city ?? null })),
  };
}

// ── Pedido vinculado ───────────────────────────────────────────────────────────

export interface PedidoParaEnvio {
  id: string;
  numero: string;
  cliente: string | null;
  telefono: string | null;
  total: number;
  direccion: string | null;
  ciudad: string | null;
  barrio: string | null;
  pagado: boolean;
}

/**
 * Pedidos de la tienda con domicilio, confirmados y sin envío: los que se pueden vincular al crear
 * un envío. Su envío se crea por la ruta única del pedido web.
 */
export async function pedidosSinEnvio(db: SupabaseClient, organizationId: number, busqueda: string, branchId?: number | null): Promise<PedidoParaEnvio[]> {
  let q = db
    .from('web_orders')
    .select('id, order_number, customer_name, customer_phone, total, delivery_address, payment_status')
    .eq('organization_id', organizationId)
    .in('delivery_type', ['delivery_own', 'delivery_third_party'])
    .in('status', ['confirmed', 'preparing', 'ready'])
    .order('created_at', { ascending: false })
    .limit(40);
  if (branchId) q = q.eq('branch_id', branchId);
  const termino = busqueda.trim().replace(/[%,()]/g, ' ').trim();
  if (termino) q = q.ilike('order_number', `%${termino}%`);
  const { data, error } = await q;
  if (error) throw error;
  const pedidos = (data ?? []) as { id: string; order_number: string; customer_name: string | null; customer_phone: string | null; total: number | string | null; delivery_address: Record<string, unknown> | null; payment_status: string | null }[];
  if (pedidos.length === 0) return [];
  const { data: conEnvio, error: e2 } = await db.from('shipments').select('source_id').eq('organization_id', organizationId).eq('source_type', 'web_order').in('source_id', pedidos.map((p) => p.id));
  if (e2) throw e2;
  const ya = new Set(((conEnvio ?? []) as { source_id: string }[]).map((s) => s.source_id));
  return pedidos
    .filter((p) => !ya.has(p.id))
    .map((p) => {
      const d = p.delivery_address ?? {};
      return {
        id: p.id,
        numero: p.order_number,
        cliente: texto(p.customer_name),
        telefono: texto(p.customer_phone),
        total: num(p.total),
        direccion: texto(d.address) ?? texto(d.street),
        ciudad: texto(d.city),
        barrio: texto(d.neighborhood),
        pagado: p.payment_status === 'paid',
      };
    });
}

// ── Leer para editar o duplicar ────────────────────────────────────────────────

export interface EnvioEditable {
  id: string;
  numero: string;
  status: string;
  sourceType: string;
  sourceId: string | null;
  pedido: string | null;
  domiciliario: string | null;
  creado: string;
  /** Metadata tal cual: al guardar se FUSIONA, nunca se reemplaza. */
  metadata: Record<string, unknown> | null;
  datos: DatosFormularioEnvio;
}

/** El envío con sus líneas, convertido a los datos del formulario. null si no existe o no se ve. */
export async function leerEnvioEditable(db: SupabaseClient, organizationId: number, id: string): Promise<EnvioEditable | null> {
  const { data, error } = await db
    .from('shipments')
    .select(`${COLUMNAS_ENVIO}, ${COLUMNAS_EXTRA}, ${EMBEDS_ENVIOS}`)
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const e = data as unknown as EnvioCrudoHistorial;
  const { data: items, error: errItems } = await db.from('shipment_items').select('id, description, qty, weight_kg, unit_value, total_value').eq('shipment_id', id).order('created_at');
  if (errItems) throw errItems;
  const pedidos = e.source_type === 'web_order' && e.source_id ? await pedidosWebDe(db, organizationId, [e.source_id]) : new Map<string, PedidoWebResumen>();
  const fila = aFilaDespacho(e, e.source_id ? pedidos.get(e.source_id) ?? null : null);
  const m = e.metadata ?? {};
  const lineas: LineaPaquete[] = ((items ?? []) as { id: string; description: string | null; qty: number | string; weight_kg: number | string | null; unit_value: number | string | null; total_value: number | string | null }[]).map((i) => ({
    clave: i.id,
    id: i.id,
    descripcion: i.description ?? '',
    cantidad: num(i.qty) || 1,
    pesoKg: numONulo(i.weight_kg),
    valor: numONulo(i.total_value) ?? (numONulo(i.unit_value) !== null ? num(i.unit_value) * (num(i.qty) || 1) : null),
  }));
  const viajeId = texto(m.trip_id);
  return {
    id: e.id,
    numero: e.shipment_number,
    status: e.status,
    sourceType: e.source_type,
    sourceId: e.source_id,
    pedido: fila.pedido,
    domiciliario: fila.domiciliario,
    creado: e.created_at,
    metadata: e.metadata,
    datos: {
      pedidoWebId: e.source_type === 'web_order' ? e.source_id : null,
      sedeId: e.branch_id,
      remitente: texto(m.sender_name) ?? '',
      telefonoRemitente: texto(m.sender_phone) ?? '',
      clienteId: e.customer_id,
      destinatario: fila.cliente ?? '',
      telefono: fila.telefono ?? '',
      direccion: fila.direccion ?? '',
      barrio: fila.barrio ?? '',
      ciudad: fila.ciudad ?? '',
      indicaciones: fila.instrucciones ?? '',
      lineas,
      tipoPaquete: (texto(m.package_type) as DatosFormularioEnvio['tipoPaquete']) ?? 'small_box',
      pesoKg: numONulo(e.weight_kg),
      valorDeclarado: numONulo(e.declared_value),
      fragil: m.is_fragile === true,
      firma: m.requires_signature === true,
      modo: viajeId ? 'viaje' : e.fulfillment_mode === 'national_carrier' ? 'national_carrier' : 'own',
      domiciliarioId: e.driver_id,
      transportadoraId: e.carrier_id,
      guia: e.fulfillment_mode === 'own' ? '' : e.tracking_number ?? '',
      viajeId,
      paradaOrigenId: texto(m.origin_stop_id),
      paradaDestinoId: texto(m.destination_stop_id),
      promesa: e.expected_delivery_date,
      costoEnvio: numONulo(e.shipping_fee),
      seguro: numONulo(e.insurance_fee),
      cobrarContraentrega: num(e.cod_amount) > 0,
      contraentrega: numONulo(e.cod_amount),
      notas: e.notes ?? '',
    },
  };
}

// ── Guardar ────────────────────────────────────────────────────────────────────

/** Número del envío manual: legible, único en la práctica y sin depender de un contador. */
export function numeroEnvioManual(ahora: Date = new Date(), azar: () => number = Math.random): string {
  const sufijo = Math.floor(azar() * 36 ** 4).toString(36).toUpperCase().padStart(4, '0');
  return `ENV-${ahora.getTime().toString(36).toUpperCase()}-${sufijo}`;
}

const nulo = (s: string) => (s.trim() === '' ? null : s.trim());

/** Metadata del formulario (remitente, paquete y viaje), FUSIONADA con la que ya tenía el envío. */
export function metadataDeFormulario(d: DatosFormularioEnvio, previa: Record<string, unknown> | null | undefined, fuenteCosto: string | null): Record<string, unknown> {
  const m: Record<string, unknown> = { ...(previa ?? {}) };
  const poner = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === '') delete m[k];
    else m[k] = v;
  };
  poner('sender_name', nulo(d.remitente));
  poner('sender_phone', nulo(d.telefonoRemitente));
  poner('package_type', d.tipoPaquete);
  poner('is_fragile', d.fragil || null);
  poner('requires_signature', d.firma || null);
  poner('barrio', nulo(d.barrio));
  poner('trip_id', d.modo === 'viaje' ? d.viajeId : null);
  poner('origin_stop_id', d.modo === 'viaje' ? d.paradaOrigenId : null);
  poner('destination_stop_id', d.modo === 'viaje' ? d.paradaDestinoId : null);
  if (fuenteCosto) m.shipping_fee_source = fuenteCosto;
  return m;
}

export interface ResultadoGuardar {
  id: string;
  /** El domiciliario elegido no se pudo asignar (el envío sí quedó guardado). */
  asignacionFallida: boolean;
}

/**
 * Crea el envío. Con pedido web vinculado va por la ruta única del pedido
 * (`createShipmentFromWebOrder`, idempotente); sin pedido, un envío manual con sus líneas.
 * El domiciliario se asigna después por la RPC.
 */
export async function crearEnvio(
  organizationId: number,
  d: DatosFormularioEnvio,
  extra: { zonaId: string | null; fuenteCosto: string | null },
): Promise<ResultadoGuardar> {
  let id: string;
  if (d.pedidoWebId) {
    const pedido = await webOrdersService.getOrderById(d.pedidoWebId);
    if (!pedido) throw new Error('PEDIDO_NO_ENCONTRADO');
    const envio = await deliveryIntegrationService.createShipmentFromWebOrder(pedido);
    id = envio.id;
  } else {
    const modo = fulfillmentDeModo(d.modo);
    const costo = Math.max(0, Number(d.costoEnvio) || 0);
    const seguro = Math.max(0, Number(d.seguro) || 0);
    const cod = d.cobrarContraentrega ? Math.max(0, Number(d.contraentrega) || 0) : 0;
    const creado = await shipmentsService.createShipment({
      organization_id: organizationId,
      branch_id: d.sedeId ?? undefined,
      source_type: 'manual',
      shipment_number: numeroEnvioManual(),
      tracking_number: modo === 'national_carrier' ? nulo(d.guia) ?? undefined : undefined,
      customer_id: d.clienteId ?? undefined,
      delivery_address: d.direccion.trim(),
      delivery_city: d.ciudad.trim(),
      delivery_contact_name: d.destinatario.trim(),
      delivery_contact_phone: d.telefono.trim(),
      delivery_instructions: nulo(d.indicaciones) ?? undefined,
      carrier_id: modo === 'national_carrier' ? d.transportadoraId ?? undefined : undefined,
      package_count: 1,
      weight_kg: d.pesoKg ?? undefined,
      declared_value: d.valorDeclarado ?? undefined,
      shipping_fee: costo,
      insurance_fee: seguro,
      cod_amount: cod,
      total_cost: costo + seguro,
      expected_delivery_date: d.promesa ?? undefined,
      status: 'pending',
      notes: nulo(d.notas) ?? undefined,
      metadata: metadataDeFormulario(d, null, extra.fuenteCosto),
      ...({ fulfillment_mode: modo, cod_status: cod > 0 ? 'pending' : null, shipping_zone_id: extra.zonaId } as Partial<ShipmentWithDetails>),
    });
    id = creado.id;
    for (const l of d.lineas.filter((x) => x.descripcion.trim())) {
      const cantidad = Math.max(1, Number(l.cantidad) || 1);
      await shipmentsService.addShipmentItem(id, {
        description: l.descripcion.trim(),
        qty: cantidad,
        weight_kg: l.pesoKg ?? undefined,
        unit_value: l.valor != null ? l.valor / cantidad : undefined,
      });
    }
  }
  let asignacionFallida = false;
  if (d.domiciliarioId && d.modo !== 'national_carrier') {
    // Logística 1b: sin vehículo la base usa el del envío o el por defecto del domiciliario (4.5) y
    // revisa documentos. Si queda bloqueado, el envío se guarda igual «Por despachar» sin asignar.
    try {
      await deliveryIntegrationService.assignVehicleAndDriver(id, null, d.domiciliarioId);
    } catch {
      asignacionFallida = true;
    }
  }
  return { id, asignacionFallida };
}

/**
 * Guarda los cambios de un envío existente: SOLO los campos que el estado permite
 * (`camposEditables`). El domiciliario se cambia por la RPC; las líneas, por el servicio de
 * siempre. Nunca cambia el estado.
 */
export async function actualizarEnvio(
  original: EnvioEditable,
  d: DatosFormularioEnvio,
  extra: { zonaId: string | null; fuenteCosto: string | null },
): Promise<ResultadoGuardar> {
  const vinculado = !!original.sourceId;
  const ed = camposEditables({ status: original.status, vinculado, nuevo: false });
  const puede = (c: CampoEnvio) => ed.has(c);
  const cambios: Record<string, unknown> = {};
  if (puede('sede')) cambios.branch_id = d.sedeId;
  if (puede('cliente')) cambios.customer_id = d.clienteId;
  if (puede('cliente')) cambios.delivery_contact_name = d.destinatario.trim();
  if (puede('telefono')) cambios.delivery_contact_phone = d.telefono.trim();
  if (puede('direccion')) cambios.delivery_address = d.direccion.trim();
  if (puede('ciudad')) cambios.delivery_city = d.ciudad.trim();
  if (puede('indicaciones')) cambios.delivery_instructions = nulo(d.indicaciones);
  if (puede('peso')) cambios.weight_kg = d.pesoKg;
  if (puede('valorDeclarado')) cambios.declared_value = d.valorDeclarado;
  if (puede('modo')) {
    const modo = fulfillmentDeModo(d.modo);
    cambios.fulfillment_mode = modo;
    cambios.carrier_id = modo === 'national_carrier' ? d.transportadoraId : null;
  }
  if (puede('guia') && fulfillmentDeModo(d.modo) === 'national_carrier') cambios.tracking_number = nulo(d.guia);
  if (puede('promesa')) cambios.expected_delivery_date = d.promesa;
  if (puede('costo') || puede('seguro')) {
    const costo = puede('costo') ? Math.max(0, Number(d.costoEnvio) || 0) : Number(original.datos.costoEnvio) || 0;
    const seguro = puede('seguro') ? Math.max(0, Number(d.seguro) || 0) : Number(original.datos.seguro) || 0;
    cambios.shipping_fee = costo;
    cambios.insurance_fee = seguro;
    cambios.total_cost = costo + seguro;
    if (puede('costo')) cambios.shipping_zone_id = extra.zonaId;
  }
  if (puede('contraentrega')) {
    const cod = d.cobrarContraentrega ? Math.max(0, Number(d.contraentrega) || 0) : 0;
    cambios.cod_amount = cod;
    cambios.cod_status = cod > 0 ? 'pending' : null;
  }
  if (puede('notas')) cambios.notes = nulo(d.notas);
  if (puede('tipoPaquete') || puede('remitente') || puede('viaje') || puede('fragil') || puede('firma') || puede('barrio')) {
    cambios.metadata = metadataDeFormulario(d, original.metadata, puede('costo') ? extra.fuenteCosto : null);
  }
  await shipmentsService.updateShipment(original.id, cambios as Partial<ShipmentWithDetails>);

  if (puede('lineas')) {
    const nuevas = d.lineas.filter((l) => l.descripcion.trim());
    const quedan = new Set(nuevas.map((l) => l.id).filter(Boolean));
    for (const l of original.datos.lineas) if (l.id && !quedan.has(l.id)) await shipmentsService.deleteShipmentItem(l.id);
    for (const l of nuevas) {
      const cantidad = Math.max(1, Number(l.cantidad) || 1);
      const unit = l.valor != null ? l.valor / cantidad : undefined;
      if (l.id) {
        const antes = original.datos.lineas.find((x) => x.id === l.id);
        if (antes && (antes.descripcion !== l.descripcion || antes.cantidad !== cantidad || antes.valor !== l.valor || antes.pesoKg !== l.pesoKg)) {
          await shipmentsService.updateShipmentItem(l.id, { description: l.descripcion.trim(), qty: cantidad, unit_value: unit, total_value: l.valor ?? undefined, weight_kg: l.pesoKg ?? undefined });
        }
      } else {
        await shipmentsService.addShipmentItem(original.id, { description: l.descripcion.trim(), qty: cantidad, weight_kg: l.pesoKg ?? undefined, unit_value: unit });
      }
    }
  }

  let asignacionFallida = false;
  if (puede('domiciliario') && d.domiciliarioId && d.domiciliarioId !== original.datos.domiciliarioId && d.modo !== 'national_carrier') {
    // Logística 1b: misma regla que el alta (vehículo sugerido por la base; bloqueo = sin asignar).
    try {
      await deliveryIntegrationService.assignVehicleAndDriver(original.id, null, d.domiciliarioId);
    } catch {
      asignacionFallida = true;
    }
  }
  return { id: original.id, asignacionFallida };
}
