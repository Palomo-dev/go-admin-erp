/**
 * Contrato de las rutas de facturas de compra y cuentas por pagar (plan
 * FACTURAS-COMPRA-CXP F2). Módulo hoja: lo importan los route handlers, los
 * clientes del navegador y las pruebas.
 *
 * Los errores de las RPC (`fn_factura_compra_*`, `fn_programar_pago`, …) llegan
 * como `message` de Postgres; aquí se traducen a un `codigo` estable (los textos
 * están en `facturasCompra.errores.<codigo>` y `cuentasPorPagar.errores.<codigo>`)
 * y a su estado HTTP.
 */
import { z } from 'zod';
import { loteRecepcionSchema } from '@/lib/services/inventario/recepcionOrdenCompra';

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Día `YYYY-MM-DD` (se combina con la hora de la sucursal en la base) o instante ISO. */
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/);
const UUID = z.string().uuid();
const ENTERO_ID = z.number().int().positive();
const IMPORTE = z.number().finite().min(0).max(1e12);

export const lineaCompraSchema = z
  .object({
    product_id: ENTERO_ID.nullable().optional(),
    description: z.string().max(500).nullable().optional(),
    qty: z.number().finite().positive().max(1e9),
    unit_price: IMPORTE,
    discount_amount: IMPORTE.optional(),
    tax_rate: z.number().finite().min(0).max(100).optional(),
    tax_code: z.string().max(20).nullable().optional(),
    serial_numbers: z.array(z.string().max(120)).max(1000).optional(),
    note: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const retencionSchema = z
  .object({
    concept: z.string().min(1).max(200),
    base: IMPORTE,
    rate: z.number().finite().min(0).max(100),
    amount: IMPORTE.nullable().optional(),
    tax_code: z.string().max(20).nullable().optional(),
  })
  .strict();

export const guardarFacturaSchema = z
  .object({
    id: UUID.optional(),
    branch_id: ENTERO_ID,
    supplier_id: ENTERO_ID,
    number_ext: z.string().trim().min(1).max(60),
    issue_date: FECHA.nullable().optional(),
    due_date: FECHA.nullable().optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    payment_terms: z.number().int().min(0).max(3650).nullable().optional(),
    payment_method: z.string().max(40).nullable().optional(),
    payment_terms_id: UUID.nullable().optional(),
    tax_included: z.boolean().optional(),
    po_id: ENTERO_ID.nullable().optional(),
    salesperson_id: UUID.nullable().optional(),
    commission_rate: z.number().finite().min(0).max(100).optional(),
    commission_type: z.enum(['salesperson', 'intermediation_purchase', 'none']).optional(),
    commission_method: z.string().max(40).optional(),
    commission_amount: IMPORTE.optional(),
    lines: z.array(lineaCompraSchema).min(1).max(500),
    applied_taxes: z.array(z.object({ tax_code: z.string().min(1).max(20), tax_rate: z.number().finite().min(0).max(100) }).strict()).max(20).optional(),
    withholdings: z.array(retencionSchema).max(20).optional(),
  })
  .strict();

export type GuardarFacturaCompra = z.infer<typeof guardarFacturaSchema>;

/**
 * Inventario B8: lotes de la recepción por línea de la factura (por
 * `invoice_item_id`, o por `product_id` si el producto está en una sola línea).
 * Obligatorios para los productos que manejan lotes; los valida y crea la base
 * (`fn_fc_recepcionar_int`).
 */
export const lotesRecepcionFacturaSchema = z
  .array(
    z
      .object({
        invoice_item_id: UUID.optional(),
        product_id: z.coerce.number().int().positive().optional(),
        lotes: z.array(loteRecepcionSchema).min(1).max(50),
      })
      .strict()
      .refine((e) => Boolean(e.invoice_item_id) || Boolean(e.product_id), { message: 'linea_requerida' }),
  )
  .max(500);

export const confirmarFacturaSchema = z
  .object({
    recepcionar: z.boolean().default(true),
    generar_ds: z.boolean().default(false),
    lotes: lotesRecepcionFacturaSchema.optional(),
  })
  .strict();

export const recepcionarFacturaSchema = z.object({ lotes: lotesRecepcionFacturaSchema.optional() }).strict();

export type LotesRecepcionFactura = z.infer<typeof lotesRecepcionFacturaSchema>;

export const anularFacturaSchema = z.object({ motivo: z.string().trim().min(3).max(500) }).strict();

export const desdeOrdenSchema = z.object({ orden_uuid: UUID }).strict();

export const programarPagoSchema = z
  .object({
    amount: z.number().finite().positive().max(1e12),
    scheduled_date: DIA,
    method: z.string().min(1).max(40).default('transfer'),
    bank_account_id: ENTERO_ID.nullable().optional(),
    reference: z.string().max(200).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    installment_id: UUID.nullable().optional(),
  })
  .strict();

export const decisionProgramacionSchema = z.object({ comentario: z.string().trim().max(500).nullable().optional() }).strict();
export const rechazoProgramacionSchema = z.object({ comentario: z.string().trim().min(3).max(500) }).strict();

export const planCuotasSchema = z
  .object({
    cuotas: z
      .array(
        z
          .object({
            vence: DIA,
            capital: IMPORTE,
            interes: IMPORTE.optional(),
            valor: z.number().finite().positive().max(1e12),
            nota: z.string().max(500).nullable().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(120),
  })
  .strict();

export const estadoCuentaQuerySchema = z.object({ desde: DIA.nullable().optional(), hasta: DIA.nullable().optional() });

// ─── Errores ─────────────────────────────────────────────────────────────────

export const ERRORES_COMPRA = [
  'sin_permiso',
  'sucursal_no_permitida',
  'no_encontrado',
  'numero_requerido',
  'numero_duplicado',
  'proveedor_invalido',
  'sucursal_invalida',
  'lineas_requeridas',
  'linea_invalida',
  'linea_sin_descripcion',
  'producto_ajeno',
  'moneda_invalida',
  'metodo_invalido',
  'orden_invalida',
  'orden_sin_recepcion',
  'retencion_invalida',
  'vencimiento_antes_de_emision',
  'no_editable',
  'ya_confirmada',
  'sin_lineas',
  'no_confirmada',
  'anulada',
  'solo_borrador',
  'tiene_pagos',
  'tiene_asiento',
  'ya_anulada',
  'cuenta_sin_saldo',
  'monto_invalido',
  'excede_saldo',
  'excede_saldo_programable',
  'fecha_pasada',
  'cuenta_bancaria_invalida',
  'cuota_invalida',
  'programacion_no_pendiente',
  'segregacion_funciones',
  'motivo_requerido',
  'plan_con_abonos',
  'plan_no_cuadra',
  'cuotas_invalidas',
  'rango_invalido',
  'datos_invalidos',
  'error_desconocido',
] as const;

/**
 * Inventario B8: errores de la recepción con lotes y seriales. Su texto vive en
 * `inventarioRecepcionOC.errores` (el mismo de la recepción de la OC); las
 * pantallas de compras lo usan cuando `facturasCompra.errores` no lo tiene.
 */
export const ERRORES_RECEPCION_COMPRA = [
  'lote_requerido',
  'lotes_no_cuadran',
  'lotes_sin_linea',
  'lote_invalido',
  'lote_repetido',
  'lote_vencimiento_distinto',
  'seriales_no_cuadran',
  'serial_repetido',
  'cantidad_serial_entera',
  'fecha_invalida',
] as const;

export type ErrorCompra = (typeof ERRORES_COMPRA)[number] | (typeof ERRORES_RECEPCION_COMPRA)[number];

/** Código estable para el mensaje de error de una RPC de compras o CxP. */
export function codigoErrorCompra(mensaje: string | null | undefined): ErrorCompra {
  const m = (mensaje ?? '').trim();
  const pares: Array<[RegExp, ErrorCompra]> = [
    [/^sin_permiso|^SIN_PERMISO/i, 'sin_permiso'],
    [/Acceso denegado a la organizaci/i, 'sin_permiso'],
    [/SUCURSAL_NO_PERMITIDA|sin_acceso_sucursal/i, 'sucursal_no_permitida'],
    [/^DUPLICATE_INVOICE/, 'numero_duplicado'],
    [/^NUMERO_REQUERIDO/, 'numero_requerido'],
    [/^PROVEEDOR_INVALIDO|^PROVEEDOR_NO_ES_DE_LA_ORG/, 'proveedor_invalido'],
    [/^SUCURSAL_INVALIDA|^SUCURSAL_NO_ES_DE_LA_ORG/, 'sucursal_invalida'],
    [/^LINEAS_REQUERIDAS|^DEMASIADAS_LINEAS/, 'lineas_requeridas'],
    [/^LINEA_INVALIDA/, 'linea_invalida'],
    [/^LINEA_SIN_DESCRIPCION/, 'linea_sin_descripcion'],
    [/^PRODUCTO_NO_ES_DE_LA_ORG/, 'producto_ajeno'],
    [/^MONEDA_INVALIDA/, 'moneda_invalida'],
    [/^METODO_PAGO_INVALIDO/, 'metodo_invalido'],
    [/^ORDEN_INVALIDA|^ORDEN_NO_ENCONTRADA/, 'orden_invalida'],
    [/^ORDEN_SIN_RECEPCION/, 'orden_sin_recepcion'],
    [/^RETENCION_INVALIDA/, 'retencion_invalida'],
    [/^VENCIMIENTO_ANTES_DE_EMISION/, 'vencimiento_antes_de_emision'],
    [/^NO_EDITABLE/, 'no_editable'],
    [/^YA_CONFIRMADA/, 'ya_confirmada'],
    [/^SIN_LINEAS/, 'sin_lineas'],
    [/^NO_CONFIRMADA/, 'no_confirmada'],
    [/^ANULADA$/, 'anulada'],
    [/^SOLO_BORRADOR/, 'solo_borrador'],
    [/^TIENE_PAGOS|tiene pagos registrados/i, 'tiene_pagos'],
    [/^TIENE_ASIENTO/, 'tiene_asiento'],
    [/ya está anulada/i, 'ya_anulada'],
    [/^FACTURA_NO_ENCONTRADA|^CUENTA_NO_ENCONTRADA|^PROGRAMACION_NO_ENCONTRADA|^PROVEEDOR_NO_ENCONTRADO|no encontrada/i, 'no_encontrado'],
    [/^CUENTA_SIN_SALDO/, 'cuenta_sin_saldo'],
    [/^MONTO_INVALIDO|monto_invalido/, 'monto_invalido'],
    [/^EXCEDE_SALDO_PROGRAMABLE/, 'excede_saldo_programable'],
    [/^EXCEDE_SALDO|monto_excede_saldo|monto_excede_cuota/, 'excede_saldo'],
    [/^FECHA_PASADA/, 'fecha_pasada'],
    [/^CUENTA_BANCARIA_INVALIDA|cuenta_bancaria_invalida/, 'cuenta_bancaria_invalida'],
    [/^CUOTA_INVALIDA|cuota_no_encontrada|cuota_pagada/, 'cuota_invalida'],
    [/^PROGRAMACION_NO_PENDIENTE/, 'programacion_no_pendiente'],
    [/^SEGREGACION_FUNCIONES/, 'segregacion_funciones'],
    [/^MOTIVO_REQUERIDO/, 'motivo_requerido'],
    [/^PLAN_CON_ABONOS/, 'plan_con_abonos'],
    [/^PLAN_NO_CUADRA/, 'plan_no_cuadra'],
    [/^CUOTAS_INVALIDAS/, 'cuotas_invalidas'],
    [/^RANGO_INVALIDO/, 'rango_invalido'],
    [/^lote_requerido$/, 'lote_requerido'],
    [/^lotes_no_cuadran$/, 'lotes_no_cuadran'],
    [/^lotes_sin_linea$/, 'lotes_sin_linea'],
    [/^lote_invalido$/, 'lote_invalido'],
    [/^lote_repetido$/, 'lote_repetido'],
    [/^lote_vencimiento_distinto$/, 'lote_vencimiento_distinto'],
    [/^seriales_no_cuadran$/, 'seriales_no_cuadran'],
    [/^serial_repetido$/, 'serial_repetido'],
    [/^cantidad_serial_entera$/, 'cantidad_serial_entera'],
    [/^fecha_invalida$/, 'fecha_invalida'],
  ];
  for (const [re, codigo] of pares) if (re.test(m)) return codigo;
  return 'error_desconocido';
}

/** Estado HTTP de un error de compras o CxP. */
export function estadoHttpErrorCompra(codigo: ErrorCompra): number {
  switch (codigo) {
    case 'sin_permiso':
    case 'sucursal_no_permitida':
    case 'segregacion_funciones':
      return 403;
    case 'no_encontrado':
      return 404;
    case 'numero_duplicado':
    case 'no_editable':
    case 'ya_confirmada':
    case 'no_confirmada':
    case 'anulada':
    case 'solo_borrador':
    case 'tiene_pagos':
    case 'tiene_asiento':
    case 'ya_anulada':
    case 'programacion_no_pendiente':
    case 'plan_con_abonos':
    case 'cuenta_sin_saldo':
      return 409;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

// ─── Resultados de las RPC ───────────────────────────────────────────────────

export interface ResultadoGuardar {
  id: string;
  number_ext: string;
  status: 'draft';
  lineas: number;
  subtotal: number;
  total: number;
  neto_a_pagar: number;
  seriales_omitidos: Array<{ serial: string; product_id: number; reason: string }>;
}


export interface ResultadoRecepcion {
  ya_recepcionado?: boolean;
  recibido_por_orden?: boolean;
  procesadas: Array<{ product_id: number; product_name: string; qty: number; unit_cost: number; avg_cost: number }>;
  saltadas: Array<{ product_id: number | null; product_name?: string; reason: string }>;
}


export interface ResultadoConfirmar {
  invoice_id: string;
  status: 'received';
  accounts_payable_id: string | null;
  recepcion: ResultadoRecepcion | null;
  support_document_id: string | null;
}


export interface ProgramarPago {
  amount: number;
  scheduled_date: string;
  method: string;
  bank_account_id?: number | null;
  reference?: string | null;
  notes?: string | null;
  installment_id?: string | null;
}


export interface CuotaEntrada {
  vence: string;
  capital: number;
  interes?: number;
  valor: number;
  nota?: string | null;
}


export interface MovimientoEstadoCuenta {
  fecha: string;
  dia: string;
  tipo: 'factura' | 'cuenta' | 'pago';
  documento: string | null;
  ref_id: string;
  vence: string | null;
  cargo: number;
  abono: number;
  saldo: number;
}


export interface EstadoCuentaProveedor {
  proveedor: { id: number; nombre: string; nit: string | null; dv: string | null; email: string | null; telefono: string | null; direccion: string | null; ciudad: string | null };
  desde: string | null;
  hasta: string | null;
  hoy: string;
  zona: string;
  moneda: string;
  saldo_inicial: number;
  movimientos: MovimientoEstadoCuenta[];
  total_cargos: number;
  total_abonos: number;
  saldo_final: number;
  vencido: number;
  por_vencer: number;
}

