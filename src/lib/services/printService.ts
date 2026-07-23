import { Sale, SaleItem, Customer, Payment } from '../../components/pos/types';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';

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
  logoUrl?: string;
  fiscal_responsibilities?: string[];
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

// Línea de impuesto para desglose dinámico en el recibo (IVA, ICA, etc.)
export interface TaxLine {
  name: string;
  amount: number;
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
   * Obtiene la información del negocio y la sucursal principal desde Supabase
   */
  static async getBusinessAndBranch(
    organizationId: number
  ): Promise<{ business?: BusinessInfo; branch?: BranchInfo }> {
    try {
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, legal_name, nit, tax_id, phone, email, address, city, logo_url, fiscal_responsibilities')
        .eq('id', organizationId)
        .maybeSingle();

      const { data: branch } = await supabase
        .from('branches')
        .select('name, address, city, phone')
        .eq('organization_id', organizationId)
        .eq('is_main', true)
        .maybeSingle();

      const business: BusinessInfo | undefined = org
        ? {
            name: org.name || 'Mi Empresa',
            legalName: org.legal_name || undefined,
            nit: org.nit || undefined,
            taxId: org.tax_id || undefined,
            address: org.address || undefined,
            city: org.city || undefined,
            phone: org.phone || undefined,
            email: org.email || undefined,
            logoUrl: org.logo_url || undefined,
            fiscal_responsibilities: org.fiscal_responsibilities || undefined,
          }
        : undefined;

      const branchInfo: BranchInfo | undefined = branch
        ? {
            name: branch.name || undefined,
            address: branch.address || undefined,
            city: branch.city || undefined,
            phone: branch.phone || undefined,
          }
        : undefined;

      return { business, branch: branchInfo };
    } catch (e) {
      console.warn('Error obteniendo datos de negocio/sucursal:', e);
      return {};
    }
  }

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
    branch?: BranchInfo,
    taxLines?: TaxLine[],
    deliveryInfo?: { type: string; address: string; driverName?: string }
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
        ${business?.logoUrl
          ? `<img src="${business.logoUrl}" alt="${businessName}" style="max-height: 70px; max-width: 100%; margin: 0 auto 8px; display: block;" />`
          : `<div class="business-name">${businessName}</div>
        ${business?.legalName && business.legalName !== businessName ? `<div class="business-legal">${business.legalName}</div>` : ''}`}
        ${business?.nit ? `<div class="business-nit"><strong>NIT:</strong> ${business.nit}</div>` : ''}
        ${business?.taxId && !business?.nit ? `<div class="business-nit"><strong>ID Fiscal:</strong> ${business.taxId}</div>` : ''}
        ${businessAddress ? `<div class="business-address">${businessAddress}</div>` : ''}
        ${business?.city ? `<div class="business-address">${business.city}</div>` : ''}
        ${business?.phone ? `<div class="business-address">Tel: ${business.phone}</div>` : ''}
        ${business?.email ? `<div class="business-address">${business.email}</div>` : ''}
        ${business?.fiscal_responsibilities && business.fiscal_responsibilities.length > 0 ? `<div class="business-address"><strong>Régimen:</strong> ${business.fiscal_responsibilities.join(', ')}</div>` : ''}
        ${branch?.address ? `<div class="business-address" style="margin-top: 5px;">${branch.address}</div>` : ''}
        ${branch?.city ? `<div class="business-address">${branch.city}</div>` : ''}
        ${branch?.phone ? `<div class="business-address">Tel: ${branch.phone}</div>` : ''}
    </div>

    <div class="sale-info">
        <div><strong>Ticket:</strong> ${sale.id}</div>
        <div><strong>Fecha:</strong> ${dateStr}</div>
        <div><strong>Hora:</strong> ${timeStr}</div>
        ${(sale as any)._source === 'web'
          ? `<div><strong>Origen:</strong> Facturado por la web</div>`
          : `<div><strong>Cajero:</strong> ${cashier?.name || (sale as any).seller_name || 'Sistema POS'}</div>`}
    </div>

