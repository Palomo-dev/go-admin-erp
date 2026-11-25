/* AUTO-GENERADO por sync-agent.js — NO EDITAR */
﻿import type { KitchenTicketPrintPayload, SaleTicketPrintPayload, ShipmentGuidePrintPayload, ShipmentLabelPayload, ElectronicInvoicePrintPayload } from './types';
import { moneyFormatter } from './money';
import { formatQuantity, isMeasuredLine, itemsSummary, linePriceDetail } from './quantity';
import type { PaperSpec } from './paper';
import { writeRasterImage, writeRasterPage } from './escposImage';
import { resolveShipmentLabel } from './shipmentLabel';


/**
 * Lineas de impuesto a imprimir: el desglose por tipo (IVA, ICA...) si viene
 * informado y, si no, el total agregado. Devuelve [] si no hay impuestos.
 *
 * El sufijo se abrevia a "(incl)" porque en 58mm solo hay 32 columnas y
 * "(incluido)" desplazaria el importe fuera del papel.
 */
function taxLines(payload: SaleTicketPrintPayload): Array<{ label: string; amount: number }> {
  const suffix = payload.taxIncluded ? ' (incl)' : '';

  if (payload.taxLines && payload.taxLines.length > 0) {
    return payload.taxLines.map((t) => ({ label: `${t.name}${suffix}:`, amount: t.amount }));
  }
  if (payload.taxTotal && payload.taxTotal > 0) {
    return [{ label: `Impuestos${suffix}:`, amount: payload.taxTotal }];
  }
  return [];
}

function getPaymentLabel(payment: { method: string; methodName?: string; amount: number }): string {
  return payment.methodName || payment.method || 'Efectivo';
}

const FISCAL_RESPONSIBILITY_LABELS: Record<string, string> = {
  O_23: 'Gran contribuyente',
  O_15: 'Auto retenedor',
  R_99: 'No responsable de IVA',
  R_48: 'Regimen simplificado',
  R_49: 'Regimen comun',
  O_13: 'Gran contribuyente',
  O_47: 'Regimen simple',
  O_48: 'Responsable de IVA',
  O_49: 'No responsable',
  'R-99-PN': 'No responsable (PN)',
};

function translateFiscalResponsibility(code: string): string {
  return FISCAL_RESPONSIBILITY_LABELS[code] || code;
}

const GO_ADMIN_FOOTER = [
  'GO Admin S.A.S',
  'NIT: 901479683-5',
  'www.goadmin.io',
  '3113195711',
  'servicio@goadmin.io',
];

const STATION_LABELS: Record<string, string> = {
  hot_kitchen: 'COCINA CALIENTE',
  cold_kitchen: 'COCINA FRÃA',
  bar: 'BAR',
  cashier: 'CAJA',
  all: 'COMANDA',
};

/**
 * Tamanos de texto ESC/POS (`GS ! n`).
 *
 * CUIDADO: en escpos@3.0.0-alpha.6 `size(w, h)` calcula `n = w * 16 + h`, donde
 * cada unidad es un MULTIPLICADOR. Por lo tanto `size(1, 1)` NO es tamano
 * normal: produce texto al doble de ancho y al doble de alto. El tamano normal
 * es `size(0, 0)`.
 *
 * Consecuencia practica: cualquier linea en doble ancho dispone de la MITAD de
 * columnas, asi que su alineacion debe calcularse con `charsPerLine / 2`.
 */
const SIZE_NORMAL: readonly [number, number] = [0, 0];
/** Doble alto con ancho normal: destaca sin consumir columnas. */
const SIZE_TALL: readonly [number, number] = [0, 1];
/** Doble ancho y doble alto: consume el doble de columnas. */
const SIZE_DOUBLE: readonly [number, number] = [1, 1];

/** Linea separadora fuerte al ancho exacto del papel. */
/**
 * Lo que estas plantillas usan de `escpos.Printer` (API encadenable). Antes
 * era `any`; el agente y el ERP pasan su `Printer` tal cual.
 */
export interface EscposDevice {
  text(content: string): EscposDevice;
  style(type: string): EscposDevice;
  size(width: number, height: number): EscposDevice;
  align(align: string): EscposDevice;
  font(family: string): EscposDevice;
  feed(lines?: number): EscposDevice;
  cut(partial?: boolean, feed?: number): EscposDevice;
  qrimage(content: string, options?: { cellSize?: number }): unknown;
  code128(content: string, options?: { width?: number; height?: number }): unknown;
}

function sep(chars: number): string {
  return '='.repeat(chars);
}

/** Linea separadora suave al ancho exacto del papel. */
function sepLight(chars: number): string {
  return '-'.repeat(chars);
}

/**
 * Alinea `label` a la izquierda y `value` a la derecha rellenando con espacios.
 *
 * `width` es el numero de caracteres que caben en la linea; para texto en doble
 * ancho hay que pasar la mitad. Si no caben ambos, se recorta `label` para que
 * el importe quede siempre completo y pegado al margen derecho, en lugar de
 * desbordarse a la linea siguiente.
 */
function padRight(label: string, value: string, width: number): string {
  const maxLabel = width - value.length - 1;
  const safeLabel = label.length > maxLabel ? label.slice(0, Math.max(0, maxLabel)) : label;
  const spaces = Math.max(1, width - safeLabel.length - value.length);
  return safeLabel + ' '.repeat(spaces) + value;
}

/**
 * Parte un texto en lineas de como maximo `width` caracteres sin cortar
 * palabras. Una palabra mas larga que la linea se trocea por fuerza.
 *
 * Necesario porque la impresora hace su propio salto de linea en un punto
 * arbitrario, lo que descuadra la maquetacion.
 */
function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];

  const lines: string[] = [];
  let current = '';

  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines.flatMap((line) => {
    if (line.length <= width) return [line];
    const chunks: string[] = [];
    for (let i = 0; i < line.length; i += width) chunks.push(line.slice(i, i + width));
    return chunks;
  });
}

