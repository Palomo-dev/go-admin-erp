import { supabase } from '@/lib/supabase/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebOrder, WebOrderItem } from './webOrdersService';
import { toPlainDate, todayInTz } from '@/lib/utils/dateDisplay';
import { getOrganizationTimezone } from './organizationTimezoneService';
import { contraentregaDePedidoWeb, type MedioCobroContraentrega } from '@/lib/logistica/contraentrega';
import type { EstadoEnvio, ModoDespacho, MotivoNovedad } from '@/lib/logistica/estadosEnvio';

/**
 * Envíos del domicilio propio (logística Fase 1, docs/logistica/FASE1-CIMIENTOS.md).
 *
 * Crear el envío de un pedido web sigue siendo un insert desde aquí (una sola ruta, idempotente
 * por índice único). Todo lo demás — asignar, cambiar estado, entregar con prueba/código/recaudo,
 * novedad y el envío de una venta POS — es UNA RPC transaccional `logistica_*` con guarda de
 * organización y sede en la base (migraciones 20261123150003 y 20261123150641). El actor sale de
 * la sesión (auth.uid()); los parámetros `driverId` que quedan en firmas viejas no deciden nada.
 */

/**
 * Opciones de `createShipmentFromWebOrder`.
 *
 * `client` existe porque la misma función corre en dos contextos: desde la UI del POS
 * (cliente de navegador con sesión) y desde la auto-confirmación por pago y el cron
 * (service role). Antes había DOS implementaciones, una por contexto, con campos y
 * formatos de guía distintos. Ahora hay una, y el contexto sólo cambia el cliente.
 */
export interface CreateWebOrderShipmentOptions {
  /** Cliente Supabase a usar. Por defecto, el del navegador. */
  client?: SupabaseClient;
  /**
   * Id de cliente ya resuelto. La auto-confirmación crea o localiza al cliente antes
   * de llegar aquí y su id puede diferir de `webOrder.customer_id`.
   */
  customerId?: string | null;
  /** Zona horaria de la organización; si no viene, se consulta. */
  timezone?: string;
}

export interface DeliveryShipment {
  id: string;
  organization_id: number;
  branch_id?: number;
  source_type: string;
  source_id: string;
  shipment_number: string;
  tracking_number: string;
  customer_id?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_department?: string;
  delivery_postal_code?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  delivery_contact_name?: string;
  delivery_contact_phone?: string;
  delivery_instructions?: string;
  carrier_id?: string;
  expected_delivery_date?: string;
  picked_at?: string;
  dispatched_at?: string;
  delivered_at?: string;
  status: EstadoEnvio;
  notes?: string;
  internal_notes?: string;
  created_by?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Fase 1 logística (migración 20261123145040)
  driver_id?: string | null;
  vehicle_id?: string | null;
  assigned_at?: string | null;
  fulfillment_mode?: ModoDespacho;
  exception_reason?: MotivoNovedad | null;
  exception_detail?: string | null;
  failed_attempts?: number;
  cod_status?: 'pending' | 'collected' | 'remitted' | null;
  cod_collected_amount?: number | null;
  cod_collected_method?: MedioCobroContraentrega | null;
  cod_collected_at?: string | null;
  cod_remitted_at?: string | null;
  delivery_code_required?: boolean;
  shipping_zone_id?: string | null;
  // Relaciones
  vehicle?: DeliveryVehicle;
  driver?: DeliveryDriver;
  web_order?: WebOrder;
  // Campos adicionales de la tabla shipments
  customer?: { id: string; full_name: string; phone?: string; email?: string } | null;
  shipment_items?: { id: string; description: string; qty: number }[];
  cod_amount?: number;
  shipping_fee?: number;
  total_cost?: number;
  currency?: string;
  package_count?: number;
  declared_value?: number;
  weight_kg?: number;
  payment_status?: 'pending' | 'paid' | 'cod' | 'cancelled';
}

export interface DeliveryVehicle {
  id: string;
  plate: string;
  vehicle_type: string;
  brand?: string;
  model?: string;
  color?: string;
  capacity_kg?: number;
  status: 'available' | 'in_use' | 'maintenance' | 'inactive';
  current_driver_id?: string;
  current_driver?: DeliveryDriver;
}

/**
 * Domiciliario (driver_credentials). Desde la Fase 1 puede ser EXTERNO: sin empleo en Recursos
 * humanos (`employment_id` NULL), con nombre y teléfono propios y sin licencia (bicicleta, a pie).
 */
