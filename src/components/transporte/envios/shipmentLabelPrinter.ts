import type { ShipmentWithDetails } from '@/lib/services/shipmentsService';
import type { ShipmentGuidePrintPayload } from '@printing';
import { buildShipmentGuideHTML, buildShipmentGuidesHTML, getPaperSpec, DEFAULT_PAPER_WIDTH } from '@printing';
import { PrintJobsService } from '@/lib/services/printJobsService';

export interface ShipmentGuideItem {
  id: string;
  description?: string;
  sku?: string;
  qty?: number;
  unit?: string;
  unit_value?: number;
  total_value?: number;
  weight_kg?: number;
  notes?: string;
  product_id?: number;
  products?: { id: number; name: string; sku: string };
}

export interface ShipmentGuideDriver {
  name: string;
  phone?: string;
  license_number?: string;
  license_category?: string;
}

export interface ShipmentGuideOrgInfo {
  name: string;
  nit?: string;
  tax_id?: string;
  address?: string;
  phone?: string;
}

function formatCurrency(value: number | undefined, currency: string = 'COP'): string {
  if (!value || value === 0) return '$0';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency, minimumFractionDigits: 0 }).format(value);
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '-';
  }
}

function getStatusLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    draft: 'Borrador',
    pending: 'Pendiente',
    assigned: 'Asignado',
    ready: 'Listo',
    picked: 'Recogido',
    dispatched: 'Despachado',
    in_transit: 'En Tránsito',
    out_for_delivery: 'En Entrega',
    delivered: 'Entregado',
    failed: 'Fallido',
    returned: 'Devuelto',
    cancelled: 'Cancelado',
  };
  return labels[status || ''] || status || '-';
}

function getPaymentLabel(status: string | undefined): string {
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    paid: 'Pagado',
    cod: 'Contra Entrega',
    cancelled: 'Cancelado',
  };
  return labels[status || ''] || status || '-';
}

interface ParsedItemNotes {
  modifiers?: Array<{ groupId: number; groupName: string; modifierId: number; name: string; extraPrice: number }>;
  variant_data?: Record<string, string>;
  discount_amount?: number;
  tax_amount?: number;
  tax_rate?: number;
  tax_excluded?: boolean;
  product_image?: string;
}

function parseItemNotes(notes?: string): ParsedItemNotes {
  if (!notes) return {};
  try {
    return JSON.parse(notes);
  } catch {
    return {};
  }
}

interface GenerateGuideOptions {
  items?: ShipmentGuideItem[];
  driver?: ShipmentGuideDriver | null;
  orgInfo?: ShipmentGuideOrgInfo | null;
}

