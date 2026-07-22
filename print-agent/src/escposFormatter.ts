import type { KitchenTicketPrintPayload, SaleTicketPrintPayload, SaleTicketPayment } from './types';

function formatMoney(value: number): string {
  return value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
 * Envía a un dispositivo escpos (chainable) los comandos para imprimir una
 * comanda de cocina. `device` es una instancia de `escpos.Printer` ya
 * conectada a un `escpos.<Interface>` (network/usb/bluetooth).
 */
export function printKitchenTicket(device: any, payload: KitchenTicketPrintPayload): void {
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const fecha = new Date(payload.createdAt).toLocaleString('es-CO');

  device
    .font('a')
    .align('ct')
    .style('b')
    .size(1, 1)
    .text(stationLabel)
    .style('normal')
    .text('--------------------------------')
    .align('lt')
    .text(`Ticket: #${payload.ticketId}`)
    .text(`Mesa: ${payload.tableName || '-'}`);

  if (payload.serverName) {
    device.text(`Mesero: ${payload.serverName}`);
  }

  device
    .text(`Fecha: ${fecha}`)
    .text('--------------------------------');

  for (const item of payload.items) {
    device.style('b').text(`${item.quantity} x ${item.productName}`).style('normal');

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      device.text(`  ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join(' · ')}`);
    }

    if (item.modifiers && item.modifiers.length > 0) {
      device.text(`  + ${item.modifiers.map((m) => m.name).join(', ')}`);
    }

    if (item.notes) {
      device.text(`  * ${item.notes}`);
    }
  }

  device
    .text('--------------------------------')
    .feed(2)
    .cut();
}

/**
 * Construye una versión en texto plano de la comanda, usada por el driver
 * 'system' (impresora del sistema operativo vía spooler estándar), que no
 * habla ESC/POS directamente.
 */