export interface DeliveryDriver {
  id: string;
  organization_id?: number;
  employment_id: string | null;
  user_id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  is_external?: boolean;
  vehicle_type?: string | null;
  license_number: string | null;
  license_category: string | null;
  license_expiry: string | null;
  is_active: boolean;
  employee?: {
    id: string | number;
    first_name: string;
    last_name: string;
    phone?: string;
    photo_url?: string;
  } | null;
}

export interface TransportEvent {
  id: string;
  reference_type: string;
  reference_id: string;
  event_type: string;
  event_time: string;
  latitude?: number;
  longitude?: number;
  location_text?: string;
  actor_type: string;
  actor_id?: string;
  description?: string;
  payload?: Record<string, unknown>;
  canonical_status?: string | null;
  reason_code?: string | null;
  created_at: string;
}

export interface ProofOfDelivery {
  id: string;
  shipment_id: string;
  delivered_at: string;
  recipient_name: string;
  recipient_doc_type?: string;
  recipient_doc_number?: string;
  recipient_relationship?: string;
  signature_url?: string;
  photo_urls?: string[];
  latitude?: number;
  longitude?: number;
  delivery_location_type?: string;
  driver_id?: string;
  courier_id?: string | null;
  delivery_code_verified?: boolean;
  cod_collected_amount?: number | null;
  cod_collected_method?: string | null;
  notes?: string;
  customer_feedback?: string;
  customer_rating?: number;
  created_at: string;
}

/** Prueba de entrega que recibe `markAsDelivered` (se traduce al jsonb de la RPC). */
export interface ProofInput {
  recipientName: string;
  recipientDocType?: string;
  recipientDocNumber?: string;
  recipientRelationship?: string;
  signatureUrl?: string;
  photoUrls?: string[];
  notes?: string;
  latitude?: number;
  longitude?: number;
  locationType?: string;
}

/** Resultado de `markAsDelivered`. Un código errado NO lanza: devuelve ok=false con los intentos. */
export type ResultadoEntrega =
  | { ok: true; shipmentId: string; proofId: string; codStatus: string | null; aviso: 'entregado' }
  | { ok: false; error: 'CODIGO_INVALIDO'; intentosRestantes: number };

/** Error de una RPC logistica_*: `codigo` es el RAISE de la base (TRANSICION_INVALIDA, COBRO_REQUERIDO…). */
export class EnvioError extends Error {
  constructor(public readonly codigo: string, mensaje?: string) {
    super(mensaje ?? codigo);
    this.name = 'EnvioError';
  }
}

const CODIGOS_RPC = [
  'ENVIO_NO_ENCONTRADO', 'SIN_ACCESO_SEDE', 'ESTADO_NO_ASIGNABLE', 'DOMICILIARIO_INVALIDO', 'VEHICULO_INVALIDO',
  'ESTADO_NO_PERMITIDO', 'TRANSICION_INVALIDA', 'YA_ENTREGADO', 'ESTADO_NO_ENTREGABLE', 'RECEPTOR_REQUERIDO',
  'CODIGO_NO_EMITIDO', 'CODIGO_BLOQUEADO', 'COBRO_REQUERIDO', 'MOTIVO_INVALIDO', 'ESTADO_SIN_NOVEDAD',
  'VENTA_NO_ENCONTRADA', 'VENTA_ANULADA', 'DIRECCION_REQUERIDA', 'SIN_PERMISO',
  // Migración 20261123165617: un domiciliario sin permiso sobre un envío que no es suyo, y asignar
  // contraentrega a quien no la cobra.
  'ENVIO_AJENO', 'DOMICILIARIO_NO_COBRA',
] as const;

function errorDeRpc(error: { message?: string; code?: string }): EnvioError {
  const m = error.message ?? '';
  const codigo = CODIGOS_RPC.find((c) => m.includes(c)) ?? (error.code === '42501' ? 'SIN_ACCESO' : 'ERROR');
  return new EnvioError(codigo, m || codigo);
}

