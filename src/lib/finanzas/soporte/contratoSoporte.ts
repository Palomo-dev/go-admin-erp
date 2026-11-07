/**
 * Contrato de las rutas de documento soporte (`/api/documentos-soporte/**`).
 * Módulo hoja: lo importan los route handlers, el cliente del navegador y las
 * pruebas. La organización nunca viaja en el cuerpo.
 *
 * Permisos (resueltos en el servidor, `PERMISOS_FINANZAS`): leer
 * `finance.view`; crear y editar `finance.create` (la RPC lo vuelve a exigir);
 * eliminar un borrador `finance.void` (el mismo de la ruta vieja del
 * proveedor). Enviar a la DIAN sigue por `POST /api/factus/support-document`.
 */
import { z } from 'zod';
import { ESTADOS_SOPORTE, FILTROS_ESTADO, type EstadoSoporte } from './soporteLogica';

// ─── Errores ────────────────────────────────────────────────────────────────

export const ERRORES_SOPORTE = [
  'no_autenticado',
  'sin_permiso',
  'sin_acceso_sucursal',
  'datos_invalidos',
  'documento_no_encontrado',
  'documento_no_editable',
  'documento_no_eliminable',
  'documento_en_envio',
  'documento_de_compra',
  'documento_sin_lineas',
  'linea_invalida',
  'producto_invalido',
  'proveedor_invalido',
  'proveedor_incompleto',
  'sucursal_invalida',
  'compra_invalida',
  'medio_pago_requerido',
  'vencimiento_invalido',
  'migracion_pendiente',
  'error_desconocido',
] as const;
export type ErrorSoporte = (typeof ERRORES_SOPORTE)[number];

/**
 * Mensaje de la base → código estable. `fn_assert_acceso_org` no distingue
 * «otra organización» de «no existe»; la función inexistente (migración
 * 20261108020000 sin aplicar) sale como `migracion_pendiente`.
 */
export function codigoErrorSoporte(error: { message?: string | null; code?: string | null } | null | undefined): ErrorSoporte {
  const texto = (error?.message ?? '').trim();
  if (error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(texto)) return 'migracion_pendiente';
  if (texto.startsWith('Acceso denegado a la organización')) return 'documento_no_encontrado';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_SOPORTE as readonly string[]).includes(primero) ? (primero as ErrorSoporte) : 'error_desconocido';
}

export function estadoHttpErrorSoporte(codigo: ErrorSoporte): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
      return 403;
    case 'documento_no_encontrado':
      return 404;
    case 'documento_no_editable':
    case 'documento_no_eliminable':
    case 'documento_en_envio':
    case 'documento_de_compra':
      return 409;
    case 'migracion_pendiente':
      return 503;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

// ─── Guardar ────────────────────────────────────────────────────────────────

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const monto = z.number().finite();

