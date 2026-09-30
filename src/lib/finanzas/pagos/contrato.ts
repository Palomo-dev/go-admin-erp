/**
 * Contrato del pago único (`POST /api/pagos`, `POST /api/pagos/[id]/anular`,
 * `GET /api/pagos/contexto`). Módulo hoja: lo importan el route handler, el
 * diálogo `kit/documento/RegistrarPagoDialog` y las pruebas.
 *
 * Quién lo usa: factura de venta, CxC (Finanzas y POS), ficha del cliente,
 * factura de compra y CxP, y «Registrar cobro» del detalle de venta. Contrato
 * escrito en docs/implementacion/FACTURAS-VENTA-CXC-PLAN.md §6.
 */
import { z } from 'zod';

export const DIRECCIONES_PAGO = ['cobro', 'pago'] as const;
export type DireccionPago = (typeof DIRECCIONES_PAGO)[number];

export const DOCUMENTOS_COBRO = ['invoice_sales', 'account_receivable'] as const;
export const DOCUMENTOS_PAGO = ['invoice_purchase', 'account_payable'] as const;
export type DocumentoPago = (typeof DOCUMENTOS_COBRO)[number] | (typeof DOCUMENTOS_PAGO)[number];

/** Desde dónde se abre el diálogo: decide el permiso que exige el servidor. */
export const ORIGENES_PAGO = [
  'factura_venta',
  'cxc',
  'pos_cxc',
  'venta_pos',
  'ficha_cliente',
  'factura_compra',
  'cxp',
] as const;
export type OrigenPago = (typeof ORIGENES_PAGO)[number];

const ORIGENES_POS: readonly OrigenPago[] = ['pos_cxc', 'venta_pos'];

/**
 * Permiso que exige el servidor. En el POS el cajero cobra con `pos.create` y
 * anula con `pos.void`; en Finanzas, `finance.create` / `finance.void`. La RPC
 * vuelve a comprobarlo (acepta cualquiera de los dos para cobrar y anular).
 */
export function permisoParaRegistrar(direccion: DireccionPago, origen: OrigenPago): string {
  if (direccion === 'pago') return 'finance.create';
  return ORIGENES_POS.includes(origen) ? 'pos.create' : 'finance.create';
}

export function permisoParaAnular(origen: OrigenPago | null | undefined): string {
  return origen && ORIGENES_POS.includes(origen) ? 'pos.void' : 'finance.void';
}

const UUID = z.string().uuid();
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const IMPORTE = z.number().finite().positive().max(1e12);

export const aplicacionSchema = z
  .object({
    documento: z.enum([...DOCUMENTOS_COBRO, ...DOCUMENTOS_PAGO]),
    id: UUID,
    cuota_id: UUID.nullable().optional(),
    monto: IMPORTE,
  })
  .strict();

export const solicitudPagoSchema = z
  .object({
    direccion: z.enum(DIRECCIONES_PAGO),
    origen: z.enum(ORIGENES_PAGO),
    aplicaciones: z.array(aplicacionSchema).min(1).max(200),
    metodo: z.string().min(1).max(40),
    moneda: z.string().regex(/^[A-Z]{3}$/),
    fecha: DIA,
    referencia: z.string().max(200).nullable().optional(),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    recibido: z.number().finite().min(0).max(1e12).nullable().optional(),
    anticipo: z.number().finite().min(0).max(1e12).optional(),
    notas: z.string().max(2000).nullable().optional(),
    clave_idempotencia: z.string().min(8).max(200),
  })
  .strict()
  .superRefine((s, ctx) => {
    const permitidos: readonly string[] = s.direccion === 'cobro' ? DOCUMENTOS_COBRO : DOCUMENTOS_PAGO;
    s.aplicaciones.forEach((a, i) => {
      if (!permitidos.includes(a.documento)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['aplicaciones', i, 'documento'], message: 'documento_invalido' });
      }
    });
    if ((s.anticipo ?? 0) > 0 && s.direccion !== 'cobro') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['anticipo'], message: 'anticipo_solo_cobro' });
    }
  });

export type SolicitudPago = z.infer<typeof solicitudPagoSchema>;

export const anulacionPagoSchema = z
  .object({
    motivo: z.string().trim().min(3).max(500),
    origen: z.enum(ORIGENES_PAGO).optional(),
  })
  .strict();

