/**
 * Adaptador ESC/POS para móvil - TypeScript puro sin dependencias de Node.js.
 *
 * Genera comandos ESC/POS como Uint8Array para enviar vía Bluetooth LE
 * o socket de red desde la app móvil Capacitor.
 *
 * Basado en print-agent/src/printing/renderEscpos.ts pero sin la librería
 * `escpos` de Node.js. Usa solo APIs del navegador (TextEncoder, DataView).
 *
 * Soporta:
 * - Inicialización de impresora
 * - Texto normal, doble alto, doble ancho, negrita
 * - Alineación (izquierda, centro, derecha)
 * - Líneas separadoras
 * - Corte de papel
 * - Apertura de cajón
 * - Tablas simples (nombre | precio)
 * - Código QR (comando GS ( k)
 */

import type { PaperWidth } from '@printing/paper';
import { getPaperSpec } from '@printing/paper';
import type {
  SaleTicketPrintPayload,
  KitchenTicketPrintPayload,
} from '@printing/types';

// ============================================================================
// Constantes ESC/POS
// ============================================================================

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// ============================================================================
// Builder de bytes
// ============================================================================

class EscposBuilder {
  private chunks: Uint8Array[] = [];
  private encoder = new TextEncoder();

  /** Añade bytes raw al buffer */
  raw(bytes: Uint8Array | number[]): this {
    this.chunks.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return this;
  }

  /** Añade texto codificado en UTF-8 */
  text(str: string): this {
    this.chunks.push(this.encoder.encode(str));
    return this;
  }

  /** Añade un salto de línea */
  newline(): this {
    this.chunks.push(new Uint8Array([LF]));
    return this;
  }

  // ── Comandos de inicialización ──

  /** ESC @ — inicializa la impresora */
  init(): this {
    return this.raw([ESC, 0x40]);
  }

  // ── Comandos de formato ──

  /** ESC ! n — selecciona modo de impresión (0=normal, 16=doble alto, 32=doble ancho, 48=ambos) */
  printMode(mode: number): this {
    return this.raw([ESC, 0x21, mode]);
  }

  /** Texto normal */
  normal(): this {
    return this.printMode(0);
  }

  /** Doble alto */
  doubleHeight(): this {
    return this.printMode(16);
  }

  /** Doble ancho */
  doubleWidth(): this {
    return this.printMode(32);
  }

  /** Doble alto + doble ancho */
  doubleSize(): this {
    return this.printMode(48);
  }

  /** ESC E n — negrita (1=on, 0=off) */
  bold(on: boolean): this {
    return this.raw([ESC, 0x45, on ? 1 : 0]);
  }

  // ── Alineación ──

  /** ESC a n — alineación (0=izq, 1=centro, 2=der) */
  align(mode: 0 | 1 | 2): this {
    return this.raw([ESC, 0x61, mode]);
  }

  left(): this { return this.align(0); }
  center(): this { return this.align(1); }
  right(): this { return this.align(2); }

  // ── Línea separadora ──

  /** Imprime una línea de guiones del ancho del papel */
  separator(char = '-'): this {
    const spec = this.paperSpec;
    const line = char.repeat(spec.charsPerLine);
    return this.text(line).newline();
  }

  // ── Corte de papel ──

  /** GS V m — corte de papel (0=full cut, 1=partial cut) */
  cut(partial = false): this {
    return this.raw([GS, 0x56, partial ? 1 : 0]);
  }

  // ── Apertura de cajón ──

  /** ESC p m t1 t2 — pulso para abrir cajón (pin 2, 200ms) */
  openCashDrawer(): this {
    return this.raw([ESC, 0x70, 0x00, 0x64, 0x64]);
  }

  // ── Código QR ──

