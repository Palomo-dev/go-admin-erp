import type { KitchenTicketPrintPayload, SaleTicketPrintPayload, ShipmentGuidePrintPayload, ElectronicInvoicePrintPayload } from './types';
import { moneyFormatter } from './money';
import { formatQuantity, isMeasuredLine, itemsSummary, lineNamePrefix, linePriceDetail } from './quantity';
import type { PaperSpec } from './paper';
import { rasterToBmpDataUrl } from './escposImage';
import { resolveShipmentLabel } from './shipmentLabel';


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
  cold_kitchen: 'COCINA FRÃA',
  bar: 'BAR',
  cashier: 'CAJA',
  all: 'COMANDA',
};

// NOTA sobre impresoras tÃ©rmicas:
// - Todo debe ser NEGRO PURO (#000). Los grises se difuminan (dithering) y salen
//   casi invisibles en papel tÃ©rmico.
// - Fuentes < 10px resultan ilegibles a 203dpi.
// - El ancho se define UNA sola vez, en `@page size`. Poner ademÃ¡s un ancho en
//   `html`/`body` crea dos fuentes de verdad que se contradicen: Chromium
//   maqueta con el tamaÃ±o de pÃ¡gina y el driver escala el resultado, lo que
//   produce texto diminuto y desplazado. `body` usa width: 100% para llenar
//   exactamente la pÃ¡gina que declara `@page`.
// - `size` usa el Ã¡rea IMPRIMIBLE (72mm para 80mm), porque el driver de la
//   impresora del sistema ya recorta al Ã¡rea del cabezal. Usar el ancho del
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
  const formatMoney = moneyFormatter(payload, { symbol: true });
  const isPreCuenta = (payload.title || '').toUpperCase().includes('PRE-CUENTA') || (payload.title || '').toUpperCase().includes('PRE CUENTA');
  const title = payload.title || 'TICKET DE VENTA';
  const dateObj = new Date(payload.createdAt);
  const dateStr = dateObj.toLocaleDateString('es-CO', payload.timezone ? { timeZone: payload.timezone } : {});
  const timeStr = dateObj.toLocaleTimeString('es-CO', { ...(payload.timezone ? { timeZone: payload.timezone } : {}), hour: '2-digit', minute: '2-digit', hour12: false });
  const itemsText = itemsSummary(payload.items, payload.locale);

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
    // Nota para el cliente (texto libre del cajero): se escapa.
    const noteLine = item.note
      ? `<div class="item-detail item-note">&raquo; ${item.note.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)}</div>`
      : '';

    return `
    <div class="item">
      <div class="item-line">
        <span class="item-name">${lineNamePrefix(item, payload.locale)}${item.productName}</span>
        <span class="item-total">${formatMoney(item.total)}</span>
      </div>
      <div class="item-detail">${linePriceDetail(item, formatMoney, payload.locale)}</div>
      ${variantLine}
      ${modifierLine}
      ${noteLine}
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

  const balanceHTML = payload.balance && payload.balance > 0
    ? `<div class="payments">
         ${payload.totalPaid && payload.totalPaid > 0 ? `<div class="payment-line"><span>Pagado:</span><span>${formatMoney(payload.totalPaid)}</span></div>` : ''}
         <div class="payment-line change-line" style="font-weight:bold"><span>SALDO PENDIENTE:</span><span>${formatMoney(payload.balance)}</span></div>
       </div>`
    : '';

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
    <div class="meta-row"><span class="meta-label">Items:</span><span class="meta-value">${itemsText}</span></div>
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
  ${balanceHTML}

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
  const dateStr = dateObj.toLocaleDateString('es-CO', payload.timezone ? { timeZone: payload.timezone } : {});
  const timeStr = dateObj.toLocaleTimeString('es-CO', { ...(payload.timezone ? { timeZone: payload.timezone } : {}), hour: '2-digit', minute: '2-digit', hour12: false });
  const itemsText = itemsSummary(payload.items);

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
        <span class="item-name">${isMeasuredLine(item) ? `${formatQuantity(item)} ` : `${formatQuantity(item)}x `}${item.productName}</span>
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
    <div class="meta-row"><span class="meta-label">Items:</span><span class="meta-value">${itemsText}</span></div>
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

/** Escapa texto para HTML (los datos del envio los escribe la persona). */
function escGuia(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/**
 * Rotulo de envio (Figma «21 Logistica» 3223:15627). Con `label.raster` la pagina muestra la
 * IMAGEN del rotulo que genero el ERP con su vista previa (la misma que sale por ESC/POS), a lo
 * ancho imprimible del papel. Sin imagen, una version HTML sencilla con los mismos textos.
 */
/**
 * Tamano del numero de guia en la version HTML de respaldo: UNA sola linea (2026-11-25; la guia
 * DEL-WO-... se partia en dos). Ancho util del papel en px CSS (puntos del cabezal a 203 ppp) entre
 * los caracteres a ~0,72 em cada uno; nunca mas de 17 px ni menos de 8.
 */
function guideNumberFontPx(guideNumber: string, paper: PaperSpec): number {
  const widthPx = (paper.charsPerLine * 12 * 96) / 203;
  const chars = Math.max(1, Array.from(guideNumber).length);
  return Math.max(8, Math.min(17, Math.floor((widthPx / (chars * 0.72)) * 10) / 10));
}

function buildShipmentGuideBody(payload: ShipmentGuidePrintPayload, paper: PaperSpec): string {
  const l = resolveShipmentLabel(payload);
  const image = rasterToBmpDataUrl(l.raster, paper.charsPerLine * 12);
  if (image && l.raster) {
    const mm = (l.raster.width / 203) * 25.4;
    return `<img src="${image}" alt="${escGuia(l.guideNumber)}" style="display:block;width:${mm.toFixed(2)}mm;height:auto;image-rendering:pixelated">`;
  }
  const line = (text: string | null | undefined, style: string) => (text ? `<div style="${style}">${escGuia(text)}</div>` : '');
  const collect = l.charge.kind === 'collect';
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#000">
    ${line(l.senderLabel, 'font-size:8px;font-weight:600')}
    ${line(l.storeName, 'font-size:13px;font-weight:bold')}
    ${line(l.branchLine, 'font-size:9px')}
    <div style="border:2px solid #000;padding:4px 6px;margin:6px 0">
      ${line(l.receiverLabel, 'font-size:8px;font-weight:600')}
      ${line(l.receiverName, 'font-size:17px;font-weight:bold')}
      ${line(l.address, 'font-size:12px;font-weight:600;word-break:break-word')}
      ${line(l.neighborhood, 'font-size:10px')}
      ${line(l.destination, 'font-size:13px;font-weight:bold')}
      ${line(l.phone, 'font-size:12px;font-weight:600')}
      ${line(l.instructions, 'font-size:9px;word-break:break-word')}
    </div>
    <div style="font-size:11px;font-weight:600">${escGuia([`${l.packageLabel} ${l.packageText}`, l.weightText ? `${l.weightLabel} ${l.weightText}` : null, l.deliveryText].filter(Boolean).join(' · '))}</div>
    ${l.carrierGuideText ? `<div style="border:1px solid #000;padding:3px 6px;margin:6px 0">${line(l.carrierGuideLabel, 'font-size:8px;font-weight:600')}${line(l.carrierGuideText, 'font-size:11px;font-weight:bold')}</div>` : ''}
    <div style="${collect ? 'background:#000;color:#fff;' : 'border:2px solid #000;'}text-align:center;padding:5px 6px;margin:6px 0">
      ${line(l.charge.title, 'font-size:12px;font-weight:bold;letter-spacing:1px')}
      ${line(l.charge.amount, 'font-size:22px;font-weight:bold')}
      ${line(l.charge.note, 'font-size:9px')}
    </div>
    ${l.handling ? `<div style="border:2px dashed #000;padding:3px 6px;margin:6px 0;text-align:center">${line(l.handling, 'font-size:10px;font-weight:bold;letter-spacing:0.4px')}</div>` : ''}
    ${line(l.guideLabel, 'font-size:8px;font-weight:600;margin-top:6px')}
    ${line(l.guideNumber, `font-size:${guideNumberFontPx(l.guideNumber, paper)}px;font-weight:bold;white-space:nowrap;overflow:hidden`)}
    ${line(l.qrCaptionLong, 'font-size:8px')}
    ${line(l.footer, 'font-size:9px;margin-top:4px')}
  </div>`;
}

