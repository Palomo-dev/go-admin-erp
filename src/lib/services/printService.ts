import { Sale, SaleItem, Customer, Payment } from '../../components/pos/types';
import { formatCurrency } from '@/utils/Utils';

// Interfaz para datos del negocio/organización
export interface BusinessInfo {
  name: string;
  legalName?: string;
  nit?: string;
  taxId?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
}

// Interfaz para datos de la sucursal
export interface BranchInfo {
  name?: string;
  address?: string;
  city?: string;
  phone?: string;
}

// Interfaz para datos del cajero/vendedor
export interface CashierInfo {
  name: string;
  email?: string;
}

// Traducción de métodos de pago a español
const PAYMENT_METHOD_NAMES: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  credit_card: 'Tarjeta de Crédito',
  debit_card: 'Tarjeta Débito',
  transfer: 'Transferencia',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  pse: 'PSE',
  payu: 'PayU',
  mp: 'Mercado Pago',
  credit: 'Crédito',
  check: 'Cheque',
  other: 'Otro'
};

const translatePaymentMethod = (method: string): string => {
  return PAYMENT_METHOD_NAMES[method?.toLowerCase()] || method || 'Efectivo';
};

export class PrintService {
  /**
   * Generar HTML del ticket para impresión
   */
  static generateTicketHTML(
    sale: Sale,
    saleItems: SaleItem[],
    customer?: Customer,
    payments: Payment[] = [],
    business?: BusinessInfo,
    cashier?: CashierInfo,
    branch?: BranchInfo
  ): string {
    const businessName = business?.name || 'Mi Empresa';
    const businessAddress = business?.address || '';
    // Nombre del cliente: priorizar full_name, luego first_name + last_name
    const customerName = customer ? 
      (customer.full_name || 
       [(customer as any).first_name, (customer as any).last_name].filter(Boolean).join(' ') ||
       customer.email ||
       'Cliente') : null;
    // Documento del cliente
    const customerDoc = customer?.doc_number || (customer as any)?.identification_number || null;
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Ticket de Venta</title>
    <style>
        @media print {
            @page { 
                margin: 5mm; 
                size: 80mm auto; 
            }
            body { 
                margin: 0; 
                font-family: 'Courier New', monospace; 
                font-size: 12px; 
                line-height: 1.2; 
                color: black;
            }
        }
        body {
            width: 80mm;
            margin: 0 auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.2;
            color: black;
            background: white;
            padding: 10px;
        }
        .header {
            text-align: center;
            border-bottom: 1px dashed #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .business-name {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        .business-address {
            font-size: 10px;
            margin-bottom: 5px;
        }
        .sale-info {
            margin-bottom: 10px;
            font-size: 10px;
        }
        .customer-info {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 5px 0;
            margin-bottom: 10px;
            font-size: 10px;
        }
        .items-header {
            border-bottom: 1px solid #000;
            padding-bottom: 2px;
            margin-bottom: 5px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
        }
        .item {
            margin-bottom: 3px;
            font-size: 10px;
        }
        .item-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1px;
        }
        .item-name {
            font-weight: bold;
        }
        .item-details {
            color: #666;
            font-size: 9px;
        }
        .totals {
            border-top: 1px solid #000;
            margin-top: 10px;
            padding-top: 5px;
        }
        .total-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
        }
        .total-final {
            font-weight: bold;
            font-size: 14px;
            border-top: 1px solid #000;
            padding-top: 5px;
            margin-top: 5px;
        }
        .payments {
            border-top: 1px dashed #000;
            margin-top: 10px;
            padding-top: 10px;
        }
        .payment-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
            font-size: 10px;
        }
        .footer {
            text-align: center;
            margin-top: 20px;
            font-size: 10px;
            border-top: 1px dashed #000;
            padding-top: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="business-name">${businessName}</div>
        ${business?.legalName ? `<div class="business-legal">${business.legalName}</div>` : ''}
        ${business?.nit ? `<div class="business-nit"><strong>NIT:</strong> ${business.nit}</div>` : ''}
        ${business?.taxId && !business?.nit ? `<div class="business-nit"><strong>ID Fiscal:</strong> ${business.taxId}</div>` : ''}
        ${businessAddress ? `<div class="business-address">${businessAddress}</div>` : ''}
        ${business?.city ? `<div class="business-address">${business.city}</div>` : ''}
        ${business?.phone ? `<div class="business-address">Tel: ${business.phone}</div>` : ''}
        ${branch?.name ? `<div class="business-address" style="margin-top: 5px; font-weight: bold;">Sucursal: ${branch.name}</div>` : ''}
        ${branch?.address ? `<div class="business-address">${branch.address}</div>` : ''}
        ${branch?.city ? `<div class="business-address">${branch.city}</div>` : ''}
        ${branch?.phone ? `<div class="business-address">Tel Sucursal: ${branch.phone}</div>` : ''}
    </div>

    <div class="sale-info">
        <div><strong>Ticket:</strong> ${sale.id}</div>
        <div><strong>Fecha:</strong> ${dateStr}</div>
        <div><strong>Hora:</strong> ${timeStr}</div>
        <div><strong>Cajero:</strong> ${cashier?.name || 'Sistema POS'}</div>
    </div>

    ${customerName ? `
    <div class="customer-info">
        <div><strong>Cliente:</strong> ${customerName}</div>
        ${customerDoc ? `<div><strong>Documento:</strong> ${customerDoc}</div>` : ''}
        ${customer?.phone ? `<div><strong>Teléfono:</strong> ${customer.phone}</div>` : ''}
        ${customer?.email ? `<div><strong>Email:</strong> ${customer.email}</div>` : ''}
    </div>
    ` : ''}

    <div class="items-header">
        <span>PRODUCTO</span>
        <span>TOTAL</span>
    </div>

    ${saleItems.map(item => {
      // Obtener nombre del producto de múltiples fuentes posibles
      let productName = 'Producto';
      
      // Parsear notes si es string
      let notesObj: any = {};
      try {
        notesObj = typeof item.notes === 'string' ? JSON.parse(item.notes || '{}') : (item.notes || {});
      } catch { notesObj = {}; }
      
      // Prioridad 1: product_name directo
      if ((item as any).product_name && (item as any).product_name !== 'Producto') {
        productName = (item as any).product_name;
      }
      // Prioridad 2: product.name
      else if ((item as any).product?.name && (item as any).product?.name !== 'Producto') {
        productName = (item as any).product.name;
      }
      // Prioridad 3: products.name (relación de Supabase)
      else if ((item as any).products?.name) {
        productName = (item as any).products.name;
      }
      // Prioridad 4: notes.product_name (parseado)
      else if (notesObj?.product_name && notesObj?.product_name !== 'Producto') {
        productName = notesObj.product_name;
      }
      
      return `
    <div class="item">
        <div class="item-line">
            <span class="item-name">${productName}</span>
            <span>${formatCurrency(item.total)}</span>
        </div>
        <div class="item-details">
            ${item.quantity} × ${formatCurrency(item.unit_price)}
            ${item.tax_amount && item.tax_amount > 0 ? ` (IVA: ${formatCurrency(item.tax_amount)})` : ''}
            ${item.discount_amount && item.discount_amount > 0 ? ` (Desc: ${formatCurrency(item.discount_amount)})` : ''}
        </div>
    </div>
    `;
    }).join('')}

    <div class="totals">
        <div class="total-line">
            <span>Subtotal:</span>
            <span>${formatCurrency(sale.subtotal)}</span>
        </div>
        ${sale.discount_total > 0 ? `
        <div class="total-line">
            <span>Descuento:</span>
            <span>-${formatCurrency(sale.discount_total)}</span>
        </div>
        ` : ''}
        ${sale.tax_total > 0 ? `
        <div class="total-line">
            <span>Impuestos:</span>
            <span>${formatCurrency(sale.tax_total)}</span>
        </div>
        ` : ''}
        <div class="total-line total-final">
            <span>TOTAL:</span>
            <span>${formatCurrency(sale.total)}</span>
        </div>
    </div>

    ${payments.length > 0 ? `
    <div class="payments">
        <div style="font-weight: bold; margin-bottom: 5px;">PAGOS:</div>
        ${payments.map(payment => `
        <div class="payment-line">
            <span>${translatePaymentMethod(payment.method)}:</span>
            <span>${formatCurrency(payment.amount)}</span>
        </div>
        `).join('')}
        ${false ? `
        <div class="payment-line" style="font-weight: bold;">
            <span>Cambio:</span>
            <span>$0</span>
        </div>
        ` : ''}
    </div>
    ` : ''}

    <div class="footer">
        <div>¡Gracias por su compra!</div>
        <div>Sistema POS - ${dateStr}</div>
    </div>
</body>
</html>
    `;
  }

  /**
   * Imprimir ticket directamente
   */
  static printTicket(
    sale: Sale,
    saleItems: SaleItem[],
    customer?: Customer,
    payments: Payment[] = [],
    business?: BusinessInfo,
    cashier?: CashierInfo,
    branch?: BranchInfo
  ): void {
    const html = this.generateTicketHTML(
      sale, 
      saleItems, 
      customer, 
      payments, 
      business, 
      cashier,
      branch
    );

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      
      // Usar setTimeout para evitar problemas con callbacks obsoletos
      setTimeout(() => {
        try {
          if (printWindow && !printWindow.closed) {
            printWindow.focus();
            printWindow.print();
          }
        } catch (e) {
          console.warn('Error al imprimir:', e);
        }
      }, 500);
    }
  }

  /**
   * Descargar ticket como archivo HTML
   */
  static downloadTicket(
    sale: Sale,
    saleItems: SaleItem[],
    customer?: Customer,
    payments: Payment[] = [],
    business?: BusinessInfo,
    cashier?: CashierInfo,
    branch?: BranchInfo
  ): void {
    const html = this.generateTicketHTML(
      sale, 
      saleItems, 
      customer, 
      payments, 
      business, 
      cashier,
      branch
    );

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ticket-${sale.id}.html`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Imprimir pre-cuenta de mesa (ticket sin pago)
   */
  static printPreCuenta(
    tableName: string,
    items: Array<{ product?: { name?: string }; quantity: number; unit_price: number; total: number; tax_amount?: number; discount_amount?: number; notes?: any }>,
    subtotal: number,
    taxTotal: number,
    discountTotal: number,
    total: number,
    business?: BusinessInfo,
    branch?: BranchInfo,
  ): void {
    const dateStr = new Date().toLocaleDateString('es-CO');
    const timeStr = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const businessName = business?.name || 'Restaurante';
    const businessAddress = business?.address || '';

    const itemsHTML = items.map(item => {
      const name = item.product?.name || 'Producto';
      return `
        <div class="item">
          <div class="item-line">
            <span class="item-name">${name}</span>
            <span>${formatCurrency(item.total)}</span>
          </div>
          <div class="item-details">
            ${item.quantity} × ${formatCurrency(item.unit_price)}
          </div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pre-Cuenta - ${tableName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:10px;font-size:12px}
  .header{text-align:center;border-bottom:1px dashed #000;padding-bottom:8px;margin-bottom:8px}
  .business-name{font-size:16px;font-weight:bold}
  .business-address{font-size:10px;color:#555}
  .pre-cuenta-title{text-align:center;font-size:14px;font-weight:bold;margin:8px 0;padding:6px;border:2px dashed #000;letter-spacing:1px}
  .mesa-info{text-align:center;margin-bottom:8px;font-size:13px;font-weight:bold}
  .items-header{display:flex;justify-content:space-between;font-weight:bold;border-bottom:1px solid #000;padding:4px 0;margin-bottom:4px;font-size:11px}
  .item{padding:3px 0;border-bottom:1px dotted #ccc}
  .item-line{display:flex;justify-content:space-between}
  .item-name{flex:1;margin-right:8px;font-size:11px}
  .item-details{font-size:10px;color:#666;margin-top:1px}
  .totals{border-top:1px dashed #000;margin-top:8px;padding-top:8px}
  .total-line{display:flex;justify-content:space-between;padding:2px 0}
  .total-final{font-size:16px;font-weight:bold;border-top:2px solid #000;margin-top:4px;padding-top:6px}
  .footer{text-align:center;border-top:1px dashed #000;margin-top:10px;padding-top:8px;font-size:10px;color:#666}
  @media print{body{width:100%}@page{size:80mm auto;margin:0}}
</style></head><body>
  <div class="header">
    <div class="business-name">${businessName}</div>
    ${business?.nit ? `<div class="business-address"><strong>NIT:</strong> ${business.nit}</div>` : ''}
    ${businessAddress ? `<div class="business-address">${businessAddress}</div>` : ''}
    ${business?.phone ? `<div class="business-address">Tel: ${business.phone}</div>` : ''}
    ${branch?.name ? `<div class="business-address" style="margin-top:4px;font-weight:bold">Sucursal: ${branch.name}</div>` : ''}
    ${branch?.address ? `<div class="business-address">${branch.address}</div>` : ''}
  </div>
  <div class="pre-cuenta-title">*** PRE-CUENTA ***</div>
  <div class="mesa-info">${tableName}</div>
  <div style="text-align:center;font-size:11px;margin-bottom:8px">${dateStr} - ${timeStr}</div>
  <div class="items-header"><span>PRODUCTO</span><span>TOTAL</span></div>
  ${itemsHTML}
  <div class="totals">
    <div class="total-line"><span>Subtotal:</span><span>${formatCurrency(subtotal)}</span></div>
    ${discountTotal > 0 ? `<div class="total-line"><span>Descuento:</span><span>-${formatCurrency(discountTotal)}</span></div>` : ''}
    ${taxTotal > 0 ? `<div class="total-line"><span>Impuestos:</span><span>${formatCurrency(taxTotal)}</span></div>` : ''}
    <div class="total-line total-final"><span>TOTAL:</span><span>${formatCurrency(total)}</span></div>
  </div>
  <div class="footer">
    <div style="font-weight:bold">*** NO ES FACTURA ***</div>
    <div>Este documento es solo informativo</div>
    <div style="margin-top:4px">¡Gracias por su preferencia!</div>
  </div>
</body></html>`;

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        try {
          if (printWindow && !printWindow.closed) {
            printWindow.focus();
            printWindow.print();
          }
        } catch (e) {
          console.warn('Error al imprimir pre-cuenta:', e);
        }
      }, 500);
    }
  }

  /**
   * Configurar impresora térmica (stub para futuras implementaciones)
   */
  static configureThermalPrinter(config: {
    type: 'bluetooth' | 'usb' | 'network';
    address?: string;
    port?: number;
    deviceName?: string;
  }): void {
    console.log('Configurando impresora térmica:', config);
    // TODO: Implementar configuración de impresora térmica real
  }

  /**
   * Validar si se puede imprimir
   */
  static canPrint(): boolean {
    return typeof window !== 'undefined' && 
           (window.print !== undefined || (window as any).webkit?.messageHandlers !== undefined);
  }

  /**
   * Imprimir usando diferentes métodos según el dispositivo
   */
  static smartPrint(
    sale: Sale,
    saleItems: SaleItem[],
    customer?: Customer,
    payments: Payment[] = [],
    business?: BusinessInfo,
    cashier?: CashierInfo,
    branch?: BranchInfo
  ): void {
    if (this.canPrint()) {
      this.printTicket(sale, saleItems, customer, payments, business, cashier, branch);
    } else {
      // Fallback: descargar como HTML
      this.downloadTicket(sale, saleItems, customer, payments, business, cashier, branch);
      alert('La impresión directa no está disponible. El ticket se descargará como archivo HTML.');
    }
  }
}
