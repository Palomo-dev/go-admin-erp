/**
 * Contratos de los adaptadores de logística.
 *
 * - CarrierProvider: transportadora directa (Coordinadora, Servientrega, Envía Colvanes,
 *   Interrapidísimo): cotiza, genera la guía oficial, el rótulo, rastrea y anula.
 * - DropshipProvider: proveedor de dropshipping (Effi, Dropi): catálogo, stock y pedido con
 *   contraentrega; el proveedor elige la transportadora y devuelve la guía.
 *
 * Un adaptador sin documentación oficial o sin credenciales lanza NotConfiguredError: nunca
 * devuelve datos simulados.
 */
import type { EstadoCanonico } from './estados';

export type Ambiente = 'sandbox' | 'production';

/** Lo que recibe un adaptador. Las credenciales llegan descifradas y solo existen en el servidor. */
export interface ContextoIntegracion {
  organizationId: number;
  connectionId: string;
  environment: Ambiente;
  /** Valores del formulario de conexión: secretos (del Vault) y ajustes, por la `clave` del esquema. */
  credenciales: Readonly<Record<string, string>>;
}

export interface CapacidadesTransportadora {
  quote: boolean;
  createLabel: boolean;
  labelPdf: boolean;
  track: boolean;
  webhook: boolean;
  cancel: boolean;
  cod: boolean;
  pickup: boolean;
}

export interface CapacidadesDropshipping {
  catalog: boolean;
  stock: boolean;
  cities: boolean;
  quoteShipping: boolean;
  createOrder: boolean;
  orderStatus: boolean;
  cancelOrder: boolean;
  webhook: boolean;
  cod: boolean;
}

export interface Direccion {
  nombre: string;
  telefono: string;
  direccion: string;
  /** Código DANE del municipio (5 dígitos). */
  ciudadDane: string;
  documento?: string;
  correo?: string;
}

export interface Paquete {
  pesoKg: number;
  largoCm?: number;
  anchoCm?: number;
  altoCm?: number;
  unidades: number;
}

export interface SolicitudEnvio {
  /** Id interno del envío: clave de idempotencia al crear la guía. */
  shipmentId: string;
  referencia: string;
  origen: Direccion;
  destino: Direccion;
  paquetes: Paquete[];
  valorDeclarado: number;
  /** Contraentrega: monto a recaudar (0 o ausente = sin recaudo). */
  montoRecaudo?: number;
  contenido?: string;
  observaciones?: string;
  nivelServicio?: string;
}

export interface Cotizacion {
  servicio: string;
  precio: number;
  moneda: string;
  diasEstimados?: number;
  comisionRecaudo?: number;
  raw: unknown;
}

export interface Rotulo {
  formato: 'pdf' | 'zpl' | 'png';
  /** Uno de los dos: URL del proveedor o contenido en base64. */
  url?: string;
  base64?: string;
}

export interface GuiaCreada {
  trackingNumber: string;
  providerRef: string;
  label?: Rotulo;
  raw: unknown;
}

export interface EventoRastreo {
  providerStatus: string;
  canonicalStatus: EstadoCanonico | null;
  eventTime: string;
  location?: string;
  description?: string;
  /** Id del evento en el proveedor, si existe (deduplicación). */
  externalEventId?: string;
  raw: unknown;
}

export interface EventoWebhook {
  externalEventId: string;
  trackingNumber?: string;
  providerOrderId?: string;
  eventos: EventoRastreo[];
}

export interface CarrierProvider {
  readonly code: string;
  readonly nombre: string;
  readonly capabilities: CapacidadesTransportadora;
  /** Prueba real contra el proveedor. Sin esto la conexión no pasa a `connected`. */
  validateCredentials(ctx: ContextoIntegracion): Promise<void>;
  quote(ctx: ContextoIntegracion, solicitud: SolicitudEnvio): Promise<Cotizacion[]>;
  createShipment(ctx: ContextoIntegracion, solicitud: SolicitudEnvio): Promise<GuiaCreada>;
  getLabel(ctx: ContextoIntegracion, trackingNumber: string): Promise<Rotulo>;
  track(ctx: ContextoIntegracion, trackingNumber: string): Promise<EventoRastreo[]>;
  cancel(ctx: ContextoIntegracion, trackingNumber: string): Promise<void>;
  parseWebhook?(ctx: ContextoIntegracion, cuerpo: unknown, cabeceras: Headers): Promise<EventoWebhook>;
}

export interface ProductoProveedor {
  externalProductId: string;
  externalVariantId: string;
  nombre: string;
  sku?: string;
  codigoBarras?: string;
  referencia?: string;
  costo: number;
  precioSugerido?: number;
  moneda: string;
  stock: number;
  pesoKg?: number;
  largoCm?: number;
  anchoCm?: number;
  altoCm?: number;
  imagenes: string[];
  descripcion?: string;
  raw: unknown;
}

export interface PaginaCatalogo {
  productos: ProductoProveedor[];
  siguienteCursor: string | null;
}

export interface CiudadProveedor {
  externalCode: string;
  nombre: string;
  departamento?: string;
  /** Código DANE si el proveedor lo informa. */
  dane?: string;
  raw: unknown;
}

export interface LineaPedido {
  externalProductId: string;
  externalVariantId: string;
  cantidad: number;
  precioUnitario: number;
}

export interface PedidoDropshipping {
  /** Clave de idempotencia: id del envío (grupo de ítems de ese proveedor). */
  shipmentId: string;
  referencia: string;
  destino: Direccion;
  lineas: LineaPedido[];
  montoRecaudo: number;
  observaciones?: string;
}

export interface PedidoCreado {
  providerOrderId: string;
  trackingNumber?: string;
  carrierName?: string;
  label?: Rotulo;
  raw: unknown;
}

export interface EstadoPedidoProveedor {
  providerOrderId: string;
  trackingNumber?: string;
  carrierName?: string;
  eventos: EventoRastreo[];
  raw: unknown;
}

export interface DropshipProvider {
  readonly code: string;
  readonly nombre: string;
  readonly capabilities: CapacidadesDropshipping;
  validateCredentials(ctx: ContextoIntegracion): Promise<void>;
  listCatalog(ctx: ContextoIntegracion, cursor: string | null): Promise<PaginaCatalogo>;
  getStock(ctx: ContextoIntegracion, ids: { externalProductId: string; externalVariantId: string }[]): Promise<Map<string, number>>;
  getCities(ctx: ContextoIntegracion): Promise<CiudadProveedor[]>;
  quoteShipping?(ctx: ContextoIntegracion, pedido: PedidoDropshipping): Promise<Cotizacion[]>;
  createOrder(ctx: ContextoIntegracion, pedido: PedidoDropshipping): Promise<PedidoCreado>;
  getOrderStatus(ctx: ContextoIntegracion, providerOrderId: string): Promise<EstadoPedidoProveedor>;
  cancelOrder?(ctx: ContextoIntegracion, providerOrderId: string): Promise<void>;
  parseWebhook?(ctx: ContextoIntegracion, cuerpo: unknown, cabeceras: Headers): Promise<EventoWebhook>;
}

export type Adaptador =
  | { tipo: 'transportadora'; adaptador: CarrierProvider }
  | { tipo: 'dropshipping'; adaptador: DropshipProvider };
