/**
 * Contrato de la nota crédito de una factura de venta (plan §2 L10, P1.6, P7):
 * `GET /api/facturas-venta/[id]/nota-credito` (lo que queda por acreditar por
 * línea) y `POST /api/facturas-venta/[id]/nota-credito` (`fn_nota_credito_emitir`).
 * Módulo hoja: lo importan la ruta, el diálogo y las pruebas.
 */
import { z } from 'zod';

export const MODOS_NOTA = ['total', 'lineas', 'valor'] as const;
export type ModoNota = (typeof MODOS_NOTA)[number];

/** Conceptos DIAN de nota crédito (1 devolución parcial · 2 anulación · 3 rebaja · 4 ajuste de precio · 5 otros). */
export const CONCEPTOS_DIAN = ['1', '2', '3', '4', '5'] as const;
export type ConceptoDian = (typeof CONCEPTOS_DIAN)[number];

export const solicitudNotaSchema = z
  .object({
    modo: z.enum(MODOS_NOTA),
    lineas: z
      .array(z.object({ itemId: z.string().uuid(), cantidad: z.number().positive().max(1e9) }).strict())
      .max(500)
      .optional(),
    valor: z.number().positive().max(1e12).optional(),
    concepto: z.string().trim().min(1).max(200).optional(),
    motivo: z.string().trim().min(5).max(500),
    conceptoDian: z.enum(CONCEPTOS_DIAN).optional(),
    reingresar: z.boolean().default(false),
    liquidacion: z.enum(['saldo_a_favor', 'devolucion']).default('saldo_a_favor'),
    metodoDevolucion: z.string().trim().min(1).max(40).optional(),
    cuentaBancariaId: z.number().int().positive().optional(),
    claveIdempotencia: z.string().trim().min(8).max(200),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.modo === 'lineas' && !(s.lineas && s.lineas.length > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineas'], message: 'sin_lineas' });
    }
    if (s.modo === 'valor' && (!s.valor || !s.concepto)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['valor'], message: 'monto_invalido' });
    }
    if (s.lineas && new Set(s.lineas.map((l) => l.itemId.toLowerCase())).size !== s.lineas.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lineas'], message: 'linea_repetida' });
    }
  });
export type SolicitudNota = z.infer<typeof solicitudNotaSchema>;

export const ERRORES_NOTA = [
  'no_autenticado',
  'sin_permiso',
  'factura_no_encontrada',
  'sin_acceso_sucursal',
  'clave_idempotencia_invalida',
  'modo_invalido',
  'motivo_obligatorio',
  'liquidacion_invalida',
  'documento_invalido',
  'factura_borrador',
  'ya_anulada',
  'monto_invalido',
  'concepto_obligatorio',
  'sin_lineas',
  'linea_repetida',
  'cantidad_invalida',
  'cantidad_excede_disponible',
  'linea_no_pertenece_a_la_factura',
  'nada_por_acreditar',
  'nota_excede_facturado',
  'reingreso_con_seriales',
  'saldo_a_favor_sin_cliente',
  'metodo_devolucion_obligatorio',
  'sin_caja_abierta',
  'cuenta_no_encontrada',
  'sin_regla_contable',
] as const;
export type ErrorNota = (typeof ERRORES_NOTA)[number] | 'error_desconocido' | 'datos_invalidos';

/** Mensaje de la RPC → código estable (`facturasVenta.nota.errores.<codigo>`). */
export function codigoErrorNota(mensaje: string | null | undefined): ErrorNota {
  const texto = (mensaje ?? '').trim();
  if (texto.startsWith('Acceso denegado a la organización')) return 'factura_no_encontrada';
  // Mensajes de fn_liquidar_excedente_nota_credito (función anterior, en prosa).
  if (texto.startsWith('No se encontró la cuenta de caja o banco')) return 'cuenta_no_encontrada';
  if (texto.startsWith('La organización no tiene regla de venta')) return 'sin_regla_contable';
  if (texto.startsWith('La factura no tiene cliente')) return 'saldo_a_favor_sin_cliente';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_NOTA as readonly string[]).includes(primero) ? (primero as ErrorNota) : 'error_desconocido';
}

export function estadoHttpErrorNota(codigo: ErrorNota): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
      return 403;
    case 'factura_no_encontrada':
      return 404;
    case 'ya_anulada':
    case 'factura_borrador':
    case 'documento_invalido':
    case 'nada_por_acreditar':
    case 'nota_excede_facturado':
    case 'cantidad_excede_disponible':
    case 'sin_caja_abierta':
      return 409;
    case 'error_desconocido':
    case 'sin_regla_contable':
      return 500;
    default:
      return 422;
  }
}

