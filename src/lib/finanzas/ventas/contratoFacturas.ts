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
      return 409;
    case 'error_desconocido':
      return 500;
    default:
      return 422;
  }
}

export const anulacionFacturaSchema = z.object({ motivo: z.string().trim().min(3).max(500) }).strict();

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
