/**
 * Contrato de las rutas de facturas de venta (`GET /api/facturas-venta/[id]`,
 * `POST …/[id]/emitir`, `POST …/[id]/anular`). Módulo hoja: lo importan los
 * route handlers, las pantallas y las pruebas.
 */
import { z } from 'zod';

export const ERRORES_FACTURA = [
  'no_autenticado',
  'sin_permiso',
  'factura_no_encontrada',
  'sin_acceso_sucursal',
  'documento_invalido',
  'factura_no_borrador',
  'factura_sin_lineas',
  'stock_insuficiente',
  'motivo_obligatorio',
  'ya_anulada',
  'nota_credito',
  'con_pagos',
  'fe_aceptada',
  'sucursal_invalida',
  'cliente_invalido',
  'linea_invalida',
  'producto_invalido',
  'vendedor_invalido',
  'numero_duplicado',
] as const;
export type ErrorFactura = (typeof ERRORES_FACTURA)[number] | 'error_desconocido' | 'datos_invalidos';

/** Traduce el mensaje de la RPC a un código estable (`facturasVenta.errores.<codigo>`). */
export function codigoErrorFactura(mensaje: string | null | undefined): ErrorFactura {
  const texto = (mensaje ?? '').trim();
  // fn_assert_acceso_org: factura de otra organización → no se distingue de «no existe».
  if (texto.startsWith('Acceso denegado a la organización')) return 'factura_no_encontrada';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_FACTURA as readonly string[]).includes(primero) ? (primero as ErrorFactura) : 'error_desconocido';
}

export function estadoHttpErrorFactura(codigo: ErrorFactura): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
      return 403;
    case 'factura_no_encontrada':
      return 404;
    case 'factura_no_borrador':
    case 'ya_anulada':
    case 'con_pagos':
    case 'fe_aceptada':
    case 'nota_credito':
    case 'stock_insuficiente':
    case 'numero_duplicado':
      return 409;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

export const anulacionFacturaSchema = z.object({ motivo: z.string().trim().min(3).max(500) }).strict();

// ─── Guardar borrador (POST /api/facturas-venta, PUT /api/facturas-venta/[id]) ─

const numeroOpcional = z.number().finite();
const uuidOpcional = z.string().uuid().nullable().optional();
const fechaInstante = z.string().datetime({ offset: true }).nullable().optional();

export const lineaFacturaSchema = z
  .object({
    id: z.string().optional(),
    product_id: z.number().int().positive().nullable().optional(),
    description: z.string().trim().min(1).max(1000),
    qty: numeroOpcional.positive(),
    unit_price: numeroOpcional.min(0),
    tax_code: z.string().max(40).nullable().optional(),
    tax_rate: numeroOpcional.min(0).max(100).nullable().optional(),
    tax_included: z.boolean().optional(),
    total_line: numeroOpcional,
    discount_amount: numeroOpcional.min(0).nullable().optional(),
    serial_ids: z.array(z.number().int().positive()).max(1000).optional(),
    /** Nota de la línea: sale en el PDF (formulario v2). */
    note: z.string().trim().max(500).nullable().optional(),
    /**
     * Impuestos de la línea cuando lleva más de uno (decisión 5): el detalle
     * queda en `invoice_items.impuestos_linea`; `tax_rate` es la suma y
     * `tax_code` el del primero.
     */
    taxes: z
      .array(
        z
          .object({
            id: z.string().max(60),
            codigo: z.string().max(40).nullable(),
            nombre: z.string().max(120),
            tarifa: numeroOpcional.min(0).max(100),
          })
          .strip(),
      )
      .max(10)
      .optional(),
  })
  .strip();

/**
 * Lo que envía el formulario. La organización NO viaja: sale de la sesión.
 * Los totales tampoco: los calcula la base desde las líneas.
 */