/** Línea de la factura con lo que aún se puede acreditar (`fn_nota_credito_lineas_disponibles`). */
export interface LineaAcreditable {
  itemId: string;
  productId: number | null;
  descripcion: string;
  cantidad: number;
  acreditada: number;
  disponible: number;
  precioUnitario: number;
  descuento: number;
  total: number;
  tarifa: number;
  incluido: boolean;
}

export interface ContextoNota {
  lineas: LineaAcreditable[];
  /** Lo facturado menos lo ya acreditado: tope de la nota. */
  tope: number;
  total: number;
  saldo: number;
  moneda: string | null;
  tieneCliente: boolean;
  feAceptada: boolean;
}

export interface ResultadoNota {
  id: string;
  numero: string | null;
  total: number;
  repetida: boolean;
  excedente: number;
  liquidacion: { modo: string; excedente?: number } | null;
  productosReingresados: number;
  /** Factura electrónica de la nota: encolada, no aplica (la factura no fue aceptada) o falló el encolado. */
  fe: 'encolada' | 'no_aplica' | 'error';
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Valor de una línea acreditada con la misma proporción que la RPC:
 * `round(total_linea × cantidad / cantidad_facturada, 2)`.
 */
export function valorLineaNota(linea: Pick<LineaAcreditable, 'total' | 'cantidad'>, cantidad: number): number {
  if (!(linea.cantidad > 0) || !(cantidad > 0)) return 0;
  return r2((linea.total * cantidad) / linea.cantidad);
}

/** Total de la nota que verá la RPC para un modo y una selección. */
export function totalNota(
  modo: ModoNota,
  lineas: LineaAcreditable[],
  seleccion: Record<string, number>,
  valor: number,
): number {
  if (modo === 'valor') return r2(valor > 0 ? valor : 0);
  const cantidadDe = (l: LineaAcreditable) => (modo === 'total' ? l.disponible : Math.min(seleccion[l.itemId] ?? 0, l.disponible));
  return r2(lineas.reduce((s, l) => s + valorLineaNota(l, cantidadDe(l)), 0));
}

// ─── Anular una nota crédito (POST /api/notas-credito/[id]/anular) ──────────

/** Motivo de la anulación: obligatorio, como en `fn_nota_credito_anular` (5 caracteres). */
export const anulacionNotaSchema = z.object({ motivo: z.string().trim().min(5).max(500) }).strict();

export const ERRORES_ANULAR_NOTA = [
  'no_autenticado',
  'sin_permiso',
  'nota_no_encontrada',
  'sin_acceso_sucursal',
  'motivo_obligatorio',
  'documento_invalido',
  'nota_aceptada_dian',
  'nota_en_envio_dian',
  'saldo_a_favor_aplicado',
  'pago_en_caja_cerrada',
  'pago_no_anulable',
] as const;
export type ErrorAnularNota = (typeof ERRORES_ANULAR_NOTA)[number] | 'error_desconocido' | 'datos_invalidos';

/** Mensaje de `fn_nota_credito_anular` → código estable (`documentosVenta.notaCreditoAnular.errores.<codigo>`). */
export function codigoErrorAnularNota(mensaje: string | null | undefined): ErrorAnularNota {
  const texto = (mensaje ?? '').trim();
  // fn_assert_acceso_org: nota de otra organización → no se distingue de «no existe».
  if (texto.startsWith('Acceso denegado a la organización')) return 'nota_no_encontrada';
  const primero = texto.split(/[\s:]/)[0];
  return (ERRORES_ANULAR_NOTA as readonly string[]).includes(primero) ? (primero as ErrorAnularNota) : 'error_desconocido';
}

export function estadoHttpErrorAnularNota(codigo: ErrorAnularNota): number {
  switch (codigo) {
    case 'no_autenticado':
      return 401;
    case 'sin_permiso':
    case 'sin_acceso_sucursal':
      return 403;
    case 'nota_no_encontrada':
      return 404;
    case 'motivo_obligatorio':
    case 'datos_invalidos':
      return 400;
    case 'error_desconocido':
      return 500;
    default:
      // Aceptada o en envío a la DIAN, saldo a favor ya usado, devolución en caja cerrada.
      return 409;
  }
}

export interface ResultadoAnularNota {
  id: string;
  yaAnulada: boolean;
  saldoFactura: number | null;
  saldosAFavorCancelados: number;
  devolucionesAnuladas: number;
  productosRetirados: number;
}
