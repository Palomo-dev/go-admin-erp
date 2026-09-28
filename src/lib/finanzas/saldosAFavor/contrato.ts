/**
 * Contrato de los saldos a favor del cliente (`credit_notes` +
 * `credit_note_applications`): route handlers de `/api/saldos-a-favor/**`,
 * servicio de servidor, cliente del navegador y pruebas. Módulo hoja.
 *
 * Toda escritura es UNA RPC transaccional con el cliente de la sesión:
 * - aplicar a una factura → `fn_apply_customer_credit`
 * - crear un anticipo     → `fn_saldo_favor_crear` (pago + saldo + asiento)
 * - anular un anticipo    → `fn_saldo_favor_anular`
 * - devolver en dinero    → `fn_saldo_favor_devolver`
 * La base resuelve organización, sucursal, permiso, autor e idempotencia; el
 * saldo de la factura lo pone la regla única (nunca se escribe aquí).
 */
import { z } from 'zod';

export const ERRORES_SALDO_FAVOR = [
  'no_autenticado',
  'sin_permiso',
  'sin_acceso_sucursal',
  'organizacion_no_permitida',
  'datos_invalidos',
  'clave_idempotencia_invalida',
  'clave_idempotencia_reutilizada',
  'monto_invalido',
  'saldo_no_encontrado',
  'saldo_no_disponible',
  'saldo_vencido',
  'saldo_usado',
  'saldo_no_anulable',
  'monto_excede_saldo_a_favor',
  'factura_no_encontrada',
  'documento_invalido',
  'documento_borrador',
  'documento_anulado',
  'cliente_distinto',
  'cliente_no_encontrado',
  'sucursal_invalida',
  'moneda_distinta',
  'monto_excede_saldo',
  'metodo_invalido',
  'referencia_obligatoria',
  'cuenta_bancaria_invalida',
  'sin_caja_abierta',
  'pago_en_caja_cerrada',
  'sin_cuenta_de_dinero',
  'sin_cuenta_por_cobrar',
  'vencimiento_invalido',
  'motivo_obligatorio',
  'asiento_no_creado',
  'error_desconocido',
] as const;
export type ErrorSaldoFavor = (typeof ERRORES_SALDO_FAVOR)[number];

/** Código estable a partir del mensaje de la RPC (`raise exception '<codigo>'`). */
export function codigoErrorSaldoFavor(mensaje: string | null | undefined): ErrorSaldoFavor {
  const texto = (mensaje ?? '').trim();
  // fn_assert_acceso_org: el usuario no pertenece a la organización del registro.
  if (texto.startsWith('Acceso denegado a la organización')) return 'sin_permiso';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_SALDO_FAVOR as readonly string[]).includes(primero) ? (primero as ErrorSaldoFavor) : 'error_desconocido';
}

/** Estado HTTP de cada código de error. */
export function estadoHttpErrorSaldoFavor(codigo: ErrorSaldoFavor): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
    case 'organizacion_no_permitida':
      return 403;
    case 'saldo_no_encontrado':
    case 'factura_no_encontrada':
    case 'cliente_no_encontrado':
      return 404;
    case 'saldo_no_disponible':
    case 'saldo_vencido':
    case 'saldo_usado':
    case 'saldo_no_anulable':
    case 'documento_borrador':
    case 'documento_anulado':
    case 'sin_caja_abierta':
    case 'pago_en_caja_cerrada':
      return 409;
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
    case 'asiento_no_creado':
    case 'sin_cuenta_de_dinero':
    case 'sin_cuenta_por_cobrar':
      return 500;
    default:
      return 422;
  }
}

const UUID = z.string().uuid();
const IMPORTE = z.number().finite().positive().max(1e12);
const CLAVE = z.string().min(8).max(200);

export const aplicarSaldoSchema = z
  .object({
    factura_id: UUID,
    monto: IMPORTE,
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudAplicarSaldo = z.infer<typeof aplicarSaldoSchema>;

export interface ResultadoAplicarSaldo {
  aplicacion_id: string;
  repetida: boolean;
  monto: number;
  saldo_disponible: number;
  saldo_factura: number;
  estado_factura?: string;
}

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Anticipo a mano: el dinero entra como un pago real (recibo, payments y caja)
 * por el método de la organización; nunca una cuenta PUC elegida en pantalla.
 */
export const crearSaldoSchema = z
  .object({
    cliente_id: UUID,
    sucursal_id: z.number().int().positive(),
    monto: IMPORTE,
    metodo: z.string().min(1).max(40),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    referencia: z.string().max(200).nullable().optional(),
    vence: DIA.nullable().optional(),
    notas: z.string().max(2000).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudCrearSaldo = z.infer<typeof crearSaldoSchema>;

export interface ResultadoCrearSaldo {
  credito_id: string;
  grupo_id: string;
  recibo: string;
  repetida: boolean;
  caja_id: number | null;
  monto: number;
}

/** Factura de venta abierta del cliente, a la que se le puede aplicar saldo. */
export interface FacturaAbiertaSaldo {
  id: string;
  number: string;
  total: number;
  balance: number;
  issue_date: string | null;
}

/**
 * Lo que necesitan los diálogos: métodos, cuentas y caja de la sucursal (anticipo)
 * y, si se pidió un cliente, sus facturas abiertas (aplicar).
 */
export interface ContextoSaldoFavor {
  metodos: { code: string; name: string; requires_reference: boolean }[];
  cuentasBancarias: { id: number; name: string; bank_name: string | null; ultimos: string | null; currency: string | null }[];
  caja: { abierta: boolean; id: number | null };
  hoy: string;
  facturas: FacturaAbiertaSaldo[];
}

/** Fila del listado (`fn_list_customer_credits`): estado vivo y acceso por sucursal. */
export interface SaldoAFavorFila {
  id: string;
  customer_id: string;
  customer_name: string | null;
  amount: number;
  balance: number;
  used: number;
  /** active | used | expired (vivo: venció y queda saldo) | cancelled */
  status: string;
  notes: string | null;
  expiry_date: string | null;
  created_at: string;
  branch_id: number | null;
  origen: 'pago' | 'nota_credito' | 'devolucion' | 'otro';
  anulable: boolean;
}

/** Anular un anticipo sin usar: reversa pago, saldo y asiento (fn_anular_pago). */
export const anularSaldoSchema = z.object({ motivo: z.string().trim().min(3).max(500) }).strict();
export type SolicitudAnularSaldo = z.infer<typeof anularSaldoSchema>;

/** Devolver en dinero todo o parte del saldo (caja abierta o cuenta bancaria). */
export const devolverSaldoSchema = z
  .object({
    monto: IMPORTE,
    metodo: z.string().min(1).max(40),
    motivo: z.string().trim().min(3).max(500),
    cuenta_bancaria: z.number().int().positive().nullable().optional(),
    referencia: z.string().max(200).nullable().optional(),
    clave_idempotencia: CLAVE,
  })
  .strict();
export type SolicitudDevolverSaldo = z.infer<typeof devolverSaldoSchema>;

export interface ResultadoAnularSaldo {
  payment_id: string;
  credito_id: string;
  contra_asiento: number | null;
}

export interface ResultadoDevolverSaldo {
  payment_id: string;
  repetida: boolean;
  monto: number;
  saldo_disponible: number;
}