export const guardarFacturaSchema = z
  .object({
    number: z.string().trim().max(60).nullable().optional(),
    customer_id: uuidOpcional,
    branch_id: z.number().int().positive(),
    issue_date: fechaInstante,
    due_date: fechaInstante,
    currency: z.string().trim().length(3).nullable().optional(),
    payment_terms: z.number().int().min(0).max(3650).nullable().optional(),
    payment_method: z.string().trim().max(60).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
    tax_included: z.boolean().optional(),
    salesperson_id: uuidOpcional,
    opportunity_id: uuidOpcional,
    commission_rate: numeroOpcional.min(0).nullable().optional(),
    commission_type: z.enum(['salesperson', 'intermediation_sale', 'none']).nullable().optional(),
    commission_method: z.enum(['percentage', 'fixed_amount']).nullable().optional(),
    include_in_cash_register: z.boolean().optional(),
    /** Términos y condiciones (van al PDF, aparte de las notas para el cliente). */
    terms_conditions: z.string().max(20000).nullable().optional(),
    applied_taxes: z.array(z.object({ tax_code: z.string().trim().min(1).max(40), tax_rate: numeroOpcional.min(0).max(100).optional() }).strip()).max(50).optional(),
    items: z.array(lineaFacturaSchema).min(1).max(500),
  })
  .strip();
export type DatosFactura = z.infer<typeof guardarFacturaSchema>;

export interface ResultadoGuardarFactura {
  id: string;
  numero: string | null;
  saleId: string | null;
  total: number;
  faltantes: FaltanteStock[];
}

export interface FaltanteStock {
  product_id: number;
  producto: string;
  requerido: number;
  disponible: number;
}

// ─── Detalle agregado (GET /api/facturas-venta/[id]) ────────────────────────

export interface LineaFacturaDetalle {
  id: string;
  productId: number | null;
  descripcion: string;
  sku: string | null;
  cantidad: number;
  /** Producto por peso o medida: símbolo de la unidad («kg») y decimales de la cantidad; `null` por unidad. */
  unidad?: string | null;
  decimalesCantidad?: number | null;
  precioUnitario: number;
  descuento: number;
  tarifa: number;
  codigoImpuesto: string | null;
  /** Nombre de la plantilla de impuesto de la línea (`tax_templates.name`). */
  nombreImpuesto: string | null;
  incluido: boolean;
  total: number;
  seriales: string[];
  nota: string | null;
}

export interface PagoFacturaDetalle {
  id: string;
  fecha: string | null;
  metodo: string | null;
  metodoNombre: string | null;
  monto: number;
  cambio: number;
  referencia: string | null;
  estado: string;
  recibo: string | null;
  origen: string | null;
  anuladoEn: string | null;
  motivoAnulacion: string | null;
}

export interface DetalleFacturaVenta {
  factura: {
    id: string;
    numero: string | null;
    estado: string;
    tipoDocumento: string;
    emision: string | null;
    vencimiento: string | null;
    moneda: string | null;
    subtotal: number;
    impuestos: number;
    total: number;
    saldo: number;
    notas: string | null;
    descripcion: string | null;
    impuestosIncluidos: boolean;
    terminos: number | null;
    metodoPago: string | null;
    branchId: number | null;
    sucursal: string | null;
    vendedor: string | null;
    comisionTasa: number | null;
    cargos: { descripcion: string; monto: number }[];
    saleId: string | null;
    /**
     * Canal de la venta de origen (`sales.source`): «pos», «web» o «invoice».
     * En «web» trae el pedido para enlazarlo; antes todo se rotulaba «Venta del POS».
     */
    origenVenta?: { canal: string | null; pedidoWebId: string | null; pedidoWebNumero: string | null } | null;
    facturaRelacionadaId: string | null;
    fe: { estado: string | null; numero: string | null; qr: string | null };
    creadaEn: string | null;
  };
  cliente: {
    id: string;
    nombre: string | null;
    documento: string | null;
    email: string | null;
    telefono: string | null;
    direccion: string | null;
  } | null;
  lineas: LineaFacturaDetalle[];
  pagos: PagoFacturaDetalle[];
  notasCredito: { id: string; numero: string | null; total: number; estado: string; fecha: string | null }[];
  creditoAplicado: number;
  cartera: { id: string; saldo: number; estado: string | null; dias: number | null } | null;
  asientos: { id: number; clave: string | null; fecha: string | null; debito: number; revertido: boolean }[];
  job: { id: string; estado: string; retenido: string | null; error: string | null; cufe: string | null; actualizado: string | null } | null;
  historial: { accion: string; fecha: string | null; motivo: string | null }[];
}
