import type { KitchenTicketPrintPayload, SaleTicketPrintPayload } from './types';

function formatMoney(value: number): string {
  return value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

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
  if (payload.branchName && payload.branchName !== payload.businessName) {
    device.text(payload.branchName);
  }
  if (payload.branchAddress && payload.branchAddress !== payload.businessAddress) {
    device.text(payload.branchAddress);
  }

  device
    .text('--------------------------------')
    .style('b')
    .size(1, 1)
    .text(payload.title || 'TICKET DE VENTA')
    .style('normal')
    .text('--------------------------------')
    .align('lt');

  if (payload.tableName) device.text(`Mesa: ${payload.tableName}`);
  if (payload.saleNumber) device.text(`Venta: #${payload.saleNumber}`);
  if (payload.customerName) device.text(`Cliente: ${payload.customerName}`);
  if (payload.serverName) device.text(`Mesero: ${payload.serverName}`);

  device.text(`Fecha: ${fecha}`).text('--------------------------------');

  for (const item of payload.items) {
    device.text(`${item.quantity} x ${item.productName}`);
    device.align('rt').text(formatMoney(item.total)).align('lt');
  }

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

  device
    .text('--------------------------------')
    .align('rt')
    .style('b')
    .size(1, 1)
    .text(`TOTAL: ${formatMoney(payload.total)}`)
    .style('normal')
    .size(1, 1)
    .align('lt')
    .feed(2)
    .cut();
}

/**
 * Versión en texto plano del ticket de venta, para impresoras 'system'.
 */
export function buildPlainTextSaleTicket(payload: SaleTicketPrintPayload): string {
  const fecha = new Date(payload.createdAt).toLocaleString('es-CO');
  const lines: string[] = [];

  if (payload.businessName) lines.push(payload.businessName);
  if (payload.businessNit) lines.push(`NIT: ${payload.businessNit}`);
  if (payload.businessPhone) lines.push(`Tel: ${payload.businessPhone}`);
  if (payload.businessAddress) lines.push(payload.businessAddress);
  if (payload.branchName && payload.branchName !== payload.businessName) {
    lines.push(payload.branchName);
  }
  if (payload.branchAddress && payload.branchAddress !== payload.businessAddress) {
    lines.push(payload.branchAddress);
  }

  lines.push('--------------------------------');
  lines.push(payload.title || 'TICKET DE VENTA');
  lines.push('--------------------------------');
  if (payload.tableName) lines.push(`Mesa: ${payload.tableName}`);
  if (payload.saleNumber) lines.push(`Venta: #${payload.saleNumber}`);
  if (payload.customerName) lines.push(`Cliente: ${payload.customerName}`);
  if (payload.serverName) lines.push(`Mesero: ${payload.serverName}`);
  lines.push(`Fecha: ${fecha}`);
  lines.push('--------------------------------');

  for (const item of payload.items) {
    lines.push(`${item.quantity} x ${item.productName} — ${formatMoney(item.total)}`);
  }

  lines.push('--------------------------------');
  if (payload.subtotal != null) lines.push(`Subtotal: ${formatMoney(payload.subtotal)}`);
  if (payload.discountTotal && payload.discountTotal > 0) lines.push(`Descuento: -${formatMoney(payload.discountTotal)}`);
  if (payload.taxTotal && payload.taxTotal > 0) lines.push(`Impuestos: ${formatMoney(payload.taxTotal)}`);
  lines.push('--------------------------------');
  lines.push(`TOTAL: ${formatMoney(payload.total)}`);
  lines.push('\n\n');

  return lines.join('\n');
}
