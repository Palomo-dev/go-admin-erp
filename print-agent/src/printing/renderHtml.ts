import type { KitchenTicketPrintPayload, SaleTicketPrintPayload, ShipmentGuidePrintPayload } from './types';
import type { PaperSpec } from './paper';

function formatMoney(value: number): string {
  // `style: 'currency'` separa el simbolo del importe con U+00A0 (espacio
  // duro). Ese byte es 0xA0, que las impresoras termicas interpretan en CP437
  // como "a" acentuada: en papel salia "$a36.480". Se normaliza a espacio
  // normal, que es identico en pantalla y correcto en la impresora.
  return value
    .toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 })
    .replace(/\u00a0/g, ' ');
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

// NOTA sobre impresoras térmicas:
// - Todo debe ser NEGRO PURO (#000). Los grises se difuminan (dithering) y salen
//   casi invisibles en papel térmico.
// - Fuentes < 10px resultan ilegibles a 203dpi.
// - El ancho se define UNA sola vez, en `@page size`. Poner además un ancho en
//   `html`/`body` crea dos fuentes de verdad que se contradicen: Chromium
//   maqueta con el tamaño de página y el driver escala el resultado, lo que
//   produce texto diminuto y desplazado. `body` usa width: 100% para llenar
//   exactamente la página que declara `@page`.
// - `size` usa el área IMPRIMIBLE (72mm para 80mm), porque el driver de la
//   impresora del sistema ya recorta al área del cabezal. Usar el ancho del
//   rollo provocaba margenes dobles y recortes en el lado derecho.
function buildCss(paper: PaperSpec): string {
  return `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  /* La pagina mide el area imprimible real. El driver ya recorta al area del
     cabezal, asi que usar el ancho del rollo provocaba margenes dobles. */
  @page { size: ${paper.printableMm}mm auto; margin: 0; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    width: 100%;
    margin: 0;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 12px;
    line-height: 1.3;
    color: #000;
    background: #fff;
    /* Padding lateral minimo: el driver ya respeta el area imprimible. */
    padding: 6px 8px;
    font-weight: 500;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #000;
    padding-bottom: 5px;
    margin-bottom: 5px;
  }
  .business-logo {
    /* El alto se acota porque el rollo es continuo: un logo grande no rompe
       la maquetacion, pero se come varios centimetros de papel en cada
       ticket. En 58mm se reduce proporcionalmente via max-width. */
    max-width: 60%;
    max-height: 90px;
    margin: 0 auto 4px;
    display: block;
    /* El termico solo imprime negro: se fuerza el contraste para que un logo
       de color no salga como una mancha gris ilegible. */
    filter: grayscale(100%) contrast(140%);
  }
  .business-name {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }
  .business-info {
    font-size: 11px;
    color: #000;
    margin-bottom: 1px;
  }
  .branch-name {
    font-size: 13px;
    font-weight: 700;
    margin-top: 3px;
    color: #000;
  }
  .banner {
    text-align: center;
    font-size: 15px;
    font-weight: 800;
    border: 2px solid #000;
    padding: 4px;
    margin: 5px 0;
    letter-spacing: 1px;
  }
  .meta {
    border-top: 1px solid #000;
    border-bottom: 1px solid #000;
    padding: 4px 0;
    margin-bottom: 5px;
    font-size: 12px;
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 2px;
  }
  .meta-label { font-weight: 700; color: #000; }
  .meta-value { color: #000; }
  .section-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    border-bottom: 1px solid #000;
    padding-bottom: 2px;
    margin: 5px 0 3px;
  }
  .items-header {
    display: flex;
    justify-content: space-between;
    border-bottom: 2px solid #000;
    padding-bottom: 2px;
    margin-bottom: 4px;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
  }
  .item {
    margin-bottom: 4px;
    padding-bottom: 3px;
    border-bottom: 1px solid #000;
  }
  .item-line {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 1px;
  }
  .item-name {
    font-weight: 700;
    font-size: 13px;
    flex: 1;
  }
  .item-total {
    font-weight: 700;
    font-size: 13px;
    white-space: nowrap;
  }
  .item-detail {
    font-size: 11px;
    color: #000;
    margin-top: 1px;
    padding-left: 6px;
  }
  .item-variant {
    font-weight: 700;
    color: #000;
  }
  .item-modifier {
    font-weight: 700;
    color: #000;
  }
  .item-notes {
    font-weight: 700;
    color: #000;
    margin-top: 2px;
    padding-left: 6px;
    font-size: 12px;
  }
  .totals {
    border-top: 2px solid #000;
    margin-top: 6px;
    padding-top: 5px;
  }
  .total-line {
    display: flex;
    justify-content: space-between;
    margin-bottom: 3px;
    font-size: 13px;
  }
  .total-final {
    font-weight: 800;
    font-size: 18px;
    border-top: 2px solid #000;
    padding-top: 5px;
    margin-top: 5px;
  }
  .payments {
    margin-top: 5px;
    padding-top: 4px;
    border-top: 1px solid #000;
  }
  .payment-line {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    margin-bottom: 2px;
  }
  .footer {
    text-align: center;
    margin-top: 7px;
    font-size: 11px;
    border-top: 1px solid #000;
    padding-top: 6px;
    color: #000;
  }
  .footer-banner {
    font-weight: 800;
    font-size: 14px;
    margin-bottom: 3px;
  }
  .footer-brand {
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid #000;
    font-size: 10px;
    color: #000;
  }
  .qr-container {
    text-align: center;
    margin-top: 5px;
  }
  .customer-box {
    border: 1px solid #000;
    padding: 4px;
    margin: 4px 0;
    font-size: 12px;
  }
  .customer-box .label { font-weight: 700; color: #000; }
  .delivery-box {
    border: 1px solid #000;
    padding: 4px;
    margin: 4px 0;
    font-size: 12px;
  }
  .delivery-box .label { font-weight: 700; color: #000; }
  .delivery-title {
    font-weight: 800;
    text-align: center;
    border-bottom: 1px solid #000;
    margin-bottom: 3px;
    padding-bottom: 2px;
  }
  .delivery-instructions {
    margin-top: 3px;
    padding-top: 3px;
    border-top: 1px dashed #000;
  }
  .change-line {
    font-weight: 800;
    font-size: 14px;
    border-top: 1px solid #000;
    margin-top: 3px;
    padding-top: 3px;
  }
`;
}