export function generateShipmentGuideHTML(
  shipment: ShipmentWithDetails,
  options: GenerateGuideOptions = {},
): string {
  const meta = (shipment.metadata as Record<string, unknown> | null) || {};
  const items = options.items || (meta.items as ShipmentGuideItem[] | undefined) || [];

  const senderName = (meta.sender_name as string) || shipment.sender_name || '-';
  const senderPhone = (meta.sender_phone as string) || shipment.sender_phone || '-';
  const receiverName = shipment.delivery_contact_name || shipment.receiver_name || shipment.customer?.full_name || '-';
  const receiverPhone = shipment.delivery_contact_phone || shipment.receiver_phone || shipment.customer?.phone || '-';
  const receiverAddress = shipment.delivery_address || '-';
  const receiverCity = shipment.delivery_city || '-';
  const originStop = shipment.origin_stop?.name || (meta.origin_stop_id as string) || '-';
  const destinationStop = shipment.destination_stop?.name || (meta.destination_stop_id as string) || '-';
  const driverName = options.driver?.name || shipment.driver_name || 'Sin asignar';
  const driverPhone = options.driver?.phone || '';
  const driverLicense = options.driver?.license_number || '';
  const driverLicenseCat = options.driver?.license_category || '';
  const packageType = (meta.package_type as string) || shipment.package_type || '-';
  const deliveryType = (meta.delivery_type as string) || shipment.delivery_type || '-';
  const isFragile = (meta.is_fragile as boolean) || shipment.is_fragile || false;
  const requiresSignature = (meta.requires_signature as boolean) || shipment.requires_signature || false;

  const orgName = options.orgInfo?.name || 'GO ADMIN';
  const orgNit = options.orgInfo?.nit || options.orgInfo?.tax_id || '-';
  const orgAddress = options.orgInfo?.address || '';
  const orgPhone = options.orgInfo?.phone || '-';

  const trackingNumber = shipment.tracking_number || shipment.shipment_number || '';
  const barcodeValue = trackingNumber.replace(/[^A-Z0-9]/gi, '') || '0000000000';

  const itemsRows = items.length > 0
    ? items.map((item) => {
      const parsed = parseItemNotes(item.notes);
      const variantEntries = parsed.variant_data
        ? Object.entries(parsed.variant_data).filter(([, v]) => !!v)
        : [];
      const modifiers = parsed.modifiers || [];
      const discount = parsed.discount_amount || 0;
      const taxAmount = parsed.tax_amount || 0;
      const taxRate = parsed.tax_rate || 0;
      const taxExcluded = parsed.tax_excluded || false;
      const qty = item.qty || 1;
      const unitValue = item.unit_value || 0;
      const totalValue = item.total_value || (qty * unitValue);
      const desc = item.description || item.products?.name || '-';
      const sku = item.sku || item.products?.sku || '';

      let detailHtml = '';
      if (sku) detailHtml += `<div class="item-detail">SKU: ${sku}</div>`;
      if (item.weight_kg) detailHtml += `<div class="item-detail">Peso: ${item.weight_kg} kg</div>`;
      if (variantEntries.length > 0) {
        detailHtml += `<div class="item-detail">${variantEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}</div>`;
      }
      if (modifiers.length > 0) {
        detailHtml += `<div class="item-detail">${modifiers.map((m) => `${m.name}${m.extraPrice > 0 ? ` (+${formatCurrency(m.extraPrice)})` : ''}`).join(', ')}</div>`;
      }
      if (discount > 0) {
        detailHtml += `<div class="item-detail">Descuento: -${formatCurrency(discount)}</div>`;
      }
      if (taxAmount > 0) {
        detailHtml += `<div class="item-detail">Impuesto: ${formatCurrency(taxAmount)} (${taxRate}%${taxExcluded ? ' excl.' : ' incl.'})</div>`;
      }

      return `
      <div class="item">
        <div class="item-line">
          <span class="item-name">${qty}x ${desc}</span>
          <span class="item-total">${formatCurrency(totalValue)}</span>
        </div>
        <div class="item-unit">Valor Unit: ${formatCurrency(unitValue)}${item.unit ? ' / ' + item.unit : ''}</div>
        ${detailHtml}
      </div>`;
    }).join('')
    : '<div class="item"><div class="item-detail">Sin items registrados</div></div>';

  const itemsTotal = items.reduce((sum, item) => sum + (item.total_value || ((item.qty || 1) * (item.unit_value || 0))), 0);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Guia de Envio - ${trackingNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: 80mm auto; margin: 0; }
  html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    width: 100%;
    margin: 0;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 12px;
    line-height: 1.3;
    color: #000;
    background: #fff;
    padding: 6px 8px;
    font-weight: 500;
  }
  .header {
    text-align: center;
    border-bottom: 2px solid #000;
    padding-bottom: 5px;
    margin-bottom: 5px;
  }
  .header-title {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }
  .header-sub {
    font-size: 11px;
    color: #000;
    margin-bottom: 1px;
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
  .barcode-section {
    text-align: center;
    border: 1px solid #000;
    padding: 6px;
    margin: 5px 0;
  }
  .barcode-svg {
    display: inline-block;
  }
  .barcode-number {
    font-family: 'Courier New', monospace;
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 2px;
    color: #000;
    margin-top: 4px;
  }
  .item-unit {
    font-size: 11px;
    color: #000;
    margin-top: 1px;
    padding-left: 6px;
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
  .info-box {
    border: 1px solid #000;
    padding: 4px;
    margin: 3px 0;
    font-size: 12px;
  }
  .info-box .label { font-weight: 700; color: #000; }
  .route-box {
    border: 1px solid #000;
    padding: 4px;
    margin: 3px 0;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
  }
  .route-arrow { font-size: 16px; font-weight: 800; }
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
  .item-name { font-weight: 700; font-size: 13px; flex: 1; }
  .item-total { font-weight: 700; font-size: 13px; white-space: nowrap; }
  .item-detail {
    font-size: 11px;
    color: #000;
    margin-top: 1px;
    padding-left: 6px;
  }
  .driver-box {
    border: 1px solid #000;
    padding: 4px;
    margin: 3px 0;
    font-size: 12px;
  }
  .driver-box .label { font-weight: 700; color: #000; }
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
  .notes-box {
    border: 1px solid #000;
    padding: 4px;
    margin: 4px 0;
    font-size: 12px;
  }
  .notes-box .label { font-weight: 700; color: #000; margin-bottom: 2px; }
  .signature-box {
    border-top: 1px solid #000;
    margin-top: 10px;
    padding-top: 5px;
    font-size: 11px;
  }
  .signature-line {
    border-bottom: 1px solid #000;
    width: 100%;
    height: 30px;
    margin-bottom: 2px;
  }
  .signature-label {
    text-align: center;
    font-weight: 700;
    color: #000;
  }
  .footer {
    text-align: center;
    margin-top: 7px;
    font-size: 11px;
    border-top: 1px solid #000;
    padding-top: 6px;
    color: #000;
  }
  .footer-brand {
    margin-top: 5px;
    padding-top: 5px;
    border-top: 1px solid #000;
    font-size: 10px;
    color: #000;
  }
  .print-btn {
    position: fixed;
    top: 20px;
    right: 20px;
    background: #000;
    color: #fff;
    border: none;
    padding: 10px 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
  }
  .print-btn:hover { background: #333; }
  @media print {
    body { padding: 6px 8px; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

  <div class="header">
    <div class="header-title">${orgName}</div>
    <div class="header-sub">NIT: ${orgNit}</div>
    ${orgAddress ? `<div class="header-sub">${orgAddress}</div>` : ''}
    <div class="header-sub">Tel: ${orgPhone}</div>
  </div>

  <div class="banner">GUIA DE ENVIO</div>

  <div class="barcode-section">
    <svg id="barcode" class="barcode-svg"></svg>
    <div class="barcode-number">${barcodeValue}</div>
  </div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Guia No:</span><span class="meta-value">${shipment.shipment_number || '-'}</span></div>
    <div class="meta-row"><span class="meta-label">Tracking:</span><span class="meta-value">${shipment.tracking_number || '-'}</span></div>
    <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${formatDate(shipment.created_at)} ${new Date(shipment.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })}</span></div>
    <div class="meta-row"><span class="meta-label">Estado:</span><span class="meta-value">${getStatusLabel(shipment.status)}</span></div>
    <div class="meta-row"><span class="meta-label">Pago:</span><span class="meta-value">${getPaymentLabel(shipment.payment_status)}</span></div>
  </div>

  <div class="driver-box">
    <div><span class="label">Conductor:</span> ${driverName}</div>
    ${driverPhone ? `<div><span class="label">Telefono:</span> ${driverPhone}</div>` : ''}
    ${driverLicense ? `<div><span class="label">Licencia:</span> ${driverLicense}${driverLicenseCat ? ' (' + driverLicenseCat + ')' : ''}</div>` : ''}
  </div>

  <div class="route-box">
    ${originStop} <span class="route-arrow">--&gt;</span> ${destinationStop}
  </div>

  <div class="section-title">Remitente</div>
  <div class="info-box">
    <div><span class="label">Nombre:</span> ${senderName}</div>
    <div><span class="label">Telefono:</span> ${senderPhone}</div>
  </div>

  <div class="section-title">Destinatario</div>
  <div class="info-box">
    <div><span class="label">Nombre:</span> ${receiverName}</div>
    <div><span class="label">Telefono:</span> ${receiverPhone}</div>
    <div><span class="label">Direccion:</span> ${receiverAddress}</div>
    <div><span class="label">Ciudad:</span> ${receiverCity}</div>
    ${shipment.delivery_instructions ? `<div><span class="label">Instrucciones:</span> ${shipment.delivery_instructions}</div>` : ''}
  </div>

  <div class="section-title">Detalles</div>
  <div class="meta">
    <div class="meta-row"><span class="meta-label">Peso:</span><span class="meta-value">${shipment.weight_kg ? shipment.weight_kg + ' kg' : '-'}</span></div>
    <div class="meta-row"><span class="meta-label">Paquetes:</span><span class="meta-value">${shipment.package_count || 1}</span></div>
    <div class="meta-row"><span class="meta-label">Tipo:</span><span class="meta-value">${packageType}</span></div>
    <div class="meta-row"><span class="meta-label">Entrega:</span><span class="meta-value">${deliveryType}</span></div>
    <div class="meta-row"><span class="meta-label">Valor Declarado:</span><span class="meta-value">${formatCurrency(shipment.declared_value)}</span></div>
    ${isFragile ? '<div class="meta-row"><span class="meta-label">FRAGIL:</span><span class="meta-value">SI</span></div>' : ''}
    ${requiresSignature ? '<div class="meta-row"><span class="meta-label">Firma:</span><span class="meta-value">REQUERIDA</span></div>' : ''}
  </div>

  <div class="items-header">
    <span>Descripcion</span>
    <span>Total</span>
  </div>
  ${itemsRows}

  <div class="totals">
    <div class="total-line"><span>Valor Items:</span><span>${formatCurrency(itemsTotal)}</span></div>
    <div class="total-line"><span>Flete:</span><span>${formatCurrency(shipment.shipping_fee || shipment.freight_cost)}</span></div>
    <div class="total-line"><span>Seguro:</span><span>${formatCurrency(shipment.insurance_fee || shipment.insurance_cost)}</span></div>
    ${shipment.cod_amount ? `<div class="total-line"><span>Contra Entrega:</span><span>${formatCurrency(shipment.cod_amount)}</span></div>` : ''}
    <div class="total-line total-final"><span>TOTAL:</span><span>${formatCurrency(shipment.total_cost)}</span></div>
  </div>

  ${shipment.notes ? `
  <div class="notes-box">
    <div class="label">Notas</div>
    <div>${shipment.notes}</div>
  </div>
  ` : ''}

  <div class="signature-box">
    <div class="signature-line"></div>
    <div class="signature-label">Firma de Recepcion</div>
  </div>

  <div class="footer">
    <div>Guia generada el ${new Date().toLocaleString('es-CO')}</div>
    <div class="footer-brand">
      <div>GO Admin S.A.S | NIT: 901479683-5</div>
      <div>www.goadmin.io | 3113195711 | servicio@goadmin.io</div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <script>
    window.onload = function() {
      try {
        JsBarcode("#barcode", "${barcodeValue}", {
          format: "CODE128",
          width: 2,
          height: 50,
          displayValue: false,
          margin: 0,
          background: "#ffffff",
          lineColor: "#000000"
        });
      } catch(e) {
        document.getElementById('barcode').outerHTML = '<div class="barcode-number">*' + '${barcodeValue}' + '*</div>';
      }
      setTimeout(function() { window.print(); }, 500);
    };
  </script>
</body>
</html>`;
}

/**
 * Inyecta en la ventana de impresion el script de JsBarcode y auto-print.
 * El HTML de @printing no incluye scripts para mantenerlo limpio;
 * se inyectan aqui para que la ventana del navegador imprima automaticamente.
 */
function injectPrintScripts(printWindow: Window): void {
  const script = printWindow.document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
  script.onload = () => {
    try {
      printWindow.document.querySelectorAll('svg[data-barcode]').forEach((el: Element) => {
        const value = el.getAttribute('data-barcode') || '';
        const JsBarcode = (printWindow as any).JsBarcode || (window as any).JsBarcode;
        if (JsBarcode) {
          JsBarcode(el, value.trim(), {
            format: 'CODE128',
            width: 2,
            height: 50,
            displayValue: false,
            margin: 0,
            background: '#ffffff',
            lineColor: '#000000',
          });
        }
      });
    } catch {
      // JsBarcode no disponible, el tracking number ya se muestra como texto
    }
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };
  printWindow.document.head.appendChild(script);
}

export function printShipmentGuide(
  shipment: ShipmentWithDetails,
  options: GenerateGuideOptions = {},
): void {
  const payload = buildShipmentGuidePayload(shipment, options);
  const paper = getPaperSpec(DEFAULT_PAPER_WIDTH);
  const html = buildShipmentGuideHTML(payload, paper);
  const printWindow = window.open('', '_blank', 'width=400,height=700');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir la guia.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  injectPrintScripts(printWindow);
}

export function printShipmentGuides(
  entries: Array<{ shipment: ShipmentWithDetails; options?: GenerateGuideOptions }>,
): void {
  if (entries.length === 0) return;

  const payloads = entries.map(({ shipment, options }) => buildShipmentGuidePayload(shipment, options));
  const paper = getPaperSpec(DEFAULT_PAPER_WIDTH);
  const html = buildShipmentGuidesHTML(payloads, paper);

  const printWindow = window.open('', '_blank', 'width=400,height=700');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir las guias.');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  injectPrintScripts(printWindow);
}

/**
 * Construye un ShipmentGuidePrintPayload a partir de los datos del envio.
 * Usado por el camino del print-agent (ESC/POS con corte automatico).
 */
export function buildShipmentGuidePayload(
  shipment: ShipmentWithDetails,
  options: GenerateGuideOptions = {},
): ShipmentGuidePrintPayload {
  const meta = (shipment.metadata as Record<string, unknown> | null) || {};
  const items = options.items || (meta.items as ShipmentGuideItem[] | undefined) || [];

  const parsedItems = items.map((item) => {
    const parsed = parseItemNotes(item.notes);
    return {
      description: item.description || item.products?.name || '-',
      sku: item.sku || item.products?.sku,
      quantity: item.qty || 1,
      unit: item.unit,
      unitValue: item.unit_value,
      totalValue: item.total_value,
      weightKg: item.weight_kg,
      variantData: parsed.variant_data || null,
      modifiers: parsed.modifiers
        ? parsed.modifiers.map((m) => ({ name: m.name, extraPrice: m.extraPrice }))
        : null,
      discountAmount: parsed.discount_amount,
      taxAmount: parsed.tax_amount,
    };
  });

  const itemsTotalValue = parsedItems.reduce((sum, i) => sum + (i.totalValue || (i.quantity * (i.unitValue || 0))), 0);

  return {
    shipmentId: shipment.id,
    trackingNumber: shipment.tracking_number,
    shipmentNumber: shipment.shipment_number,
    status: shipment.status,
    createdAt: shipment.created_at || new Date().toISOString(),

    businessName: options.orgInfo?.name,
    businessNit: options.orgInfo?.nit || options.orgInfo?.tax_id,
    businessPhone: options.orgInfo?.phone,
    businessAddress: options.orgInfo?.address,

    senderName: (meta.sender_name as string) || shipment.sender_name,
    senderPhone: (meta.sender_phone as string) || shipment.sender_phone,

    receiverName: shipment.delivery_contact_name || shipment.receiver_name || shipment.customer?.full_name,
    receiverPhone: shipment.delivery_contact_phone || shipment.receiver_phone || shipment.customer?.phone,
    receiverAddress: shipment.delivery_address,
    receiverCity: shipment.delivery_city,
    receiverInstructions: shipment.delivery_instructions,

    originStop: shipment.origin_stop?.name || (meta.origin_stop_id as string),
    destinationStop: shipment.destination_stop?.name || (meta.destination_stop_id as string),

    driver: options.driver
      ? {
        name: options.driver.name,
        phone: options.driver.phone,
        licenseNumber: options.driver.license_number,
        licenseCategory: options.driver.license_category,
      }
      : undefined,

    items: parsedItems,
    itemsTotalValue,

    weightKg: shipment.weight_kg || (meta.weight_kg as number),
    packageCount: shipment.package_count || (meta.package_count as number),
    packageType: (meta.package_type as string) || shipment.package_type,
    deliveryType: (meta.delivery_type as string) || shipment.delivery_type,
    declaredValue: shipment.declared_value || (meta.declared_value as number),
    isFragile: (meta.is_fragile as boolean) || shipment.is_fragile,
    requiresSignature: (meta.requires_signature as boolean) || shipment.requires_signature,

    shippingFee: shipment.shipping_fee,
    freightCost: shipment.freight_cost,
    insuranceCost: shipment.insurance_fee,
    codAmount: shipment.cod_amount,
    totalCost: shipment.total_cost,
  };
}

/**
 * Imprime una guia de envio con corte automatico.
 * Intenta encolar via print-agent (ESC/POS con cut()). Si no hay agente
 * online o no hay impresoras configuradas, hace fallback al HTML del navegador.
 *
 * Abre la ventana de impresion sincronicamente (antes de cualquier await)
 * para no perder el gesto del usuario y evitar que el navegador bloquee el popup.
 */
export async function printShipmentGuideWithCut(
  shipment: ShipmentWithDetails,
  options: GenerateGuideOptions = {},
  branchId?: number,
): Promise<{ method: 'agent' | 'html'; enqueued: number }> {
  const payload = buildShipmentGuidePayload(shipment, options);
  const paper = getPaperSpec(DEFAULT_PAPER_WIDTH);
  const html = buildShipmentGuideHTML(payload, paper);

  const printWindow = window.open('', '_blank', 'width=400,height=700');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir la guia.');
    return { method: 'html', enqueued: 0 };
  }

  if (branchId) {
    try {
      const isOnline = await PrintJobsService.isAgentOnline(branchId);
      if (isOnline) {
        const result = await PrintJobsService.enqueueShipmentGuide(branchId, payload);
        if (result.enqueued > 0) {
          printWindow.close();
          return { method: 'agent', enqueued: result.enqueued };
        }
      }
    } catch (e) {
      console.warn('Error encolando guia via print-agent, fallback a HTML:', e);
    }
  }

  printWindow.document.write(html);
  printWindow.document.close();
  injectPrintScripts(printWindow);
  return { method: 'html', enqueued: 0 };
}

/**
 * Imprime varias guias de envio con corte automatico.
 * Intenta encolar via print-agent (cada guia como job independiente con cut()).
 * Si no hay agente, hace fallback al HTML combinado del navegador.
 *
 * Abre la ventana sincronicamente para no perder el gesto del usuario.
 */
export async function printShipmentGuidesWithCut(
  entries: Array<{ shipment: ShipmentWithDetails; options?: GenerateGuideOptions }>,
  branchId?: number,
): Promise<{ method: 'agent' | 'html'; enqueued: number }> {
  if (entries.length === 0) return { method: 'html', enqueued: 0 };

  const payloads = entries.map(({ shipment, options }) => buildShipmentGuidePayload(shipment, options));
  const paper = getPaperSpec(DEFAULT_PAPER_WIDTH);
  const html = buildShipmentGuidesHTML(payloads, paper);

  const printWindow = window.open('', '_blank', 'width=400,height=700');
  if (!printWindow) {
    alert('Por favor permite las ventanas emergentes para imprimir las guias.');
    return { method: 'html', enqueued: 0 };
  }

  if (branchId) {
    try {
      const isOnline = await PrintJobsService.isAgentOnline(branchId);
      if (isOnline) {
        const result = await PrintJobsService.enqueueShipmentGuides(branchId, payloads);
        if (result.enqueued > 0) {
          printWindow.close();
          return { method: 'agent', enqueued: result.enqueued };
        }
      }
    } catch (e) {
      console.warn('Error encolando guias via print-agent, fallback a HTML:', e);
    }
  }

  printWindow.document.write(html);
  printWindow.document.close();
  injectPrintScripts(printWindow);
  return { method: 'html', enqueued: 0 };
}