/**
 * Imprime el nombre de un item y su importe. Si ambos caben van en la misma
 * linea con el importe alineado a la derecha; si no, el nombre se envuelve en
 * varias lineas y el importe cierra alineado a la derecha.
 */
function writeItemLine(device: EscposDevice, label: string, value: string, chars: number): void {
  if (label.length + value.length + 1 <= chars) {
    device.style('b').text(padRight(label, value, chars)).style('normal');
    return;
  }

  device.style('b');
  for (const line of wrapText(label, chars)) device.text(line);
  device.style('normal').text(padRight('', value, chars));
}

/** Etiqueta de la línea de venta: «3x  Producto» por unidad; solo el nombre por peso (la cantidad va en el detalle). */
function saleLabel(item: { quantity: number; unit?: string | null; qtyDecimals?: number | null; productName: string }, locale?: string): string {
  return isMeasuredLine(item) ? item.productName : `${formatQuantity(item, locale)}x  ${item.productName}`;
}

/** Etiqueta de la comanda: «2x  Plato» o «0,500 kg  Carne». */
function kitchenLabel(item: { quantity: number; unit?: string | null; qtyDecimals?: number | null; productName: string }): string {
  return isMeasuredLine(item) ? `${formatQuantity(item)}  ${item.productName}` : `${formatQuantity(item)}x  ${item.productName}`;
}

