import { Sale, SaleItem, Customer, Payment } from '../../components/pos/types';
import { formatCurrency } from '@/utils/Utils';
import { supabase } from '@/lib/supabase/config';
// Plantillas compartidas con el agente de impresion (print-agent/src/printing).
// Son las mismas que usan las impresoras fisicas, para que el ticket salga
// igual imprima por donde imprima.
import {
  buildSaleTicketHTML,
  buildKitchenTicketsHTML,
  buildElectronicInvoiceHTML,
  getPaperSpec,
  type SaleTicketDeliveryInfo,
  type SaleTicketPrintPayload,
  type KitchenTicketPrintPayload,
  type ElectronicInvoicePrintPayload,
} from '@printing';

/**
 * Datos de entrega tal como los arma el POS. Coincide con el tipo compartido;
 * se declara aqui para que los llamadores no dependan de `@printing`.
 */
export type DeliveryInfo = SaleTicketDeliveryInfo;

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

/**
 * Extras opcionales de la pre-cuenta.
 *
 * Van agrupados en un objeto y no como parametros sueltos porque la firma de
 * `printPreCuenta` ya tenia nueve posicionales y anadir mas hacia imposible
 * saber en la llamada que significaba cada valor.
 */
export interface PreCuentaPrintOptions {
  /** Desglose por impuesto. Sustituye al total agregado si viene informado. */
  taxLines?: TaxLine[];
  /** Si los precios de la carta ya incluyen impuestos. */
  taxIncluded?: boolean;
  /** Flete. Solo se imprime si el pedido ya lo tiene definido. */
  deliveryFee?: number;
  tipAmount?: number;
  /** Datos de entrega, para pre-cuentas de domicilio. */
  deliveryInfo?: DeliveryInfo;
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

/**
 * Al imprimir desde el navegador no se sabe a que impresora ira el ticket, asi
 * que se maqueta para el ancho mas habitual. El agente si conoce la impresora
 * y usa el `paper_width` real de su ficha.
 */
const BROWSER_PAPER = getPaperSpec('80mm');

/**
 * `sale_items.notes` puede venir como JSON (modificadores, numero de comensal,
 * nota libre) o como texto plano. Devuelve siempre un objeto manejable.
 */
function parseItemNotes(notes: unknown): any {
  if (!notes) return {};
  if (typeof notes === 'object') return notes;
  try {
    return JSON.parse(String(notes) || '{}');
  } catch {
    return {};
  }
}

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
   * Generar HTML del ticket de venta.
   *
   * Delega en `buildSaleTicketHTML`, la plantilla compartida con el agente de
   * impresion, para que el recibo salga igual por navegador que por impresora
   * fisica. Aqui solo se traduce el modelo del POS al payload de la plantilla.
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
    deliveryInfo?: DeliveryInfo
  ): string {
    const payload = this.toSalePayload(
      sale,
      saleItems,
      customer,
      payments,
      business,
      cashier,
      branch,
      taxLines,
      deliveryInfo,
    );
    return buildSaleTicketHTML(payload, BROWSER_PAPER);
  }

  /**
   * Traduce el modelo de venta del POS (`Sale`, `SaleItem`, `Customer`,
   * `Payment`) al payload que entiende la plantilla compartida.
   *
   * Los `as any` son deliberados: `Sale` y `SaleItem` arrastran campos que
   * llegan de distintos origenes (POS, web, PMS) y no estan todos declarados
   * en la interfaz.
   */
  private static toSalePayload(
    sale: Sale,
    saleItems: SaleItem[],
    customer?: Customer,
    payments: Payment[] = [],
    business?: BusinessInfo,
    cashier?: CashierInfo,
    branch?: BranchInfo,
    taxLines?: TaxLine[],
    deliveryInfo?: DeliveryInfo
  ): SaleTicketPrintPayload {
    const anySale = sale as any;

    const customerName = customer
      ? (customer.full_name
        || [(customer as any).first_name, (customer as any).last_name].filter(Boolean).join(' ')
        || customer.email
        || 'Cliente')
      : undefined;

    return {
      saleId: String(sale.id),
      saleNumber: anySale.sale_number || undefined,
      customerName,
      // El tipo de documento (CC, NIT, CE...) importa en el recibo fiscal: sin
      // el, un numero suelto no identifica al cliente ante la DIAN.
      customerDocType: (customer as any)?.doc_type || (customer as any)?.identification_type || undefined,
      customerDocNumber: customer?.doc_number || (customer as any)?.identification_number || undefined,
      customerPhone: (customer as any)?.phone || undefined,
      customerEmail: customer?.email || undefined,
      customerAddress: (customer as any)?.address || undefined,
      customerFiscalResponsibilities: (customer as any)?.fiscal_responsibilities || undefined,
      cashierName: cashier?.name,
      createdAt: anySale.created_at || new Date().toISOString(),
      items: saleItems.map((item) => {
        const anyItem = item as any;
        const notes = parseItemNotes(anyItem.notes);
        return {
          productName: anyItem.product_name || anyItem.product?.name || notes?.product_name || 'Producto',
          quantity: item.quantity,
          unitPrice: item.unit_price,
          total: item.total,
          taxAmount: item.tax_amount,
          discountAmount: item.discount_amount,
          variantData: anyItem.product?.variant_data || anyItem.variant_data || null,
          modifiers: Array.isArray(notes?.modifiers) ? notes.modifiers : null,
        };
      }),
      subtotal: sale.subtotal,
      taxTotal: sale.tax_total,
      taxLines: taxLines && taxLines.length > 0 ? taxLines : null,
      taxIncluded: !!anySale.tax_included,
      discountTotal: sale.discount_total,
      tipAmount: Number(anySale.tip_amount) || undefined,
      deliveryFee: Number(anySale.delivery_fee) || undefined,
      total: sale.total,
      payments: payments.map((p) => ({
        method: p.method,
        methodName: translatePaymentMethod(p.method),
        amount: p.amount,
      })),
      totalPaid: payments.length > 0 ? payments.reduce((sum, p) => sum + Number(p.amount || 0), 0) : undefined,
      changeAmount: Number(anySale.change_amount) || undefined,
      businessName: business?.name,
      businessNit: business?.nit || business?.taxId,
      businessPhone: business?.phone,
      businessAddress: business?.address,
      businessCity: business?.city,
      businessEmail: business?.email,
      businessFiscalResponsibilities: business?.fiscal_responsibilities,
      businessLogoUrl: business?.logoUrl,
      branchName: branch?.name,
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      // Se pasa el objeto completo: el conductor necesita telefono, ciudad e
      // indicaciones, no solo la direccion.
      deliveryInfo,
    };
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
    deliveryInfo?: DeliveryInfo
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

    const printWindow = window.open('', '_blank', 'width=302,height=600');
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
    deliveryInfo?: DeliveryInfo
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
   * Imprimir pre-cuenta de mesa (ticket sin pago).
   *
   * Usa `buildSaleTicketHTML`, la misma plantilla con la que el agente imprime
   * en las impresoras fisicas. Antes habia aqui una copia propia del HTML, y
   * cada arreglo de maquetacion habia que hacerlo dos veces.
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
    options?: PreCuentaPrintOptions,
  ): void {
    const payload: SaleTicketPrintPayload = {
      saleId: `pre-${tableName}`,
      title: 'PRE-CUENTA',
      tableName,
      serverName,
      createdAt: new Date().toISOString(),
      items: items.map((item) => {
        const notes = parseItemNotes(item.notes);
        return {
          productName: item.product?.name || 'Producto',
          quantity: item.quantity,
          unitPrice: item.unit_price,
          total: item.total,
          taxAmount: item.tax_amount,
          discountAmount: item.discount_amount,
          variantData: item.product?.variant_data || null,
          modifiers: Array.isArray(notes?.modifiers) ? notes.modifiers : null,
        };
      }),
      subtotal,
      taxTotal,
      taxLines: options?.taxLines && options.taxLines.length > 0 ? options.taxLines : null,
      taxIncluded: options?.taxIncluded,
      discountTotal,
      // El flete solo aparece si el pedido ya lo tiene definido; en una mesa
      // normal no existe y una linea "Envio: 0" solo confunde al cliente.
      deliveryFee: options?.deliveryFee && options.deliveryFee > 0 ? options.deliveryFee : undefined,
      tipAmount: options?.tipAmount && options.tipAmount > 0 ? options.tipAmount : undefined,
      total,
      businessName: business?.name,
      businessNit: business?.nit,
      businessPhone: business?.phone,
      businessAddress: business?.address,
      businessCity: business?.city,
      businessEmail: business?.email,
      businessFiscalResponsibilities: business?.fiscal_responsibilities,
      businessLogoUrl: business?.logoUrl,
      branchName: branch?.name,
      branchAddress: branch?.address,
      branchPhone: branch?.phone,
      deliveryInfo: options?.deliveryInfo,
    };

    this.openPrintWindow(buildSaleTicketHTML(payload, BROWSER_PAPER));
  }

  /**
   * Abre una ventana emergente con el documento y lanza el dialogo de
   * impresion cuando ha terminado de cargar.
   */
  private static openPrintWindow(html: string): void {
    const printWindow = window.open('', '_blank', 'width=302,height=700');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    this.printWhenReady(printWindow);
  }

  