export function buildSaleTicketHTML(payload: SaleTicketPrintPayload, paper: PaperSpec): string {
  const isPreCuenta = (payload.title || '').toUpperCase().includes('PRE-CUENTA') || (payload.title || '').toUpperCase().includes('PRE CUENTA');
  const title = payload.title || 'TICKET DE VENTA';
  const dateObj = new Date(payload.createdAt);
  const dateStr = dateObj.toLocaleDateString('es-CO');
  const timeStr = dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
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

  // Bloque de entrega: es lo que lee el conductor, asi que va completo aunque
  // ocupe papel. Las instrucciones se separan porque suelen ser el dato que
  // evita la llamada de "no encuentro la direccion".
  const delivery = payload.deliveryInfo;
  const deliveryHTML = delivery ? `
    <div class="delivery-box">
      <div class="delivery-title">DATOS DE ENTREGA</div>
      <div><span class="label">Tipo:</span> ${delivery.type}</div>
      <div><span class="label">Direccion:</span> ${delivery.address}</div>
      ${delivery.city ? `<div><span class="label">Ciudad:</span> ${delivery.city}</div>` : ''}
      ${delivery.contactName ? `<div><span class="label">Recibe:</span> ${delivery.contactName}</div>` : ''}
      ${delivery.contactPhone ? `<div><span class="label">Tel:</span> ${delivery.contactPhone}</div>` : ''}
      ${delivery.driverName ? `<div><span class="label">Conductor:</span> ${delivery.driverName}</div>` : ''}
      ${delivery.instructions ? `<div class="delivery-instructions"><span class="label">Indicaciones:</span> ${delivery.instructions}</div>` : ''}
    </div>` : '';

  // Con desglose (IVA, ICA...) se imprime una linea por impuesto; sin el, solo
  // el agregado. El rotulo cambia si el precio ya lleva el impuesto incluido.
  const taxSuffix = payload.taxIncluded ? ' (incluido)' : '';
  const taxHTML = payload.taxLines && payload.taxLines.length > 0
    ? payload.taxLines
        .map(t => `<div class="total-line"><span>${t.name}${taxSuffix}:</span><span>${formatMoney(t.amount)}</span></div>`)
        .join('')
    : (payload.taxTotal && payload.taxTotal > 0
        ? `<div class="total-line"><span>Impuestos${taxSuffix}:</span><span>${formatMoney(payload.taxTotal)}</span></div>`
        : '');

  const totalsHTML = `
    <div class="totals">
      ${payload.subtotal != null ? `<div class="total-line"><span>Subtotal:</span><span>${formatMoney(payload.subtotal)}</span></div>` : ''}
      ${payload.discountTotal && payload.discountTotal > 0 ? `<div class="total-line"><span>Descuento:</span><span>-${formatMoney(payload.discountTotal)}</span></div>` : ''}
      ${taxHTML}
      ${payload.deliveryFee && payload.deliveryFee > 0 ? `<div class="total-line"><span>Envio:</span><span>${formatMoney(payload.deliveryFee)}</span></div>` : ''}
      ${payload.tipAmount && payload.tipAmount > 0 ? `<div class="total-line"><span>Propina:</span><span>${formatMoney(payload.tipAmount)}</span></div>` : ''}
      <div class="total-line total-final"><span>TOTAL:</span><span>${formatMoney(payload.total)}</span></div>
    </div>`;

  // El vuelto solo tiene sentido si hubo pago, por eso vive dentro de este
  // bloque y no en los totales.
  const hasPayments = !!payload.payments && payload.payments.length > 0;
  const paymentsHTML = hasPayments ? `
    <div class="payments">
      ${payload.payments!.map(p => `<div class="payment-line"><span>${p.methodName || p.method || 'Efectivo'}:</span><span>${formatMoney(p.amount)}</span></div>`).join('')}
      ${payload.totalPaid && payload.totalPaid > 0 ? `<div class="payment-line"><span>Recibido:</span><span>${formatMoney(payload.totalPaid)}</span></div>` : ''}
      ${payload.changeAmount && payload.changeAmount > 0 ? `<div class="payment-line change-line"><span>CAMBIO:</span><span>${formatMoney(payload.changeAmount)}</span></div>` : ''}
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${buildCss(paper)}</style>
</head>
<body>
  <div class="header">
    ${payload.businessLogoUrl ? `<img class="business-logo" src="${payload.businessLogoUrl}" alt="" />` : ''}
    ${payload.businessName ? `<div class="business-name">${payload.businessName}</div>` : ''}
    ${payload.businessNit ? `<div class="business-info">NIT: ${payload.businessNit}</div>` : ''}
    ${payload.businessAddress ? `<div class="business-info">${payload.businessAddress}</div>` : ''}
    ${payload.businessCity ? `<div class="business-info">${payload.businessCity}</div>` : ''}
    ${payload.businessPhone ? `<div class="business-info">Tel: ${payload.businessPhone}</div>` : ''}
    ${payload.businessEmail ? `<div class="business-info">${payload.businessEmail}</div>` : ''}
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
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=50x50&data=https://goadmin.io" alt="QR" style="width:50px;height:50px" />
    </div>
    <div class="footer-brand">
      <div>GO Admin S.A.S | NIT: 901479683-5</div>
      <div>www.goadmin.io | 3113195711 | servicio@goadmin.io</div>
    </div>
  </div>
</body>
</html>`;
}

