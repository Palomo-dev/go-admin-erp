import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { PrintersService, type PrinterStation } from '@/components/pos/configuracion/printersService';
import {
  getPaperSpec,
  type MonochromeRaster,
  type SaleTicketPrintPayload as SharedSaleTicketPrintPayload,
  type ShipmentGuidePrintPayload as SharedShipmentGuidePrintPayload,
  type ElectronicInvoicePrintPayload as SharedElectronicInvoicePrintPayload,
} from '@printing';
import { rasterizeLogo } from './logoRasterService';
import { PrintService } from './printService';

/** Campos de cabecera que comparten el ticket de venta y la pre-cuenta. */
interface BusinessHeader {
  businessName?: string;
  businessNit?: string;
  businessPhone?: string;
  businessAddress?: string;
  businessEmail?: string;
  businessCity?: string;
  businessFiscalResponsibilities?: string[] | null;
  businessLogoUrl?: string;
  branchName?: string;
  branchAddress?: string;
  branchPhone?: string;
}

/**
 * Completa la cabecera del negocio cuando el llamador no la aporta.
 *
 * El payload se guarda en `print_jobs` y lo consume el agente, donde ya no hay
 * contexto de React: lo que no viaje en el JSON no existe. Varias pantallas
 * encolaban sin la organizacion cargada y el ticket salia sin nombre, sin NIT y
 * sin sucursal. Resolverlo aqui, en el unico punto por el que pasan todos los
 * llamadores, evita que cada pantalla tenga que acordarse de pasar 11 campos.
 */
async function resolveBusinessHeader(provided: BusinessHeader): Promise<BusinessHeader> {
  if (provided.businessName) return provided;

  try {
    const { business, branch } = await PrintService.getBusinessAndBranch(getOrganizationId());
    if (!business) return provided;

    return {
      businessName: business.name,
      businessNit: provided.businessNit || business.nit || business.taxId,
      businessPhone: provided.businessPhone || business.phone,
      businessAddress: provided.businessAddress || business.address,
      businessEmail: provided.businessEmail || business.email,
      businessCity: provided.businessCity || business.city,
      businessFiscalResponsibilities:
        provided.businessFiscalResponsibilities || business.fiscal_responsibilities || null,
      businessLogoUrl: provided.businessLogoUrl || business.logoUrl,
      branchName: provided.branchName || branch?.name,
      branchAddress: provided.branchAddress || branch?.address,
      branchPhone: provided.branchPhone || branch?.phone,
    };
  } catch (error) {
    // Un ticket con cabecera incompleta es mejor que no imprimir la venta.
    console.warn('No se pudo completar la cabecera del negocio del ticket:', error);
    return provided;
  }
}

/**
 * Rasteriza el logo una vez por cada ancho de papel presente entre las
 * impresoras destino.
 *
 * Se agrupa por ancho y no por impresora porque dos impresoras de 80mm
 * comparten exactamente el mismo bitmap, y rasterizar es la parte cara del
 * proceso (descarga + canvas + recorrido de pixeles).
 */
async function buildLogoRasters(
  logoUrl: string | undefined,
  printers: Array<{ paper_width?: string | null }>,
): Promise<Map<string, MonochromeRaster | null>> {
  const byWidth = new Map<string, MonochromeRaster | null>();
  if (!logoUrl) return byWidth;

  // Array.from y no `for...of` sobre el Set: el tsconfig del ERP no habilita
  // downlevelIteration y el iterador nativo no compila.
  const widths = Array.from(new Set(printers.map((p) => getPaperSpec(p.paper_width).width)));

  for (const width of widths) {
    const spec = getPaperSpec(width);
    // charsPerLine * 12 reconstruye los puntos del cabezal: 576 u 384.
    byWidth.set(width, await rasterizeLogo(logoUrl, spec.charsPerLine * 12));
  }

  return byWidth;
}