    ${customerName ? `
    <div class="customer-info">
        <div><strong>Cliente:</strong> ${customerName}</div>
        ${customerDoc ? `<div><strong>Documento:</strong> ${(customer as any).doc_type ? (customer as any).doc_type + ': ' : ''}${customerDoc}</div>` : ''}
        ${customer?.phone ? `<div><strong>Teléfono:</strong> ${customer.phone}</div>` : ''}
        ${customer?.email ? `<div><strong>Email:</strong> ${customer.email}</div>` : ''}
        ${(customer as any).address ? `<div><strong>Dirección:</strong> ${(customer as any).address}</div>` : ''}
        ${(customer as any).fiscal_responsibilities && (customer as any).fiscal_responsibilities.length > 0 ? `<div><strong>Régimen:</strong> ${(customer as any).fiscal_responsibilities.join(', ')}</div>` : ''}
    </div>
    ` : ''}

    ${deliveryInfo ? `
    <div class="customer-info">
        <div><strong>Entrega:</strong> ${deliveryInfo.type}</div>
        <div><strong>Dirección:</strong> ${deliveryInfo.address}</div>
        ${deliveryInfo.driverName ? `<div><strong>Conductor:</strong> ${deliveryInfo.driverName}</div>` : ''}
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

      // Variantes elegidas (ej. Talla: M, Color: Rojo)
      const variantData = (item as any).product?.variant_data || (item as any).products?.variant_data || null;
      const variantEntries = variantData ? Object.entries(variantData).filter(([, v]) => !!v) : [];
      const variantLine = variantEntries.length > 0
        ? `<div class="item-details">${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join(' · ')}</div>`
        : '';

      // Modificadores elegidos (ej. Salsa: BBQ, Extra queso)
      const modifiers: Array<{ name: string; extraPrice: number }> = Array.isArray(notesObj?.modifiers) ? notesObj.modifiers : [];
      const modifiersLine = modifiers.length > 0
        ? `<div class="item-details">${modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatCurrency(m.extraPrice)})` : m.name).join(' · ')}</div>`
        : '';

