/**
 * Tipos del CONTENIDO de un documento imprimible.
 *
 * Viven aqui, y no en el `types.ts` del agente, porque los consumen tanto el
 * agente de escritorio como el ERP web. Solo describen que se imprime; nada
 * sobre como se imprime ni sobre el hardware (eso es `PrinterRow`, que se
 * queda del lado del agente).
 *
 * Regla para esta carpeta: TypeScript puro, sin APIs de Node ni del DOM. El
 * codigo de `printing/` se compila tanto con el tsconfig del agente como con
 * el de Next.js.
 */

export interface KitchenTicketItemModifier {
  name: string;
  extraPrice: number;
}

export interface KitchenTicketItemPayload {
  productName: string;
  quantity: number;
  notes?: string | null;
  variantData?: Record<string, string> | null;
  modifiers?: KitchenTicketItemModifier[] | null;
}

export interface KitchenTicketPrintPayload {
  ticketId: number;
  tableName?: string;
  serverName?: string;
  station: string;
  createdAt: string;
  items: KitchenTicketItemPayload[];
  businessName?: string;
  branchName?: string;
}

export interface SaleTicketItemPayload {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxAmount?: number;
  discountAmount?: number;
  variantData?: Record<string, string> | null;
  modifiers?: Array<{ name: string; extraPrice: number }> | null;
}

export interface SaleTicketPayment {
  method: string;
  methodName?: string;
  amount: number;
}

/**
 * Linea del desglose de impuestos (IVA, ICA, INC...). Cuando viene informada
 * se imprime en lugar del total agregado de impuestos, que es lo que exige la
 * normativa colombiana en el recibo.
 */
export interface SaleTicketTaxLine {
  name: string;
  amount: number;
}

/**
 * Logo del negocio ya convertido a bitmap monocromo, listo para el comando
 * `GS v 0` de ESC/POS.
 *
 * Se rasteriza en el ERP (con el canvas del navegador) y no en el agente
 * porque el agente no tiene ninguna libreria capaz de decodificar PNG/JPEG y
 * anadirla implicaria un modulo nativo mas que compilar en cada equipo.
 *
 * `data` son los bits empaquetados en base64: 1 = punto negro, 8 pixeles por
 * byte, de izquierda a derecha. Cada fila se rellena hasta completar el byte.
 */
export interface MonochromeRaster {
  /** Ancho en pixeles. Debe ser <= a los puntos del cabezal (576 u 384). */
  width: number;
  /** Alto en pixeles. */
  height: number;
  /** Bits empaquetados en base64, `ceil(width / 8) * height` bytes. */
  data: string;
}

/**
 * Datos de la entrega a domicilio. Lo que necesita el conductor para llegar
 * y lo que necesita el cliente para reclamar.
 */
export interface SaleTicketDeliveryInfo {
  type: string;
  address: string;
  driverName?: string;
  contactName?: string;
  contactPhone?: string;
  city?: string;
  instructions?: string;
}

export interface SaleTicketPrintPayload {
  saleId: string;
  saleNumber?: string;
  customerName?: string;
  customerDocType?: string;
  customerDocNumber?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerFiscalResponsibilities?: string[] | null;
  title?: string;
  tableName?: string;
  serverName?: string;
  cashierName?: string;
  createdAt: string;
  items: SaleTicketItemPayload[];
  subtotal?: number;
  taxTotal?: number;
  /** Desglose por tipo de impuesto. Si viene, sustituye a `taxTotal`. */
  taxLines?: SaleTicketTaxLine[] | null;
  /** Si los precios ya llevan el impuesto incluido (cambia el rotulo). */
  taxIncluded?: boolean;
  discountTotal?: number;
  tipAmount?: number;
  deliveryFee?: number;
  total: number;
  payments?: SaleTicketPayment[];
  /** Suma entregada por el cliente. Se imprime bajo los pagos. */
  totalPaid?: number;
  /** Vuelto. Solo se imprime si es mayor que cero. */
  changeAmount?: number;
  businessName?: string;
  businessNit?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessEmail?: string;
  businessCity?: string;
  businessFiscalResponsibilities?: string[] | null;
  /** URL del logo. Solo la usa el camino HTML; ESC/POS necesita el raster. */
  businessLogoUrl?: string;
  /** Logo rasterizado para impresoras termicas. Ver `MonochromeRaster`. */
  businessLogoRaster?: MonochromeRaster | null;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
  deliveryInfo?: SaleTicketDeliveryInfo;
}

/** Tipo de documento a imprimir. Coincide con `print_jobs.job_type`. */
export type TicketKind = 'kitchen_ticket' | 'pre_cuenta' | 'sale_ticket';