export interface KitchenTicketPrintPayload {
  ticketId: number;
  tableName?: string;
  serverName?: string;
  station: PrinterStation | string;
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    notes?: string | null;
    variantData?: Record<string, string> | null;
    modifiers?: Array<{ name: string; extraPrice: number }> | null;
  }>;
  businessName?: string;
  branchName?: string;
}

/**
 * El payload del ticket de venta es el mismo que consume el agente, asi que se
 * reexporta el tipo compartido en lugar de mantener aqui una copia reducida
 * que se quedaba corta cada vez que la plantilla ganaba un campo.
 */
export type SaleTicketPrintPayload = SharedSaleTicketPrintPayload;
export type ShipmentGuidePrintPayload = SharedShipmentGuidePrintPayload;

export interface PrintJobWithPrinter {
  id: string;
  branch_id: number | null;
  printer_id: string;
  station: string | null;
  job_type: 'kitchen_ticket' | 'pre_cuenta' | 'sale_ticket';
  reference_id: string | null;
  status: 'pending' | 'sent' | 'printed' | 'error';
  error_message: string | null;
  created_at: string;
  printed_at: string | null;
  printers?: { name: string } | null;
}

export interface PrintAgentStatus {
  id: string;
  agent_name: string;
  last_seen_at: string | null;
  isOnline: boolean;
  branch_name: string | null;
}

/**
 * Umbral (ms) para considerar un Print Agent como "en línea" según su último heartbeat.
 */
const AGENT_ONLINE_THRESHOLD_MS = 45_000;