export function buildPlainTextTicket(payload: KitchenTicketPrintPayload): string {
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const fecha = new Date(payload.createdAt).toLocaleString('es-CO');
  const lines: string[] = [];

  lines.push(stationLabel);
  lines.push('--------------------------------');
  lines.push(`Ticket: #${payload.ticketId}`);
  lines.push(`Mesa: ${payload.tableName || '-'}`);
  if (payload.serverName) lines.push(`Mesero: ${payload.serverName}`);
  lines.push(`Fecha: ${fecha}`);
  lines.push('--------------------------------');

  for (const item of payload.items) {
    lines.push(`${item.quantity} x ${item.productName}`);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      lines.push(`  ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join(' · ')}`);
    }

    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  + ${item.modifiers.map((m) => m.name).join(', ')}`);
    }

    if (item.notes) lines.push(`  * ${item.notes}`);
  }

  lines.push('--------------------------------');
  lines.push('\n\n');

  return lines.join('\n');
}

/**
 * Imprime el ticket de venta (recibo de caja) en un dispositivo escpos.
 */
export function printSaleTicket(device: any, payload: SaleTicketPrintPayload): void {
  const fecha = new Date(payload.createdAt).toLocaleString('es-CO');

  // --- Header: datos del negocio ---
  device
    .font('a')
    .align('ct')
    .style('b')
    .size(1, 1);

  if (payload.businessName) device.text(payload.businessName);
  device.style('normal');
  if (payload.businessNit) device.text(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) device.text(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) device.text(payload.businessAddress);
  if (payload.businessCity) device.text(payload.businessCity);
  if (payload.businessEmail) device.text(payload.businessEmail);
  if (payload.businessFiscalResponsibilities && payload.businessFiscalResponsibilities.length > 0) {
    device.text(payload.businessFiscalResponsibilities.map(translateFiscalResponsibility).join(', '));
  }
  if (payload.branchName && payload.branchName !== payload.businessName) {
    device.text(payload.branchName);
  }
  if (payload.branchAddress && payload.branchAddress !== payload.businessAddress) {
    device.text(payload.branchAddress);
  }
  if (payload.branchPhone) device.text(`Tel: ${payload.branchPhone}`);

  // --- Titulo del documento ---
  device
    .text('--------------------------------')
    .style('b')
    .size(1, 1)
    .text(payload.title || 'TICKET DE VENTA')
    .style('normal')
    .text('--------------------------------')
    .align('lt');

  // --- Info del ticket ---
  if (payload.saleNumber) device.text(`Venta: #${payload.saleNumber}`);
  if (payload.tableName) device.text(`Mesa: ${payload.tableName}`);
  if (payload.cashierName) device.text(`Cajero: ${payload.cashierName}`);
  if (payload.serverName) device.text(`Mesero: ${payload.serverName}`);
  device.text(`Fecha: ${fecha}`);

  // --- Info del cliente ---
  if (payload.customerName || payload.customerDocNumber) {
    device.text('--------------------------------');
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
  if (payload.deliveryInfo) {
    device.text('--------------------------------');
    device.text(`Entrega: ${payload.deliveryInfo.type}`);
    device.text(`Direccion: ${payload.deliveryInfo.address}`);
    if (payload.deliveryInfo.driverName) device.text(`Conductor: ${payload.deliveryInfo.driverName}`);
  }

  device.text('--------------------------------');

  // --- Items ---
  for (const item of payload.items) {
    device.style('b').text(`${item.quantity} x ${item.productName}`).style('normal');
    device.align('rt').text(formatMoney(item.total)).align('lt');
    device.text(`  ${formatMoney(item.unitPrice)} c/u`);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      device.text(`  ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join(' · ')}`);
    }

    if (item.modifiers && item.modifiers.length > 0) {
      device.text(`  + ${item.modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatMoney(m.extraPrice)})` : m.name).join(', ')}`);
    }

    if (item.taxAmount && item.taxAmount > 0) {
      device.text(`  Imp: ${formatMoney(item.taxAmount)}`);
    }
    if (item.discountAmount && item.discountAmount > 0) {
      device.text(`  Desc: -${formatMoney(item.discountAmount)}`);
    }
  }

  // --- Totales ---
  device.text('--------------------------------');

  if (payload.subtotal != null) {
    device.align('lt').text('Subtotal:').align('rt').text(formatMoney(payload.subtotal)).align('lt');
  }
  if (payload.discountTotal && payload.discountTotal > 0) {
    device.align('lt').text('Descuento:').align('rt').text(`-${formatMoney(payload.discountTotal)}`).align('lt');
  }
  if (payload.taxTotal && payload.taxTotal > 0) {
    device.align('lt').text('Impuestos:').align('rt').text(formatMoney(payload.taxTotal)).align('lt');
  }
  if (payload.deliveryFee && payload.deliveryFee > 0) {
    device.align('lt').text('Envio:').align('rt').text(formatMoney(payload.deliveryFee)).align('lt');
  }
  if (payload.tipAmount && payload.tipAmount > 0) {
    device.align('lt').text('Propina:').align('rt').text(formatMoney(payload.tipAmount)).align('lt');
  }

  device
    .text('--------------------------------')
    .align('rt')
    .style('b')
    .size(1, 1)
    .text(`TOTAL: ${formatMoney(payload.total)}`)
    .style('normal')
    .size(1, 1)
    .align('lt');

  // --- Pagos ---
  if (payload.payments && payload.payments.length > 0) {
    device.text('--------------------------------');
    for (const payment of payload.payments) {
      device.align('lt').text(`${getPaymentLabel(payment)}:`).align('rt').text(formatMoney(payment.amount)).align('lt');
    }
  }

  // --- QR ---
  device.text('--------------------------------').align('ct');
  try {
    device.qrimage('https://goadmin.io', { cellSize: 3 });
  } catch {
    // Si la impresora no soporta QR, se omite
  }

  // --- Footer ---
  device
    .text('--------------------------------')
    .text('Gracias por su compra!')
    .feed(1);

  for (const line of GO_ADMIN_FOOTER) {
    device.text(line);
  }

  device.feed(2).cut();
}

/**
 * Versión en texto plano del ticket de venta, para impresoras 'system'.
 */
export function buildPlainTextSaleTicket(payload: SaleTicketPrintPayload): string {
  const fecha = new Date(payload.createdAt).toLocaleString('es-CO');
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
    lines.push(payload.branchName);
  }
  if (payload.branchAddress && payload.branchAddress !== payload.businessAddress) {
    lines.push(payload.branchAddress);
  }
  if (payload.branchPhone) lines.push(`Tel: ${payload.branchPhone}`);

  lines.push('--------------------------------');
  lines.push(payload.title || 'TICKET DE VENTA');
  lines.push('--------------------------------');

  // --- Info del ticket ---
  if (payload.saleNumber) lines.push(`Venta: #${payload.saleNumber}`);
  if (payload.tableName) lines.push(`Mesa: ${payload.tableName}`);
  if (payload.cashierName) lines.push(`Cajero: ${payload.cashierName}`);
  if (payload.serverName) lines.push(`Mesero: ${payload.serverName}`);
  lines.push(`Fecha: ${fecha}`);

  // --- Info del cliente ---
  if (payload.customerName || payload.customerDocNumber) {
    lines.push('--------------------------------');
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
    lines.push('--------------------------------');
    lines.push(`Entrega: ${payload.deliveryInfo.type}`);
    lines.push(`Direccion: ${payload.deliveryInfo.address}`);
    if (payload.deliveryInfo.driverName) lines.push(`Conductor: ${payload.deliveryInfo.driverName}`);
  }

  lines.push('--------------------------------');

  // --- Items ---
  for (const item of payload.items) {
    lines.push(`${item.quantity} x ${item.productName} — ${formatMoney(item.total)}`);
    lines.push(`  ${formatMoney(item.unitPrice)} c/u`);

    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    if (variantEntries.length > 0) {
      lines.push(`  ${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join(' · ')}`);
    }

    if (item.modifiers && item.modifiers.length > 0) {
      lines.push(`  + ${item.modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatMoney(m.extraPrice)})` : m.name).join(', ')}`);
    }

    if (item.taxAmount && item.taxAmount > 0) lines.push(`  Imp: ${formatMoney(item.taxAmount)}`);
    if (item.discountAmount && item.discountAmount > 0) lines.push(`  Desc: -${formatMoney(item.discountAmount)}`);
  }

  // --- Totales ---
  lines.push('--------------------------------');
  if (payload.subtotal != null) lines.push(`Subtotal: ${formatMoney(payload.subtotal)}`);
  if (payload.discountTotal && payload.discountTotal > 0) lines.push(`Descuento: -${formatMoney(payload.discountTotal)}`);
  if (payload.taxTotal && payload.taxTotal > 0) lines.push(`Impuestos: ${formatMoney(payload.taxTotal)}`);
  if (payload.deliveryFee && payload.deliveryFee > 0) lines.push(`Envio: ${formatMoney(payload.deliveryFee)}`);
  if (payload.tipAmount && payload.tipAmount > 0) lines.push(`Propina: ${formatMoney(payload.tipAmount)}`);
  lines.push('--------------------------------');
  lines.push(`TOTAL: ${formatMoney(payload.total)}`);

  // --- Pagos ---
  if (payload.payments && payload.payments.length > 0) {
    lines.push('--------------------------------');
    for (const payment of payload.payments) {
      lines.push(`${getPaymentLabel(payment)}: ${formatMoney(payment.amount)}`);
    }
  }

  // --- Footer ---
  lines.push('--------------------------------');
  lines.push('Gracias por su compra!');
  lines.push('');
  for (const line of GO_ADMIN_FOOTER) {
    lines.push(line);
  }
  lines.push('\n\n');

  return lines.join('\n');
}
