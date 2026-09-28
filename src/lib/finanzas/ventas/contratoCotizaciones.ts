/**
 * Contrato de las rutas de cotizaciones (`/api/cotizaciones/**`). Módulo hoja:
 * lo importan los route handlers, el cliente del navegador y las pruebas.
 *
 * Todo se escribe por RPC transaccional (20260928172526): número y totales en
 * la base, transiciones de estado válidas, conversión a factura BORRADOR por
 * `fn_factura_venta_guardar`. La organización nunca viaja en el cuerpo.
 *
 * Permisos (decididos con la evidencia del motor de documentos, que deja VER
 * una cotización con `finance.view` o `sales_management`, y del CRM, cuyos
 * vendedores crean propuestas): leer → finance.view | sales_management;
 * escribir (crear, editar, duplicar, estado, eliminar, enviar) →
 * finance.create | sales_management; convertir → finance.create, porque crea
 * una factura.
 */
import { z } from 'zod';

export const PERMISOS_COTIZACION = {
  LEER: ['finance.view', 'sales_management'],
  ESCRIBIR: ['finance.create', 'sales_management'],
  CONVERTIR: ['finance.create'],
} as const;

export const ESTADOS_COTIZACION = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'] as const;
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

/** Estados que se pueden pedir a mano: 'expired' se deriva al leer y 'converted' lo pone la conversión. */
export const ESTADOS_MANUALES = ['sent', 'accepted', 'rejected'] as const;

const numero = z.number().finite();
const uuidOpcional = z.string().uuid().nullable().optional();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const lineaCotizacionSchema = z
  .object({
    product_id: z.number().int().positive().nullable().optional(),
    description: z.string().trim().min(1).max(5000),
    qty: numero.positive(),
    unit_price: numero.min(0),
    discount_amount: numero.min(0).nullable().optional(),
    tax_code: z.string().max(40).nullable().optional(),
    tax_rate: numero.min(0).max(100).nullable().optional(),
    tax_included: z.boolean().optional(),
  })
  .strip();

/**
 * Lo que envía el formulario. Ni organización, ni número, ni totales: los
 * pone la base. `applied_taxes` son los impuestos marcados en el documento,
 * para resolver la tarifa de las líneas que no traen una (como en facturas).
 */
export const guardarCotizacionSchema = z
  .object({
    customer_id: z.string().uuid(),
    branch_id: z.number().int().positive(),
    issue_date: dia.nullable().optional(),
    valid_until: dia.nullable().optional(),
    currency: z.string().trim().length(3).nullable().optional(),
    payment_terms: z.number().int().min(0).max(3650).nullable().optional(),
    payment_method: z.string().trim().max(60).nullable().optional(),
    notes: z.string().max(20000).nullable().optional(),
    terms_conditions: z.string().max(20000).nullable().optional(),
    salesperson_id: uuidOpcional,
    opportunity_id: uuidOpcional,
    tax_included: z.boolean().optional(),
    applied_taxes: z
      .array(z.object({ tax_code: z.string().trim().min(1).max(40), tax_rate: numero.min(0).max(100) }).strip())
      .max(50)
      .optional(),
    items: z.array(lineaCotizacionSchema).min(1).max(500),
  })
  .strip();
export type DatosCotizacion = z.infer<typeof guardarCotizacionSchema>;

export const cambioEstadoSchema = z.object({ estado: z.enum(ESTADOS_MANUALES) }).strict();
export const duplicarSchema = z.object({ valid_until: dia.nullable().optional() }).strict();
export const convertirSchema = z
  .object({ branch_id: z.number().int().positive().nullable().optional(), opportunity_id: uuidOpcional })
  .strict();
export const enviarCotizacionSchema = z
  .object({
    para: z.string().trim().email().max(200).optional(),
    mensaje: z.string().max(2000).nullable().optional(),
    idioma: z.enum(['es', 'en', 'fr', 'pt']).optional(),
    clave: z.string().min(8).max(200).optional(),
  })
  .strict();