/**
   * Imprimir comanda de cocina por navegador (fallback sin agente).
   *
   * Los items se agrupan por estacion y se emite una comanda por cada una,
   * separadas por salto de pagina. Es el mismo reparto que hace la impresion
   * fisica, donde cada estacion tiene su propia impresora.
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
    const createdAt = new Date().toISOString();
    const stations = Array.from(new Set(items.map((i) => i.station || 'all')));

    const payloads: KitchenTicketPrintPayload[] = stations.map((station) => ({
      ticketId: 0,
      station,
      tableName,
      serverName,
      createdAt,
      items: items
        .filter((i) => (i.station || 'all') === station)
        .map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          notes: i.notes,
          variantData: i.variantData,
          modifiers: i.modifiers,
        })),
      businessName: business?.name,
      branchName: branch?.name,
    }));

    this.openPrintWindow(buildKitchenTicketsHTML(payloads, BROWSER_PAPER));
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
    deliveryInfo?: DeliveryInfo
  ): void {
    if (this.canPrint()) {
      this.printTicket(sale, saleItems, customer, payments, business, cashier, branch, taxLines, deliveryInfo);
    } else {
      // Fallback: descargar como HTML
      this.downloadTicket(sale, saleItems, customer, payments, business, cashier, branch, taxLines, deliveryInfo);
      alert('La impresión directa no está disponible. El ticket se descargará como archivo HTML.');
    }
  }

  /**
   * Imprimir factura electrónica validada por DIAN desde el navegador.
   *
   * Genera un documento HTML con CUFE, QR de validación y entorno DIAN,
   * y lo abre en una ventana emergente con el diálogo de impresión.
   */
  static printElectronicInvoice(payload: ElectronicInvoicePrintPayload): void {
    const html = buildElectronicInvoiceHTML(payload, BROWSER_PAPER);
    this.openPrintWindow(html);
  }
}
