import { Sale, SaleItem, Customer, Payment } from '../../components/pos/types';
import { formatCurrency } from '@/utils/Utils';

export class PrintService {
  /**
   * Generar HTML del ticket para impresión
   */
  static generateTicketHTML(
    sale: Sale,
    saleItems: SaleItem[],
    customer?: Customer,
    payments: Payment[] = [],
    businessName: string = 'Mi Empresa',
    businessAddress: string = 'Dirección de la empresa'
  ): string {
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
        <div class="business-address">${businessAddress}</div>
    </div>

    <div class="sale-info">
        <div><strong>Ticket:</strong> ${sale.id}</div>
        <div><strong>Fecha:</strong> ${dateStr}</div>
        <div><strong>Hora:</strong> ${timeStr}</div>
        <div><strong>Cajero:</strong> Sistema POS</div>
    </div>

    ${customer ? `
    <div class="customer-info">
        <div><strong>Cliente:</strong> ${customer.full_name}</div>
        ${customer.doc_number ? `<div><strong>Documento:</strong> ${customer.doc_number}</div>` : ''}
        ${customer.phone ? `<div><strong>Teléfono:</strong> ${customer.phone}</div>` : ''}
        ${customer.email ? `<div><strong>Email:</strong> ${customer.email}</div>` : ''}
    </div>
    ` : ''}

    <div class="items-header">
        <span>PRODUCTO</span>
        <span>TOTAL</span>
    </div>

    ${saleItems.map(item => `
    <div class="item">
        <div class="item-line">
            <span class="item-name">${item.notes?.product_name || 'Producto'}</span>
            <span>${formatCurrency(item.total)}</span>
        </div>
        <div class="item-details">
            ${item.quantity} × ${formatCurrency(item.unit_price)}
            ${item.tax_amount && item.tax_amount > 0 ? ` (IVA: ${formatCurrency(item.tax_amount)})` : ''}
            ${item.discount_amount && item.discount_amount > 0 ? ` (Desc: ${formatCurrency(item.discount_amount)})` : ''}
        </div>
    </div>
    `).join('')}

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
            <span>${payment.method || 'cash'}:</span>
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
    businessName?: string,
    businessAddress?: string
  ): void {
    const html = this.generateTicketHTML(
      sale, 
      saleItems, 
      customer, 
      payments, 
      businessName, 
      businessAddress
    );

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      
      printWindow.onload = () => {
        printWindow.print();
        setTimeout(() => printWindow.close(), 1000);
      };
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
    businessName?: string,
    businessAddress?: string
  ): void {
    const html = this.generateTicketHTML(
      sale, 
      saleItems, 
      customer, 
      payments, 
      businessName, 
      businessAddress
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
    businessName?: string,
    businessAddress?: string
  ): void {
    if (this.canPrint()) {
      this.printTicket(sale, saleItems, customer, payments, businessName, businessAddress);
    } else {
      // Fallback: descargar como HTML
      this.downloadTicket(sale, saleItems, customer, payments, businessName, businessAddress);
      alert('La impresión directa no está disponible. El ticket se descargará como archivo HTML.');
    }
  }
}
