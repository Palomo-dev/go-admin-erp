/**
 * Contrato de las rutas de seriales, garantías y trazabilidad (inventario B4).
 * Módulo hoja: lo importan los route handlers (`/api/inventario/{seriales,
 * garantias,trazabilidad}/**`), el cliente del navegador y las pruebas.
 *
 * Las RPC (`fn_seriales_*`, `fn_serial_detalle`, `fn_garantia_*`,
 * `fn_trazabilidad`) responden `jsonb` con claves en español; aquí están sus
 * tipos. Sus errores llegan como `message` de Postgres y se traducen a un
 * `codigo` estable (textos en `inventarioGarantias.errores.<codigo>`) y a su
 * estado HTTP.
 */
import { z } from 'zod';
import { ACCIONES_INVENTARIO, type AccionInventario, type TipoDocumentoMovimiento } from '@/lib/inventario/nucleo/tipos';

// ── Tipos compartidos ────────────────────────────────────────────────────────

/**
 * Documento de un origen: la forma del núcleo (`fn_documento_de_movimiento`,
 * la misma que usa `kit/inventario/EnlaceDocumento`) más el reclamo de
 * garantía, que el núcleo no conoce. `numero` y `ruta` los resuelve el servidor.
 */
export type TipoDocumentoSerial = TipoDocumentoMovimiento | 'garantia';

export interface DocumentoSerial {
  source: string;
  source_id: string | null;
  product_id: number | null;
  tipo: TipoDocumentoSerial;
  numero: string | null;
  ruta: string | null;
  fecha?: string | null;
}

export interface Referencia {
  id: number;
  nombre: string;
}

export interface ProductoRef {
  id: number;
  uuid: string | null;
  nombre: string;
  sku: string | null;
}

export interface TerceroRef {
  id: string | number | null;
  uuid?: string | null;
  nombre: string | null;
}

export interface VentaSerial {
  venta_id: string | null;
  factura_id: string | null;
  numero: string | null;
  fecha: string | null;
  /** La venta (o la factura si no hay venta) con su número y ruta. */
  documento: DocumentoSerial | null;
  sucursal: Referencia | null;
}

export interface GarantiaSerial {
  meses: number | null;
  /** Columnas `date` (sin zona): se muestran con `formatPlainDate`. */
  inicio: string | null;
  fin: string | null;
}