  /**
   * GS ( k — imprime un código QR.
   * Modelo 2, tamaño automático, corrección nivel M.
   */
  qr(data: string): this {
    const dataBytes = this.encoder.encode(data);
    const len = dataBytes.length + 3;

    // 1. Set QR model: GS ( k pL pH cn fn n
    this.raw([GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32]);
    // 2. Set QR size: GS ( k pL pH cn fn n (module size = 6)
    this.raw([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06]);
    // 3. Set error correction: GS ( k pL pH cn fn n (level M = 49)
    this.raw([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]);
    // 4. Store data: GS ( k pL pH cn fn m d1...dk
    this.raw([GS, 0x28, 0x6b, len & 0xff, (len >> 8) & 0xff, 0x31, 0x50, 0x30]);
    this.raw(dataBytes);
    // 5. Print: GS ( k pL pH cn fn m
    this.raw([GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]);
    return this;
  }

  // ── Tabla simple (2 columnas) ──

  /**
   * Imprime una fila de 2 columnas: nombre a la izquierda, precio a la derecha.
   * Rellena con espacios hasta el ancho del papel.
   */
  row2cols(left: string, right: string): this {
    const spec = this.paperSpec;
    const maxLeft = spec.charsPerLine - right.length - 1;
    const leftStr = left.length > maxLeft ? left.substring(0, maxLeft) : left;
    const padding = ' '.repeat(Math.max(1, spec.charsPerLine - leftStr.length - right.length));
    return this.text(leftStr + padding + right).newline();
  }

  // ── Build ──

