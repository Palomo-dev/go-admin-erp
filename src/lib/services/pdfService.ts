'use client';

import { contextoMoneda, crearFormateadorMoneda, type ContextoMoneda } from '@/lib/utils/moneda';
import { abrirDocumento, descargarDocumento, guardarArchivo, imprimirDocumento, obtenerPdf } from '@/lib/documents/cliente';
import { colorHexSeguro, escaparHtml as e } from '@/lib/documents/escape';
import { qrSvg } from '@/lib/documents/qr';
import type { TipoDocumento } from '@/lib/documents/tipos';

export interface InvoiceDataForPDF {
  id: string;
  number: string;
  issue_date: string;
  due_date: string;
  status: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  balance: number;
  notes?: string;
  tax_included?: boolean;
  discount_total?: number;
  customer?: {
    full_name: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_id?: string;
    doc_type?: string;
    doc_number?: string;
  };
  organization?: {
    name: string;
    tax_id?: string;
    address?: string;
    phone?: string;
    email?: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
  };
  items: {
    description: string;
    qty: number;
    unit_price: number;
    tax_rate?: number;
    tax_included?: boolean;
    discount_amount?: number;
    total_line: number;
    sku?: string;
    serial_numbers?: string[] | null;
  }[];
  // Monto de notas de crédito / saldo a favor aplicado a esta factura (informativo)
  credit_applied?: number;
  /**
   * Formato de los montos: moneda del documento (o la base de la
   * organización), decimales y locale del país. Lo arma el llamador con
   * `useMonedaOrganizacion().paraDocumento(doc.currency)`. Sin él, se formatea
   * en `currency` con locale de respaldo; nunca se suponen pesos.
   */
  moneda?: ContextoMoneda;
}

/** Contexto de formato del documento. */
function monedaDe(data: InvoiceDataForPDF): ContextoMoneda {
  return data.moneda ?? contextoMoneda(data.currency);
}

/**
 * Tipo del motor para los datos que arman las pantallas de venta: la
 * cotización llega por el mismo método con `status = 'quotation'`.
 */
function tipoVenta(data: Pick<InvoiceDataForPDF, 'status'>): TipoDocumento {
  return data.status === 'quotation' ? 'cotizacion' : 'factura-venta';
}

/** Descarga el PDF del motor con el nombre que pide la pantalla (o el del servidor). */
async function descargarConNombre(tipo: TipoDocumento, id: string, filename?: string): Promise<void> {
  if (!filename) return descargarDocumento(tipo, id);
  const { blob } = await obtenerPdf(tipo, id);
  guardarArchivo(blob, filename);
}

/**
 * Puntos de entrada de documentos que usan las pantallas actuales.
 *
 * Desde la fase 2 (motor único, `src/lib/documents`) todos van a
 * `GET /api/documentos/<tipo>/<id>`: el servidor arma el documento desde la
 * base con la organización de la sesión, la moneda del documento, las fechas
 * en la zona de la organización y los textos escapados. De `data` solo se usan
 * `id` (y `status === 'quotation'` para elegir la cotización); el resto lo
 * siguen armando las pantallas viejas por compatibilidad de firma y se ignora.
 * Ya no se escribe en el bucket público `invoices` ni se construye un QR que
 * apunte a él.
 */
export class PDFService {
  /** PDF del documento, generado en el servidor por el motor. */
  static async generateInvoicePDF(invoiceData: InvoiceDataForPDF): Promise<Blob> {
    return (await obtenerPdf(tipoVenta(invoiceData), invoiceData.id)).blob;
  }

  /** Descarga el PDF (o, si el servidor no puede generar PDF, el HTML imprimible). */
  static async downloadInvoicePDF(invoiceData: InvoiceDataForPDF, filename?: string): Promise<void> {
    await descargarConNombre(tipoVenta(invoiceData), invoiceData.id, filename);
  }