      return `
    <div class="item">
        <div class="item-line">
            <span class="item-name">${productName}</span>
            <span>${formatCurrency(item.total)}</span>
        </div>
        <div class="item-details">
            ${item.quantity} × ${formatCurrency(item.unit_price)}
            ${item.tax_amount && item.tax_amount > 0 ? ` (Imp.: ${formatCurrency(item.tax_amount)})` : ''}
            ${item.discount_amount && item.discount_amount > 0 ? ` (Desc: ${formatCurrency(item.discount_amount)})` : ''}
        </div>
        ${variantLine}
        ${modifiersLine}
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
        ${taxLines && taxLines.length > 0
          ? taxLines.map(t => `
        <div class="total-line">
            <span>${t.name}${(sale as any).tax_included ? ' (incluido)' : ''}:</span>
            <span>${formatCurrency(t.amount)}</span>
        </div>
        `).join('')
          : (sale.tax_total > 0 ? `
        <div class="total-line">
            <span>${(sale as any).tax_included ? 'Impuestos (incluidos):' : 'Impuestos:'}</span>
            <span>${formatCurrency(sale.tax_total)}</span>
        </div>
        ` : '')}
        ${Number(sale.delivery_fee) > 0 ? `
        <div class="total-line">
            <span>Envío:</span>
            <span>${formatCurrency(sale.delivery_fee)}</span>
        </div>
        ` : ''}
        ${Number(sale.tip_amount) > 0 ? `
        <div class="total-line">
            <span>Propina:</span>
            <span>${formatCurrency(sale.tip_amount)}</span>
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
        <div>${businessName} - ${dateStr}</div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dotted #999; font-size: 9px; color: #777;">
            <div>GO Admin S.A.S | NIT: 901479683-5</div>
            <div>www.goadmin.io | 3113195711 | servicio@goadmin.io</div>
        </div>
        <div style="margin-top: 8px; text-align: center;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=https://goadmin.io" alt="QR" style="width: 80px; height: 80px;" />
        </div>
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
    branch?: BranchInfo,
    taxLines?: TaxLine[],
    deliveryInfo?: { type: string; address: string; driverName?: string }
  ): void {
    const html = this.generateTicketHTML(
      sale, 
      saleItems, 
      customer, 
      payments, 
      business, 
      cashier,
      branch,
      taxLines,
      deliveryInfo
    );

    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      this.printWhenReady(printWindow);
    }
  }

  /**
   * Espera a que las imágenes (logo) carguen antes de imprimir, con fallback.
   */
  private static printWhenReady(printWindow: Window): void {
    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      try {
        if (!printWindow || printWindow.closed) return;
        printWindow.focus();
        if (typeof printWindow.print === 'function') {
          printWindow.print();
        }
      } catch (e) {
        console.warn('Error al imprimir:', e);
      }
    };

    const imgs = Array.from(printWindow.document.images || []);
    if (imgs.length > 0) {
      let pending = imgs.length;
      const onDone = () => {
        pending -= 1;
        if (pending <= 0) triggerPrint();
      };
      imgs.forEach((img) => {
        if (img.complete) {
          onDone();
        } else {
          img.addEventListener('load', onDone);
          img.addEventListener('error', onDone);
        }
      });
      setTimeout(triggerPrint, 3000);
    } else {
      setTimeout(triggerPrint, 300);
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
    branch?: BranchInfo,
    taxLines?: TaxLine[],
    deliveryInfo?: { type: string; address: string; driverName?: string }
  ): void {
    const html = this.generateTicketHTML(
      sale, 
      saleItems, 
      customer, 
      payments, 
      business, 
      cashier,
      branch,
      taxLines,
      deliveryInfo
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
   * Formato profesional igual al ticket de venta.
   */
  static printPreCuenta(
    tableName: string,
    items: Array<{ product?: { name?: string; variant_data?: Record<string, string> | null }; quantity: number; unit_price: number; total: number; tax_amount?: number; discount_amount?: number; notes?: any }>,
    subtotal: number,
    taxTotal: number,
    discountTotal: number,
    total: number,
    business?: BusinessInfo,
    branch?: BranchInfo,
    serverName?: string,
    driverName?: string,
    deliveryAddress?: string,
  ): void {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-CO');
    const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const businessName = business?.name || 'Restaurante';
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

    const itemsHTML = items.map(item => {
      const name = item.product?.name || 'Producto';
      let notesObj: any = {};
      try {
        notesObj = typeof item.notes === 'string' ? JSON.parse(item.notes || '{}') : (item.notes || {});
      } catch { notesObj = {}; }

      const variantEntries = item.product?.variant_data
        ? Object.entries(item.product.variant_data).filter(([, v]) => !!v)
        : [];
      const variantLine = variantEntries.length > 0
        ? `<div class="item-details">${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join(' · ')}</div>`
        : '';

      const modifiers: Array<{ name: string; extraPrice: number }> = Array.isArray(notesObj?.modifiers) ? notesObj.modifiers : [];
      const modifiersLine = modifiers.length > 0
        ? `<div class="item-details">${modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatCurrency(m.extraPrice)})` : m.name).join(' · ')}</div>`
        : '';

      const guestLine = notesObj?.guest_number
        ? `<div class="item-details">Comensal #${notesObj.guest_number}</div>`
        : '';

      const extraNotes = typeof notesObj === 'object' ? notesObj?.extra : (item.notes || '');
      const notesLine = extraNotes
        ? `<div class="item-details">Nota: ${extraNotes}</div>`
        : '';

      return `
    <div class="item">
        <div class="item-line">
            <span class="item-name">${item.quantity}× ${name}</span>
            <span>${formatCurrency(item.total)}</span>
        </div>
        <div class="item-details">
            ${formatCurrency(item.unit_price)} c/u
            ${item.tax_amount && Number(item.tax_amount) > 0 ? ` · Imp: ${formatCurrency(Number(item.tax_amount))}` : ''}
            ${item.discount_amount && Number(item.discount_amount) > 0 ? ` · Desc: -${formatCurrency(Number(item.discount_amount))}` : ''}
        </div>
        ${variantLine}
        ${modifiersLine}
        ${guestLine}
        ${notesLine}
    </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Pre-Cuenta - ${tableName}</title>
    <style>
        @media print {
            @page { margin: 5mm; size: 80mm auto; }
            body { margin: 0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.3; color: black; }
        }
        body {
            width: 80mm;
            margin: 0 auto;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.3;
            color: black;
            background: white;
            padding: 10px;
        }
        .header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 10px;
            margin-bottom: 10px;
        }
        .business-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
        .business-info { font-size: 10px; margin-bottom: 3px; color: #333; }
        .pre-cuenta-banner {
            text-align: center;
            font-size: 14px;
            font-weight: bold;
            border: 2px dashed #000;
            padding: 6px;
            margin: 8px 0;
            letter-spacing: 2px;
        }
        .meta-info {
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 6px 0;
            margin-bottom: 10px;
            font-size: 10px;
        }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .meta-label { font-weight: bold; }
        .items-header {
            display: flex;
            justify-content: space-between;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
            margin-bottom: 5px;
            font-weight: bold;
            font-size: 10px;
        }
        .item { margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px dotted #ccc; }
        .item-line { display: flex; justify-content: space-between; margin-bottom: 1px; }
        .item-name { font-weight: bold; font-size: 11px; }
        .item-details { color: #555; font-size: 9px; margin-top: 1px; }
        .totals {
            border-top: 2px solid #000;
            margin-top: 10px;
            padding-top: 8px;
        }
        .total-line { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 11px; }
        .total-final {
            font-weight: bold;
            font-size: 16px;
            border-top: 2px solid #000;
            padding-top: 6px;
            margin-top: 6px;
        }
        .footer {
            text-align: center;
            margin-top: 15px;
            font-size: 10px;
            border-top: 1px dashed #000;
            padding-top: 10px;
            color: #444;
        }
        .footer-brand {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px dotted #999;
            font-size: 9px;
            color: #777;
        }
    </style>
</head>
<body>
    <div class="header">
        ${business?.logoUrl
          ? `<img src="${business.logoUrl}" alt="${businessName}" style="max-height:60px;max-width:100%;margin:0 auto 6px;display:block" />`
          : `<div class="business-name">${businessName}</div>`}
        ${business?.logoUrl ? `<div class="business-name">${businessName}</div>` : ''}
        ${business?.nit ? `<div class="business-info"><strong>NIT:</strong> ${business.nit}</div>` : ''}
        ${business?.address ? `<div class="business-info">${business.address}</div>` : ''}
        ${business?.city ? `<div class="business-info">${business.city}</div>` : ''}
        ${business?.phone ? `<div class="business-info">Tel: ${business.phone}</div>` : ''}
        ${business?.fiscal_responsibilities && business.fiscal_responsibilities.length > 0 ? `<div class="business-info"><strong>Régimen:</strong> ${business.fiscal_responsibilities.join(', ')}</div>` : ''}
        ${branch?.name ? `<div class="business-info" style="margin-top:4px;font-weight:bold">Sucursal: ${branch.name}</div>` : ''}
        ${branch?.address ? `<div class="business-info">${branch.address}</div>` : ''}
        ${branch?.phone ? `<div class="business-info">Tel: ${branch.phone}</div>` : ''}
    </div>

    <div class="pre-cuenta-banner">*** PRE-CUENTA ***</div>

    <div class="meta-info">
        <div class="meta-row"><span class="meta-label">Mesa:</span><span>${tableName}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha:</span><span>${dateStr}</span></div>
        <div class="meta-row"><span class="meta-label">Hora:</span><span>${timeStr}</span></div>
        <div class="meta-row"><span class="meta-label">Items:</span><span>${items.length} productos (${itemCount} unidades)</span></div>
        ${serverName ? `<div class="meta-row"><span class="meta-label">Mesero:</span><span>${serverName}</span></div>` : ''}
        ${driverName ? `<div class="meta-row"><span class="meta-label">Conductor:</span><span>${driverName}</span></div>` : ''}
        ${deliveryAddress ? `<div class="meta-row"><span class="meta-label">Domicilio:</span><span>${deliveryAddress}</span></div>` : ''}
    </div>

    <div class="items-header">
        <span>DESCRIPCION</span>
        <span>TOTAL</span>
    </div>

    ${itemsHTML}

    <div class="totals">
        <div class="total-line"><span>Subtotal:</span><span>${formatCurrency(subtotal)}</span></div>
        ${discountTotal > 0 ? `<div class="total-line"><span>Descuento:</span><span>-${formatCurrency(discountTotal)}</span></div>` : ''}
        ${taxTotal > 0 ? `<div class="total-line"><span>Impuestos:</span><span>${formatCurrency(taxTotal)}</span></div>` : ''}
        <div class="total-line total-final"><span>TOTAL:</span><span>${formatCurrency(total)}</span></div>
    </div>

    <div class="footer">
        <div style="font-weight:bold;font-size:11px">*** NO ES FACTURA ***</div>
        <div>Este documento es solo informativo</div>
        <div style="margin-top:4px">¡Gracias por su preferencia!</div>
        <div class="footer-brand">
            <div>GO Admin S.A.S | NIT: 901479683-5</div>
            <div>www.goadmin.io | 3113195711 | servicio@goadmin.io</div>
        </div>
        <div style="margin-top: 8px;">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=https://goadmin.io" alt="QR" style="width: 80px; height: 80px;" />
        </div>
    </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=320,height=700');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      this.printWhenReady(printWindow);
    }
  }

  /**
   * Imprimir comanda de cocina consolidada (browser fallback).
   * Recibe todos los items agrupados y genera un solo ticket.
   */
  static printComanda(
    tableName: string,
    serverName: string | undefined,
    items: Array<{
      productName: string;
      quantity: number;
      notes?: string | null;
      station?: string | null;
      variantData?: Record<string, string> | null;
      modifiers?: Array<{ name: string; extraPrice: number }> | null;
    }>,
    business?: BusinessInfo,
    branch?: BranchInfo,
  ): void {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-CO');
    const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    const businessName = business?.name || 'Restaurante';

    const stationLabels: Record<string, string> = {
      kitchen: 'COCINA',
      bar: 'BAR',
      grill: 'PARRILLA',
      dessert: 'POSTRES',
      all: 'GENERAL',
    };

    const stations = Array.from(new Set(items.map((i) => i.station || 'all')));

    const stationsHTML = stations.map((station) => {
      const stationItems = items.filter((i) => (i.station || 'all') === station);
      const stationLabel = stationLabels[station] || station.toUpperCase();

      const stationItemsHTML = stationItems.map((item) => {
        const variantEntries = item.variantData
          ? Object.entries(item.variantData).filter(([, v]) => !!v)
          : [];
        const variantLine = variantEntries.length > 0
          ? `<div class="item-details">${variantEntries.map(([attr, value]) => `${attr}: ${value}`).join(' · ')}</div>`
          : '';

        const modifiersLine = item.modifiers && item.modifiers.length > 0
          ? `<div class="item-details">${item.modifiers.map((m) => m.extraPrice > 0 ? `${m.name} (+${formatCurrency(m.extraPrice)})` : m.name).join(' · ')}</div>`
          : '';

        const notesLine = item.notes
          ? `<div class="item-notes">>> ${item.notes}</div>`
          : '';

        return `
    <div class="item">
        <div class="item-line">
            <span class="item-qty">${item.quantity}×</span>
            <span class="item-name">${item.productName}</span>
        </div>
        ${variantLine}
        ${modifiersLine}
        ${notesLine}
    </div>`;
      }).join('');

      return `
    <div class="station-block">
        <div class="station-header">=== ${stationLabel} ===</div>
        ${stationItemsHTML}
    </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Comanda - ${tableName}</title>
    <style>
        @media print {
            @page { margin: 5mm; size: 80mm auto; }
            body { margin: 0; font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.4; color: black; }
        }
        body {
            width: 80mm;
            margin: 0 auto;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            line-height: 1.4;
            color: black;
            background: white;
            padding: 10px;
        }
        .header {
            text-align: center;
            border-bottom: 2px dashed #000;
            padding-bottom: 8px;
            margin-bottom: 8px;
        }
        .business-name { font-size: 15px; font-weight: bold; }
        .comanda-banner {
            text-align: center;
            font-size: 16px;
            font-weight: bold;
            border: 2px dashed #000;
            padding: 6px;
            margin: 6px 0;
            letter-spacing: 2px;
        }
        .meta-info {
            border-bottom: 1px dashed #000;
            padding: 4px 0;
            margin-bottom: 8px;
            font-size: 11px;
        }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .meta-label { font-weight: bold; }
        .station-block { margin-bottom: 10px; }
        .station-header {
            font-size: 13px;
            font-weight: bold;
            border-bottom: 1px solid #000;
            padding-bottom: 3px;
            margin-bottom: 5px;
        }
        .item { margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px dotted #ccc; }
        .item-line { display: flex; gap: 6px; align-items: baseline; }
        .item-qty { font-weight: bold; font-size: 14px; min-width: 28px; }
        .item-name { font-size: 12px; font-weight: bold; }
        .item-details { color: #555; font-size: 10px; margin-top: 1px; margin-left: 34px; }
        .item-notes { color: #333; font-size: 10px; font-style: italic; margin-top: 2px; margin-left: 34px; }
        .footer {
            text-align: center;
            margin-top: 12px;
            font-size: 10px;
            border-top: 1px dashed #000;
            padding-top: 8px;
            color: #444;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="business-name">${businessName}</div>
        ${branch?.name ? `<div style="font-size:10px">${branch.name}</div>` : ''}
    </div>

    <div class="comanda-banner">*** COMANDA ***</div>

    <div class="meta-info">
        <div class="meta-row"><span class="meta-label">Mesa:</span><span>${tableName}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha:</span><span>${dateStr} ${timeStr}</span></div>
        ${serverName ? `<div class="meta-row"><span class="meta-label">Mesero:</span><span>${serverName}</span></div>` : ''}
        <div class="meta-row"><span class="meta-label">Items:</span><span>${items.length} productos</span></div>
    </div>

    ${stationsHTML}

    <div class="footer">
        <div>Comanda generada por GO Admin</div>
        <div style="margin-top:4px;font-size:9px;color:#777">${dateStr} ${timeStr}</div>
    </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=320,height=700');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      this.printWhenReady(printWindow);
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
    branch?: BranchInfo,
    taxLines?: TaxLine[],
    deliveryInfo?: { type: string; address: string; driverName?: string }
  ): void {
    if (this.canPrint()) {
      this.printTicket(sale, saleItems, customer, payments, business, cashier, branch, taxLines, deliveryInfo);
    } else {
      // Fallback: descargar como HTML
      this.downloadTicket(sale, saleItems, customer, payments, business, cashier, branch, taxLines, deliveryInfo);
      alert('La impresión directa no está disponible. El ticket se descargará como archivo HTML.');
    }
  }
}