  /** Construye el buffer final como un solo Uint8Array */
  build(): Uint8Array {
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  // ── Paper spec ──

  private _paperSpec: ReturnType<typeof getPaperSpec> | null = null;
  private _paperWidth: PaperWidth = '80mm';

  setPaperWidth(width: PaperWidth): this {
    this._paperWidth = width;
    this._paperSpec = null;
    return this;
  }

  private get paperSpec(): ReturnType<typeof getPaperSpec> {
    if (!this._paperSpec) {
      this._paperSpec = getPaperSpec(this._paperWidth);
    }
    return this._paperSpec;
  }
}

// ============================================================================
// Funciones de maquetación de tickets
// ============================================================================

/**
 * Formatea un valor monetario con separadores de miles.
 */
function formatMoney(value: number, currency = '$'): string {
  return `${currency}${value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Trunca un texto a un máximo de caracteres añadiendo "..." si excede.
 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + '...';
}

/**
 * Genera el buffer ESC/POS para un ticket de venta.
 */
export function buildSaleTicket(
  payload: SaleTicketPrintPayload,
  paperWidth: PaperWidth = '80mm',
): Uint8Array {
  const b = new EscposBuilder().setPaperWidth(paperWidth);

  b.init();

  // Encabezado del negocio
  if (payload.businessName) {
    b.center().bold(true).doubleHeight().text(payload.businessName).newline().normal().bold(false);
  }
  if (payload.businessNit) {
    b.center().text(`NIT: ${payload.businessNit}`).newline();
  }
  if (payload.businessAddress) {
    b.center().text(payload.businessAddress).newline();
  }
  if (payload.businessPhone) {
    b.center().text(`Tel: ${payload.businessPhone}`).newline();
  }
  if (payload.businessCity) {
    b.center().text(payload.businessCity).newline();
  }
  if (payload.businessEmail) {
    b.center().text(payload.businessEmail).newline();
  }
  if (payload.businessFiscalResponsibilities?.length) {
    b.center().text(payload.businessFiscalResponsibilities.join(', ')).newline();
  }

  b.newline();

  // Título
  const title = payload.title || 'TICKET DE VENTA';
  b.center().bold(true).text(title).newline().bold(false);

  // Número de venta
  if (payload.saleNumber) {
    b.center().text(`No: ${payload.saleNumber}`).newline();
  }

  // Sucursal
  if (payload.branchName) {
    b.center().text(`Sucursal: ${payload.branchName}`).newline();
  }
  if (payload.branchAddress) {
    b.center().text(payload.branchAddress).newline();
  }

  b.separator();

  // Datos del cliente
  if (payload.customerName) {
    b.text(`Cliente: ${truncate(payload.customerName, 40)}`).newline();
  }
  if (payload.customerDocNumber) {
    b.text(`Doc: ${payload.customerDocType || 'CC'} ${payload.customerDocNumber}`).newline();
  }
  if (payload.customerPhone) {
    b.text(`Tel: ${payload.customerPhone}`).newline();
  }

  // Cajero y mesa
  if (payload.cashierName) {
    b.text(`Cajero: ${payload.cashierName}`).newline();
  }
  if (payload.tableName) {
    b.text(`Mesa: ${payload.tableName}`).newline();
  }

  // Fecha
  b.text(`Fecha: ${new Date(payload.createdAt).toLocaleString('es-CO')}`).newline();
  b.separator();

  // Items
  for (const item of payload.items) {
    const qty = item.quantity.toString();
    const name = truncate(item.productName, 28);
    b.text(`${qty}x ${name}`).newline();

    if (item.variantData) {
      const variant = Object.entries(item.variantData)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (variant) b.text(`  ${truncate(variant, 36)}`).newline();
    }

    if (item.modifiers?.length) {
      for (const mod of item.modifiers) {
        b.text(`  + ${truncate(mod.name, 30)} ${formatMoney(mod.extraPrice)}`).newline();
      }
    }

    b.right().text(formatMoney(item.total)).newline().left();
  }

  b.separator();

  // Totales
  if (payload.subtotal !== undefined) {
    b.row2cols('Subtotal:', formatMoney(payload.subtotal));
  }
  if (payload.discountTotal && payload.discountTotal > 0) {
    b.row2cols('Descuento:', `- ${formatMoney(payload.discountTotal)}`);
  }
  if (payload.taxLines?.length) {
    for (const line of payload.taxLines) {
      b.row2cols(`${line.name}:`, formatMoney(line.amount));
    }
  } else if (payload.taxTotal !== undefined && payload.taxTotal > 0) {
    b.row2cols('Impuestos:', formatMoney(payload.taxTotal));
  }
  if (payload.tipAmount && payload.tipAmount > 0) {
    b.row2cols('Propina:', formatMoney(payload.tipAmount));
  }
  if (payload.deliveryFee && payload.deliveryFee > 0) {
    b.row2cols('Domicilio:', formatMoney(payload.deliveryFee));
  }

  b.bold(true).doubleHeight();
  b.row2cols('TOTAL:', formatMoney(payload.total));
  b.normal().bold(false);

  // Pagos
  if (payload.payments?.length) {
    b.separator();
    for (const payment of payload.payments) {
      const method = payment.methodName || payment.method;
      b.row2cols(method, formatMoney(payment.amount));
    }
    if (payload.totalPaid !== undefined) {
      b.row2cols('Recibido:', formatMoney(payload.totalPaid));
    }
    if (payload.changeAmount && payload.changeAmount > 0) {
      b.row2cols('Cambio:', formatMoney(payload.changeAmount));
    }
    if (payload.balance && payload.balance > 0) {
      b.row2cols('Saldo:', formatMoney(payload.balance));
    }
  }

  // Delivery
  if (payload.deliveryInfo) {
    b.separator();
    b.bold(true).text('ENTREGA A DOMICILIO').newline().bold(false);
    b.text(`Dir: ${payload.deliveryInfo.address}`).newline();
    if (payload.deliveryInfo.contactName) {
      b.text(`Contacto: ${payload.deliveryInfo.contactName}`).newline();
    }
    if (payload.deliveryInfo.contactPhone) {
      b.text(`Tel: ${payload.deliveryInfo.contactPhone}`).newline();
    }
    if (payload.deliveryInfo.instructions) {
      b.text(`Notas: ${payload.deliveryInfo.instructions}`).newline();
    }
  }

  b.separator();
  b.center().text('Gracias por su compra').newline();
  b.newline().newline().cut();

  return b.build();
}

/**
 * Genera el buffer ESC/POS para un ticket de cocina.
 */
export function buildKitchenTicket(
  payload: KitchenTicketPrintPayload,
  paperWidth: PaperWidth = '80mm',
): Uint8Array {
  const b = new EscposBuilder().setPaperWidth(paperWidth);

  b.init();

  // Encabezado
  if (payload.businessName) {
    b.center().bold(true).text(payload.businessName).newline().bold(false);
  }
  b.center().doubleHeight().bold(true).text('COMANDA DE COCINA').newline().normal().bold(false);

  if (payload.tableName) {
    b.center().bold(true).text(`Mesa: ${payload.tableName}`).newline().bold(false);
  }
  if (payload.serverName) {
    b.center().text(`Mozo: ${payload.serverName}`).newline();
  }

  b.separator();

  // Estación
  b.bold(true).text(`Estacion: ${payload.station}`).newline().bold(false);
  b.text(`Hora: ${new Date(payload.createdAt).toLocaleTimeString('es-CO')}`).newline();
  b.text(`Ticket #: ${payload.ticketId}`).newline();
  b.separator();

  // Items
  for (const item of payload.items) {
    b.bold(true).text(`${item.quantity}x ${item.productName}`).newline().bold(false);

    if (item.variantData) {
      const variant = Object.entries(item.variantData)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (variant) b.text(`  ${variant}`).newline();
    }

    if (item.modifiers?.length) {
      for (const mod of item.modifiers) {
        b.text(`  + ${mod.name}`).newline();
      }
    }

    if (item.notes) {
      b.text(`  *** ${item.notes} ***`).newline();
    }
  }

  b.separator();
  b.cut();

  return b.build();
}

/**
 * Genera el buffer ESC/POS para una pre-cuenta.
 */
export function buildPreCuenta(
  payload: SaleTicketPrintPayload,
  paperWidth: PaperWidth = '80mm',
): Uint8Array {
  const b = new EscposBuilder().setPaperWidth(paperWidth);

  b.init();

  if (payload.businessName) {
    b.center().bold(true).text(payload.businessName).newline().bold(false);
  }
  if (payload.businessNit) {
    b.center().text(`NIT: ${payload.businessNit}`).newline();
  }

  b.newline();
  b.center().doubleHeight().bold(true).text('PRE-CUENTA').newline().normal().bold(false);

  if (payload.tableName) {
    b.center().text(`Mesa: ${payload.tableName}`).newline();
  }
  if (payload.serverName) {
    b.center().text(`Mozo: ${payload.serverName}`).newline();
  }

  b.text(`Fecha: ${new Date(payload.createdAt).toLocaleString('es-CO')}`).newline();
  b.separator();

  // Items sin precios detallados (pre-cuenta simple)
  for (const item of payload.items) {
    const qty = item.quantity.toString();
    const name = truncate(item.productName, 28);
    b.row2cols(`${qty}x ${name}`, formatMoney(item.total));
  }

  b.separator();

  if (payload.subtotal !== undefined) {
    b.row2cols('Subtotal:', formatMoney(payload.subtotal));
  }
  if (payload.taxTotal !== undefined && payload.taxTotal > 0) {
    b.row2cols('Impuestos:', formatMoney(payload.taxTotal));
  }
  if (payload.discountTotal && payload.discountTotal > 0) {
    b.row2cols('Descuento:', `- ${formatMoney(payload.discountTotal)}`);
  }

  b.bold(true).doubleHeight();
  b.row2cols('TOTAL:', formatMoney(payload.total));
  b.normal().bold(false);

  b.newline().newline().cut();

  return b.build();
}

/**
 * Genera el comando ESC/POS para abrir el cajón de dinero.
 */
export function buildCashDrawerCommand(): Uint8Array {
  return new EscposBuilder().init().openCashDrawer().build();
}

// ============================================================================
// Export del builder para uso avanzado
// ============================================================================

export { EscposBuilder };