  /** Abre el PDF en una pestaña nueva. */
  static async printInvoicePDF(invoiceData: InvoiceDataForPDF): Promise<void> {
    abrirDocumento(tipoVenta(invoiceData), invoiceData.id);
  }

  /**
   * @deprecated Plantilla de navegador anterior al motor único: arma el HTML
   * con los datos que le pasa la pantalla. No la usa ningún punto de entrada;
   * se conserva (con los textos escapados y el QR local) mientras las
   * pantallas se rediseñan. Para un documento real: `imprimirDocumento`.
   */
  static generateInvoiceHTML(data: InvoiceDataForPDF, qrUrl?: string): string {
    const primaryColor = colorHexSeguro(data.organization?.primary_color) || '#2563eb';
    const secondaryColor = colorHexSeguro(data.organization?.secondary_color) || '#1e40af';
    const moneda = monedaDe(data);
    const formatCurrency = crearFormateadorMoneda(moneda);
    const qrData = qrUrl || `Factura: ${data.number} | Total: ${formatCurrency(data.total)} | Saldo: ${formatCurrency(data.balance)} | ${data.organization?.name || ''}`;

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const statusText: Record<string, string> = {
      'draft': 'Borrador',
      'issued': 'Emitida',
      'paid': 'Pagada',
      'partial': 'Pago Parcial',
      'void': 'Anulada',
      'quotation': 'Cotización',
      'sent': 'Enviada',
      'accepted': 'Aceptada',
      'rejected': 'Rechazada',
      'expired': 'Vencida',
      'converted': 'Convertida'
    };

    const isQuotation = data.status === 'quotation';
    const docTitle = isQuotation ? 'COTIZACIÓN' : 'FACTURA';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${docTitle} ${e(data.number)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #333; }
          .invoice { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid ${primaryColor}; }
          .logo-section { display: flex; align-items: center; gap: 12px; }
          .logo-img { max-height: 60px; max-width: 180px; object-fit: contain; }
          .logo-text { font-size: 24px; font-weight: bold; color: ${primaryColor}; }
          .invoice-title { text-align: right; }
          .invoice-title h1 { font-size: 28px; color: #333; margin-bottom: 5px; }
          .invoice-number { font-size: 14px; color: #666; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 5px; }
          .status-draft { background: #fef3c7; color: #92400e; }
          .status-issued { background: #dbeafe; color: ${secondaryColor}; }
          .status-paid { background: #d1fae5; color: #065f46; }
          .status-partial { background: #ede9fe; color: #5b21b6; }
          .status-void { background: #f3f4f6; color: #374151; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .info-box { width: 48%; }
          .info-box h3 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; letter-spacing: 0.5px; }
          .info-box p { margin-bottom: 4px; line-height: 1.5; }
          .info-box .name { font-weight: 600; font-size: 14px; color: #111; }
          .dates { display: flex; gap: 40px; margin-bottom: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .dates div { }
          .dates label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 4px; }
          .dates span { font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: ${primaryColor}; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
          th:last-child { text-align: right; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
          td:last-child { text-align: right; }
          .totals { margin-left: auto; width: 280px; }
          .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
          .totals .subtotal { border-bottom: 1px solid #e5e7eb; }
          .totals .discount { color: #dc2626; }
          .totals .total { font-size: 16px; font-weight: bold; border-top: 2px solid ${primaryColor}; padding-top: 12px; margin-top: 4px; }
          .totals .balance { color: #dc2626; font-weight: bold; }
          .totals .paid { color: #059669; font-weight: 600; }
          .debt-badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 700; margin-top: 8px; }
          .debt-badge-pending { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
          .debt-badge-paid { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
          .tax-included-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #ede9fe; color: #5b21b6; margin-left: 6px; }
          .item-discount { color: #dc2626; font-size: 11px; }
          .notes { margin-top: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .notes h4 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; padding-top: 20px; border-top: 1px solid #e5e7eb; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .invoice { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="logo-section">
              ${data.organization?.logo_url ? `<img src="${e(data.organization.logo_url)}" alt="Logo" class="logo-img" />` : `<div class="logo-text">${e(data.organization?.name || 'Mi Empresa')}</div>`}
            </div>
            <div class="invoice-title">
              <div style="display:flex;align-items:flex-start;gap:12px;">
                <div style="text-align:right;">
                  <h1>${docTitle}</h1>
                  <div class="invoice-number">${e(data.number)}</div>
                  <span class="status status-${isQuotation ? 'issued' : e(data.status)}">${e(statusText[data.status] || data.status)}</span>
                </div>
                <div style="flex-shrink:0;">
                  <div style="width:80px;height:80px;">${qrSvg(qrData.slice(0, 600), { titulo: `QR ${docTitle}` })}</div>
                  <div style="font-size:9px;color:#6b7280;text-align:center;margin-top:2px;">Escanear para ver</div>
                </div>
              </div>
            </div>
          </div>
          
          ${['void', 'voided', 'cancelled'].includes(data.status) ? `
          <div style="border:2px solid #dc2626;color:#dc2626;background:#fef2f2;padding:10px 16px;border-radius:8px;text-align:center;font-weight:bold;font-size:16px;letter-spacing:2px;margin-bottom:20px;">DOCUMENTO ANULADO</div>
          ` : ''}
          <div class="info-section">
            <div class="info-box">
              <h3>De</h3>
              <p class="name">${e(data.organization?.name || 'Mi Empresa')}</p>
              ${data.organization?.tax_id ? `<p>NIT: ${e(data.organization.tax_id)}</p>` : ''}
              ${data.organization?.address ? `<p>${e(data.organization.address)}</p>` : ''}
              ${data.organization?.phone ? `<p>Tel: ${e(data.organization.phone)}</p>` : ''}
              ${data.organization?.email ? `<p>${e(data.organization.email)}</p>` : ''}
            </div>
            <div class="info-box">
              <h3>${isQuotation ? 'Cotizar a' : 'Facturar a'}</h3>
              <p class="name">${e(data.customer?.full_name || 'Cliente')}</p>
              ${(data.customer?.doc_number || data.customer?.tax_id) ? `<p>${e(data.customer?.doc_type ? data.customer.doc_type.toUpperCase() : 'NIT/CC')}: ${e(data.customer.doc_number || data.customer.tax_id)}</p>` : ''}
              ${data.customer?.address ? `<p>${e(data.customer.address)}</p>` : ''}
              ${data.customer?.phone ? `<p>Tel: ${e(data.customer.phone)}</p>` : ''}
              ${data.customer?.email ? `<p>${e(data.customer.email)}</p>` : ''}
            </div>
          </div>
          
          <div class="dates">
            <div>
              <label>Fecha de Emisión</label>
              <span>${formatDate(data.issue_date)}</span>
            </div>
            <div>
              <label>Fecha de Vencimiento</label>
              <span>${formatDate(data.due_date)}</span>
            </div>
            <div>
              <label>Moneda</label>
              <span>${moneda.code}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 40%">Descripción</th>
                <th style="width: 8%">Cant.</th>
                <th style="width: 13%">Precio Unit.</th>
                <th style="width: 10%">Descuento</th>
                <th style="width: 9%">Impuesto</th>
                <th style="width: 15%">Total</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map(item => `
                <tr>
                  <td>${item.sku ? `<span style="color:#6b7280;font-size:11px;">SKU: ${e(item.sku)}</span><br/>` : ''}${e(item.description)}${item.serial_numbers && item.serial_numbers.length > 0 ? `<br/><span style="font-size:10px;color:#6b7280;">Seriales: ${e(item.serial_numbers.join(', '))}</span>` : ''}</td>
                  <td>${e(item.qty)}</td>
                  <td>${formatCurrency(item.unit_price)}</td>
                  <td>${item.discount_amount && item.discount_amount > 0 ? `<span class="item-discount">- ${formatCurrency(item.discount_amount)}</span>` : '-'}</td>
                  <td>${item.tax_rate ? `${e(item.tax_rate)}%${item.tax_included ? ' (incl.)' : ''}` : '-'}</td>
                  <td>${formatCurrency(item.total_line)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="subtotal">
              <span>Subtotal${data.tax_included ? ' <span class="tax-included-badge">Imp. incluidos</span>' : ''}</span>
              <span>${formatCurrency(data.subtotal)}</span>
            </div>
            ${data.discount_total && data.discount_total > 0 ? `
            <div class="discount">
              <span>Descuentos</span>
              <span>- ${formatCurrency(data.discount_total)}</span>
            </div>
            ` : ''}
            <div>
              <span>Impuestos</span>
              <span>${formatCurrency(data.tax_total)}</span>
            </div>
            <div class="total">
              <span>Total</span>
              <span>${formatCurrency(data.total)}</span>
            </div>
            ${data.credit_applied && data.credit_applied > 0 ? `
              <div>
                <span>Nota crédito / saldo aplicado</span>
                <span>- ${formatCurrency(data.credit_applied)}</span>
              </div>
            ` : ''}
            ${isQuotation ? '' : (data.balance > 0 ? `
              <div class="balance">
                <span>Saldo Pendiente</span>
                <span>${formatCurrency(data.balance)}</span>
              </div>
            ` : `
              <div class="paid">
                <span>Pagado</span>
                <span>${formatCurrency(data.total - (data.balance || 0))}</span>
              </div>
            `)}
          </div>
          
          ${data.notes ? `
            <div class="notes">
              <h4>Notas</h4>
              <p>${e(data.notes)}</p>
            </div>
          ` : ''}
          
          <div class="footer">
            <p>${isQuotation ? 'Gracias por su interés' : 'Gracias por su preferencia'}</p>
            <p>Este documento fue generado electrónicamente</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Imprime la factura de venta (o la cotización, con `status = 'quotation'`):
   * abre el documento del motor en una pestaña que lanza el diálogo de
   * impresión. Se abre dentro del clic (sin `await` antes), así el bloqueador
   * de ventanas emergentes no la corta.
   */
  static async printInvoiceHTML(data: InvoiceDataForPDF): Promise<void> {
    imprimirDocumento(tipoVenta(data), data.id);
  }

  /**
   * @deprecated Plantilla de navegador anterior al motor único (ver
   * `generateInvoiceHTML`). Para un documento real: `imprimirDocumento('factura-compra', id)`.
   */
  static generatePurchaseInvoiceHTML(data: InvoiceDataForPDF): string {
    const primaryColor = colorHexSeguro(data.organization?.primary_color) || '#2563eb';
    const secondaryColor = colorHexSeguro(data.organization?.secondary_color) || '#1e40af';
    const moneda = monedaDe(data);
    const formatCurrency = crearFormateadorMoneda(moneda);

    const formatDate = (dateString: string) => {
      if (!dateString) return '-';
      return new Date(dateString).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const statusText: Record<string, string> = {
      'draft': 'Borrador',
      'received': 'Recibida',
      'paid': 'Pagada',
      'partial': 'Pago Parcial',
      'void': 'Anulada',
      'confirmed': 'Confirmada'
    };

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Factura de Compra ${e(data.number)}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #333; }
          .invoice { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid ${primaryColor}; }
          .logo-section { display: flex; align-items: center; gap: 12px; }
          .logo-img { max-height: 60px; max-width: 180px; object-fit: contain; }
          .logo-text { font-size: 24px; font-weight: bold; color: ${primaryColor}; }
          .invoice-title { text-align: right; }
          .invoice-title h1 { font-size: 28px; color: #333; margin-bottom: 5px; }
          .invoice-number { font-size: 14px; color: #666; }
          .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; margin-top: 5px; }
          .status-draft { background: #fef3c7; color: #92400e; }
          .status-received { background: #dbeafe; color: ${secondaryColor}; }
          .status-paid { background: #d1fae5; color: #065f46; }
          .status-partial { background: #ede9fe; color: #5b21b6; }
          .status-void { background: #f3f4f6; color: #374151; }
          .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .info-box { width: 48%; }
          .info-box h3 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; letter-spacing: 0.5px; }
          .info-box p { margin-bottom: 4px; line-height: 1.5; }
          .info-box .name { font-weight: 600; font-size: 14px; color: #111; }
          .dates { display: flex; gap: 40px; margin-bottom: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .dates div { }
          .dates label { font-size: 11px; color: #6b7280; display: block; margin-bottom: 4px; }
          .dates span { font-weight: 600; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: ${primaryColor}; color: white; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
          th:last-child { text-align: right; }
          td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
          td:last-child { text-align: right; }
          .totals { margin-left: auto; width: 280px; }
          .totals div { display: flex; justify-content: space-between; padding: 8px 0; }
          .totals .subtotal { border-bottom: 1px solid #e5e7eb; }
          .totals .discount { color: #dc2626; }
          .totals .total { font-size: 16px; font-weight: bold; border-top: 2px solid ${primaryColor}; padding-top: 12px; margin-top: 4px; }
          .totals .balance { color: #dc2626; font-weight: bold; }
          .totals .paid { color: #059669; font-weight: 600; }
          .debt-badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 700; margin-top: 8px; }
          .debt-badge-pending { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
          .debt-badge-paid { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
          .tax-included-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #ede9fe; color: #5b21b6; margin-left: 6px; }
          .item-discount { color: #dc2626; font-size: 11px; }
          .notes { margin-top: 30px; padding: 15px; background: #f9fafb; border-radius: 8px; }
          .notes h4 { font-size: 11px; text-transform: uppercase; color: #6b7280; margin-bottom: 8px; }
          .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #9ca3af; padding-top: 20px; border-top: 1px solid #e5e7eb; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .invoice { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="logo-section">
              ${data.organization?.logo_url ? `<img src="${e(data.organization.logo_url)}" alt="Logo" class="logo-img" />` : `<div class="logo-text">${e(data.organization?.name || 'Mi Empresa')}</div>`}
            </div>
            <div class="invoice-title">
              <h1>FACTURA DE COMPRA</h1>
              <div class="invoice-number">${e(data.number)}</div>
              <span class="status status-${e(data.status)}">${e(statusText[data.status] || data.status)}</span>
            </div>
          </div>
          
          ${['void', 'voided', 'cancelled'].includes(data.status) ? `
          <div style="border:2px solid #dc2626;color:#dc2626;background:#fef2f2;padding:10px 16px;border-radius:8px;text-align:center;font-weight:bold;font-size:16px;letter-spacing:2px;margin-bottom:20px;">FACTURA DE COMPRA ANULADA</div>
          ` : ''}
          <div class="info-section">
            <div class="info-box">
              <h3>Empresa</h3>
              <p class="name">${e(data.organization?.name || 'Mi Empresa')}</p>
              ${data.organization?.tax_id ? `<p>NIT: ${e(data.organization.tax_id)}</p>` : ''}
              ${data.organization?.address ? `<p>${e(data.organization.address)}</p>` : ''}
              ${data.organization?.phone ? `<p>Tel: ${e(data.organization.phone)}</p>` : ''}
              ${data.organization?.email ? `<p>${e(data.organization.email)}</p>` : ''}
            </div>
            <div class="info-box">
              <h3>Proveedor</h3>
              <p class="name">${e(data.customer?.full_name || 'N/A')}</p>
              ${(data.customer?.doc_number || data.customer?.tax_id) ? `<p>${e(data.customer?.doc_type ? data.customer.doc_type.toUpperCase() : 'NIT')}: ${e(data.customer.doc_number || data.customer.tax_id)}</p>` : ''}
              ${data.customer?.address ? `<p>${e(data.customer.address)}</p>` : ''}
              ${data.customer?.phone ? `<p>Tel: ${e(data.customer.phone)}</p>` : ''}
              ${data.customer?.email ? `<p>${e(data.customer.email)}</p>` : ''}
            </div>
          </div>
          
          <div class="dates">
            <div>
              <label>Fecha de Emisión</label>
              <span>${formatDate(data.issue_date)}</span>
            </div>
            <div>
              <label>Fecha de Vencimiento</label>
              <span>${formatDate(data.due_date)}</span>
            </div>
            <div>
              <label>Moneda</label>
              <span>${moneda.code}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="width: 40%">Descripción</th>
                <th style="width: 8%">Cant.</th>
                <th style="width: 13%">Precio Unit.</th>
                <th style="width: 10%">Descuento</th>
                <th style="width: 9%">Impuesto</th>
                <th style="width: 15%">Total</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map(item => `
                <tr>
                  <td>${item.sku ? `<span style="color:#6b7280;font-size:11px;">SKU: ${e(item.sku)}</span><br/>` : ''}${e(item.description)}${item.serial_numbers && item.serial_numbers.length > 0 ? `<br/><span style="font-size:10px;color:#6b7280;">Seriales: ${e(item.serial_numbers.join(', '))}</span>` : ''}</td>
                  <td>${e(item.qty)}</td>
                  <td>${formatCurrency(item.unit_price)}</td>
                  <td>${item.discount_amount && item.discount_amount > 0 ? `<span class="item-discount">- ${formatCurrency(item.discount_amount)}</span>` : '-'}</td>
                  <td>${item.tax_rate ? `${e(item.tax_rate)}%${item.tax_included ? ' (incl.)' : ''}` : '-'}</td>
                  <td>${formatCurrency(item.total_line)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="totals">
            <div class="subtotal">
              <span>Subtotal${data.tax_included ? ' <span class="tax-included-badge">Imp. incluidos</span>' : ''}</span>
              <span>${formatCurrency(data.subtotal)}</span>
            </div>
            ${data.discount_total && data.discount_total > 0 ? `
            <div class="discount">
              <span>Descuentos</span>
              <span>- ${formatCurrency(data.discount_total)}</span>
            </div>
            ` : ''}
            <div>
              <span>Impuestos</span>
              <span>${formatCurrency(data.tax_total)}</span>
            </div>
            <div class="total">
              <span>Total</span>
              <span>${formatCurrency(data.total)}</span>
            </div>
            ${data.credit_applied && data.credit_applied > 0 ? `
              <div>
                <span>Nota crédito / saldo aplicado</span>
                <span>- ${formatCurrency(data.credit_applied)}</span>
              </div>
            ` : ''}
            ${data.balance > 0 ? `
              <div class="balance">
                <span>Saldo Pendiente</span>
                <span>${formatCurrency(data.balance)}</span>
              </div>
            ` : `
              <div class="paid">
                <span>Pagado</span>
                <span>${formatCurrency(data.total - (data.balance || 0))}</span>
              </div>
            `}
          </div>
          
          ${data.notes ? `
            <div class="notes">
              <h4>Notas</h4>
              <p>${e(data.notes)}</p>
            </div>
          ` : ''}
          
          <div class="footer">
            <p>Documento interno - Factura de compra</p>
            <p>Este documento fue generado electrónicamente</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /** Imprime la factura de compra: documento del motor en una pestaña con el diálogo de impresión. */
  static printPurchaseInvoiceHTML(data: InvoiceDataForPDF): void {
    imprimirDocumento('factura-compra', data.id);
  }

  /**
   * Descarga la factura de compra en PDF (antes era un `.html` con nombre de
   * «PDF»). Si el servidor no puede generar PDF, descarga el HTML imprimible.
   */
  static async downloadPurchaseInvoicePDF(data: InvoiceDataForPDF, filename?: string): Promise<void> {
    try {
      await descargarConNombre('factura-compra', data.id, filename);
    } catch (error) {
      console.error('Error descargando PDF:', error);
      throw error;
    }
  }
}
