import type { KitchenTicketPrintPayload, SaleTicketPrintPayload } from './types';

function formatMoney(value: number): string {
  return value.toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

const FISCAL_LABELS: Record<string, string> = {
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

function translateFiscal(code: string): string {
  return FISCAL_LABELS[code] || code;
}

const STATION_LABELS: Record<string, string> = {
  hot_kitchen: 'COCINA CALIENTE',
  cold_kitchen: 'COCINA FRÍA',
  bar: 'BAR',
  cashier: 'CAJA',
  all: 'COMANDA',
};

const SHARED_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @media print {
    @page { margin: 4mm; size: 80mm auto; }
    body { -webkit-print-color-adjust: exact; }
  }
  body {
    width: 80mm;
    margin: 0 auto;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.4;
    color: #1a1a1a;
    background: #fff;
    padding: 6mm;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
  .business-name {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }
  .business-info {
    font-size: 9px;
    color: #555;
    margin-bottom: 1px;
  }
  .branch-name {
    font-size: 11px;
    font-weight: 700;
    margin-top: 4px;
    color: #333;
  }
  .banner {
    text-align: center;
    font-size: 14px;
    font-weight: 800;
    border: 2px solid #1a1a1a;
    padding: 5px;
    margin: 6px 0;
    letter-spacing: 2px;
  }
  .meta {
    border-top: 1px dashed #999;
    border-bottom: 1px dashed #999;
    padding: 5px 0;
    margin-bottom: 6px;
    font-size: 10px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .meta-label { font-weight: 700; color: #333; }
  .meta-value { color: #555; }
  .section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    border-bottom: 1px solid #1a1a1a;
    padding-bottom: 2px;
    margin: 6px 0 4px;
  }
  .items-header {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #1a1a1a;
    padding-bottom: 3px;
    margin-bottom: 4px;
    font-weight: 700;
    font-size: 9px;
    text-transform: uppercase;
  }
  .item {
    margin-bottom: 5px;
    padding-bottom: 4px;
    border-bottom: 1px dotted #ddd;
  }
  .item-line {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1px;
  }
  .item-name {
    font-weight: 700;
    font-size: 11px;
  }
  .item-total {
    font-weight: 700;
    font-size: 11px;
  }
  .item-detail {
    font-size: 9px;
    color: #666;
    margin-top: 1px;
    padding-left: 4px;
  }
  .item-variant {
    font-weight: 600;
    color: #444;
  }
  .item-modifier {
    font-weight: 600;
    color: #2c7a2c;
  }
  .item-notes {
    font-style: italic;
    color: #b8860b;
    margin-top: 1px;
  }
  .totals {
    border-top: 2px solid #1a1a1a;
    margin-top: 8px;
    padding-top: 6px;
  }
  .total-line {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
    font-size: 11px;
  }
  .total-final {
    font-weight: 800;
    font-size: 15px;
    border-top: 2px solid #1a1a1a;
    padding-top: 5px;
    margin-top: 5px;
  }
  .payments {
    margin-top: 6px;
    padding-top: 4px;
    border-top: 1px dashed #999;
  }
  .payment-line {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    margin-bottom: 2px;
  }
  .footer {
    text-align: center;
    margin-top: 10px;
    font-size: 9px;
    border-top: 1px dashed #999;
    padding-top: 8px;
    color: #555;
  }
  .footer-banner {
    font-weight: 800;
    font-size: 11px;
    margin-bottom: 3px;
  }
  .footer-brand {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px dotted #ccc;
    font-size: 8px;
    color: #888;
  }
  .qr-container {
    text-align: center;
    margin-top: 6px;
  }
  .customer-box {
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 5px;
    margin: 4px 0;
    font-size: 10px;
  }
  .customer-box .label { font-weight: 700; color: #333; }
  .delivery-box {
    border: 1px dashed #999;
    border-radius: 3px;
    padding: 5px;
    margin: 4px 0;
    font-size: 10px;
  }
`;

export function buildSaleTicketHTML(payload: SaleTicketPrintPayload): string {
  const isPreCuenta = (payload.title || '').toUpperCase().includes('PRE-CUENTA') || (payload.title || '').toUpperCase().includes('PRE CUENTA');
  const title = payload.title || 'TICKET DE VENTA';
  const dateObj = new Date(payload.createdAt);
  const dateStr = dateObj.toLocaleDateString('es-CO');
  const timeStr = dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const itemCount = payload.items.reduce((sum, i) => sum + i.quantity, 0);

  const businessFiscal = payload.businessFiscalResponsibilities?.map(translateFiscal).join(', ') || '';
  const customerFiscal = payload.customerFiscalResponsibilities?.map(translateFiscal).join(', ') || '';

  const itemsHTML = payload.items.map(item => {
    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    const variantLine = variantEntries.length > 0
      ? `<div class="item-detail item-variant">${variantEntries.map(([a, v]) => `${a}: ${v}`).join(' &middot; ')}</div>`
      : '';

    const modifiers = item.modifiers || [];
    const modifierLine = modifiers.length > 0
      ? `<div class="item-detail item-modifier">+ ${modifiers.map(m => m.extraPrice > 0 ? `${m.name} (+${formatMoney(m.extraPrice)})` : m.name).join(', ')}</div>`
      : '';

    const taxLine = item.taxAmount && item.taxAmount > 0
      ? `<div class="item-detail">Imp: ${formatMoney(item.taxAmount)}</div>`
      : '';
    const discLine = item.discountAmount && item.discountAmount > 0
      ? `<div class="item-detail">Desc: -${formatMoney(item.discountAmount)}</div>`
      : '';

    return `
    <div class="item">
      <div class="item-line">
        <span class="item-name">${item.quantity}x ${item.productName}</span>
        <span class="item-total">${formatMoney(item.total)}</span>
      </div>
      <div class="item-detail">${formatMoney(item.unitPrice)} c/u</div>
      ${variantLine}
      ${modifierLine}
      ${taxLine}
      ${discLine}
    </div>`;
  }).join('');

  const customerHTML = (payload.customerName || payload.customerDocNumber) ? `
    <div class="customer-box">
      ${payload.customerName ? `<div><span class="label">Cliente:</span> ${payload.customerName}</div>` : ''}
      ${payload.customerDocType && payload.customerDocNumber ? `<div><span class="label">${payload.customerDocType}:</span> ${payload.customerDocNumber}</div>` : ''}
      ${payload.customerPhone ? `<div><span class="label">Tel:</span> ${payload.customerPhone}</div>` : ''}
      ${payload.customerAddress ? `<div><span class="label">Dir:</span> ${payload.customerAddress}</div>` : ''}
      ${customerFiscal ? `<div><span class="label">Regimen:</span> ${customerFiscal}</div>` : ''}
    </div>` : '';

  const deliveryHTML = payload.deliveryInfo ? `
    <div class="delivery-box">
      <div><span class="label">Entrega:</span> ${payload.deliveryInfo.type}</div>
      <div><span class="label">Direccion:</span> ${payload.deliveryInfo.address}</div>
      ${payload.deliveryInfo.driverName ? `<div><span class="label">Conductor:</span> ${payload.deliveryInfo.driverName}</div>` : ''}
    </div>` : '';

  const totalsHTML = `
    <div class="totals">
      ${payload.subtotal != null ? `<div class="total-line"><span>Subtotal:</span><span>${formatMoney(payload.subtotal)}</span></div>` : ''}
      ${payload.discountTotal && payload.discountTotal > 0 ? `<div class="total-line"><span>Descuento:</span><span>-${formatMoney(payload.discountTotal)}</span></div>` : ''}
      ${payload.taxTotal && payload.taxTotal > 0 ? `<div class="total-line"><span>Impuestos:</span><span>${formatMoney(payload.taxTotal)}</span></div>` : ''}
      ${payload.deliveryFee && payload.deliveryFee > 0 ? `<div class="total-line"><span>Envio:</span><span>${formatMoney(payload.deliveryFee)}</span></div>` : ''}
      ${payload.tipAmount && payload.tipAmount > 0 ? `<div class="total-line"><span>Propina:</span><span>${formatMoney(payload.tipAmount)}</span></div>` : ''}
      <div class="total-line total-final"><span>TOTAL:</span><span>${formatMoney(payload.total)}</span></div>
    </div>`;

  const paymentsHTML = payload.payments && payload.payments.length > 0 ? `
    <div class="payments">
      ${payload.payments.map(p => `<div class="payment-line"><span>${p.methodName || p.method || 'Efectivo'}:</span><span>${formatMoney(p.amount)}</span></div>`).join('')}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="header">
    <div class="business-name">${payload.businessName || 'Restaurante'}</div>
    ${payload.businessNit ? `<div class="business-info">NIT: ${payload.businessNit}</div>` : ''}
    ${payload.businessAddress ? `<div class="business-info">${payload.businessAddress}</div>` : ''}
    ${payload.businessCity ? `<div class="business-info">${payload.businessCity}</div>` : ''}
    ${payload.businessPhone ? `<div class="business-info">Tel: ${payload.businessPhone}</div>` : ''}
    ${businessFiscal ? `<div class="business-info">Regimen: ${businessFiscal}</div>` : ''}
    ${payload.branchName && payload.branchName !== payload.businessName ? `<div class="branch-name">Sucursal: ${payload.branchName}</div>` : ''}
    ${payload.branchAddress && payload.branchAddress !== payload.businessAddress ? `<div class="business-info">${payload.branchAddress}</div>` : ''}
    ${payload.branchPhone ? `<div class="business-info">Tel: ${payload.branchPhone}</div>` : ''}
  </div>

  <div class="banner">${title}</div>

  <div class="meta">
    ${payload.saleNumber ? `<div class="meta-row"><span class="meta-label">Venta:</span><span class="meta-value">#${payload.saleNumber}</span></div>` : ''}
    ${payload.tableName ? `<div class="meta-row"><span class="meta-label">Mesa:</span><span class="meta-value">${payload.tableName}</span></div>` : ''}
    <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${dateStr} ${timeStr}</span></div>
    <div class="meta-row"><span class="meta-label">Items:</span><span class="meta-value">${payload.items.length} (${itemCount} unidades)</span></div>
    ${payload.cashierName ? `<div class="meta-row"><span class="meta-label">Cajero:</span><span class="meta-value">${payload.cashierName}</span></div>` : ''}
    ${payload.serverName ? `<div class="meta-row"><span class="meta-label">Mesero:</span><span class="meta-value">${payload.serverName}</span></div>` : ''}
  </div>

  ${customerHTML}
  ${deliveryHTML}

  <div class="items-header">
    <span>Descripcion</span>
    <span>Total</span>
  </div>

  ${itemsHTML}

  ${totalsHTML}
  ${paymentsHTML}

  <div class="footer">
    ${isPreCuenta
      ? `<div class="footer-banner">*** NO ES FACTURA ***</div>
         <div>Documento solo informativo</div>
         <div style="margin-top:3px">Gracias por su preferencia!</div>`
      : `<div>Gracias por su compra!</div>`
    }
    <div class="qr-container">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=https://goadmin.io" alt="QR" style="width:70px;height:70px" />
    </div>
    <div class="footer-brand">
      <div>GO Admin S.A.S | NIT: 901479683-5</div>
      <div>www.goadmin.io | 3113195711 | servicio@goadmin.io</div>
    </div>
  </div>
</body>
</html>`;
}

export function buildKitchenTicketHTML(payload: KitchenTicketPrintPayload): string {
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const dateObj = new Date(payload.createdAt);
  const dateStr = dateObj.toLocaleDateString('es-CO');
  const timeStr = dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const itemCount = payload.items.reduce((sum, i) => sum + i.quantity, 0);

  const itemsHTML = payload.items.map(item => {
    const variantEntries = item.variantData ? Object.entries(item.variantData).filter(([, v]) => !!v) : [];
    const variantLine = variantEntries.length > 0
      ? `<div class="item-detail item-variant">${variantEntries.map(([a, v]) => `${a}: ${v}`).join(' &middot; ')}</div>`
      : '';

    const modifiers = item.modifiers || [];
    const modifierLine = modifiers.length > 0
      ? `<div class="item-detail item-modifier">+ ${modifiers.map(m => m.name).join(', ')}</div>`
      : '';

    const notesLine = item.notes
      ? `<div class="item-notes">&gt;&gt; ${item.notes}</div>`
      : '';

    return `
    <div class="item">
      <div class="item-line">
        <span class="item-name">${item.quantity}x ${item.productName}</span>
      </div>
      ${variantLine}
      ${modifierLine}
      ${notesLine}
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Comanda #${payload.ticketId}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="header">
    <div class="business-name">${payload.businessName || 'Restaurante'}</div>
    ${payload.branchName && payload.branchName !== payload.businessName ? `<div class="branch-name">${payload.branchName}</div>` : ''}
  </div>

  <div class="banner">*** COMANDA ***</div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Estacion:</span><span class="meta-value">${stationLabel}</span></div>
    <div class="meta-row"><span class="meta-label">Ticket:</span><span class="meta-value">#${payload.ticketId}</span></div>
    <div class="meta-row"><span class="meta-label">Mesa:</span><span class="meta-value">${payload.tableName || '-'}</span></div>
    <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${dateStr} ${timeStr}</span></div>
    <div class="meta-row"><span class="meta-label">Items:</span><span class="meta-value">${payload.items.length} (${itemCount} unidades)</span></div>
    ${payload.serverName ? `<div class="meta-row"><span class="meta-label">Mesero:</span><span class="meta-value">${payload.serverName}</span></div>` : ''}
  </div>

  <div class="items-header">
    <span>Descripcion</span>
    <span>Cant.</span>
  </div>

  ${itemsHTML}

  <div class="footer">
    <div>Comanda generada por GO Admin</div>
    <div style="margin-top:3px;font-size:8px;color:#888">${dateStr} ${timeStr}</div>
  </div>
</body>
</html>`;
}
