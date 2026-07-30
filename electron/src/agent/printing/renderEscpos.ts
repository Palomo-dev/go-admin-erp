/* AUTO-GENERADO por sync-agent.js — NO EDITAR */
import type { KitchenTicketPrintPayload, SaleTicketPrintPayload, SaleTicketPayment, ShipmentGuidePrintPayload } from './types';
import type { PaperSpec } from './paper';
import { writeRasterImage } from './escposImage';

function formatMoney(value: number): string {
  return value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

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
  cold_kitchen: 'COCINA FRÍA',
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
function writeItemLine(device: any, label: string, value: string, chars: number): void {
  if (label.length + value.length + 1 <= chars) {
    device.style('b').text(padRight(label, value, chars)).style('normal');
    return;
  }

  device.style('b');
  for (const line of wrapText(label, chars)) device.text(line);
  device.style('normal').text(padRight('', value, chars));
}

function formatDateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('es-CO'),
    // hour12: false evita el sufijo "p. m." que agrega el locale es-CO. Ese
    // sufijo gasta 6 columnas y hace que la linea de fecha desborde las 32
    // columnas disponibles en papel de 58mm.
    time: d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

/**
 * Envía a un dispositivo escpos (chainable) los comandos para imprimir una
 * comanda de cocina. `device` es una instancia de `escpos.Printer` ya
 * conectada a un `escpos.<Interface>` (network/usb/bluetooth).
 */
export function printKitchenTicket(device: any, payload: KitchenTicketPrintPayload, paper: PaperSpec): void {
  const chars = paper.charsPerLine;
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const { date, time } = formatDateParts(payload.createdAt);
  const itemCount = payload.items.reduce((sum, i) => sum + i.quantity, 0);

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

  // --- Estación ---
  device.style('b').size(...SIZE_TALL).text(`Estacion: ${stationLabel}`).style('normal').size(...SIZE_NORMAL);

  // --- Info del ticket ---
  device.text(`Ticket: #${payload.ticketId}`);
  device.text(`Mesa: ${payload.tableName || '-'}`);
  if (payload.serverName) device.text(`Mesero: ${payload.serverName}`);
  device.text(`Fecha: ${date}  Hora: ${time}`);
  device.text(`Items: ${payload.items.length} (${itemCount} unidades)`);
  device.text(sepLight(chars));

  // --- Items ---
  for (const item of payload.items) {
    // Doble alto para que el cocinero lo lea de lejos, ancho normal para
    // aprovechar las columnas completas en nombres largos.
    device.style('b').size(...SIZE_TALL);
    for (const line of wrapText(`${item.quantity}x  ${item.productName}`, chars)) {
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
 * Construye una versión en texto plano de la comanda, usada por el driver
 * 'system' (impresora del sistema operativo vía spooler estándar), que no
 * habla ESC/POS directamente.
 */
export function buildPlainTextTicket(payload: KitchenTicketPrintPayload, paper: PaperSpec): string {
  const chars = paper.charsPerLine;
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const { date, time } = formatDateParts(payload.createdAt);
  const itemCount = payload.items.reduce((sum, i) => sum + i.quantity, 0);
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
  lines.push(`Items: ${payload.items.length} (${itemCount} unidades)`);
  lines.push(sepLight(chars));

  for (const item of payload.items) {
    lines.push(...wrapText(`${item.quantity}x  ${item.productName}`, chars));

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
export function printSaleTicket(device: any, payload: SaleTicketPrintPayload, paper: PaperSpec): void {
  const chars = paper.charsPerLine;
  // Una linea en doble ancho dispone de la mitad de columnas.
  const doubleChars = Math.floor(chars / 2);
  const { date, time } = formatDateParts(payload.createdAt);
  const isPreCuenta = (payload.title || '').toUpperCase().includes('PRE-CUENTA') || (payload.title || '').toUpperCase().includes('PRE CUENTA');
  const itemCount = payload.items.reduce((sum, i) => sum + i.quantity, 0);

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
  device.text(`Items: ${payload.items.length} (${itemCount} unidades)`);

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
    writeItemLine(device, `${item.quantity}x  ${item.productName}`, formatMoney(item.total), chars);
    device.text(`  ${formatMoney(item.unitPrice)} c/u`);

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
 * Versión en texto plano del ticket de venta, para impresoras 'system'.
 */
export function buildPlainTextSaleTicket(payload: SaleTicketPrintPayload, paper: PaperSpec): string {
  const chars = paper.charsPerLine;
  const { date, time } = formatDateParts(payload.createdAt);
  const isPreCuenta = (payload.title || '').toUpperCase().includes('PRE-CUENTA') || (payload.title || '').toUpperCase().includes('PRE CUENTA');
  const itemCount = payload.items.reduce((sum, i) => sum + i.quantity, 0);
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
  lines.push(`Items: ${payload.items.length} (${itemCount} unidades)`);

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
    const label = `${item.quantity}x  ${item.productName}`;
    const money = formatMoney(item.total);
    if (label.length + money.length + 1 <= chars) {
      lines.push(padRight(label, money, chars));
    } else {
      lines.push(...wrapText(label, chars));
      lines.push(padRight('', money, chars));
    }
    lines.push(`  ${formatMoney(item.unitPrice)} c/u`);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      const text = `* ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join('  ')}`;
      lines.push(...wrapText(text, chars - 2).map((l) => `  ${l}`));
    }

    if (item.modifiers && item.modifiers.length > 0) {
      const text = `+ ${item.modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatMoney(m.extraPrice)})` : m.name).join(', ')}`;
      lines.push(...wrapText(text, chars - 2).map((l) => `  ${l}`));
    }

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
 * Imprime la guia de envio en un dispositivo ESC/POS con corte automatico.
 */
export function printShipmentGuide(device: any, payload: ShipmentGuidePrintPayload, paper: PaperSpec): void {
  const chars = paper.charsPerLine;
  const { date, time } = formatDateParts(payload.createdAt);
  const tracking = payload.trackingNumber || payload.shipmentNumber || payload.shipmentId;

  // --- Header: datos del negocio ---
  device.font('a').align('ct');
  if (payload.businessName) {
    device.style('b').size(...SIZE_TALL).text(payload.businessName).style('normal').size(...SIZE_NORMAL);
  }
  if (payload.businessNit) device.text(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) device.text(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) device.text(payload.businessAddress);

  // --- Titulo ---
  device
    .text(sep(chars))
    .style('b')
    .size(...SIZE_DOUBLE)
    .text('GUIA DE ENVIO')
    .size(...SIZE_NORMAL)
    .style('normal')
    .text(sep(chars));

  // --- Tracking number ---
  device.style('b').text(`No: ${tracking}`).style('normal');
  device.text(`Fecha: ${date} ${time}`);
  if (payload.status) device.text(`Estado: ${payload.status.toUpperCase()}`);

  // --- Remitente ---
  device.text(sepLight(chars)).style('b').text('REMITENTE').style('normal');
  if (payload.senderName) device.text(payload.senderName);
  if (payload.senderPhone) device.text(`Tel: ${payload.senderPhone}`);

  // --- Destinatario ---
  device.text(sepLight(chars)).style('b').text('DESTINATARIO').style('normal');
  if (payload.receiverName) device.text(payload.receiverName);
  if (payload.receiverPhone) device.text(`Tel: ${payload.receiverPhone}`);
  if (payload.receiverAddress) {
    for (const line of wrapText(`Dir: ${payload.receiverAddress}`, chars)) device.text(line);
  }
  if (payload.receiverCity) device.text(`Ciudad: ${payload.receiverCity}`);
  if (payload.receiverInstructions) {
    for (const line of wrapText(`Instr: ${payload.receiverInstructions}`, chars)) device.text(line);
  }

  // --- Ruta ---
  device.text(sepLight(chars)).style('b').text('RUTA').style('normal');
  if (payload.originStop) device.text(`Origen: ${payload.originStop}`);
  if (payload.destinationStop) device.text(`Destino: ${payload.destinationStop}`);

  // --- Conductor ---
  if (payload.driver) {
    device.text(sepLight(chars)).style('b').text('CONDUCTOR').style('normal');
    device.text(payload.driver.name || 'Sin asignar');
    if (payload.driver.phone) device.text(`Tel: ${payload.driver.phone}`);
    if (payload.driver.licenseNumber) device.text(`Lic: ${payload.driver.licenseNumber}`);
    if (payload.driver.licenseCategory) device.text(`Cat: ${payload.driver.licenseCategory}`);
  }

  // --- Detalles ---
  device.text(sepLight(chars)).style('b').text('DETALLES').style('normal');
  if (payload.weightKg) device.text(padRight('Peso:', `${payload.weightKg} kg`, chars));
  if (payload.packageCount) device.text(padRight('Paquetes:', String(payload.packageCount), chars));
  if (payload.packageType) device.text(padRight('Tipo:', payload.packageType, chars));
  if (payload.deliveryType) device.text(padRight('Entrega:', payload.deliveryType, chars));
  if (payload.declaredValue) device.text(padRight('Valor Decl.:', formatMoney(payload.declaredValue), chars));
  if (payload.isFragile) device.text('** FRAGIL **');
  if (payload.requiresSignature) device.text('** REQUIERE FIRMA **');

  // --- Items ---
  if (payload.items && payload.items.length > 0) {
    device.text(sepLight(chars)).style('b').text('ITEMS').style('normal');
    device.text(sepLight(chars));
    for (const item of payload.items) {
      const qty = item.quantity || 1;
      const desc = item.description || '-';
      const total = item.totalValue || (qty * (item.unitValue || 0));
      writeItemLine(device, `${qty}x ${desc}`, formatMoney(total), chars);
      if (item.sku) device.text(`  SKU: ${item.sku}`);
      if (item.weightKg) device.text(`  Peso: ${item.weightKg} kg`);
      if (item.variantData) {
        const entries = Object.entries(item.variantData);
        if (entries.length > 0) {
          for (const line of wrapText(`  ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}`, chars)) device.text(line);
        }
      }
      if (item.modifiers && item.modifiers.length > 0) {
        const modStr = item.modifiers.map((m) => `${m.name}${m.extraPrice > 0 ? ` (+${formatMoney(m.extraPrice)})` : ''}`).join(', ');
        for (const line of wrapText(`  ${modStr}`, chars)) device.text(line);
      }
      if (item.discountAmount && item.discountAmount > 0) device.text(`  Desc: -${formatMoney(item.discountAmount)}`);
      if (item.taxAmount && item.taxAmount > 0) device.text(`  Imp: ${formatMoney(item.taxAmount)}`);
      device.text(sepLight(chars));
    }
  }

  // --- Totales ---
  device.text(sepLight(chars)).style('b').text('TOTALES').style('normal');
  if (payload.itemsTotalValue) device.text(padRight('Valor Items:', formatMoney(payload.itemsTotalValue), chars));
  if (payload.freightCost) device.text(padRight('Flete:', formatMoney(payload.freightCost), chars));
  if (payload.insuranceCost) device.text(padRight('Seguro:', formatMoney(payload.insuranceCost), chars));
  if (payload.codAmount) device.text(padRight('Contra Entrega:', formatMoney(payload.codAmount), chars));
  if (payload.totalCost) device.style('b').text(padRight('TOTAL:', formatMoney(payload.totalCost), chars)).style('normal');

  // --- Barcode ---
  device.text(sepLight(chars));
  device.align('ct');
  try {
    device.code128(tracking, { width: 2, height: 50 });
  } catch {
    device.text(`** ${tracking} **`);
  }
  device.text(tracking);

  // --- Firma ---
  device.text(sepLight(chars)).text('').text('');
  device.text('Firma Conductor:');
  device.text('________________');
  device.text('').text('');
  device.text('Firma Destinatario:');
  device.text('________________');

  // --- Footer ---
  device.text(sepLight(chars));
  for (const line of GO_ADMIN_FOOTER) {
    device.text(line);
  }

  device.feed(2).cut();
}

/**
 * Version en texto plano de la guia de envio, para impresoras 'system'.
 */
export function buildPlainTextShipmentGuide(payload: ShipmentGuidePrintPayload, paper: PaperSpec): string {
  const chars = paper.charsPerLine;
  const { date, time } = formatDateParts(payload.createdAt);
  const tracking = payload.trackingNumber || payload.shipmentNumber || payload.shipmentId;
  const lines: string[] = [];

  if (payload.businessName) lines.push(payload.businessName);
  if (payload.businessNit) lines.push(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) lines.push(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) lines.push(payload.businessAddress);

  lines.push(sep(chars));
  lines.push('GUIA DE ENVIO');
  lines.push(sep(chars));
  lines.push(`No: ${tracking}`);
  lines.push(`Fecha: ${date} ${time}`);
  if (payload.status) lines.push(`Estado: ${payload.status.toUpperCase()}`);

  lines.push(sepLight(chars));
  lines.push('REMITENTE');
  if (payload.senderName) lines.push(payload.senderName);
  if (payload.senderPhone) lines.push(`Tel: ${payload.senderPhone}`);

  lines.push(sepLight(chars));
  lines.push('DESTINATARIO');
  if (payload.receiverName) lines.push(...wrapText(payload.receiverName, chars));
  if (payload.receiverPhone) lines.push(`Tel: ${payload.receiverPhone}`);
  if (payload.receiverAddress) lines.push(...wrapText(`Dir: ${payload.receiverAddress}`, chars));
  if (payload.receiverCity) lines.push(`Ciudad: ${payload.receiverCity}`);
  if (payload.receiverInstructions) lines.push(...wrapText(`Instr: ${payload.receiverInstructions}`, chars));

  lines.push(sepLight(chars));
  lines.push('RUTA');
  if (payload.originStop) lines.push(`Origen: ${payload.originStop}`);
  if (payload.destinationStop) lines.push(`Destino: ${payload.destinationStop}`);

  if (payload.driver) {
    lines.push(sepLight(chars));
    lines.push('CONDUCTOR');
    lines.push(payload.driver.name || 'Sin asignar');
    if (payload.driver.phone) lines.push(`Tel: ${payload.driver.phone}`);
    if (payload.driver.licenseNumber) lines.push(`Lic: ${payload.driver.licenseNumber}`);
    if (payload.driver.licenseCategory) lines.push(`Cat: ${payload.driver.licenseCategory}`);
  }

  lines.push(sepLight(chars));
  lines.push('DETALLES');
  if (payload.weightKg) lines.push(padRight('Peso:', `${payload.weightKg} kg`, chars));
  if (payload.packageCount) lines.push(padRight('Paquetes:', String(payload.packageCount), chars));
  if (payload.packageType) lines.push(padRight('Tipo:', payload.packageType, chars));
  if (payload.deliveryType) lines.push(padRight('Entrega:', payload.deliveryType, chars));
  if (payload.declaredValue) lines.push(padRight('Valor Decl.:', formatMoney(payload.declaredValue), chars));
  if (payload.isFragile) lines.push('** FRAGIL **');
  if (payload.requiresSignature) lines.push('** REQUIERE FIRMA **');

  if (payload.items && payload.items.length > 0) {
    lines.push(sepLight(chars));
    lines.push('ITEMS');
    lines.push(sepLight(chars));
    for (const item of payload.items) {
      const qty = item.quantity || 1;
      const desc = item.description || '-';
      const total = item.totalValue || (qty * (item.unitValue || 0));
      lines.push(padRight(`${qty}x ${desc}`, formatMoney(total), chars));
      if (item.sku) lines.push(`  SKU: ${item.sku}`);
      if (item.weightKg) lines.push(`  Peso: ${item.weightKg} kg`);
      if (item.variantData) {
        const entries = Object.entries(item.variantData);
        if (entries.length > 0) lines.push(...wrapText(`  ${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}`, chars));
      }
      if (item.modifiers && item.modifiers.length > 0) {
        const modStr = item.modifiers.map((m) => `${m.name}${m.extraPrice > 0 ? ` (+${formatMoney(m.extraPrice)})` : ''}`).join(', ');
        lines.push(...wrapText(`  ${modStr}`, chars));
      }
      if (item.discountAmount && item.discountAmount > 0) lines.push(`  Desc: -${formatMoney(item.discountAmount)}`);
      if (item.taxAmount && item.taxAmount > 0) lines.push(`  Imp: ${formatMoney(item.taxAmount)}`);
      lines.push(sepLight(chars));
    }
  }

  lines.push(sepLight(chars));
  lines.push('TOTALES');
  if (payload.itemsTotalValue) lines.push(padRight('Valor Items:', formatMoney(payload.itemsTotalValue), chars));
  if (payload.freightCost) lines.push(padRight('Flete:', formatMoney(payload.freightCost), chars));
  if (payload.insuranceCost) lines.push(padRight('Seguro:', formatMoney(payload.insuranceCost), chars));
  if (payload.codAmount) lines.push(padRight('Contra Entrega:', formatMoney(payload.codAmount), chars));
  if (payload.totalCost) lines.push(padRight('TOTAL:', formatMoney(payload.totalCost), chars));

  lines.push(sepLight(chars));
  lines.push(`** ${tracking} **`);

  lines.push(sepLight(chars));
  lines.push('');
  lines.push('Firma Conductor:');
  lines.push('________________');
  lines.push('');
  lines.push('Firma Destinatario:');
  lines.push('________________');

  lines.push(sepLight(chars));
  for (const line of GO_ADMIN_FOOTER) {
    lines.push(line);
  }
  lines.push('\n\n');

  return lines.join('\n');
}
