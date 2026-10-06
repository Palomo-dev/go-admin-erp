/**
 * Punto de entrada de la capa de impresion compartida.
 *
 * FUENTE UNICA DE VERDAD de como se ve un ticket. La consumen:
 *   - El agente de escritorio (Go Admin Desktop), via `sync-agent.js`, que
 *     copia esta carpeta a `src/agent/printing`.
 *   - El ERP web, via el alias `@/printing/*` del tsconfig.
 *
 * Antes de esta carpeta habia cinco copias distintas de las plantillas y cada
 * arreglo habia que replicarlo a mano en todas; en la practica siempre se
 * quedaba alguna sin actualizar y el ticket salia distinto segun por donde se
 * imprimiera.
 *
 * Restriccion: TypeScript puro. Sin `fs`, sin `electron`, sin `window`. Este
 * codigo se compila con el tsconfig del agente (CommonJS/Node) y con el de
 * Next.js (ESM/navegador), asi que solo puede usar lo que existe en ambos.
 */

export type { PaperSpec, PaperWidth } from './paper';
export { getPaperSpec, normalizePaperWidth, DEFAULT_PAPER_WIDTH } from './paper';

export type {
  KitchenTicketItemModifier,
  KitchenTicketItemPayload,
  KitchenTicketPrintPayload,
  ElectronicInvoicePrintPayload,
  LocalPrintRequest,
  MonochromeRaster,
  PrintJobType,
  SaleTicketDeliveryInfo,
  SaleTicketItemPayload,
  SaleTicketPayment,
  SaleTicketPrintPayload,
  SaleTicketTaxLine,
  ShipmentGuideItemPayload,
  ShipmentGuideDriverPayload,
  ShipmentGuidePrintPayload,
  TicketKind,
} from './types';

export { buildSaleTicketHTML, buildKitchenTicketHTML, buildKitchenTicketsHTML, buildShipmentGuideHTML, buildShipmentGuidesHTML, buildElectronicInvoiceHTML } from './renderHtml';

export {
  buildPlainTextSaleTicket,
  buildPlainTextTicket,
  buildPlainTextShipmentGuide,
  buildPlainTextElectronicInvoice,
  printSaleTicket,
  printKitchenTicket,
  printShipmentGuide,
  printElectronicInvoice,
} from './renderEscpos';

export { buildRasterImageCommand, isValidRaster, writeRasterImage } from './escposImage';

export type { QuantityLine } from './quantity';
export { formatQuantity, isMeasuredLine, itemsSummary, lineNamePrefix, linePriceDetail } from './quantity';
export type { UnidadPeso } from './peso';
export { convertirPeso, decimalesPeso, pesoEnUnidad, pesoLegible, precioVisiblePeso, unidadPeso } from './peso';

export type { MoneyFormat } from './money';
export { moneyFormatter } from './money';