export const filtrosCotizacionSchema = z
  .object({
    estado: z.enum(ESTADOS_COTIZACION).optional(),
    busqueda: z.string().trim().max(100).optional(),
    desde: dia.optional(),
    hasta: dia.optional(),
    customer_id: z.string().uuid().optional(),
    opportunity_id: z.string().uuid().optional(),
    branch_id: z.coerce.number().int().positive().optional(),
  })
  .strip();
export type FiltrosCotizacion = z.infer<typeof filtrosCotizacionSchema>;

export const ERRORES_COTIZACION = [
  'no_autenticado',
  'sin_permiso',
  'sin_acceso_sucursal',
  'cotizacion_no_encontrada',
  'sucursal_invalida',
  'cliente_invalido',
  'vendedor_invalido',
  'oportunidad_invalida',
  'vigencia_invalida',
  'cotizacion_sin_lineas',
  'linea_invalida',
  'producto_invalido',
  'cotizacion_no_editable',
  'transicion_invalida',
  'cotizacion_vencida',
  'cotizacion_no_eliminable',
  'cotizacion_rechazada',
  'numero_duplicado',
  'datos_invalidos',
  // Envío por correo
  'cliente_sin_correo',
  'correo_no_configurado',
  'cliente_sin_consentimiento',
  'correo_invalido',
  'proveedor_correo',
] as const;
export type ErrorCotizacion = (typeof ERRORES_COTIZACION)[number] | 'error_desconocido';

/** Mensaje de la RPC → código estable (`documentosVenta.cotizaciones.errores.<codigo>`). */
export function codigoErrorCotizacion(mensaje: string | null | undefined): ErrorCotizacion {
  const texto = (mensaje ?? '').trim();
  // fn_assert_acceso_org: no se distingue «de otra organización» de «no existe».
  if (texto.startsWith('Acceso denegado a la organización')) return 'cotizacion_no_encontrada';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_COTIZACION as readonly string[]).includes(primero) ? (primero as ErrorCotizacion) : 'error_desconocido';
}

export function estadoHttpErrorCotizacion(codigo: ErrorCotizacion): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
      return 403;
    case 'cotizacion_no_encontrada':
      return 404;
    case 'cotizacion_no_editable':
    case 'transicion_invalida':
    case 'cotizacion_vencida':
    case 'cotizacion_no_eliminable':
    case 'cotizacion_rechazada':
    case 'numero_duplicado':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

// ─── Respuestas ─────────────────────────────────────────────────────────────

export interface LineaCotizacionDetalle {
  id: string;
  product_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  discount_amount: number;
  tax_code: string | null;
  tax_rate: number;
  tax_included: boolean;
  total_line: number;
}

/** Fila del listado y cabecera del detalle. `status` es el estado VIVO (con 'expired'). */
export interface CotizacionResumen {
  id: string;
  number: string;
  status: EstadoCotizacion;
  /** Estado guardado en la fila (sin derivar 'expired'). */
  stored_status: string;
  customer_id: string;
  branch_id: number | null;
  issue_date: string;
  valid_until: string | null;
  currency: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  payment_terms: number | null;
  payment_method: string | null;
  salesperson_id: string | null;
  converted_invoice_id: string | null;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
  customers: { id: string; full_name: string; email?: string; phone?: string } | null;
}

export interface CotizacionDetalle extends Omit<CotizacionResumen, 'customers'> {
  notes: string | null;
  terms_conditions: string | null;
  tax_included: boolean;
  converted_invoice_number: string | null;
  customers: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
    address?: string;
    identification_number?: string;
    identification_type?: string;
    avatar_url?: string | null;
  } | null;
  quotation_items: LineaCotizacionDetalle[];
}

export interface ResultadoGuardarCotizacion {
  id: string;
  numero: string;
  total: number;
}

export interface ResultadoConversion {
  invoiceId: string;
  numero: string | null;
  yaConvertida: boolean;
  faltantes: { product_id: number; producto: string; requerido: number; disponible: number }[];
}