function formatDateParts(iso: string, timezone?: string): { date: string; time: string } {
  const d = new Date(iso);
  const tzOpts = timezone ? { timeZone: timezone } : {};
  return {
    date: d.toLocaleDateString('es-CO', tzOpts),
    // hour12: false evita el sufijo "p. m." que agrega el locale es-CO. Ese
    // sufijo gasta 6 columnas y hace que la linea de fecha desborde las 32
    // columnas disponibles en papel de 58mm.
    time: d.toLocaleTimeString('es-CO', { ...tzOpts, hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

/**
 * EnvÃ­a a un dispositivo escpos (chainable) los comandos para imprimir una
 * comanda de cocina. `device` es una instancia de `escpos.Printer` ya
 * conectada a un `escpos.<Interface>` (network/usb/bluetooth).
 */
export function printKitchenTicket(device: EscposDevice, payload: KitchenTicketPrintPayload, paper: PaperSpec): void {
  const chars = paper.charsPerLine;
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const { date, time } = formatDateParts(payload.createdAt, payload.timezone);
  const itemsText = itemsSummary(payload.items, (payload as { locale?: string }).locale);

  // --- Header: datos del negocio ---
  // Doble alto (no doble ancho) para que un nombre largo no se parta de linea.
  device.font('a').align('ct').style('b').size(...SIZE_TALL);

  if (payload.businessName) device.text(payload.businessName);
  device.style('normal').size(...SIZE_NORMAL);
  if (payload.branchName && payload.branchName !== payload.businessName) {
    device.text(payload.branchName);
  }

  // --- Banner de comanda ---
  // Es el texto mas importante del ticket: doble ancho y alto. Ocupa 30 de las
  // 32 columnas disponibles en 58mm, por lo que sigue entrando en una linea.
  device
    .text(sep(chars))
    .style('b')
    .size(...SIZE_DOUBLE)
    .text('*** COMANDA ***')
    .style('normal')
    .size(...SIZE_NORMAL)
    .text(sep(chars))
    .align('lt');

  // --- EstaciÃ³n ---
  device.style('b').size(...SIZE_TALL).text(`Estacion: ${stationLabel}`).style('normal').size(...SIZE_NORMAL);

  // --- Info del ticket ---
  device.text(`Ticket: #${payload.ticketId}`);
  device.text(`Mesa: ${payload.tableName || '-'}`);
  if (payload.serverName) device.text(`Mesero: ${payload.serverName}`);
  device.text(`Fecha: ${date}  Hora: ${time}`);
  device.text(`Items: ${itemsText}`);
  device.text(sepLight(chars));

  // --- Items ---
  for (const item of payload.items) {
    // Doble alto para que el cocinero lo lea de lejos, ancho normal para
    // aprovechar las columnas completas en nombres largos.
    device.style('b').size(...SIZE_TALL);
    for (const line of wrapText(kitchenLabel(item), chars)) {
      device.text(line);
    }
    device.style('normal').size(...SIZE_NORMAL);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      const text = `* ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join('  ')}`;
      device.style('b');
      for (const line of wrapText(text, chars - 2)) device.text(`  ${line}`);
      device.style('normal');
    }

    if (item.modifiers && item.modifiers.length > 0) {
      const text = `+ ${item.modifiers.map((m) => m.name).join(', ')}`;
      device.style('b');
      for (const line of wrapText(text, chars - 2)) device.text(`  ${line}`);
      device.style('normal');
    }

    if (item.notes) {
      for (const line of wrapText(`>> ${item.notes}`, chars - 2)) device.text(`  ${line}`);
    }

    device.text(sepLight(chars));
  }

  // --- Footer ---
  device
    .align('ct')
    .style('normal')
    .text('Comanda generada por GO Admin')
    .text(`${date} ${time}`)
    .feed(2)
    .cut();
}

/**
 * Construye una versiÃ³n en texto plano de la comanda, usada por el driver
 * 'system' (impresora del sistema operativo vÃ­a spooler estÃ¡ndar), que no
 * habla ESC/POS directamente.
 */
export function buildPlainTextTicket(payload: KitchenTicketPrintPayload, paper: PaperSpec): string {
  const chars = paper.charsPerLine;
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const { date, time } = formatDateParts(payload.createdAt, payload.timezone);
  const itemsText = itemsSummary(payload.items, (payload as { locale?: string }).locale);
  const lines: string[] = [];

  // --- Header ---
  if (payload.businessName) lines.push(payload.businessName);
  if (payload.branchName && payload.branchName !== payload.businessName) {
    lines.push(payload.branchName);
  }
  lines.push(sep(chars));
  lines.push('*** COMANDA ***');
  lines.push(sep(chars));
  lines.push(`Estacion: ${stationLabel}`);
  lines.push(`Ticket: #${payload.ticketId}`);
  lines.push(`Mesa: ${payload.tableName || '-'}`);
  if (payload.serverName) lines.push(`Mesero: ${payload.serverName}`);
  lines.push(`Fecha: ${date}  Hora: ${time}`);
  lines.push(`Items: ${itemsText}`);
  lines.push(sepLight(chars));

  for (const item of payload.items) {
    lines.push(...wrapText(kitchenLabel(item), chars));

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      const text = `* ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join('  ')}`;
      lines.push(...wrapText(text, chars - 2).map((l) => `  ${l}`));
    }

    if (item.modifiers && item.modifiers.length > 0) {
      const text = `+ ${item.modifiers.map((m) => m.name).join(', ')}`;
      lines.push(...wrapText(text, chars - 2).map((l) => `  ${l}`));
    }

    if (item.notes) {
      lines.push(...wrapText(`>> ${item.notes}`, chars - 2).map((l) => `  ${l}`));
    }
    lines.push(sepLight(chars));
  }

  lines.push('Comanda generada por GO Admin');
  lines.push(`${date} ${time}`);
  lines.push('\n\n');

  return lines.join('\n');
}

/**
 * Imprime el ticket de venta (recibo de caja) en un dispositivo escpos.
 */
export function printSaleTicket(device: EscposDevice, payload: SaleTicketPrintPayload, paper: PaperSpec): void {
  const formatMoney = moneyFormatter(payload, { symbol: false });
  const chars = paper.charsPerLine;
  // Una linea en doble ancho dispone de la mitad de columnas.
  const doubleChars = Math.floor(chars / 2);
  const { date, time } = formatDateParts(payload.createdAt, payload.timezone);
  const isPreCuenta = (payload.title || '').toUpperCase().includes('PRE-CUENTA') || (payload.title || '').toUpperCase().includes('PRE CUENTA');
  const itemsText = itemsSummary(payload.items, (payload as { locale?: string }).locale);

  // --- Header: datos del negocio ---
  device.font('a').align('ct');

  // El logo va antes del nombre y centrado. `charsPerLine * 12` reconstruye
  // los puntos del cabezal (576 en 80mm, 384 en 58mm), que es el limite duro
  // de ancho que acepta la impresora.
  writeRasterImage(device, payload.businessLogoRaster, chars * 12);

  device.style('b').size(...SIZE_TALL);
  if (payload.businessName) device.text(payload.businessName);
  device.style('normal').size(...SIZE_NORMAL);
  if (payload.businessNit) device.text(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) device.text(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) device.text(payload.businessAddress);
  if (payload.businessCity) device.text(payload.businessCity);
  if (payload.businessEmail) device.text(payload.businessEmail);
  if (payload.businessFiscalResponsibilities && payload.businessFiscalResponsibilities.length > 0) {
    device.text(payload.businessFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
  }
  if (payload.branchName && payload.branchName !== payload.businessName) {
    device.style('b').text(`Sucursal: ${payload.branchName}`).style('normal');
  }
  if (payload.branchAddress && payload.branchAddress !== payload.businessAddress) {
    device.text(payload.branchAddress);
  }
  if (payload.branchPhone) device.text(`Tel: ${payload.branchPhone}`);

  // --- Titulo del documento ---
  device
    .text(sep(chars))
    .style('b')
    .size(...SIZE_DOUBLE)
    .text(payload.title || 'TICKET DE VENTA')
    .style('normal')
    .size(...SIZE_NORMAL)
    .text(sep(chars))
    .align('lt');

  // --- Info del ticket ---
  if (payload.saleNumber) device.text(`Venta: #${payload.saleNumber}`);
  if (payload.tableName) device.text(`Mesa: ${payload.tableName}`);
  if (payload.cashierName) device.text(`Cajero: ${payload.cashierName}`);
  if (payload.serverName) device.text(`Mesero: ${payload.serverName}`);
  device.text(`Fecha: ${date}  Hora: ${time}`);
  device.text(`Items: ${itemsText}`);

  // --- Info del cliente ---
  if (payload.customerName || payload.customerDocNumber) {
    device.text(sepLight(chars));
    if (payload.customerName) device.text(`Cliente: ${payload.customerName}`);
    if (payload.customerDocType && payload.customerDocNumber) {
      device.text(`${payload.customerDocType}: ${payload.customerDocNumber}`);
    } else if (payload.customerDocNumber) {
      device.text(`Doc: ${payload.customerDocNumber}`);
    }
    if (payload.customerPhone) device.text(`Tel: ${payload.customerPhone}`);
    if (payload.customerAddress) device.text(`Dir: ${payload.customerAddress}`);
    if (payload.customerFiscalResponsibilities && payload.customerFiscalResponsibilities.length > 0) {
      device.text(payload.customerFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
    }
  }

  // --- Delivery ---
  // Se envuelve cada campo: una direccion larga desbordaria las 32 columnas de
  // un papel de 58mm y la impresora la partiria por donde le conviene.
  if (payload.deliveryInfo) {
    const d = payload.deliveryInfo;
    device.text(sepLight(chars));
    device.style('b').text('DATOS DE ENTREGA').style('normal');
    device.text(`Tipo: ${d.type}`);
    for (const line of wrapText(`Direccion: ${d.address}`, chars)) device.text(line);
    if (d.city) device.text(`Ciudad: ${d.city}`);
    if (d.contactName) for (const line of wrapText(`Recibe: ${d.contactName}`, chars)) device.text(line);
    if (d.contactPhone) device.text(`Tel: ${d.contactPhone}`);
    if (d.driverName) for (const line of wrapText(`Conductor: ${d.driverName}`, chars)) device.text(line);
    if (d.instructions) {
      device.style('b');
      for (const line of wrapText(`Indicaciones: ${d.instructions}`, chars)) device.text(line);
      device.style('normal');
    }
  }

  // --- Encabezado de items ---
  device.text(sepLight(chars));
  device.style('b').text(padRight('DESCRIPCION', 'TOTAL', chars)).style('normal');
  device.text(sepLight(chars));

  // --- Items ---
  for (const item of payload.items) {
    // Nombre e importe en la misma linea; si no caben, el nombre se envuelve y
    // el importe cierra alineado a la derecha.
    writeItemLine(device, saleLabel(item, payload.locale), formatMoney(item.total), chars);
    device.text(`  ${linePriceDetail(item, formatMoney, payload.locale)}`);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      const text = `* ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join('  ')}`;
      device.style('b');
      for (const line of wrapText(text, chars - 2)) device.text(`  ${line}`);
      device.style('normal');
    }

    if (item.modifiers && item.modifiers.length > 0) {
      const text = `+ ${item.modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatMoney(m.extraPrice)})` : m.name).join(', ')}`;
      device.style('b');
      for (const line of wrapText(text, chars - 2)) device.text(`  ${line}`);
      device.style('normal');
    }

    if (item.note) {
      for (const line of wrapText(`» ${item.note}`, chars - 2)) device.text(`  ${line}`);
    }

    if (item.taxAmount && item.taxAmount > 0) {
      device.text(`  Imp: ${formatMoney(item.taxAmount)}`);
    }
    if (item.discountAmount && item.discountAmount > 0) {
      device.text(`  Desc: -${formatMoney(item.discountAmount)}`);
    }

    device.text(sepLight(chars));
  }

  // --- Totales ---
  device.align('lt');
  if (payload.subtotal != null) {
    device.text(padRight('Subtotal:', formatMoney(payload.subtotal), chars));
  }
  if (payload.discountTotal && payload.discountTotal > 0) {
    device.text(padRight('Descuento:', `-${formatMoney(payload.discountTotal)}`, chars));
  }
  for (const line of taxLines(payload)) {
    device.text(padRight(line.label, formatMoney(line.amount), chars));
  }
  if (payload.deliveryFee && payload.deliveryFee > 0) {
    device.text(padRight('Envio:', formatMoney(payload.deliveryFee), chars));
  }
  if (payload.tipAmount && payload.tipAmount > 0) {
    device.text(padRight('Propina:', formatMoney(payload.tipAmount), chars));
  }

  // El TOTAL va en doble ancho, por lo que se alinea sobre `doubleChars`.
  device
    .text(sep(chars))
    .style('b')
    .size(...SIZE_DOUBLE)
    .text(padRight('TOTAL:', formatMoney(payload.total), doubleChars))
    .style('normal')
    .size(...SIZE_NORMAL);

  // --- Pagos ---
  if (payload.payments && payload.payments.length > 0) {
    device.text(sepLight(chars));
    for (const payment of payload.payments) {
      device.text(padRight(`${getPaymentLabel(payment)}:`, formatMoney(payment.amount), chars));
    }
    if (payload.totalPaid && payload.totalPaid > 0) {
      device.text(padRight('Recibido:', formatMoney(payload.totalPaid), chars));
    }
    // El cambio en negrita: es el dato que el cajero comprueba de un vistazo.
    if (payload.changeAmount && payload.changeAmount > 0) {
      device.style('b').text(padRight('CAMBIO:', formatMoney(payload.changeAmount), chars)).style('normal');
    }
  }

  // --- QR ---
  device.text(sep(chars)).align('ct');
  try {
    device.qrimage('https://goadmin.io', { cellSize: 3 });
  } catch {
    // Si la impresora no soporta QR, se omite
  }

  // --- Footer ---
  if (isPreCuenta) {
    // Doble alto y no doble ancho: en 58mm este aviso ocuparia 42 de 32
    // columnas y se partiria en dos lineas.
    device
      .text(sepLight(chars))
      .style('b')
      .size(...SIZE_TALL)
      .text('*** NO ES FACTURA ***')
      .style('normal')
      .size(...SIZE_NORMAL)
      .text('Documento solo informativo')
      .text('Gracias por su preferencia!')
      .feed(1);
  } else {
    device
      .text(sepLight(chars))
      .text('Gracias por su compra!')
      .feed(1);
  }

  for (const line of GO_ADMIN_FOOTER) {
    device.text(line);
  }

  device.feed(2).cut();
}

/**
 * VersiÃ³n en texto plano del ticket de venta, para impresoras 'system'.
 */
export function buildPlainTextSaleTicket(payload: SaleTicketPrintPayload, paper: PaperSpec): string {
  const formatMoney = moneyFormatter(payload, { symbol: false });
  const chars = paper.charsPerLine;
  const { date, time } = formatDateParts(payload.createdAt, payload.timezone);
  const isPreCuenta = (payload.title || '').toUpperCase().includes('PRE-CUENTA') || (payload.title || '').toUpperCase().includes('PRE CUENTA');
  const itemsText = itemsSummary(payload.items, (payload as { locale?: string }).locale);
  const lines: string[] = [];

  // --- Header: datos del negocio ---
  if (payload.businessName) lines.push(payload.businessName);
  if (payload.businessNit) lines.push(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) lines.push(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) lines.push(payload.businessAddress);
  if (payload.businessCity) lines.push(payload.businessCity);
  if (payload.businessEmail) lines.push(payload.businessEmail);
  if (payload.businessFiscalResponsibilities && payload.businessFiscalResponsibilities.length > 0) {
    lines.push(payload.businessFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
  }
  if (payload.branchName && payload.branchName !== payload.businessName) {
    lines.push(`Sucursal: ${payload.branchName}`);
  }
  if (payload.branchAddress && payload.branchAddress !== payload.businessAddress) {
    lines.push(payload.branchAddress);
  }
  if (payload.branchPhone) lines.push(`Tel: ${payload.branchPhone}`);

  lines.push(sep(chars));
  lines.push(payload.title || 'TICKET DE VENTA');
  lines.push(sep(chars));

  // --- Info del ticket ---
  if (payload.saleNumber) lines.push(`Venta: #${payload.saleNumber}`);
  if (payload.tableName) lines.push(`Mesa: ${payload.tableName}`);
  if (payload.cashierName) lines.push(`Cajero: ${payload.cashierName}`);
  if (payload.serverName) lines.push(`Mesero: ${payload.serverName}`);
  lines.push(`Fecha: ${date}  Hora: ${time}`);
  lines.push(`Items: ${itemsText}`);

  // --- Info del cliente ---
  if (payload.customerName || payload.customerDocNumber) {
    lines.push(sepLight(chars));
    if (payload.customerName) lines.push(`Cliente: ${payload.customerName}`);
    if (payload.customerDocType && payload.customerDocNumber) {
      lines.push(`${payload.customerDocType}: ${payload.customerDocNumber}`);
    } else if (payload.customerDocNumber) {
      lines.push(`Doc: ${payload.customerDocNumber}`);
    }
    if (payload.customerPhone) lines.push(`Tel: ${payload.customerPhone}`);
    if (payload.customerAddress) lines.push(`Dir: ${payload.customerAddress}`);
    if (payload.customerFiscalResponsibilities && payload.customerFiscalResponsibilities.length > 0) {
      lines.push(payload.customerFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
    }
  }

  // --- Delivery ---
  if (payload.deliveryInfo) {
    const d = payload.deliveryInfo;
    lines.push(sepLight(chars));
    lines.push('DATOS DE ENTREGA');
    lines.push(`Tipo: ${d.type}`);
    lines.push(...wrapText(`Direccion: ${d.address}`, chars));
    if (d.city) lines.push(`Ciudad: ${d.city}`);
    if (d.contactName) lines.push(...wrapText(`Recibe: ${d.contactName}`, chars));
    if (d.contactPhone) lines.push(`Tel: ${d.contactPhone}`);
    if (d.driverName) lines.push(...wrapText(`Conductor: ${d.driverName}`, chars));
    if (d.instructions) lines.push(...wrapText(`Indicaciones: ${d.instructions}`, chars));
  }

  // --- Encabezado de items ---
  lines.push(sepLight(chars));
  lines.push(padRight('DESCRIPCION', 'TOTAL', chars));
  lines.push(sepLight(chars));

  // --- Items ---
  for (const item of payload.items) {
    const label = saleLabel(item, payload.locale);
    const money = formatMoney(item.total);
    if (label.length + money.length + 1 <= chars) {
      lines.push(padRight(label, money, chars));
    } else {
      lines.push(...wrapText(label, chars));
      lines.push(padRight('', money, chars));
    }
    lines.push(`  ${linePriceDetail(item, formatMoney, payload.locale)}`);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      const text = `* ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join('  ')}`;
      lines.push(...wrapText(text, chars - 2).map((l) => `  ${l}`));
    }

    if (item.modifiers && item.modifiers.length > 0) {
      const text = `+ ${item.modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatMoney(m.extraPrice)})` : m.name).join(', ')}`;
      lines.push(...wrapText(text, chars - 2).map((l) => `  ${l}`));
    }

    if (item.note) lines.push(...wrapText(`» ${item.note}`, chars - 2).map((l) => `  ${l}`));

    if (item.taxAmount && item.taxAmount > 0) lines.push(`  Imp: ${formatMoney(item.taxAmount)}`);
    if (item.discountAmount && item.discountAmount > 0) lines.push(`  Desc: -${formatMoney(item.discountAmount)}`);
    lines.push(sepLight(chars));
  }

  // --- Totales ---
  if (payload.subtotal != null) lines.push(padRight('Subtotal:', formatMoney(payload.subtotal), chars));
  if (payload.discountTotal && payload.discountTotal > 0) lines.push(padRight('Descuento:', `-${formatMoney(payload.discountTotal)}`, chars));
  for (const t of taxLines(payload)) lines.push(padRight(t.label, formatMoney(t.amount), chars));
  if (payload.deliveryFee && payload.deliveryFee > 0) lines.push(padRight('Envio:', formatMoney(payload.deliveryFee), chars));
  if (payload.tipAmount && payload.tipAmount > 0) lines.push(padRight('Propina:', formatMoney(payload.tipAmount), chars));
  lines.push(sep(chars));
  lines.push(padRight('TOTAL:', formatMoney(payload.total), chars));

  // --- Pagos ---
  if (payload.payments && payload.payments.length > 0) {
    lines.push(sepLight(chars));
    for (const payment of payload.payments) {
      lines.push(padRight(`${getPaymentLabel(payment)}:`, formatMoney(payment.amount), chars));
    }
    if (payload.totalPaid && payload.totalPaid > 0) {
      lines.push(padRight('Recibido:', formatMoney(payload.totalPaid), chars));
    }
    if (payload.changeAmount && payload.changeAmount > 0) {
      lines.push(padRight('CAMBIO:', formatMoney(payload.changeAmount), chars));
    }
  }

  // --- Footer ---
  lines.push(sepLight(chars));
  if (isPreCuenta) {
    lines.push('*** NO ES FACTURA ***');
    lines.push('Documento solo informativo');
    lines.push('Gracias por su preferencia!');
  } else {
    lines.push('Gracias por su compra!');
  }
  lines.push('');
  for (const line of GO_ADMIN_FOOTER) {
    lines.push(line);
  }
  lines.push('\n\n');

  return lines.join('\n');
}

/**
 * Lineas de texto del rotulo de envio (Figma «21 Logistica» 3223:15627, version termica
 * 3223:16129), en el mismo orden que la imagen: remitente, destinatario, paquete/peso/entrega,
 * guia de la transportadora, cobro, guia con barras y QR, pie. Solo se usa cuando no llega la
 * imagen (`label.raster`) o la impresora no acepta bytes crudos.
 */
function shipmentLabelLines(l: ShipmentLabelPayload): {
  sender: string[];
  receiver: string[];
  cells: string;
  carrier: string[];
  charge: string[];
  handling: string[];
  after: string[];
} {
  return {
    sender: [l.senderLabel, l.storeName, l.branchLine].filter(Boolean) as string[],
    receiver: [l.receiverLabel, l.receiverName, l.address, l.neighborhood, l.destination, l.phone, l.instructions].filter(Boolean) as string[],
    cells: [
      `${l.packageLabel}: ${l.packageText}`,
      l.weightText ? `${l.weightLabel}: ${l.weightText}` : null,
      l.deliveryText ? `${l.deliveryLabel}: ${l.deliveryText}` : null,
    ]
      .filter(Boolean)
      .join('  '),
    carrier: l.carrierGuideText ? [l.carrierGuideLabel, l.carrierGuideText] : [],
    charge: [l.charge.title, l.charge.amount ?? null, l.charge.note].filter(Boolean) as string[],
    handling: l.handling ? [l.handling] : [],
    after: [l.qrCaptionLong, l.footer].filter(Boolean) as string[],
  };
}

/**
 * Imprime el rotulo de envio con corte automatico. Con `label.raster` imprime la IMAGEN del
 * rotulo (la misma de la vista previa del ERP); si no, la version en texto con los mismos datos.
 */
export function printShipmentGuide(device: EscposDevice, payload: ShipmentGuidePrintPayload, paper: PaperSpec): void {
  const l = resolveShipmentLabel(payload);
  const dots = paper.charsPerLine * 12;
  if (writeRasterPage(device, l.raster, dots)) {
    device.feed(1).cut();
    return;
  }

  const chars = paper.charsPerLine;
  const r = shipmentLabelLines(l);
  device.font('a').align('lt');
  r.sender.forEach((line, i) => {
    if (i === 1) device.style('b');
    for (const w of wrapText(line, chars)) device.text(w);
    if (i === 1) device.style('normal');
  });
  device.text(sep(chars));
  for (const line of r.receiver) {
    const strong = line === l.receiverName || line === l.destination;
    if (strong) device.style('b').size(...SIZE_TALL);
    for (const w of wrapText(line, chars)) device.text(w);
    if (strong) device.size(...SIZE_NORMAL).style('normal');
  }
  device.text(sep(chars));
  for (const w of wrapText(r.cells, chars)) device.text(w);
  if (r.carrier.length) {
    device.text(sepLight(chars));
    for (const line of r.carrier) for (const w of wrapText(line, chars)) device.text(w);
  }
  device.text(sep(chars)).align('ct').style('b');
  device.text(l.charge.title);
  if (l.charge.amount) device.size(...SIZE_DOUBLE).text(l.charge.amount).size(...SIZE_NORMAL);
  device.style('normal');
  for (const w of wrapText(l.charge.note, chars)) device.text(w);
  if (r.handling.length) {
    device.text(sepLight(chars)).style('b');
    for (const line of r.handling) for (const w of wrapText(line, chars)) device.text(w);
    device.style('normal').text(sepLight(chars));
  }
  device.text(sep(chars));
  try {
    device.code128(l.guideNumber, { width: 2, height: 60 });
  } catch {
    device.text(`** ${l.guideNumber} **`);
  }
  device.align('lt').text(l.guideLabel).style('b').size(...SIZE_TALL).text(l.guideNumber).size(...SIZE_NORMAL).style('normal');
  for (const line of r.after) for (const w of wrapText(line, chars)) device.text(w);
  device.align('ct');
  try {
    device.qrimage(l.qrData, { cellSize: 4 });
  } catch {
    // Sin soporte de QR se omite: la guia ya va en barras y en texto.
  }
  device.feed(2).cut();
}

/**
 * Version en texto plano del rotulo de envio, para impresoras 'system' sin HTML y para la vista
 * previa de Configuracion › Impresiones.
 */
export function buildPlainTextShipmentGuide(payload: ShipmentGuidePrintPayload, paper: PaperSpec): string {
  const chars = paper.charsPerLine;
  const l = resolveShipmentLabel(payload);
  const r = shipmentLabelLines(l);
  const lines: string[] = [];
  lines.push(...r.sender.flatMap((t) => wrapText(t, chars)));
  lines.push(sep(chars));
  lines.push(...r.receiver.flatMap((t) => wrapText(t, chars)));
  lines.push(sep(chars));
  lines.push(...wrapText(r.cells, chars));
  if (r.carrier.length) {
    lines.push(sepLight(chars));
    lines.push(...r.carrier.flatMap((t) => wrapText(t, chars)));
  }
  lines.push(sep(chars));
  lines.push(...r.charge.flatMap((t) => wrapText(t, chars)));
  if (r.handling.length) {
    lines.push(sepLight(chars));
    lines.push(...r.handling.flatMap((t) => wrapText(t, chars)));
    lines.push(sepLight(chars));
  }
  lines.push(sep(chars));
  lines.push(l.guideLabel);
  lines.push(`** ${l.guideNumber} **`);
  lines.push(...r.after.flatMap((t) => wrapText(t, chars)));
  return lines.join('\n');
}

/**
 * Imprime una factura electronica validada por DIAN en una impresora ESC/POS.
 * Incluye CUFE, QR de validacion y entorno (produccion/pruebas).
 */
export function printElectronicInvoice(device: EscposDevice, payload: ElectronicInvoicePrintPayload, paper: PaperSpec): void {
  const formatMoney = moneyFormatter(payload, { symbol: false });
  const chars = paper.charsPerLine;
  const doubleChars = Math.floor(chars / 2);
  const { date, time } = formatDateParts(payload.createdAt, payload.timezone);
  const itemsText = itemsSummary(payload.items, (payload as { locale?: string }).locale);
  const envLabel = payload.environment === 'production' ? 'PRODUCCION' : 'PRUEBAS';

  // --- Header: datos del negocio ---
  device.font('a').align('ct');
  writeRasterImage(device, payload.businessLogoRaster, chars * 12);

  device.style('b').size(...SIZE_TALL);
  if (payload.businessName) device.text(payload.businessName);
  device.style('normal').size(...SIZE_NORMAL);
  if (payload.businessNit) device.text(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) device.text(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) device.text(payload.businessAddress);
  if (payload.businessCity) device.text(payload.businessCity);
  if (payload.businessEmail) device.text(payload.businessEmail);
  if (payload.businessFiscalResponsibilities && payload.businessFiscalResponsibilities.length > 0) {
    device.text(payload.businessFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
  }
  if (payload.branchName && payload.branchName !== payload.businessName) {
    device.style('b').text(`Sucursal: ${payload.branchName}`).style('normal');
  }
  if (payload.branchAddress && payload.branchAddress !== payload.businessAddress) {
    device.text(payload.branchAddress);
  }

  // --- Titulo del documento ---
  device
    .text(sep(chars))
    .style('b')
    .size(...SIZE_DOUBLE)
    .text('FACTURA ELECTRONICA')
    .style('normal')
    .size(...SIZE_NORMAL)
    .text(`DIAN - Entorno: ${envLabel}`)
    .text(sep(chars))
    .align('lt');

  // --- Info del documento ---
  device.text(`Factura No: ${payload.invoiceNumber}`);
  device.text(`Fecha: ${date}  Hora: ${time}`);
  device.text(`Items: ${itemsText}`);
  if (payload.cashierName) device.text(`Cajero: ${payload.cashierName}`);
  if (payload.validationDate) {
    const vd = new Date(payload.validationDate);
    const tzOpts = payload.timezone ? { timeZone: payload.timezone } : {};
    device.text(`Validacion DIAN: ${vd.toLocaleDateString('es-CO', tzOpts)} ${vd.toLocaleTimeString('es-CO', { ...tzOpts, hour: '2-digit', minute: '2-digit' })}`);
  }

  // --- Info del cliente ---
  if (payload.customerName || payload.customerDocNumber) {
    device.text(sepLight(chars));
    if (payload.customerName) device.text(`Cliente: ${payload.customerName}`);
    if (payload.customerDocType && payload.customerDocNumber) {
      device.text(`${payload.customerDocType}: ${payload.customerDocNumber}`);
    } else if (payload.customerDocNumber) {
      device.text(`Doc: ${payload.customerDocNumber}`);
    }
    if (payload.customerPhone) device.text(`Tel: ${payload.customerPhone}`);
    if (payload.customerAddress) {
      for (const line of wrapText(`Dir: ${payload.customerAddress}`, chars)) device.text(line);
    }
    if (payload.customerFiscalResponsibilities && payload.customerFiscalResponsibilities.length > 0) {
      device.text(payload.customerFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
    }
  }

  // --- Encabezado de items ---
  device.text(sepLight(chars));
  device.style('b').text(padRight('DESCRIPCION', 'TOTAL', chars)).style('normal');
  device.text(sepLight(chars));

  // --- Items ---
  for (const item of payload.items) {
    writeItemLine(device, saleLabel(item, payload.locale), formatMoney(item.total), chars);
    device.text(`  ${linePriceDetail(item, formatMoney, payload.locale)}`);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      const text = `* ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join('  ')}`;
      device.style('b');
      for (const line of wrapText(text, chars - 2)) device.text(`  ${line}`);
      device.style('normal');
    }

    if (item.modifiers && item.modifiers.length > 0) {
      const text = `+ ${item.modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatMoney(m.extraPrice)})` : m.name).join(', ')}`;
      device.style('b');
      for (const line of wrapText(text, chars - 2)) device.text(`  ${line}`);
      device.style('normal');
    }

    if (item.note) {
      for (const line of wrapText(`» ${item.note}`, chars - 2)) device.text(`  ${line}`);
    }

    if (item.taxAmount && item.taxAmount > 0) {
      device.text(`  Imp: ${formatMoney(item.taxAmount)}`);
    }
    if (item.discountAmount && item.discountAmount > 0) {
      device.text(`  Desc: -${formatMoney(item.discountAmount)}`);
    }

    device.text(sepLight(chars));
  }

  // --- Totales ---
  device.align('lt');
  if (payload.subtotal != null) {
    device.text(padRight('Subtotal:', formatMoney(payload.subtotal), chars));
  }
  if (payload.discountTotal && payload.discountTotal > 0) {
    device.text(padRight('Descuento:', `-${formatMoney(payload.discountTotal)}`, chars));
  }
  if (payload.taxLines && payload.taxLines.length > 0) {
    const suffix = payload.taxIncluded ? ' (incl)' : '';
    for (const t of payload.taxLines) {
      device.text(padRight(`${t.name}${suffix}:`, formatMoney(t.amount), chars));
    }
  } else if (payload.taxTotal && payload.taxTotal > 0) {
    const suffix = payload.taxIncluded ? ' (incl)' : '';
    device.text(padRight(`Impuestos${suffix}:`, formatMoney(payload.taxTotal), chars));
  }

  device
    .text(sep(chars))
    .style('b')
    .size(...SIZE_DOUBLE)
    .text(padRight('TOTAL:', formatMoney(payload.total), doubleChars))
    .style('normal')
    .size(...SIZE_NORMAL);

  // --- Pagos ---
  if (payload.payments && payload.payments.length > 0) {
    device.text(sepLight(chars));
    for (const payment of payload.payments) {
      device.text(padRight(`${getPaymentLabel(payment)}:`, formatMoney(payment.amount), chars));
    }
    if (payload.totalPaid && payload.totalPaid > 0) {
      device.text(padRight('Recibido:', formatMoney(payload.totalPaid), chars));
    }
    if (payload.changeAmount && payload.changeAmount > 0) {
      device.style('b').text(padRight('CAMBIO:', formatMoney(payload.changeAmount), chars)).style('normal');
    }
  }

  // --- Notas ---
  if (payload.notes) {
    device.text(sepLight(chars));
    device.style('b').text('Notas:').style('normal');
    for (const line of wrapText(payload.notes, chars)) device.text(line);
  }

  // --- QR DIAN ---
  device.text(sep(chars)).align('ct');
  try {
    device.qrimage(payload.qrData, { cellSize: 3 });
  } catch {
    // Si la impresora no soporta QR, se omite
  }

  // --- CUFE ---
  device.style('b').text('CUFE:').style('normal');
  for (let i = 0; i < payload.cufe.length; i += chars) {
    device.text(payload.cufe.slice(i, i + chars));
  }

  // --- Footer ---
  device.text(sepLight(chars));
  device.text('Factura Electronica validada por DIAN');
  device.text('Gracias por su compra!');
  device.feed(1);

  for (const line of GO_ADMIN_FOOTER) {
    device.text(line);
  }

  device.feed(2).cut();
}