export interface EventoSerial {
  id: string;
  tipo: string;
  fecha: string;
  de_estado: string | null;
  a_estado: string | null;
  de_sucursal: string | null;
  a_sucursal: string | null;
  cliente: TerceroRef | null;
  usuario: string | null;
  documento: DocumentoSerial | null;
  notas: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * `fn_seriales_permisos`: las acciones del núcleo (`fn_inventario_permisos`)
 * más `gestionar` = `garantias` (abrir, aprobar, rechazar, enviar y resolver
 * reclamos). La RPC de cada acción vuelve a exigir.
 */
export type PermisosSeriales = Record<AccionInventario, boolean> & { gestionar: boolean };

export const PERMISOS_SERIALES_VACIOS: PermisosSeriales = {
  ...(Object.fromEntries(ACCIONES_INVENTARIO.map((a) => [a, false])) as Record<AccionInventario, boolean>),
  gestionar: false,
};

/**
 * Códigos de permiso que la ruta comprueba antes de llamar a la RPC (sin
 * permisos nuevos). Son los que componen la acción del núcleo:
 * `ver` y `garantias` de `fn_inventario_permisos`, y los que exige
 * `fn_producto_serial_cambiar_estado` para cambiar el estado de un serial.
 */
export const PERMISOS_VER_SERIALES = [
  'inventory.view',
  'inventory.create',
  'inventory.edit',
  'inventory.delete',
  'inventory.adjust',
  'inventory.transfer',
  'inventory_management',
  'product_management',
] as const;
export const PERMISOS_GESTIONAR_SERIALES = ['inventory.edit', 'inventory_management'] as const;
export const PERMISOS_ESTADO_SERIAL = ['inventory.edit', 'inventory.adjust', 'inventory_management', 'product_management'] as const;

// ── Seriales ─────────────────────────────────────────────────────────────────

export const ESTADOS_SERIAL = [
  'in_stock',
  'reserved',
  'sold',
  'returned',
  'in_transit',
  'damaged',
  'rma',
  'warranty_claim',
  'warranty',
  'repair',
  'defective',
] as const;
export type EstadoSerialBd = (typeof ESTADOS_SERIAL)[number];

export const FILTROS_GARANTIA_SERIAL = ['vigente', 'por_vencer', 'vencida', 'sin_iniciar', 'corriendo_en_bodega'] as const;
export type FiltroGarantiaSerial = (typeof FILTROS_GARANTIA_SERIAL)[number];

export interface SerialFila {
  id: number;
  serial: string;
  estado: string;
  producto: ProductoRef;
  sucursal: Referencia | null;
  recibido: string | null;
  origen: DocumentoSerial | null;
  proveedor: TerceroRef | null;
  costo: number | null;
  venta: VentaSerial | null;
  fecha_venta: string | null;
  vendedor: string | null;
  cliente: TerceroRef | null;
  garantia: GarantiaSerial;
  reclamo: { id: string; codigo: string | null; estado: string; rma: string | null } | null;
  ultimo_evento: { tipo: string; fecha: string; a_sucursal: string | null; documento: DocumentoSerial | null } | null;
}

export interface KpisSeriales {
  total: number;
  en_stock: number;
  sucursales_en_stock: number;
  vendidos: number;
  vendidos_con_venta: number;
  vendidos_con_cliente: number;
  garantia_vigente: number;
  garantia_vence_30: number;
  en_reclamo: number;
  reclamos_abiertos: number;
  corriendo_en_bodega: number;
}

export interface ListadoSeriales {
  filas: SerialFila[];
  total: number;
  kpis: KpisSeriales;
  hoy: string;
  permisos: PermisosSeriales;
}

export interface ReclamoDeSerial {
  id: string;
  codigo: string | null;
  estado: string;
  fecha: string;
  motivo: string;
  rma: string | null;
  resolucion: string | null;
}

export interface SerialDetalle {
  id: number;
  serial: string;
  estado: string;
  notas: string | null;
  producto: ProductoRef;
  proveedor: TerceroRef | null;
  origen: DocumentoSerial | null;
  recibido: string | null;
  recibido_en: Referencia | null;
  sucursal: Referencia | null;
  costo: number | null;
  lote: { id: number; codigo: string; vence: string | null } | null;
  venta: VentaSerial | null;
  fecha_venta: string | null;
  canal: string | null;
  precio_venta: number | null;
  vendedor: string | null;
  cliente: TerceroRef | null;
  garantia: GarantiaSerial;
  reclamos: ReclamoDeSerial[];
  eventos: EventoSerial[];
  hoy: string;
  permisos: PermisosSeriales;
}

/** Query de `GET /api/inventario/seriales` (todo texto en la URL). */
export const filtrosSerialesSchema = z
  .object({
    busqueda: z.string().max(120).optional(),
    estados: z.array(z.enum(ESTADOS_SERIAL)).max(ESTADOS_SERIAL.length).optional(),
    sucursal: z.coerce.number().int().positive().optional(),
    producto: z.coerce.number().int().positive().optional(),
    garantia: z.enum(FILTROS_GARANTIA_SERIAL).optional(),
    orden: z.enum(['serial', 'recibido', 'venta']).optional(),
    direccion: z.enum(['asc', 'desc']).optional(),
    desde: z.coerce.number().int().min(0).max(1_000_000).optional(),
    limite: z.coerce.number().int().min(1).max(5000).optional(),
  })
  .strict();
export type FiltrosSeriales = z.infer<typeof filtrosSerialesSchema>;

/** «Marcar como dañado» y afines: `fn_producto_serial_cambiar_estado`. */
export const cambiarEstadoSerialesSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(500),
    estado: z.enum(['in_stock', 'damaged', 'rma', 'returned', 'sold']),
    nota: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type CambiarEstadoSeriales = z.infer<typeof cambiarEstadoSerialesSchema>;

export interface ResultadoCambioEstado {
  actualizados: number;
  rechazados: { id: number; serial: string; estado: string }[];
}

// ── Garantías ────────────────────────────────────────────────────────────────

export const ESTADOS_RECLAMO = ['pending', 'approved', 'in_process', 'resolved', 'rejected', 'cancelled'] as const;
export type EstadoReclamo = (typeof ESTADOS_RECLAMO)[number];

export const TIPOS_RESOLUCION = ['repair', 'replacement', 'refund'] as const;
export type TipoResolucion = (typeof TIPOS_RESOLUCION)[number];

export type EstadoGarantiaSerial = 'vigente' | 'vencida' | 'sin_garantia';

export interface ReclamoFila {
  id: string;
  codigo: string | null;
  fecha: string;
  estado: EstadoReclamo;
  motivo: string;
  serial: { id: number; serial: string };
  producto: ProductoRef | null;
  cliente: TerceroRef | null;
  garantia: { fin: string | null; estado: EstadoGarantiaSerial };
  rma: string | null;
  proveedor: TerceroRef | null;
  resolucion: string | null;
}

export interface KpisGarantias {
  total: number;
  pendientes: number;
  pendientes_en_plazo: number;
  pendientes_vencidos: number;
  aprobados: number;
  con_proveedor: number;
  resueltos_mes: number;
  reparados_mes: number;
  reemplazados_mes: number;
  reembolsos_mes: number;
  reembolsado_mes: number;
}

export interface ListadoGarantias {
  filas: ReclamoFila[];
  total: number;
  kpis: KpisGarantias;
  hoy: string;
  permisos: PermisosSeriales;
}

export type MotivoNoReclamable = 'serial_no_encontrado' | 'serial_no_vendido' | 'sin_garantia' | 'garantia_vencida' | 'reclamo_abierto';

/** `fn_garantia_serial_para_reclamo`: ¿se puede abrir un reclamo sobre este serial? */
export interface EvaluacionSerial {
  encontrado: boolean;
  puede: boolean;
  motivo: MotivoNoReclamable | null;
  id?: number;
  serial?: string;
  estado?: string;
  producto?: ProductoRef;
  venta?: VentaSerial | null;
  fecha_venta?: string | null;
  cliente?: TerceroRef | null;
  proveedor?: TerceroRef | null;
  garantia?: GarantiaSerial & { estado: EstadoGarantiaSerial };
  reclamo_abierto?: { id: string; codigo: string | null; estado: string } | null;
  hoy?: string;
}

export interface GarantiaDetalle {
  id: string;
  codigo: string | null;
  estado: EstadoReclamo;
  fecha: string;
  motivo: string;
  descripcion: string | null;
  adjuntos: unknown[];
  creado_por: string | null;
  aprobado: { fecha: string; por: string | null } | null;
  rma: { numero: string | null; transportadora: string | null; guia: string | null; notas: string | null; fecha: string | null; por: string | null } | null;
  proveedor: TerceroRef | null;
  resolucion: {
    tipo: string | null;
    notas: string | null;
    fecha: string | null;
    por: string | null;
    monto: number | null;
    respuesta_proveedor: string | null;
    reemplazo: { id: number; serial: string } | null;
  } | null;
  cliente: TerceroRef | null;
  unidad: EvaluacionSerial;
  eventos: EventoSerial[];
  hoy: string;
  permisos: PermisosSeriales;
}

export interface SerialReemplazo {
  id: number;
  serial: string;
  sucursal: Referencia | null;
}

export const filtrosGarantiasSchema = z
  .object({
    busqueda: z.string().max(120).optional(),
    estados: z.array(z.enum(ESTADOS_RECLAMO)).max(ESTADOS_RECLAMO.length).optional(),
    garantia: z.enum(['vigente', 'vencida']).optional(),
    orden: z.enum(['fecha', 'codigo']).optional(),
    direccion: z.enum(['asc', 'desc']).optional(),
    desde: z.coerce.number().int().min(0).max(1_000_000).optional(),
    limite: z.coerce.number().int().min(1).max(5000).optional(),
  })
  .strict();
export type FiltrosGarantias = z.infer<typeof filtrosGarantiasSchema>;

export const crearReclamoSchema = z
  .object({
    serial_id: z.number().int().positive(),
    motivo: z.string().trim().min(1).max(200),
    descripcion: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type CrearReclamo = z.infer<typeof crearReclamoSchema>;

export const cambiarEstadoReclamoSchema = z
  .object({
    accion: z.enum(['aprobar', 'rechazar']),
    motivo: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((v) => v.accion !== 'rechazar' || (v.motivo ?? '').length >= 3, { path: ['motivo'] });
export type CambiarEstadoReclamo = z.infer<typeof cambiarEstadoReclamoSchema>;

export const enviarRmaSchema = z
  .object({
    proveedor: z.number().int().positive().nullable().optional(),
    rma: z.string().trim().min(1).max(80),
    transportadora: z.string().trim().max(120).nullable().optional(),
    guia: z.string().trim().max(120).nullable().optional(),
    notas: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export type EnviarRma = z.infer<typeof enviarRmaSchema>;

export const resolverReclamoSchema = z
  .object({
    tipo: z.enum(TIPOS_RESOLUCION),
    serial_reemplazo: z.number().int().positive().nullable().optional(),
    monto: z.number().finite().positive().max(1e12).nullable().optional(),
    notas: z.string().trim().max(1000).nullable().optional(),
    respuesta_proveedor: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.tipo !== 'replacement' || !!v.serial_reemplazo, { path: ['serial_reemplazo'] })
  .refine((v) => v.tipo !== 'refund' || (v.monto ?? 0) > 0, { path: ['monto'] });
export type ResolverReclamo = z.infer<typeof resolverReclamoSchema>;

// ── Trazabilidad ─────────────────────────────────────────────────────────────

export interface PasoLote {
  tipo: 'recibido' | 'trasladado' | 'traslado_recibido' | 'ajuste' | 'movimiento' | 'vendido';
  origen?: string;
  direccion?: 'in' | 'out';
  cantidad: number;
  fecha?: string;
  sucursal?: string | null;
  documento?: DocumentoSerial | null;
  usuario?: string | null;
  nota?: string | null;
  ventas?: number;
  clientes?: number;
  sucursales?: number;
  desde?: string;
  hasta?: string;
}

export interface VentaLote {
  id: number;
  fecha: string;
  documento: DocumentoSerial | null;
  cliente: TerceroRef | null;
  sucursal: string | null;
  cantidad: number;
  vendedor: string | null;
}

export interface TrazabilidadLote {
  tipo: 'lote';
  codigo: string;
  otros_lotes: number;
  lote: { id: number; codigo: string; vence: string | null; creado: string | null; producto: ProductoRef; proveedor: TerceroRef | null };
  kpis: {
    recibidas: number;
    costo_unitario: number | null;
    recepcion: DocumentoSerial | null;
    recibido_el: string | null;
    vendidas: number;
    clientes: number;
    primera_venta: string | null;
    ultima_venta: string | null;
    ventas: number;
    existencias: number;
    existencias_por_sucursal: { sucursal: string; cantidad: number }[];
    mermas: number;
    mermas_documentos: DocumentoSerial[];
  };
  recorrido: PasoLote[];
  ventas: { total: number; filas: VentaLote[] };
  hoy: string;
}

export interface MovimientoDocumento {
  id: number;
  fecha: string;
  origen: string;
  direccion: 'in' | 'out';
  cantidad: number;
  costo_unitario: number | null;
  producto: ProductoRef;
  lote: string | null;
  sucursal: string | null;
}

export interface TrazabilidadDocumento {
  tipo: 'documento';
  codigo: string;
  documento: DocumentoSerial & { cliente: TerceroRef | null };
  movimientos: MovimientoDocumento[];
  seriales: { id: number; serial: string; estado: string; producto: string }[];
  hoy: string;
}

export interface TrazabilidadSerial {
  tipo: 'serial';
  codigo: string;
  serial: SerialDetalle;
}

export interface TrazabilidadNinguno {
  tipo: 'ninguno';
  codigo: string;
}

export type ResultadoTrazabilidad = TrazabilidadSerial | TrazabilidadLote | TrazabilidadDocumento | TrazabilidadNinguno;

export const consultaTrazabilidadSchema = z
  .object({
    codigo: z.string().trim().min(1).max(120),
    sucursal: z.coerce.number().int().positive().optional(),
    desde: z.coerce.number().int().min(0).max(1_000_000).optional(),
    limite: z.coerce.number().int().min(1).max(5000).optional(),
  })
  .strict();
export type ConsultaTrazabilidad = z.infer<typeof consultaTrazabilidadSchema>;

// ── Errores ──────────────────────────────────────────────────────────────────

export const ERRORES_SERIALES = [
  'sin_permiso',
  'sucursal_no_permitida',
  'sucursal_invalida',
  'no_encontrado',
  'serial_no_encontrado',
  'reclamo_no_encontrado',
  'serial_no_vendido',
  'sin_garantia',
  'garantia_vencida',
  'reclamo_abierto',
  'transicion_invalida',
  'motivo_requerido',
  'rma_requerido',
  'proveedor_invalido',
  'tipo_invalido',
  'reemplazo_requerido',
  'reemplazo_invalido',
  'monto_invalido',
  'estado_invalido',
  'datos_invalidos',
  'error_desconocido',
] as const;
export type ErrorSeriales = (typeof ERRORES_SERIALES)[number];

/**
 * Error de una RPC de seriales → código estable. Postgres entrega el código
 * como `message` (`raise exception 'reclamo_abierto'`); 42501 es falta de
 * permiso o de acceso a la sucursal.
 */
export function codigoErrorSeriales(error: { message?: string | null; code?: string | null } | null | undefined): ErrorSeriales {
  const mensaje = (error?.message ?? '').trim();
  if (mensaje === 'SUCURSAL_NO_PERMITIDA') return 'sucursal_no_permitida';
  const conocido = (ERRORES_SERIALES as readonly string[]).find((c) => mensaje === c || mensaje.startsWith(`${c}:`));
  if (conocido) return conocido as ErrorSeriales;
  if (error?.code === '42501' || /sin_permiso|acceso denegado/i.test(mensaje)) return 'sin_permiso';
  if (error?.code === 'P0002') return 'no_encontrado';
  return 'error_desconocido';
}

export function estadoHttpErrorSeriales(codigo: ErrorSeriales): number {
  switch (codigo) {
    case 'sin_permiso':
    case 'sucursal_no_permitida':
      return 403;
    case 'no_encontrado':
    case 'serial_no_encontrado':
    case 'reclamo_no_encontrado':
      return 404;
    case 'serial_no_vendido':
    case 'sin_garantia':
    case 'garantia_vencida':
    case 'reclamo_abierto':
    case 'transicion_invalida':
    case 'reemplazo_invalido':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}