export interface PagoAplicado {
  payment_id: string;
  documento: DocumentoPago;
  id: string;
  cuenta_id: string;
  cuota_id: string | null;
  monto: number;
  saldo_nuevo: number | null;
}

export interface ResultadoPago {
  grupo_id: string;
  recibo: string;
  repetida: boolean;
  total_aplicado: number;
  anticipo: number;
  cambio: number;
  credito_id: string | null;
  caja_id: number | null;
  pagos: PagoAplicado[];
}

/** Códigos que la RPC lanza como mensaje (errcode 22023/P0002/42501). */
export const ERRORES_PAGO = [
  'no_autenticado',
  'sin_permiso',
  'direccion_invalida',
  'clave_idempotencia_invalida',
  'sin_aplicaciones',
  'demasiadas_aplicaciones',
  'monto_invalido',
  'anticipo_solo_cobro',
  'moneda_invalida',
  'fecha_invalida',
  'metodo_invalido',
  'referencia_obligatoria',
  'documento_invalido',
  'documento_no_encontrado',
  'documento_borrador',
  'documento_anulado',
  'cuenta_no_encontrada',
  'aplicacion_invalida',
  'aplicacion_repetida',
  'cuota_no_encontrada',
  'cuota_pagada',
  'monto_excede_cuota',
  'sin_acceso_sucursal',
  'moneda_distinta',
  'monto_excede_saldo',
  'terceros_distintos',
  'fecha_anterior_emision',
  'saldo_a_favor_sin_cliente',
  'recibido_insuficiente',
  'sin_caja_abierta',
  'cuenta_bancaria_invalida',
  'fecha_futura',
  'motivo_obligatorio',
  'pago_no_encontrado',
  'pago_no_anulable',
  'pago_en_caja_cerrada',
] as const;
export type ErrorPago = (typeof ERRORES_PAGO)[number] | 'error_desconocido' | 'datos_invalidos' | 'organizacion_no_permitida';

/** Traduce el mensaje de la RPC a un código estable (`pagos.errores.<codigo>`). */
export function codigoErrorPago(mensaje: string | null | undefined): ErrorPago {
  const primero = (mensaje ?? '').trim().split(/[\s:]/)[0];
  return (ERRORES_PAGO as readonly string[]).includes(primero) ? (primero as ErrorPago) : 'error_desconocido';
}

/** Estado HTTP de cada código de error. */
export function estadoHttpErrorPago(codigo: ErrorPago): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
    case 'organizacion_no_permitida':
      return 403;
    case 'documento_no_encontrado':
    case 'cuenta_no_encontrada':
    case 'cuota_no_encontrada':
    case 'pago_no_encontrado':
      return 404;
    case 'sin_caja_abierta':
    case 'pago_en_caja_cerrada':
    case 'documento_anulado':
    case 'documento_borrador':
    case 'pago_no_anulable':
    case 'cuota_pagada':
      return 409;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

/** Clave de idempotencia de un intento del diálogo (una por apertura + envío). */
export function nuevaClaveIdempotencia(prefijo = 'pago'): string {
  const aleatorio =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefijo}:${aleatorio}`;
}

// ─── Contexto del diálogo (GET /api/pagos/contexto) ─────────────────────────

export interface DocumentoAbiertoPago {
  documento: DocumentoPago;
  /** id del documento con el que se abrió (factura o cuenta). */
  id: string;
  cuenta_id: string;
  /** Factura de la cuenta (null en cartera sin factura). */
  factura_id?: string | null;
  numero: string | null;
  saldo: number;
  total: number;
  /** Compras: retenciones de la factura; la cuenta por pagar es por total − retenido. */
  retenido?: number;
  /** Compras: lo pagado de la cuenta (monto neto − saldo). */
  pagado?: number;
  moneda: string;
  vencimiento: string | null;
  emision: string | null;
  branch_id: number | null;
  cuotas: { id: string; numero: number; vencimiento: string; saldo: number; estado: string }[];
}

export interface ContextoPago {
  direccion: DireccionPago;
  tercero: { id: string; nombre: string | null } | null;
  documentos: DocumentoAbiertoPago[];
  metodos: { code: string; name: string; requires_reference: boolean }[];
  cuentasBancarias: { id: number; name: string; bank_name: string | null; ultimos: string | null; currency: string | null }[];
  caja: { abierta: boolean; id: number | null };
  hoy: string;
  branch_id: number | null;
}