class DeliveryIntegrationService {
  /**
   * Crea el envío de un pedido web. ÚNICA ruta: la llaman la confirmación manual desde
   * el POS y la auto-confirmación por pago (webhook y cron `reconcile-web-orders`).
   *
   * Idempotente de dos formas: consulta antes de insertar, y si aun así dos llamadas se
   * cruzan (UI + webhook sobre el mismo pedido), el índice único parcial sobre
   * `(source_type, source_id)` hace fallar al segundo insert con 23505 y aquí se devuelve
   * el envío que ganó la carrera, en vez de propagar el error.
   *
   * Fase 1 logística: llena el modo de despacho, el flete del pedido y la contraentrega
   * (`contraentregaDePedidoWeb`: sin pagar y no de pasarela → cod_amount = total, cod_status
   * pending). Con contraentrega propia, el disparador de la base emite el código de 4 dígitos.
   */
  async createShipmentFromWebOrder(
    webOrder: WebOrder,
    opts: CreateWebOrderShipmentOptions = {}
  ): Promise<DeliveryShipment> {
    if (webOrder.delivery_type !== 'delivery_own' && webOrder.delivery_type !== 'delivery_third_party') {
      throw new Error('Solo se pueden crear shipments para pedidos con delivery (propio o tercero)');
    }

    const client = opts.client ?? supabase;

    // Verificar si ya existe un shipment para este pedido
    const existing = await this.getShipmentByWebOrderId(webOrder.id, client);
    if (existing) {
      return existing;
    }

    const trackingNumber = await this.generateTrackingNumber();

    // Extraer datos de dirección (soporta múltiples formatos)
    const addr = (webOrder.delivery_address || {}) as Record<string, unknown>;

    // La tabla shipments no tiene columna delivery_country: el país se persiste en
    // metadata y se anexa a delivery_instructions para que el mensajero lo vea.
    const country = (addr.country || '') as string;
    const stateCode = (addr.state_code || '') as string;
    const baseInstructions = (addr.instructions || webOrder.customer_notes || '') as string;
    const deliveryInstructions = country
      ? `${baseInstructions}${baseInstructions ? ' | ' : ''}País: ${country}${stateCode ? ` (${stateCode})` : ''}`
      : baseInstructions;

    // Día calendario en la zona de la organización, no el día UTC del instante.
    let expectedDeliveryDate: string | null = null;
    if (webOrder.estimated_delivery_at) {
      const tz = opts.timezone ?? (await getOrganizationTimezone(webOrder.organization_id));
      expectedDeliveryDate = toPlainDate(new Date(webOrder.estimated_delivery_at), tz);
    }

    const { cod_amount, cod_status } = contraentregaDePedidoWeb(webOrder);
    const fulfillmentMode: ModoDespacho = webOrder.delivery_type === 'delivery_third_party' ? 'national_carrier' : 'own';

    const shipmentData = {
      organization_id: webOrder.organization_id,
      branch_id: webOrder.branch_id,
      source_type: 'web_order',
      source_id: webOrder.id,
      shipment_number: `DEL-${webOrder.order_number}`,
      tracking_number: trackingNumber,
      customer_id: opts.customerId !== undefined ? opts.customerId : (webOrder.customer_id ?? null),
      delivery_address: (addr.address || addr.street || '') as string,
      delivery_city: (addr.city || '') as string,
      delivery_department: (addr.department || addr.state || addr.neighborhood || '') as string,
      delivery_postal_code: (addr.postal_code || '') as string,
      delivery_latitude: (addr.lat || addr.latitude || null) as number | null,
      delivery_longitude: (addr.lng || addr.longitude || null) as number | null,
      delivery_contact_name: webOrder.customer_name || null,
      delivery_contact_phone: webOrder.customer_phone || null,
      delivery_instructions: deliveryInstructions,
      expected_delivery_date: expectedDeliveryDate,
      status: 'pending' as const,
      fulfillment_mode: fulfillmentMode,
      shipping_fee: Number(webOrder.delivery_fee) || 0,
      declared_value: Number(webOrder.total) || 0,
      cod_amount,
      cod_status,
      payment_status: cod_amount > 0
        ? 'cod'
        : webOrder.payment_status === 'paid' || (webOrder.payment_status === 'partial' && webOrder.advance_status === 'paid')
          ? 'paid' // anticipo que cubre todo el pedido: nada que cobrar en la puerta
          : 'pending',
      notes: `Pedido web: ${webOrder.order_number}`,
      metadata: {
        web_order_number: webOrder.order_number,
        web_order_total: webOrder.total,
        items_count: webOrder.items?.length || 0,
        delivery_type: webOrder.delivery_type,
        delivery_partner: webOrder.delivery_partner || null,
        delivery_country: country || null,
        delivery_state: (addr.state || addr.department || '') as string,
        delivery_state_code: stateCode || null,
        delivery_neighborhood: (addr.neighborhood || null) as string | null,
      },
    };

    const { data, error } = await client
      .from('shipments')
      .insert(shipmentData)
      .select()
      .single();

    if (error) {
      // 23505 = otra llamada insertó primero. Devolver el envío existente es el
      // comportamiento correcto: el pedido ya tiene su envío.
      if (error.code === '23505') {
        const winner = await this.getShipmentByWebOrderId(webOrder.id, client);
        if (winner) return winner;
      }
      throw error;
    }

    const shipment = data as DeliveryShipment;

    // Ni la creación de items ni el evento pueden hacer fallar la confirmación del pedido.
    await this.createShipmentItemsFromWebOrder(shipment.id, webOrder.items ?? [], client);

    await this.createTransportEvent(
      {
        organization_id: webOrder.organization_id,
        reference_type: 'shipment',
        reference_id: shipment.id,
        event_type: 'created',
        canonical_status: 'created',
        actor_type: 'system',
        description: `Envío creado desde pedido web ${webOrder.order_number}`,
      },
      client
    );

    return shipment;
  }