export class PrintJobsService {
  /**
   * Verifica si hay al menos un Print Agent activo (heartbeat reciente) para la sucursal.
   * Se usa para decidir si vale la pena encolar jobs de impresión física.
   */
  static async isAgentOnline(branchId: number): Promise<boolean> {
    const orgId = getOrganizationId();
    const { data, error } = await supabase
      .from('print_agents')
      .select('last_seen_at')
      .eq('organization_id', orgId)
      .eq('branch_id', branchId)
      .eq('status', 'online')
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.last_seen_at) return false;
    const elapsed = Date.now() - new Date(data.last_seen_at).getTime();
    return elapsed <= AGENT_ONLINE_THRESHOLD_MS;
  }

  /**
   * Encola los jobs de impresión de un ticket de cocina, agrupando sus items por
   * estación y resolviendo la(s) impresora(s) asignada(s) a cada estación.
   * Si una estación no tiene impresora asignada, simplemente se omite (no es error).
   */
  static async enqueueKitchenTicket(
    branchId: number,
    ticket: {
      ticketId: number;
      tableName?: string;
      serverName?: string;
      createdAt: string;
      items: Array<{ productName: string; quantity: number; notes?: string | null; station?: string | null; variantData?: Record<string, string> | null; modifiers?: Array<{ name: string; extraPrice: number }> | null }>;
      businessName?: string;
      branchName?: string;
    }
  ): Promise<{ enqueued: number; skippedStations: string[] }> {
    const orgId = getOrganizationId();

    // Agrupar items por estación (items sin estación van a 'all')
    const itemsByStation = new Map<string, typeof ticket.items>();
    for (const item of ticket.items) {
      const station = item.station || 'all';
      if (!itemsByStation.has(station)) itemsByStation.set(station, []);
      itemsByStation.get(station)!.push(item);
    }

    let enqueued = 0;
    const skippedStations: string[] = [];

    // Array.from y no `for...of` sobre el iterador del Map: el tsconfig del ERP
    // no habilita downlevelIteration, asi que el iterador nativo no compila y
    // `items` acababa inferido como `any`.
    for (const [station, items] of Array.from(itemsByStation.entries())) {
      const printers = await PrintersService.getPrintersByStation(branchId, station as PrinterStation);

      if (printers.length === 0) {
        skippedStations.push(station);
        continue;
      }

      const payload: KitchenTicketPrintPayload = {
        ticketId: ticket.ticketId,
        tableName: ticket.tableName,
        serverName: ticket.serverName,
        station,
        createdAt: ticket.createdAt,
        items: items.map((i) => ({ productName: i.productName, quantity: i.quantity, notes: i.notes, variantData: i.variantData, modifiers: i.modifiers })),
        businessName: ticket.businessName,
        branchName: ticket.branchName,
      };

      const rows = printers.map((printer) => ({
        organization_id: orgId,
        branch_id: printer.branch_id || branchId,
        printer_id: printer.id,
        station,
        job_type: 'kitchen_ticket' as const,
        reference_id: String(ticket.ticketId),
        payload: payload as any,
        status: 'pending' as const,
      }));

      const { error } = await supabase.from('print_jobs').insert(rows);
      if (error) {
        console.error('Error encolando print_job:', error);
        continue;
      }
      enqueued += rows.length;
    }

    return { enqueued, skippedStations };
  }

  /**
   * Reimpresión bajo demanda de un ticket de cocina ya existente (Comandas/KDS),
   * a partir del registro tal como lo devuelve KitchenService.getKitchenTickets().
   * Reutiliza enqueueKitchenTicket, sin duplicar la lógica de agrupación por estación.
   */
  static async enqueueKitchenTicketByRecord(ticket: {
    id: number;
    branch_id: number;
    created_at: string;
    table_sessions?: {
      serverName?: string;
      restaurant_tables?: { name: string } | null;
    } | null;
    kitchen_ticket_items?: Array<{
      station: string | null;
      notes: string | null;
      sale_items?: { quantity: number; notes?: any; products?: { name: string; variant_data?: Record<string, string> | null } | null } | null;
    }>;
  }): Promise<{ enqueued: number; skippedStations: string[] }> {
    return this.enqueueKitchenTicket(ticket.branch_id, {
      ticketId: ticket.id,
      tableName: ticket.table_sessions?.restaurant_tables?.name,
      serverName: ticket.table_sessions?.serverName,
      createdAt: ticket.created_at,
      items: (ticket.kitchen_ticket_items || []).map((item) => {
        const saleItemNotes = item.sale_items?.notes;
        const modifiers = saleItemNotes && typeof saleItemNotes === 'object' ? saleItemNotes.modifiers || null : null;
        return {
          productName: item.sale_items?.products?.name || 'Producto',
          quantity: item.sale_items?.quantity || 1,
          notes: item.notes,
          station: item.station,
          variantData: item.sale_items?.products?.variant_data || null,
          modifiers,
        };
      }),
    });
  }

  /**
   * Encola la reimpresión física de un ticket de venta (recibo de caja).
   * Resuelve la(s) impresora(s) asignada(s) a la estación 'cashier' (o 'all').
   */
  static async enqueueSaleTicket(
    branchId: number,
    sale: {
      saleId: string;
      saleNumber?: string;
      customerName?: string;
      customerDocType?: string;
      customerDocNumber?: string;
      customerPhone?: string;
      customerEmail?: string;
      customerAddress?: string;
      customerFiscalResponsibilities?: string[] | null;
      createdAt: string;
      total: number;
      subtotal?: number;
      taxTotal?: number;
      discountTotal?: number;
      tipAmount?: number;
      deliveryFee?: number;
      items: Array<{ productName: string; quantity: number; unitPrice: number; total: number; taxAmount?: number; discountAmount?: number; variantData?: Record<string, string> | null; modifiers?: Array<{ name: string; extraPrice: number }> | null }>;
      payments?: Array<{ method: string; methodName?: string; amount: number }>;
      businessName?: string;
      businessNit?: string;
      businessPhone?: string;
      businessAddress?: string;
      businessEmail?: string;
      businessCity?: string;
      businessFiscalResponsibilities?: string[] | null;
      branchName?: string;
      branchAddress?: string;
      branchPhone?: string;
      serverName?: string;
      cashierName?: string;
      totalPaid?: number;
      changeAmount?: number;
      businessLogoUrl?: string;
      deliveryInfo?: { type: string; address: string; driverName?: string; contactName?: string; contactPhone?: string; city?: string; instructions?: string };
    }
  ): Promise<{ enqueued: number }> {
    const orgId = getOrganizationId();
    const printers = await PrintersService.getPrintersByStation(branchId, 'cashier');

    if (printers.length === 0) return { enqueued: 0 };

    const header = await resolveBusinessHeader(sale);
    const logoRasters = await buildLogoRasters(header.businessLogoUrl, printers);

    const payload: SaleTicketPrintPayload = {
      saleId: sale.saleId,
      saleNumber: sale.saleNumber,
      customerName: sale.customerName,
      customerDocType: sale.customerDocType,
      customerDocNumber: sale.customerDocNumber,
      customerPhone: sale.customerPhone,
      customerEmail: sale.customerEmail,
      customerAddress: sale.customerAddress,
      customerFiscalResponsibilities: sale.customerFiscalResponsibilities,
      createdAt: sale.createdAt,
      items: sale.items,
      total: sale.total,
      subtotal: sale.subtotal,
      taxTotal: sale.taxTotal,
      discountTotal: sale.discountTotal,
      tipAmount: sale.tipAmount,
      deliveryFee: sale.deliveryFee,
      payments: sale.payments,
      ...header,
      serverName: sale.serverName,
      cashierName: sale.cashierName,
      totalPaid: sale.totalPaid,
      changeAmount: sale.changeAmount,
      deliveryInfo: sale.deliveryInfo,
    };

    // El raster se adjunta por impresora: una de 58mm y otra de 80mm necesitan
    // bitmaps de distinto ancho, asi que el payload no puede ser el mismo.
    const rows = printers.map((printer) => ({
      organization_id: orgId,
      branch_id: printer.branch_id || branchId,
      printer_id: printer.id,
      station: 'cashier',
      job_type: 'sale_ticket' as const,
      reference_id: sale.saleId,
      payload: {
        ...payload,
        businessLogoRaster: logoRasters.get(getPaperSpec(printer.paper_width).width) ?? null,
      } as any,
      status: 'pending' as const,
    }));

    const { error } = await supabase.from('print_jobs').insert(rows);
    if (error) throw error;

    return { enqueued: rows.length };
  }

  /**
   * Encola la impresión física de la pre-cuenta de una mesa.
   * Sale por la(s) impresora(s) asignada(s) a la estación 'cashier' (o 'all'),
   * con el mismo formato del ticket de venta pero titulada "PRE-CUENTA".
   */
  static async enqueuePreCuenta(
    branchId: number,
    preCuenta: {
      tableId: string;
      tableName?: string;
      createdAt: string;
      total: number;
      subtotal?: number;
      taxTotal?: number;
      discountTotal?: number;
      items: Array<{ productName: string; quantity: number; unitPrice: number; total: number; taxAmount?: number; discountAmount?: number; variantData?: Record<string, string> | null; modifiers?: Array<{ name: string; extraPrice: number }> | null }>;
      businessName?: string;
      businessNit?: string;
      businessPhone?: string;
      businessAddress?: string;
      businessEmail?: string;
      businessCity?: string;
      businessFiscalResponsibilities?: string[] | null;
      businessLogoUrl?: string;
      branchName?: string;
      branchAddress?: string;
      branchPhone?: string;
      serverName?: string;
      deliveryFee?: number;
      tipAmount?: number;
      deliveryInfo?: { type: string; address: string; driverName?: string; contactName?: string; contactPhone?: string; city?: string; instructions?: string };
    }
  ): Promise<{ enqueued: number }> {
    const orgId = getOrganizationId();
    const printers = await PrintersService.getPrintersByStation(branchId, 'cashier');

    if (printers.length === 0) return { enqueued: 0 };

    const header = await resolveBusinessHeader(preCuenta);
    const logoRasters = await buildLogoRasters(header.businessLogoUrl, printers);

    const payload = {
      saleId: `pre-${preCuenta.tableId}`,
      title: 'PRE-CUENTA',
      tableName: preCuenta.tableName,
      serverName: preCuenta.serverName,
      createdAt: preCuenta.createdAt,
      items: preCuenta.items,
      subtotal: preCuenta.subtotal,
      taxTotal: preCuenta.taxTotal,
      discountTotal: preCuenta.discountTotal,
      // Solo si el pedido ya tiene flete definido: en una mesa de salon no
      // existe y una linea "Envio: 0" solo genera dudas al cliente.
      deliveryFee: preCuenta.deliveryFee && preCuenta.deliveryFee > 0 ? preCuenta.deliveryFee : undefined,
      tipAmount: preCuenta.tipAmount && preCuenta.tipAmount > 0 ? preCuenta.tipAmount : undefined,
      deliveryInfo: preCuenta.deliveryInfo,
      total: preCuenta.total,
      ...header,
    };

    const rows = printers.map((printer) => ({
      organization_id: orgId,
      branch_id: printer.branch_id || branchId,
      printer_id: printer.id,
      station: 'cashier',
      job_type: 'pre_cuenta' as const,
      reference_id: preCuenta.tableId,
      payload: {
        ...payload,
        businessLogoRaster: logoRasters.get(getPaperSpec(printer.paper_width).width) ?? null,
      } as any,
      status: 'pending' as const,
    }));

    const { error } = await supabase.from('print_jobs').insert(rows);
    if (error) throw error;

    return { enqueued: rows.length };
  }

  /**
   * Encola automáticamente una comanda de cocina a partir de una venta completada.
   * Consulta las categorías de los productos del carrito, filtra solo los items
   * cuya categoría tiene requires_preparation = true, y los envía a la(s)
   * impresora(s) de la estación correspondiente.
   *
   * Si ningún item requiere preparación, no encola nada.
   * Si no hay impresoras físicas configuradas, retorna { enqueued: 0 }.
   */
  static async enqueueKitchenTicketFromSale(
    branchId: number,
    sale: {
      saleId: string;
      tableName?: string;
      serverName?: string;
      createdAt: string;
      items: Array<{
        productName: string;
        quantity: number;
        productId: number;
        notes?: string | null;
        variantData?: Record<string, string> | null;
        modifiers?: Array<{ name: string; extraPrice: number }> | null;
      }>;
      businessName?: string;
      branchName?: string;
    }
  ): Promise<{ enqueued: number; skippedStations: string[] }> {
    if (!sale.items.length) return { enqueued: 0, skippedStations: [] };

    const orgId = getOrganizationId();

    // Consultar categorías de los productos para saber requires_preparation y station
    const productIds = sale.items.map(i => i.productId);
    const { data: products, error } = await supabase
      .from('products')
      .select('id, category_id, station, categories!left(id, requires_preparation, station)')
      .in('id', productIds)
      .eq('organization_id', orgId);

    if (error || !products) {
      console.warn('No se pudo consultar categorías para comanda automática:', error);
      return { enqueued: 0, skippedStations: [] };
    }

    // Mapear product_id -> { requires_preparation, station }
    const productPrepMap = new Map<number, { requiresPreparation: boolean; station: string | null }>();
    for (const p of products as any[]) {
      const cat = p.categories;
      if (cat) {
        productPrepMap.set(p.id, {
          requiresPreparation: cat.requires_preparation ?? false,
          station: cat.station || p.station || null,
        });
      } else {
        // Producto sin categoría: usar station del producto si existe
        productPrepMap.set(p.id, {
          requiresPreparation: false,
          station: p.station || null,
        });
      }
    }

    // Filtrar items que requieren preparación
    const prepItems = sale.items
      .filter(item => {
        const prep = productPrepMap.get(item.productId);
        return prep?.requiresPreparation === true;
      })
      .map(item => {
        const prep = productPrepMap.get(item.productId);
        return {
          productName: item.productName,
          quantity: item.quantity,
          notes: item.notes || null,
          station: prep?.station || 'all',
          variantData: item.variantData || null,
          modifiers: item.modifiers || null,
        };
      });

    if (prepItems.length === 0) {
      return { enqueued: 0, skippedStations: [] };
    }

    // Generar un ticketId pseudo-aleatorio basado en el saleId
    const ticketId = Math.floor(Math.abs(Math.random() * 1000000));

    return this.enqueueKitchenTicket(branchId, {
      ticketId,
      tableName: sale.tableName,
      serverName: sale.serverName,
      createdAt: sale.createdAt,
      items: prepItems,
      businessName: sale.businessName,
      branchName: sale.branchName,
    });
  }

  /**
   * Últimos trabajos de impresión de una sucursal, con el nombre de la impresora,
   * para diagnóstico en Configuración > Impresoras.
   */
  static async getRecentJobs(branchId: number, limit = 20): Promise<PrintJobWithPrinter[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('print_jobs')
      .select('id, branch_id, printer_id, station, job_type, reference_id, status, error_message, created_at, printed_at, printers(name)')
      .eq('organization_id', orgId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data || []) as any;
  }

  /**
   * Trabajos de impresión paginados de una sucursal.
   * Retorna los items de la página solicitada y el conteo total.
   */
  static async getJobsPaginated(
    branchId: number,
    page: number,
    pageSize: number,
  ): Promise<{ jobs: PrintJobWithPrinter[]; total: number }> {
    const orgId = getOrganizationId();
    const offset = (page - 1) * pageSize;

    const { data, error, count } = await supabase
      .from('print_jobs')
      .select('id, branch_id, printer_id, station, job_type, reference_id, status, error_message, created_at, printed_at, printers(name)', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    return { jobs: (data || []) as any, total: count || 0 };
  }

  /**
   * Estado de los Print Agents (uno o varios PCs) de una sucursal.
   */
  static async getAgentsStatus(branchId: number): Promise<PrintAgentStatus[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('print_agents')
      .select('id, agent_name, status, last_seen_at, branches(name)')
      .eq('organization_id', orgId)
      .eq('branch_id', branchId)
      .order('agent_name');

    if (error) throw error;

    return (data || []).map((agent: any) => {
      const elapsed = agent.last_seen_at ? Date.now() - new Date(agent.last_seen_at).getTime() : Infinity;
      return {
        id: agent.id,
        agent_name: agent.agent_name,
        last_seen_at: agent.last_seen_at,
        isOnline: agent.status === 'online' && elapsed <= AGENT_ONLINE_THRESHOLD_MS,
        branch_name: agent.branches?.name || null,
      };
    });
  }

  /**
   * Encola la impresion fisica de una guia de envio.
   * Usa la estacion 'cashier' (o 'all') para resolver las impresoras.
   * El print-agent enviara el comando ESC/POS cut() para corte automatico.
   */
  static async enqueueShipmentGuide(
    branchId: number,
    guide: ShipmentGuidePrintPayload,
  ): Promise<{ enqueued: number }> {
    const orgId = getOrganizationId();
    const printers = await PrintersService.getPrintersByStation(branchId, 'cashier');

    if (printers.length === 0) return { enqueued: 0 };

    const header = await resolveBusinessHeader({
      businessName: guide.businessName,
      businessNit: guide.businessNit,
      businessPhone: guide.businessPhone,
      businessAddress: guide.businessAddress,
    });

    const payload: ShipmentGuidePrintPayload = {
      ...guide,
      businessName: header.businessName,
      businessNit: header.businessNit,
      businessPhone: header.businessPhone,
      businessAddress: header.businessAddress,
    };

    const rows = printers.map((printer) => ({
      organization_id: orgId,
      branch_id: printer.branch_id || branchId,
      printer_id: printer.id,
      station: 'cashier',
      job_type: 'shipment_guide' as const,
      reference_id: guide.shipmentId,
      payload: payload as any,
      status: 'pending' as const,
    }));

    const { error } = await supabase.from('print_jobs').insert(rows);
    if (error) throw error;

    return { enqueued: rows.length };
  }

  /**
   * Encola la impresion fisica de varias guias de envio en lote.
   * Cada guia se encola como un job independiente para que la impresora
   * corte el papel despues de cada una (ESC/POS cut() por job).
   */
  static async enqueueShipmentGuides(
    branchId: number,
    guides: ShipmentGuidePrintPayload[],
  ): Promise<{ enqueued: number }> {
    let total = 0;
    for (const guide of guides) {
      const result = await this.enqueueShipmentGuide(branchId, guide);
      total += result.enqueued;
    }
    return { enqueued: total };
  }

  /**
   * Encola la impresión física de una factura electrónica validada por DIAN.
   * Sale por la(s) impresora(s) asignada(s) a la estación 'cashier' (o 'all'),
   * con CUFE, QR de validación y entorno DIAN.
   */
  static async enqueueElectronicInvoice(
    branchId: number,
    invoice: {
      invoiceId: string;
      invoiceNumber: string;
      cufe: string;
      qrData: string;
      environment: 'production' | 'test';
      validationDate?: string;
      createdAt: string;
      total: number;
      subtotal?: number;
      taxTotal?: number;
      discountTotal?: number;
      taxIncluded?: boolean;
      taxLines?: Array<{ name: string; amount: number }> | null;
      items: Array<{ productName: string; quantity: number; unitPrice: number; total: number; taxAmount?: number; discountAmount?: number; variantData?: Record<string, string> | null; modifiers?: Array<{ name: string; extraPrice: number }> | null }>;
      payments?: Array<{ method: string; methodName?: string; amount: number }>;
      customerName?: string;
      customerDocType?: string;
      customerDocNumber?: string;
      customerPhone?: string;
      customerAddress?: string;
      customerFiscalResponsibilities?: string[] | null;
      businessName?: string;
      businessNit?: string;
      businessPhone?: string;
      businessAddress?: string;
      businessEmail?: string;
      businessCity?: string;
      businessFiscalResponsibilities?: string[] | null;
      businessLogoUrl?: string;
      branchName?: string;
      branchAddress?: string;
      branchPhone?: string;
      cashierName?: string;
      totalPaid?: number;
      changeAmount?: number;
      notes?: string;
    }
  ): Promise<{ enqueued: number }> {
    const orgId = getOrganizationId();
    const printers = await PrintersService.getPrintersByStation(branchId, 'cashier');

    if (printers.length === 0) return { enqueued: 0 };

    const header = await resolveBusinessHeader(invoice);
    const logoRasters = await buildLogoRasters(header.businessLogoUrl, printers);

    const payload: SharedElectronicInvoicePrintPayload = {
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      cufe: invoice.cufe,
      qrData: invoice.qrData,
      environment: invoice.environment,
      validationDate: invoice.validationDate,
      createdAt: invoice.createdAt,
      items: invoice.items,
      total: invoice.total,
      subtotal: invoice.subtotal,
      taxTotal: invoice.taxTotal,
      discountTotal: invoice.discountTotal,
      taxIncluded: invoice.taxIncluded,
      taxLines: invoice.taxLines,
      payments: invoice.payments,
      customerName: invoice.customerName,
      customerDocType: invoice.customerDocType,
      customerDocNumber: invoice.customerDocNumber,
      customerPhone: invoice.customerPhone,
      customerAddress: invoice.customerAddress,
      customerFiscalResponsibilities: invoice.customerFiscalResponsibilities,
      ...header,
      cashierName: invoice.cashierName,
      totalPaid: invoice.totalPaid,
      changeAmount: invoice.changeAmount,
      notes: invoice.notes,
    };

    const rows = printers.map((printer) => ({
      organization_id: orgId,
      branch_id: printer.branch_id || branchId,
      printer_id: printer.id,
      station: 'cashier',
      job_type: 'electronic_invoice' as const,
      reference_id: invoice.invoiceId,
      payload: {
        ...payload,
        businessLogoRaster: logoRasters.get(getPaperSpec(printer.paper_width).width) ?? null,
      } as any,
      status: 'pending' as const,
    }));

    const { error } = await supabase.from('print_jobs').insert(rows);
    if (error) throw error;

    return { enqueued: rows.length };
  }
}