export function buildShipmentGuideHTML(payload: ShipmentGuidePrintPayload, paper: PaperSpec): string {
  return wrapDocument(`Guia ${resolveShipmentLabel(payload).guideNumber}`, paper, [buildShipmentGuideBody(payload, paper)]);
}

export function buildShipmentGuidesHTML(payloads: ShipmentGuidePrintPayload[], paper: PaperSpec): string {
  const title = payloads.length === 1 ? `Guia ${resolveShipmentLabel(payloads[0]).guideNumber}` : `Guias (${payloads.length})`;
  return wrapDocument(title, paper, payloads.map((p) => buildShipmentGuideBody(p, paper)));
}

function buildElectronicInvoiceBody(payload: ElectronicInvoicePrintPayload): string {
  const formatMoney = moneyFormatter(payload, { symbol: true });
  const dateObj = new Date(payload.createdAt);
  const dateStr = dateObj.toLocaleDateString('es-CO', payload.timezone ? { timeZone: payload.timezone } : {});
  const timeStr = dateObj.toLocaleTimeString('es-CO', { ...(payload.timezone ? { timeZone: payload.timezone } : {}), hour: '2-digit', minute: '2-digit', hour12: false });
  const itemsText = itemsSummary(payload.items, payload.locale);

  const businessFiscal = payload.businessFiscalResponsibilities?.map(translateFiscal).join(', ') || '';
  const customerFiscal = payload.customerFiscalResponsibilities?.map(translateFiscal).join(', ') || '';

  const envLabel = payload.environment === 'production' ? 'PRODUCCION' : 'PRUEBAS';

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
    // Nota para el cliente (texto libre del cajero): se escapa.
    const noteLine = item.note
      ? `<div class="item-detail item-note">&raquo; ${item.note.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)}</div>`
      : '';

    return `
    <div class="item">
      <div class="item-line">
        <span class="item-name">${lineNamePrefix(item, payload.locale)}${item.productName}</span>
        <span class="item-total">${formatMoney(item.total)}</span>
      </div>
      <div class="item-detail">${linePriceDetail(item, formatMoney, payload.locale)}</div>
      ${variantLine}
      ${modifierLine}
      ${noteLine}
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
      <div class="total-line total-final"><span>TOTAL:</span><span>${formatMoney(payload.total)}</span></div>
    </div>`;

  const hasPayments = !!payload.payments && payload.payments.length > 0;
  const paymentsHTML = hasPayments ? `
    <div class="payments">
      ${payload.payments!.map(p => `<div class="payment-line"><span>${p.methodName || p.method || 'Efectivo'}:</span><span>${formatMoney(p.amount)}</span></div>`).join('')}
      ${payload.totalPaid && payload.totalPaid > 0 ? `<div class="payment-line"><span>Recibido:</span><span>${formatMoney(payload.totalPaid)}</span></div>` : ''}
      ${payload.changeAmount && payload.changeAmount > 0 ? `<div class="payment-line change-line"><span>CAMBIO:</span><span>${formatMoney(payload.changeAmount)}</span></div>` : ''}
    </div>` : '';

  const cufeShort = payload.cufe.length > 36 ? payload.cufe.substring(0, 36) + '...' : payload.cufe;
  const validationDateStr = payload.validationDate
    ? new Date(payload.validationDate).toLocaleString('es-CO')
    : '';

  return `
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
  </div>

  <div class="banner" style="background:#000;color:#fff;border:none;padding:6px">FACTURA ELECTRONICA</div>
  <div style="text-align:center;font-size:10px;font-weight:700;margin-bottom:4px">DIAN - Entorno: ${envLabel}</div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Factura No:</span><span class="meta-value">${payload.invoiceNumber}</span></div>
    <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${dateStr} ${timeStr}</span></div>
    <div class="meta-row"><span class="meta-label">Items:</span><span class="meta-value">${itemsText}</span></div>
    ${payload.cashierName ? `<div class="meta-row"><span class="meta-label">Cajero:</span><span class="meta-value">${payload.cashierName}</span></div>` : ''}
    ${validationDateStr ? `<div class="meta-row"><span class="meta-label">Validacion DIAN:</span><span class="meta-value">${validationDateStr}</span></div>` : ''}
  </div>

  ${customerHTML}

  <div class="items-header">
    <span>Descripcion</span>
    <span>Total</span>
  </div>

  ${itemsHTML}

  ${totalsHTML}
  ${paymentsHTML}

  ${payload.notes ? `<div style="margin:4px 0;padding:4px;border:1px dashed #000;font-size:10px"><strong>Notas:</strong> ${payload.notes}</div>` : ''}

  <div style="text-align:center;margin:8px 0 4px">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(payload.qrData)}" alt="QR DIAN" style="width:80px;height:80px" />
  </div>

  <div style="text-align:center;font-size:8px;word-break:break-all;overflow-wrap:anywhere;margin:4px 0">
    <strong>CUFE:</strong> ${cufeShort}
  </div>
  <div style="text-align:center;font-size:7px;word-break:break-all;overflow-wrap:anywhere;color:#555;margin:2px 0">
    ${payload.cufe}
  </div>

  <div class="footer">
    <div>Factura Electronica validada por DIAN</div>
    <div style="margin-top:3px">Gracias por su compra!</div>
    <div class="footer-brand">
      <div>GO Admin S.A.S | NIT: 901479683-5</div>
      <div>www.goadmin.io | 3113195711 | servicio@goadmin.io</div>
    </div>
  </div>`;
}

export function buildElectronicInvoiceHTML(payload: ElectronicInvoicePrintPayload, paper: PaperSpec): string {
  return wrapDocument(`Factura Electronica ${payload.invoiceNumber}`, paper, [buildElectronicInvoiceBody(payload)]);
}