  /**
   * Copia las líneas del pedido web al envío. No lanza: un fallo aquí deja el envío sin
   * detalle, que es recuperable, mientras que abortar la confirmación no lo sería.
   */
  private async createShipmentItemsFromWebOrder(
    shipmentId: string,
    items: WebOrderItem[],
    client: SupabaseClient
  ): Promise<void> {
    if (items.length === 0) return;

    const rows = items.map((item) => ({
      shipment_id: shipmentId,
      description: item.product_name,
      qty: item.quantity,
      unit_value: item.unit_price,
      total_value: item.total,
      product_id: item.product_id ?? null,
      sku: item.product_sku ?? null,
      notes: item.notes ?? null,
    }));

    const { error } = await client.from('shipment_items').insert(rows);
    if (error) {
      console.warn('[deliveryIntegration] No se pudieron crear los shipment_items del pedido web:', error);
    }
  }

  /**
   * Obtiene el shipment asociado a un web_order.
   *
   * `maybeSingle()` sobre el más reciente: `.single()` lanza tanto con cero filas como con
   * más de una, y la UI de asignación y de seguimiento dependen de esta función.
   */
  async getShipmentByWebOrderId(
    webOrderId: string,
    client: SupabaseClient = supabase
  ): Promise<DeliveryShipment | null> {
    const { data, error } = await client
      .from('shipments')
      .select('*')
      .eq('source_type', 'web_order')
      .eq('source_id', webOrderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return (data as DeliveryShipment | null) ?? null;
  }

  /**
   * Obtiene un shipment con todas sus relaciones
   */
  async getShipmentWithDetails(shipmentId: string): Promise<DeliveryShipment | null> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        customer:customers(id, full_name, phone, email)
      `)
      .eq('id', shipmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Vehículo: columna propia (Fase 1); metadata.vehicle_id es el espejo de lo anterior.
    const vehicleId = (data.vehicle_id ?? data.metadata?.vehicle_id) as string | undefined;
    if (vehicleId) {
      const vehicle = await this.getVehicleById(vehicleId);
      if (vehicle) {
        data.vehicle = vehicle;
      }
    }

    return data as DeliveryShipment;
  }

  /** Llama una RPC logistica_* y traduce su error. */
  private async rpc<T = Record<string, unknown>>(nombre: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(nombre, args);
    if (error) throw errorDeRpc(error);
    return (data ?? {}) as T;
  }

  /** Releer el envío después de una RPC (las RPC devuelven un resumen, la UI quiere la fila). */
  private async releer(shipmentId: string): Promise<DeliveryShipment> {
    const { data, error } = await supabase.from('shipments').select('*').eq('id', shipmentId).single();
    if (error) throw error;
    return data as DeliveryShipment;
  }

  /**
   * Asigna el domiciliario (y, si se quiere, el vehículo) a un envío: `logistica_asignar_domiciliario`.
   *
   * El vehículo ya NO es obligatorio. El conductor queda en `shipments.driver_id` y el espejo en
   * metadata se FUSIONA (antes se reemplazaba todo `metadata`). `estimatedDeliveryTime` puede
   * venir como día ('YYYY-MM-DD') o instante ISO: se guarda el día en la zona de la organización.
   */
  async assignVehicleAndDriver(
    shipmentId: string,
    vehicleId: string | null | undefined,
    driverId: string,
    estimatedDeliveryTime?: string
  ): Promise<DeliveryShipment> {
    let fecha: string | null = null;
    if (estimatedDeliveryTime) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(estimatedDeliveryTime)) {
        fecha = estimatedDeliveryTime;
      } else {
        const { data } = await supabase.from('shipments').select('organization_id').eq('id', shipmentId).single();
        const tz = await getOrganizationTimezone((data as { organization_id: number } | null)?.organization_id ?? 0);
        fecha = toPlainDate(new Date(estimatedDeliveryTime), tz);
      }
    }
    await this.rpc('logistica_asignar_domiciliario', {
      p_shipment_id: shipmentId,
      p_driver_id: driverId,
      p_vehicle_id: vehicleId || null,
      p_fecha_estimada: fecha,
    });
    return this.releer(shipmentId);
  }

  /**
   * Cambia el estado con `logistica_cambiar_estado` (ready_for_pickup, picked, in_transit,
   * out_for_delivery, returned, cancelled). La base valida la transición.
   */
  async changeStatus(
    shipmentId: string,
    estado: 'ready_for_pickup' | 'picked' | 'in_transit' | 'out_for_delivery' | 'returned' | 'cancelled',
    opts: { nota?: string; latitude?: number; longitude?: number } = {}
  ): Promise<{ status: string; aviso: string | null }> {
    const r = await this.rpc<{ status: string; aviso: string | null }>('logistica_cambiar_estado', {
      p_shipment_id: shipmentId,
      p_estado: estado,
      p_nota: opts.nota ?? null,
      p_lat: opts.latitude ?? null,
      p_lng: opts.longitude ?? null,
    });
    return { status: r.status, aviso: r.aviso ?? null };
  }

  /**
   * El domiciliario sale con el pedido: queda «en camino» (out_for_delivery), con picked_at y
   * dispatched_at, y el pedido web pasa a in_delivery. Devuelve el aviso a enviar ('en_camino').
   */
  async markAsPickedUp(
    shipmentId: string,
    location?: { latitude: number; longitude: number }
  ): Promise<DeliveryShipment> {
    await this.changeStatus(shipmentId, 'out_for_delivery', {
      latitude: location?.latitude,
      longitude: location?.longitude,
    });
    return this.releer(shipmentId);
  }

  /**
   * Entrega con prueba: `logistica_marcar_entregado`. En contraentrega exige el código de 4
   * dígitos que tiene el cliente y el cobro (monto y medio); con código errado devuelve
   * `{ ok: false, error: 'CODIGO_INVALIDO', intentosRestantes }` sin lanzar (el intento queda contado).
   */
  async markAsDelivered(
    shipmentId: string,
    proofData: ProofInput,
    opts: { codigo?: string | null; cobro?: { metodo: MedioCobroContraentrega; monto: number } | null } = {}
  ): Promise<ResultadoEntrega> {
    const r = await this.rpc<Record<string, unknown>>('logistica_marcar_entregado', {
      p_shipment_id: shipmentId,
      p_prueba: {
        nombre: proofData.recipientName,
        tipo_documento: proofData.recipientDocType ?? null,
        documento: proofData.recipientDocNumber ?? null,
        relacion: proofData.recipientRelationship ?? null,
        firma_url: proofData.signatureUrl ?? null,
        fotos: proofData.photoUrls ?? [],
        notas: proofData.notes ?? null,
        lat: proofData.latitude ?? null,
        lng: proofData.longitude ?? null,
        tipo_lugar: proofData.locationType ?? null,
      },
      p_codigo: opts.codigo ?? null,
      p_cobro: opts.cobro ?? null,
    });
    if (r.ok === false) {
      return { ok: false, error: 'CODIGO_INVALIDO', intentosRestantes: Number(r.intentos_restantes) || 0 };
    }
    return {
      ok: true,
      shipmentId: String(r.shipment_id),
      proofId: String(r.proof_id),
      codStatus: (r.cod_status as string | null) ?? null,
      aviso: 'entregado',
    };
  }

  /**
   * Novedad / intento fallido: `logistica_registrar_novedad`. El envío queda en failed_attempt
   * con el motivo; se puede reintentar (out_for_delivery), reasignar o devolver.
   */
  async registerFailedAttempt(
    shipmentId: string,
    failureData: {
      reasonCode: MotivoNovedad;
      reasonText?: string;
      rescheduleDate?: string;
      photoUrls?: string[];
      latitude?: number;
      longitude?: number;
    }
  ): Promise<{ intento: number; aviso: 'novedad' }> {
    const r = await this.rpc<{ intento: number }>('logistica_registrar_novedad', {
      p_shipment_id: shipmentId,
      p_motivo: failureData.reasonCode,
      p_detalle: failureData.reasonText ?? null,
      p_reprogramar: failureData.rescheduleDate ?? null,
      p_fotos: failureData.photoUrls ?? null,
      p_lat: failureData.latitude ?? null,
      p_lng: failureData.longitude ?? null,
    });
    return { intento: Number(r.intento) || 0, aviso: 'novedad' };
  }

  /**
   * Envío de una venta POS con domicilio: `logistica_crear_envio_venta_pos`.
   *
   * La base lee la venta (organización, sede, cliente, total, saldo y líneas): la contraentrega
   * es el SALDO de la venta, no un monto del navegador. El flete sale de la cotización por zonas
   * cuando la entrega trae municipio DANE, barrio, código postal o coordenadas; si no, se guarda
   * el que mandó el POS (`metadata.shipping_fee_source = 'pos_cliente'`). Idempotente: una venta,
   * un envío. Los demás campos del objeto (total, ítems, estado de pago) se aceptan por
   * compatibilidad con CheckoutDialog y se ignoran.
   */
  async createShipmentFromPOSSale(params: {
    saleId: string;
    organizationId: number;
    branchId: number;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    total: number;
    shippingFee?: number;
    shippingRateId?: string;
    itemsCount: number;
    driverId?: string;
    paymentStatus?: 'pending' | 'paid';
    deliveryInfo: {
      address: string;
      city?: string;
      contact_name?: string;
      contact_phone?: string;
      instructions?: string;
      municipio_dane?: string;
      barrio?: string;
      codigo_postal?: string;
      lat?: number;
      lng?: number;
    };
    saleItems?: Array<{
      description: string;
      qty: number;
      unit_value: number;
      total_value: number;
      product_id?: number;
      sku?: string;
      sale_item_id?: string;
      notes?: string;
    }>;
  }): Promise<DeliveryShipment> {
    const d = params.deliveryInfo;
    const r = await this.rpc<{ shipment_id: string }>('logistica_crear_envio_venta_pos', {
      p_sale_id: params.saleId,
      p_entrega: {
        direccion: d.address,
        ciudad: d.city ?? null,
        contacto_nombre: d.contact_name || params.customerName || null,
        contacto_telefono: d.contact_phone || params.customerPhone || null,
        instrucciones: d.instructions ?? null,
        municipio_dane: d.municipio_dane ?? null,
        barrio: d.barrio ?? null,
        codigo_postal: d.codigo_postal ?? null,
        lat: d.lat ?? null,
        lng: d.lng ?? null,
        costo_envio: params.shippingFee ?? 0,
        tarifa_id: params.shippingRateId ?? null,
      },
      p_driver_id: params.driverId || null,
    });
    return this.releer(r.shipment_id);
  }

  /**
   * Obtiene vehículos disponibles para delivery
   */
  async getAvailableVehicles(organizationId: number): Promise<DeliveryVehicle[]> {
    // vehicles.current_driver_id apunta a auth.users (no a driver_credentials): el embed
    // `driver_credentials!vehicles_current_driver_id_fkey` que había aquí no existe.
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'available')
      .eq('is_active', true)
      .in('vehicle_type', ['motorcycle', 'car', 'van', 'other']);

    if (error) throw error;
    return (data || []) as DeliveryVehicle[];
  }

  /**
   * Domiciliarios activos de la organización: los de Recursos humanos (con empleo) y los
   * externos (sin empleo). Licencia vencida deja fuera; sin licencia (bicicleta, a pie), no.
   */
  async getAvailableDrivers(organizationId: number): Promise<DeliveryDriver[]> {
    // "Hoy" en la zona de la organización: comparar contra el día UTC dejaba fuera (o
    // dentro) licencias en las horas alrededor de la medianoche.
    const hoy = todayInTz(await getOrganizationTimezone(organizationId));
    const { data, error } = await supabase
      .from('driver_credentials')
      .select(`
        *,
        employment:employments!driver_credentials_employment_id_fkey(
          id,
          organization_member:organization_members(
            id,
            profiles(
              id,
              first_name,
              last_name,
              phone,
              avatar_url
            )
          )
        )
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`license_expiry.is.null,license_expiry.gte.${hoy}`);