export const lineaSoporteSchema = z.object({
  product_id: z.number().int().positive().nullable().optional(),
  description: z.string().trim().min(1).max(500),
  qty: monto.positive(),
  unit_price: monto.min(0),
  discount_amount: monto.min(0).default(0),
  tax_rate: monto.min(0).max(100).default(0),
  tax_code: z.string().max(40).nullable().optional(),
  cuenta_contable: z.string().max(20).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const guardarSoporteSchema = z.object({
  branch_id: z.number().int().positive(),
  supplier_id: z.number().int().positive(),
  invoice_purchase_id: z.string().uuid().nullable().optional(),
  issue_date: fecha,
  payment_form: z.enum(['1', '2']),
  /** Código del método de pago de la organización (`organization_payment_methods`); el servidor lo lleva al código DIAN. */
  payment_method: z.string().trim().min(1).max(40),
  due_date: fecha.nullable().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
  observation: z.string().max(500).nullable().optional(),
  tax_included: z.boolean().default(false),
  items: z.array(lineaSoporteSchema).min(1).max(500),
});
export type DatosSoporte = z.input<typeof guardarSoporteSchema>;
export type DatosSoporteValidados = z.output<typeof guardarSoporteSchema>;

export interface ResultadoGuardarSoporte {
  id: string;
  referencia: string;
  total: number;
}

// ─── Listado ────────────────────────────────────────────────────────────────

export const TAMANOS_PAGINA_SOPORTE = [10, 25, 50, 100] as const;
export const CAMPOS_ORDEN_SOPORTE = ['referencia', 'fecha', 'total'] as const;
export const FILTROS_PANTALLA_SOPORTE = ['estado', 'desde', 'hasta', 'proveedor', 'compra'] as const;

export const parametrosListadoSoporteSchema = z.object({
  q: z.string().max(100).optional(),
  estado: z.enum(Object.keys(FILTROS_ESTADO) as [keyof typeof FILTROS_ESTADO, ...(keyof typeof FILTROS_ESTADO)[]]).optional(),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  proveedor: z.coerce.number().int().positive().optional(),
  compra: z.enum(['con', 'sin']).optional(),
  sucursal: z.coerce.number().int().positive().optional(),
  kpi_desde: fecha.optional(),
  kpi_hasta: fecha.optional(),
  orden: z.enum(['referencia_asc', 'referencia_desc', 'fecha_asc', 'fecha_desc', 'total_asc', 'total_desc']).default('fecha_desc'),
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  tamano: z.coerce.number().int().min(1).max(200).default(25),
});
export type ParametrosListadoSoporte = z.output<typeof parametrosListadoSoporteSchema>;

export interface FilaSoporteListado {
  id: string;
  referencia: string;
  numero: string | null;
  fecha: string | null;
  total: number;
  moneda: string | null;
  estado: EstadoSoporte;
  proveedor: string | null;
  proveedorDoc: string | null;
  compra: { id: string; numero: string } | null;
  sucursalId: number | null;
  /** Comparte las líneas de su factura de compra: no se edita ni se borra aquí. */
  deCompra: boolean;
  /** Último envío a la DIAN. */
  envio: { estado: string; retenido: boolean; intentos: number; maxIntentos: number } | null;
}

export interface KpisSoporte {
  emitidosPeriodo: number;
  valorPeriodo: number;
  borradores: number;
  aceptados: number;
  rechazados: number;
}

export interface RespuestaListadoSoporte {
  filas: FilaSoporteListado[];
  total: number;
  kpis: KpisSoporte;
}

export function ordenSoporte(campo: string | undefined, direccion: 'asc' | 'desc' | undefined): ParametrosListadoSoporte['orden'] {
  const c = (CAMPOS_ORDEN_SOPORTE as readonly string[]).includes(campo ?? '') ? campo : 'fecha';
  return `${c}_${direccion === 'asc' ? 'asc' : 'desc'}` as ParametrosListadoSoporte['orden'];
}

// ─── Detalle ────────────────────────────────────────────────────────────────

export interface LineaSoporteDetalle {
  id: string;
  productoId: number | null;
  descripcion: string;
  codigo: string | null;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  tarifa: number;
  codigoImpuesto: string | null;
  excluido: boolean;
  total: number;
  cuentaContable: string | null;
  nota: string | null;
}

export interface EventoEnvioSoporte {
  tipo: string;
  codigo: string | null;
  mensaje: string | null;
  fecha: string;
}

export interface DetalleSoporte {
  documento: {
    id: string;
    referencia: string;
    numero: string | null;
    estado: EstadoSoporte;
    fecha: string | null;
    hora: string | null;
    observacion: string | null;
    sucursalId: number | null;
    sucursal: string | null;
    moneda: string | null;
    impuestosIncluidos: boolean;
    subtotal: number;
    impuestos: number;
    total: number;
    cuds: string | null;
    qr: string | null;
    validadoEn: string | null;
    error: string | null;
    formaPago: '1' | '2';
    medioPago: string | null;
    vence: string | null;
    creadoEn: string;
    /** Comparte las líneas de su factura de compra (`fn_fc_crear_ds_int`). */
    deCompra: boolean;
  };
  proveedor: {
    id: number | null;
    nombre: string | null;
    identificacion: string | null;
    tipoDocumento: string | null;
    dv: string | null;
    direccion: string | null;
    correo: string | null;
    telefono: string | null;
  };
  compra: { id: string; numero: string; fecha: string | null } | null;
  lineas: LineaSoporteDetalle[];
  envio: {
    id: string;
    estado: string;
    intentos: number;
    maxIntentos: number;
    retenido: string | null;
    error: string | null;
    proximoIntento: string | null;
    eventos: EventoEnvioSoporte[];
  } | null;
}

export function esEstadoGuardado(v: unknown): v is EstadoSoporte {
  return typeof v === 'string' && (ESTADOS_SOPORTE as readonly string[]).includes(v);
}

// ─── Contexto del formulario ────────────────────────────────────────────────

export interface ContextoSoporte {
  metodos: Array<{ codigo: string; nombre: string }>;
  monedas: string[];
  compras: Array<{ id: string; numero: string; proveedor: string | null; fecha: string | null; total: number; moneda: string | null }>;
  rango: {
    prefix: string | null;
    resolucion: string | null;
    fechaResolucion: string | null;
    range_start: number | null;
    range_end: number | null;
    current_number: number | null;
    valid_until: string | null;
    alert_threshold: number | null;
  } | null;
}