function buildKitchenTicketBody(payload: KitchenTicketPrintPayload): string {
  const stationLabel = STATION_LABELS[payload.station] || payload.station.toUpperCase();
  const dateObj = new Date(payload.createdAt);
  const dateStr = dateObj.toLocaleDateString('es-CO');
  const timeStr = dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });
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

  return `
  <div class="header">
    ${payload.businessName ? `<div class="business-name">${payload.businessName}</div>` : ''}
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
  </div>`;
}

/** Envuelve uno o varios cuerpos en un documento imprimible completo. */
function wrapDocument(title: string, paper: PaperSpec, bodies: string[]): string {
  // Cada comanda ocupa su propia hoja: en papel continuo eso se traduce en un
  // corte por estacion, que es como salen tambien por impresora fisica.
  const sections = bodies
    .map((body, i) => `<div${i < bodies.length - 1 ? ' style="page-break-after: always"' : ''}>${body}</div>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${buildCss(paper)}</style>
</head>
<body>
${sections}
</body>
</html>`;
}

export function buildKitchenTicketHTML(payload: KitchenTicketPrintPayload, paper: PaperSpec): string {
  return wrapDocument(`Comanda #${payload.ticketId}`, paper, [buildKitchenTicketBody(payload)]);
}

/**
 * Varias comandas en un unico documento, una por estacion.
 *
 * Lo usa la impresion por navegador: al no haber una impresora por estacion,
 * se emite un solo documento con un salto de pagina entre comandas.
 */
export function buildKitchenTicketsHTML(payloads: KitchenTicketPrintPayload[], paper: PaperSpec): string {
  const title = payloads.length === 1 ? `Comanda #${payloads[0].ticketId}` : 'Comandas';
  return wrapDocument(title, paper, payloads.map(buildKitchenTicketBody));
}

function buildShipmentGuideBody(payload: ShipmentGuidePrintPayload): string {
  const tracking = payload.trackingNumber || payload.shipmentNumber || payload.shipmentId;
  const dateStr = new Date(payload.createdAt).toLocaleDateString('es-CO');
  const timeStr = new Date(payload.createdAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false });

  const itemsHtml = (payload.items || []).map((item) => {
    const qty = item.quantity || 1;
    const desc = item.description || '-';
    const total = item.totalValue || (qty * (item.unitValue || 0));
    let details = '';
    if (item.sku) details += `<div style="font-size:9px;color:#555">SKU: ${item.sku}</div>`;
    if (item.weightKg) details += `<div style="font-size:9px;color:#555">Peso: ${item.weightKg} kg</div>`;
    if (item.variantData) {
      const entries = Object.entries(item.variantData);
      if (entries.length > 0) details += `<div style="font-size:9px;color:#555;word-break:break-word;overflow-wrap:anywhere">${entries.map(([k, v]) => `${k}: ${v}`).join(', ')}</div>`;
    }
    if (item.modifiers && item.modifiers.length > 0) {
      const modStr = item.modifiers.map((m) => `${m.name}${m.extraPrice > 0 ? ` (+${formatMoney(m.extraPrice)})` : ''}`).join(', ');
      details += `<div style="font-size:9px;color:#555;word-break:break-word;overflow-wrap:anywhere">${modStr}</div>`;
    }
    if (item.discountAmount && item.discountAmount > 0) details += `<div style="font-size:9px;color:#555">Desc: -${formatMoney(item.discountAmount)}</div>`;
    if (item.taxAmount && item.taxAmount > 0) details += `<div style="font-size:9px;color:#555">Imp: ${formatMoney(item.taxAmount)}</div>`;
    return `<div style="border-bottom:1px dashed #ccc;padding:2px 0">
      <div style="display:flex;justify-content:space-between;font-weight:bold"><span>${qty}x ${desc}</span><span>${formatMoney(total)}</span></div>
      ${details}
    </div>`;
  }).join('');

  const totalsHtml = `
    <div class="totals">
      ${payload.itemsTotalValue ? `<div class="total-line"><span>Valor Items:</span><span>${formatMoney(payload.itemsTotalValue)}</span></div>` : ''}
      ${payload.freightCost ? `<div class="total-line"><span>Flete:</span><span>${formatMoney(payload.freightCost)}</span></div>` : ''}
      ${payload.insuranceCost ? `<div class="total-line"><span>Seguro:</span><span>${formatMoney(payload.insuranceCost)}</span></div>` : ''}
      ${payload.codAmount ? `<div class="total-line"><span>Contra Entrega:</span><span>${formatMoney(payload.codAmount)}</span></div>` : ''}
      ${payload.totalCost ? `<div class="total-line" style="font-weight:bold;font-size:12px"><span>TOTAL:</span><span>${formatMoney(payload.totalCost)}</span></div>` : ''}
    </div>`;

  const driverHtml = payload.driver ? `
    <div style="border-top:1px solid #000;margin-top:4px;padding-top:2px;font-weight:bold">CONDUCTOR</div>
    <div>${payload.driver.name || 'Sin asignar'}</div>
    ${payload.driver.phone ? `<div style="font-size:10px">Tel: ${payload.driver.phone}</div>` : ''}
    ${payload.driver.licenseNumber ? `<div style="font-size:10px">Lic: ${payload.driver.licenseNumber}${payload.driver.licenseCategory ? ` (${payload.driver.licenseCategory})` : ''}</div>` : ''}
  ` : '';

  return `
  <div style="text-align:center;font-weight:bold;font-size:14px">${payload.businessName || ''}</div>
  ${payload.businessNit ? `<div style="font-size:10px">NIT: ${payload.businessNit}</div>` : ''}
  ${payload.businessPhone ? `<div style="font-size:10px">Tel: ${payload.businessPhone}</div>` : ''}
  ${payload.businessAddress ? `<div style="font-size:10px">${payload.businessAddress}</div>` : ''}
  <div style="border-top:2px solid #000;border-bottom:2px solid #000;text-align:center;font-weight:bold;font-size:16px;margin:4px 0;padding:2px 0">GUIA DE ENVIO</div>
  <div style="font-weight:bold">No: ${tracking}</div>
  <div style="font-size:10px">Fecha: ${dateStr} ${timeStr}</div>
  ${payload.status ? `<div style="font-size:10px">Estado: ${payload.status.toUpperCase()}</div>` : ''}
  <div style="border-top:1px solid #000;margin-top:4px;padding-top:2px;font-weight:bold">REMITENTE</div>
  <div>${payload.senderName || '-'}</div>
  ${payload.senderPhone ? `<div style="font-size:10px">Tel: ${payload.senderPhone}</div>` : ''}
  <div style="border-top:1px solid #000;margin-top:4px;padding-top:2px;font-weight:bold">DESTINATARIO</div>
  <div>${payload.receiverName || '-'}</div>
  ${payload.receiverPhone ? `<div style="font-size:10px">Tel: ${payload.receiverPhone}</div>` : ''}
  ${payload.receiverAddress ? `<div style="font-size:10px;word-break:break-word;overflow-wrap:anywhere">Dir: ${payload.receiverAddress}</div>` : ''}
  ${payload.receiverCity ? `<div style="font-size:10px">Ciudad: ${payload.receiverCity}</div>` : ''}
  ${payload.receiverInstructions ? `<div style="font-size:10px;word-break:break-word;overflow-wrap:anywhere">Instr: ${payload.receiverInstructions}</div>` : ''}
  <div style="border-top:1px solid #000;margin-top:4px;padding-top:2px;font-weight:bold">RUTA</div>
  <div style="font-size:10px">Origen: ${payload.originStop || '-'} -> Destino: ${payload.destinationStop || '-'}</div>
  ${driverHtml}
  <div style="border-top:1px solid #000;margin-top:4px;padding-top:2px;font-weight:bold">DETALLES</div>
  <div style="font-size:10px">
    ${payload.weightKg ? `Peso: ${payload.weightKg} kg | ` : ''}Paquetes: ${payload.packageCount || 1}
    ${payload.packageType ? `| Tipo: ${payload.packageType}` : ''}
    ${payload.deliveryType ? `| Entrega: ${payload.deliveryType}` : ''}
  </div>
  ${payload.declaredValue ? `<div style="font-size:10px">Valor Declarado: ${formatMoney(payload.declaredValue)}</div>` : ''}
  ${payload.isFragile ? '<div style="font-weight:bold">** FRAGIL **</div>' : ''}
  ${payload.requiresSignature ? '<div style="font-weight:bold">** REQUIERE FIRMA **</div>' : ''}
  ${itemsHtml ? `<div style="border-top:1px solid #000;margin-top:4px;padding-top:2px;font-weight:bold">ITEMS</div>${itemsHtml}` : ''}
  ${totalsHtml}
  <div style="text-align:center;margin:6px 0">
    <svg data-barcode="${tracking}"></svg>
    <div style="font-size:10px;margin-top:2px">${tracking}</div>
  </div>
  <div style="border-top:1px dashed #000;margin-top:8px;padding-top:8px">
    <div style="margin-bottom:24px">Firma Conductor:<br>________________</div>
    <div>Firma Destinatario:<br>________________</div>
  </div>`;
}

export function buildShipmentGuideHTML(payload: ShipmentGuidePrintPayload, paper: PaperSpec): string {
  return wrapDocument(`Guia ${payload.trackingNumber || payload.shipmentId}`, paper, [buildShipmentGuideBody(payload)]);
}

export function buildShipmentGuidesHTML(payloads: ShipmentGuidePrintPayload[], paper: PaperSpec): string {
  const title = payloads.length === 1 ? `Guia ${payloads[0].trackingNumber || payloads[0].shipmentId}` : `Guias (${payloads.length})`;
  return wrapDocument(title, paper, payloads.map(buildShipmentGuideBody));
}