    if (error) throw error;

    type DriverProfile = {
      id?: number; first_name?: string; last_name?: string; phone?: string; avatar_url?: string;
    };
    type DriverRow = Record<string, unknown> & {
      id: string;
      full_name?: string | null;
      phone?: string | null;
      employment?: {
        organization_member?: {
          id?: number;
          profiles?: DriverProfile | DriverProfile[];
        };
      } | null;
    };

    // El tipo generado del select con embeds no es asignable a DriverRow directamente:
    // se pasa por unknown a propósito (misma forma en runtime).
    return ((data || []) as unknown as DriverRow[]).map((driver) => {
      const perfiles = driver.employment?.organization_member?.profiles;
      const profile: DriverProfile | undefined = Array.isArray(perfiles) ? perfiles[0] : perfiles;
      const [nombre, ...apellidos] = (driver.full_name ?? '').trim().split(/\s+/);
      const employee = profile
        ? {
            id: driver.employment?.organization_member?.id ?? driver.id,
            first_name: profile.first_name || '',
            last_name: profile.last_name || '',
            phone: profile.phone || driver.phone || '',
            photo_url: profile.avatar_url || '',
          }
        : driver.full_name
          ? { id: driver.id, first_name: nombre ?? '', last_name: apellidos.join(' '), phone: driver.phone ?? '', photo_url: '' }
          : null;
      return { ...driver, employee };
    }) as unknown as DeliveryDriver[];
  }

  /**
   * Domiciliario del usuario con sesión. Primero por `driver_credentials.user_id` (externos con
   * cuenta y los de Recursos humanos completados por el disparador); si no, la cadena vieja
   * auth.users → organization_members → employments → driver_credentials.
   */
  async getDriverForUser(userId: string, organizationId?: number): Promise<DeliveryDriver | null> {
    let directo = supabase
      .from('driver_credentials')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (organizationId != null) directo = directo.eq('organization_id', organizationId);
    const { data: porUsuario, error: errUsuario } = await directo.maybeSingle();
    if (errUsuario) throw errUsuario;

    // Buscar el organization_member por user_id con datos del perfil
    let miembro = supabase
      .from('organization_members')
      .select(`
        id,
        user_id,
        profiles!inner(id, first_name, last_name, phone, avatar_url)
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);
    if (organizationId != null) miembro = miembro.eq('organization_id', organizationId);
    const { data: member, error: memberError } = await miembro.maybeSingle();
    if (memberError) throw memberError;

    const perfiles = (member as { profiles?: unknown } | null)?.profiles;
    const profile = (Array.isArray(perfiles) ? perfiles[0] : perfiles) as
      | { first_name?: string; last_name?: string; phone?: string; avatar_url?: string }
      | undefined;

    let driverCred = porUsuario as Record<string, unknown> | null;
    if (!driverCred && member) {
      const { data: employment, error: jobError } = await supabase
        .from('employments')
        .select('id')
        .eq('organization_member_id', (member as { id: number }).id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (jobError) throw jobError;
      if (employment) {
        const { data, error } = await supabase
          .from('driver_credentials')
          .select('*')
          .eq('employment_id', employment.id)
          .eq('is_active', true)
          .maybeSingle();
        if (error) throw error;
        driverCred = data as Record<string, unknown> | null;
      }
    }
    if (!driverCred) return null;

    const nombreLibre = ((driverCred.full_name as string | null) ?? '').trim().split(/\s+/);
    return {
      ...driverCred,
      employee: {
        id: (member as { id?: number } | null)?.id ?? (driverCred.id as string),
        first_name: profile?.first_name || nombreLibre[0] || '',
        last_name: profile?.last_name || nombreLibre.slice(1).join(' '),
        phone: profile?.phone || (driverCred.phone as string | null) || '',
        photo_url: profile?.avatar_url || '',
      },
    } as unknown as DeliveryDriver;
  }

  /**
   * Obtiene TODOS los envíos asignados a un domiciliario (columna driver_id, Fase 1).
   */
  async getAllShipmentsForDriver(driverId: string, organizationId: number): Promise<DeliveryShipment[]> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        customer:customers(id, full_name, phone, email),
        shipment_items(id, description, qty)
      `)
      .eq('organization_id', organizationId)
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as DeliveryShipment[];
  }

  /**
   * Cambio de estado desde «Mis envíos». Los pasos simples van por `logistica_cambiar_estado`;
   * «entregado» va por `logistica_marcar_entregado` con el contacto como receptor y SOLO si el
   * envío no es contraentrega (la contraentrega exige código y cobro: usar `markAsDelivered`).
   * `driverId` se conserva en la firma por compatibilidad: el actor sale de la sesión.
   */
  async updateShipmentStatusByDriver(
    shipmentId: string,
    newStatus: DeliveryShipment['status'],
    driverId: string
  ): Promise<DeliveryShipment> {
    void driverId;
    if (newStatus === 'delivered') {
      const actual = await this.releer(shipmentId);
      if (actual.delivery_code_required || (Number(actual.cod_amount) || 0) > 0) {
        throw new EnvioError('COBRO_REQUERIDO', 'Contraentrega: registra la entrega con el código y el cobro');
      }
      const r = await this.markAsDelivered(shipmentId, {
        recipientName: actual.delivery_contact_name || 'Cliente',
        notes: 'Entrega marcada desde Mis envíos sin prueba adicional',
      });
      if (!r.ok) throw new EnvioError(r.error);
      return this.releer(shipmentId);
    }
    if (
      newStatus === 'ready_for_pickup' || newStatus === 'picked' || newStatus === 'in_transit' ||
      newStatus === 'out_for_delivery' || newStatus === 'returned' || newStatus === 'cancelled'
    ) {
      await this.changeStatus(shipmentId, newStatus);
      return this.releer(shipmentId);
    }
    throw new EnvioError('ESTADO_NO_PERMITIDO', `Estado no permitido desde Mis envíos: ${newStatus}`);
  }

  /**
   * Obtiene un vehículo por ID
   */
  async getVehicleById(vehicleId: string): Promise<DeliveryVehicle | null> {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as DeliveryVehicle;
  }

  /**
   * Obtiene el historial de eventos de un shipment
   */
  async getShipmentEvents(shipmentId: string): Promise<TransportEvent[]> {
    const { data, error } = await supabase
      .from('transport_events')
      .select('*')
      .eq('reference_type', 'shipment')
      .eq('reference_id', shipmentId)
      .order('event_time', { ascending: true });

    if (error) throw error;
    return (data || []) as TransportEvent[];
  }

  /**
   * Obtiene la prueba de entrega de un shipment
   */
  async getProofOfDelivery(shipmentId: string): Promise<ProofOfDelivery | null> {
    const { data, error } = await supabase
      .from('proof_of_delivery')
      .select('*')
      .eq('shipment_id', shipmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data as ProofOfDelivery;
  }

  /**
   * Obtiene entregas pendientes para un domiciliario (columna driver_id, Fase 1).
   */
  async getPendingDeliveriesForDriver(driverId: string): Promise<DeliveryShipment[]> {
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        customer:customers(id, full_name, phone, email)
      `)
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'ready_for_pickup', 'picked', 'in_transit', 'out_for_delivery', 'failed_attempt'])
      .order('expected_delivery_date', { ascending: true });

    if (error) throw error;
    return (data || []) as DeliveryShipment[];
  }

  /**
   * Obtiene estadísticas de entregas
   */
  async getDeliveryStats(organizationId: number, dateFrom?: string, dateTo?: string): Promise<{
    total: number;
    pending: number;
    assigned: number;
    inTransit: number;
    delivered: number;
    failed: number;
    avgDeliveryTime: number;
  }> {
    let query = supabase
      .from('shipments')
      .select('status, picked_at, delivered_at')
      .eq('organization_id', organizationId)
      .eq('source_type', 'web_order');

    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;

    const shipments = data || [];
    const delivered = shipments.filter(s => s.status === 'delivered');

    // Calcular tiempo promedio de entrega
    let totalDeliveryTime = 0;
    let deliveredWithTime = 0;
    delivered.forEach(s => {
      if (s.picked_at && s.delivered_at) {
        const pickTime = new Date(s.picked_at).getTime();
        const deliverTime = new Date(s.delivered_at).getTime();
        totalDeliveryTime += (deliverTime - pickTime) / 60000; // minutos
        deliveredWithTime++;
      }
    });

    return {
      total: shipments.length,
      pending: shipments.filter(s => s.status === 'pending').length,
      assigned: shipments.filter(s => s.status === 'assigned').length,
      inTransit: shipments.filter(s => s.status === 'out_for_delivery').length,
      delivered: delivered.length,
      failed: shipments.filter(s => s.status === 'returned' || s.status === 'failed_attempt').length,
      avgDeliveryTime: deliveredWithTime > 0 ? Math.round(totalDeliveryTime / deliveredWithTime) : 0,
    };
  }

  // Métodos privados

  private async generateTrackingNumber(): Promise<string> {
    const prefix = 'TRK';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${timestamp}${random}`;
  }

  private async createTransportEvent(eventData: {
    organization_id: number;
    reference_type: string;
    reference_id: string;
    event_type: string;
    canonical_status?: string;
    actor_type: string;
    actor_id?: string;
    latitude?: number;
    longitude?: number;
    location_text?: string;
    description?: string;
    payload?: Record<string, unknown>;
  }, client: SupabaseClient = supabase): Promise<void> {
    const { error } = await client.from('transport_events').insert({
      ...eventData,
      event_time: new Date().toISOString(),
      source: 'internal',
    });
    if (error) {
      console.warn('[deliveryIntegration] No se pudo registrar el evento de transporte:', error);
    }
  }
}

export const deliveryIntegrationService = new DeliveryIntegrationService();