/**
 * Version en texto plano de la factura electronica, para impresoras 'system'.
 */
export function buildPlainTextElectronicInvoice(payload: ElectronicInvoicePrintPayload, paper: PaperSpec): string {
  const formatMoney = moneyFormatter(payload, { symbol: false });
  const chars = paper.charsPerLine;
  const { date, time } = formatDateParts(payload.createdAt, payload.timezone);
  const itemsText = itemsSummary(payload.items, (payload as { locale?: string }).locale);
  const envLabel = payload.environment === 'production' ? 'PRODUCCION' : 'PRUEBAS';

  const lines: string[] = [];

  // --- Header ---
  if (payload.businessName) lines.push(payload.businessName);
  if (payload.businessNit) lines.push(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) lines.push(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) lines.push(payload.businessAddress);
  if (payload.businessCity) lines.push(payload.businessCity);
  if (payload.businessEmail) lines.push(payload.businessEmail);
  if (payload.businessFiscalResponsibilities && payload.businessFiscalResponsibilities.length > 0) {
    lines.push(payload.businessFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
  }
  if (payload.branchName && payload.branchName !== payload.businessName) {
    lines.push(`Sucursal: ${payload.branchName}`);
  }

  // --- Titulo ---
  lines.push(sep(chars));
  lines.push('FACTURA ELECTRONICA');
  lines.push(`DIAN - Entorno: ${envLabel}`);
  lines.push(sep(chars));

  // --- Info ---
  lines.push(`Factura No: ${payload.invoiceNumber}`);
  lines.push(`Fecha: ${date}  Hora: ${time}`);
  lines.push(`Items: ${itemsText}`);
  if (payload.cashierName) lines.push(`Cajero: ${payload.cashierName}`);
  if (payload.validationDate) {
    const vd = new Date(payload.validationDate);
    const tzOpts = payload.timezone ? { timeZone: payload.timezone } : {};
    lines.push(`Validacion DIAN: ${vd.toLocaleDateString('es-CO', tzOpts)} ${vd.toLocaleTimeString('es-CO', { ...tzOpts, hour: '2-digit', minute: '2-digit' })}`);
  }

  // --- Cliente ---
  if (payload.customerName || payload.customerDocNumber) {
    lines.push(sepLight(chars));
    if (payload.customerName) lines.push(`Cliente: ${payload.customerName}`);
    if (payload.customerDocType && payload.customerDocNumber) {
      lines.push(`${payload.customerDocType}: ${payload.customerDocNumber}`);
    } else if (payload.customerDocNumber) {
      lines.push(`Doc: ${payload.customerDocNumber}`);
    }
    if (payload.customerPhone) lines.push(`Tel: ${payload.customerPhone}`);
    if (payload.customerAddress) {
      for (const line of wrapText(`Dir: ${payload.customerAddress}`, chars)) lines.push(line);
    }
  }

  // --- Items ---
  lines.push(sepLight(chars));
  lines.push(padRight('DESCRIPCION', 'TOTAL', chars));
  lines.push(sepLight(chars));

  for (const item of payload.items) {
    lines.push(padRight(saleLabel(item, payload.locale), formatMoney(item.total), chars));
    lines.push(`  ${linePriceDetail(item, formatMoney, payload.locale)}`);
    if (item.taxAmount && item.taxAmount > 0) lines.push(`  Imp: ${formatMoney(item.taxAmount)}`);
    if (item.discountAmount && item.discountAmount > 0) lines.push(`  Desc: -${formatMoney(item.discountAmount)}`);
    lines.push(sepLight(chars));
  }

  // --- Totales ---
  if (payload.subtotal != null) lines.push(padRight('Subtotal:', formatMoney(payload.subtotal), chars));
  if (payload.discountTotal && payload.discountTotal > 0) lines.push(padRight('Descuento:', `-${formatMoney(payload.discountTotal)}`, chars));
  if (payload.taxLines && payload.taxLines.length > 0) {
    const suffix = payload.taxIncluded ? ' (incl)' : '';
    for (const t of payload.taxLines) {
      lines.push(padRight(`${t.name}${suffix}:`, formatMoney(t.amount), chars));
    }
  } else if (payload.taxTotal && payload.taxTotal > 0) {
    const suffix = payload.taxIncluded ? ' (incl)' : '';
    lines.push(padRight(`Impuestos${suffix}:`, formatMoney(payload.taxTotal), chars));
  }
  lines.push(sep(chars));
  lines.push(padRight('TOTAL:', formatMoney(payload.total), chars));
  lines.push(sep(chars));

  // --- Pagos ---
  if (payload.payments && payload.payments.length > 0) {
    for (const payment of payload.payments) {
      lines.push(padRight(`${getPaymentLabel(payment)}:`, formatMoney(payment.amount), chars));
    }
    if (payload.totalPaid && payload.totalPaid > 0) lines.push(padRight('Recibido:', formatMoney(payload.totalPaid), chars));
    if (payload.changeAmount && payload.changeAmount > 0) lines.push(padRight('CAMBIO:', formatMoney(payload.changeAmount), chars));
  }

  // --- Notas ---
  if (payload.notes) {
    lines.push(sepLight(chars));
    lines.push('Notas:');
    for (const line of wrapText(payload.notes, chars)) lines.push(line);
  }

  // --- CUFE ---
  lines.push(sepLight(chars));
  lines.push('CUFE:');
  for (let i = 0; i < payload.cufe.length; i += chars) {
    lines.push(payload.cufe.slice(i, i + chars));
  }

  // --- Footer ---
  lines.push(sepLight(chars));
  lines.push('Factura Electronica validada por DIAN');
  lines.push('Gracias por su compra!');
  lines.push('');
  for (const line of GO_ADMIN_FOOTER) {
    lines.push(line);
  }
  lines.push('\n\n');

  return lines.join('\n');
}

