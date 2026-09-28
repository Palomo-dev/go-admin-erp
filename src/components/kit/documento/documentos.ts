/**
 * Tipos de documento de la cadena (venta → factura → pagos → devolución →
 * nota crédito, y su espejo de compras), sin React: icono de cada tipo
 * (CATALOGO-ICONOS §2) y orden en la cadena.
 */
import {
  BookOpen,
  Calculator,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  FileCheck,
  FileMinus,
  FilePlus,
  FileText,
  HandCoins,
  PackagePlus,
  Receipt,
  ReceiptText,
  ScrollText,
  ShoppingBag,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export const TIPOS_DOCUMENTO = [
  'cotizacion',
  'pedido',
  'reserva',
  'ordenCompra',
  'venta',
  'factura',
  'facturaCompra',
  'entradaInventario',
  'documentoSoporte',
  'cuentaPorCobrar',
  'cuentaPorPagar',
  'pago',
  'recibo',
  'devolucion',
  'notaCredito',
  'notaDebito',
  'asiento',
] as const;

export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/** Un concepto, un icono. Los que ya están en CATALOGO-ICONOS §2 se respetan. */
export const ICONO_DOCUMENTO: Readonly<Record<TipoDocumento, LucideIcon>> = {
  cotizacion: Calculator,
  pedido: ShoppingBag,
  reserva: CalendarClock,
  ordenCompra: ClipboardList,
  venta: Receipt,
  factura: FileText,
  facturaCompra: ReceiptText,
  entradaInventario: PackagePlus,
  documentoSoporte: FileCheck,
  cuentaPorCobrar: Wallet,
  cuentaPorPagar: HandCoins,
  pago: CircleDollarSign,
  recibo: ScrollText,
  devolucion: Undo2,
  notaCredito: FileMinus,
  notaDebito: FilePlus,
  asiento: BookOpen,
};

export function esTipoDocumento(v: unknown): v is TipoDocumento {
  return typeof v === 'string' && (TIPOS_DOCUMENTO as readonly string[]).includes(v);
}

/** Eslabón de la cadena de un documento. Los textos llegan ya formateados. */
export interface EslabonDocumento {
  id: string;
  tipo: TipoDocumento;
  /** «FV-00042», «V-2144», «NC-12». */
  numero: string;
  /** Estado para `StatusBadge` (`paid`, «Anulada»). */
  estado?: string | null;
  /** Fecha ya formateada en la zona de la organización (`useFormatDate`). */
  fecha?: string | null;
  /** Importe ya formateado en la moneda del documento. */
  importe?: string | null;
  href?: string;
  onClick?: () => void;
  /** Es el documento que se está viendo. */
  actual?: boolean;
  /** Aún no existe: se dibuja punteado con su acción («Crear devolución»). */
  pendiente?: boolean;
  accion?: { etiqueta: string; onClick: () => void };
}

/**
 * Orden en la cadena: por tipo según `TIPOS_DOCUMENTO` (origen → documento →
 * cartera → pagos → devolución → nota → asiento); dentro del mismo tipo, el
 * orden en que llegaron (varios pagos en su orden cronológico).
 */
export function ordenarCadena<E extends Pick<EslabonDocumento, 'tipo'>>(eslabones: readonly E[]): E[] {
  const posicion = (t: TipoDocumento) => TIPOS_DOCUMENTO.indexOf(t);
  return eslabones
    .map((e, i) => ({ e, i }))
    .sort((a, b) => posicion(a.e.tipo) - posicion(b.e.tipo) || a.i - b.i)
    .map(({ e }) => e);
}
