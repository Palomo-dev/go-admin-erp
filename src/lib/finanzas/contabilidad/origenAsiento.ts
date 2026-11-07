/**
 * Origen legible de un asiento (Contabilidad v2 §5, `OrigenAsiento`).
 *
 * `journal_entries.source` tiene 23 valores crudos en la base (`invoice_sales`,
 * `sales`, `sale`, `reversal`…). La pantalla los agrupa en etiquetas que entiende
 * quien no escribió el motor, y, cuando el documento tiene detalle en la app,
 * arma su enlace. Sin React ni Supabase.
 */
import type { TipoDocumento } from '@/components/kit/documento/documentos';

export const GRUPOS_ORIGEN = [
  'venta',
  'factura',
  'cobro',
  'compra',
  'pago',
  'kardex',
  'caja',
  'banco',
  'comision',
  'nomina',
  'pms',
  'manual',
  'contraAsiento',
  'cierre',
  'otro',
] as const;

export type GrupoOrigen = (typeof GRUPOS_ORIGEN)[number];

/** `source` crudo → grupo. Lo que no está aquí cae en `otro` (nunca se oculta). */
const GRUPO_DE_FUENTE: Readonly<Record<string, GrupoOrigen>> = {
  sales: 'venta',
  sale: 'venta',
  sale_items: 'venta',
  tips: 'venta',
  invoice_sales: 'factura',
  credit_note: 'factura',
  debit_note: 'factura',
  payments: 'cobro',
  accounts_receivable: 'cobro',
  customer_credit: 'cobro',
  invoice_purchase: 'compra',
  purchase_orders: 'compra',
  support_document: 'compra',
  accounts_payable: 'pago',
  stock_movements: 'kardex',
  inventory_adjustment: 'kardex',
  cash_movements: 'caja',
  cash_sessions: 'caja',
  bank_transactions: 'banco',
  bank_transfer: 'banco',
  commissions: 'comision',
  payroll: 'nomina',
  nomina: 'nomina',
  folio_items: 'pms',
  folio_payment: 'pms',
  reservation: 'pms',
  manual: 'manual',
  plantilla: 'manual',
  reversal: 'contraAsiento',
  cierre_ejercicio: 'cierre',
  closing: 'cierre',
};

export function grupoOrigen(source: string | null | undefined): GrupoOrigen {
  if (!source) return 'manual';
  return GRUPO_DE_FUENTE[source] ?? 'otro';
}

/** Fuentes crudas de un grupo, para filtrar el libro por grupo en la consulta. */
export function fuentesDeGrupo(grupo: GrupoOrigen): string[] {
  return Object.entries(GRUPO_DE_FUENTE)
    .filter(([, g]) => g === grupo)
    .map(([fuente]) => fuente);
}

export interface DocumentoOrigen {
  tipo: TipoDocumento;
  /** Sin `href` si el documento no tiene página de detalle. */
  href?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENTERO = /^\d{1,12}$/;

/**
 * Documento que originó el asiento, con su enlace si la app tiene detalle. El
 * id se valida antes de ponerlo en la URL: `source_id` es texto libre.
 */
export function documentoDeOrigen(source: string | null | undefined, sourceId: string | null | undefined): DocumentoOrigen | null {
  if (!source || !sourceId) return null;
  const id = sourceId.trim();
  const valido = UUID.test(id) || ENTERO.test(id);
  const con = (tipo: TipoDocumento, ruta?: string): DocumentoOrigen =>
    ruta && valido ? { tipo, href: `${ruta}/${encodeURIComponent(id)}` } : { tipo };
  switch (source) {
    case 'invoice_sales':
      return con('factura', '/app/finanzas/facturas-venta');
    case 'sales':
    case 'sale':
      return con('venta', '/app/pos/ventas');
    case 'invoice_purchase':
      return con('facturaCompra', '/app/finanzas/facturas-compra');
    case 'purchase_orders':
      return con('ordenCompra', '/app/inventario/ordenes-compra');
    case 'accounts_receivable':
      return con('cuentaPorCobrar', '/app/finanzas/cuentas-por-cobrar');
    case 'accounts_payable':
      return con('cuentaPorPagar', '/app/finanzas/cuentas-por-pagar');
    case 'credit_note':
      return con('notaCredito', '/app/finanzas/notas-credito');
    case 'payments':
      return con('pago');
    case 'reversal':
      return ENTERO.test(id) ? { tipo: 'asiento', href: `/app/finanzas/contabilidad/asientos/${id}` } : { tipo: 'asiento' };
    default:
      return null;
  }
}

/** Número corto para el chip: los uuid se recortan a 8 caracteres. */
export function numeroCorto(sourceId: string): string {
  const id = sourceId.trim();
  return UUID.test(id) ? id.slice(0, 8) : id;
}
