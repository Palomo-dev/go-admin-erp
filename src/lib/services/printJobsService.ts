import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { PrintersService, type PrinterStation } from '@/components/pos/configuracion/printersService';

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
}

export interface SaleTicketPrintPayload {
  saleId: string;
  saleNumber?: string;
  customerName?: string;
  createdAt: string;
  items: Array<{ productName: string; quantity: number; unitPrice: number; total: number }>;
  total: number;
}

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

    for (const [station, items] of itemsByStation.entries()) {
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
      };

      const rows = printers.map((printer) => ({
        organization_id: orgId,
        branch_id: branchId,
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
      createdAt: string;
      total: number;
      items: Array<{ productName: string; quantity: number; unitPrice: number; total: number }>;
    }
  ): Promise<{ enqueued: number }> {
    const orgId = getOrganizationId();
    const printers = await PrintersService.getPrintersByStation(branchId, 'cashier');

    if (printers.length === 0) return { enqueued: 0 };

    const payload: SaleTicketPrintPayload = {
      saleId: sale.saleId,
      saleNumber: sale.saleNumber,
      customerName: sale.customerName,
      createdAt: sale.createdAt,
      items: sale.items,
      total: sale.total,
    };

    const rows = printers.map((printer) => ({
      organization_id: orgId,
      branch_id: branchId,
      printer_id: printer.id,
      station: 'cashier',
      job_type: 'sale_ticket' as const,
      reference_id: sale.saleId,
      payload: payload as any,
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
      items: Array<{ productName: string; quantity: number; unitPrice: number; total: number }>;
    }
  ): Promise<{ enqueued: number }> {
    const orgId = getOrganizationId();
    const printers = await PrintersService.getPrintersByStation(branchId, 'cashier');

    if (printers.length === 0) return { enqueued: 0 };

    const payload = {
      saleId: `pre-${preCuenta.tableId}`,
      title: 'PRE-CUENTA',
      tableName: preCuenta.tableName,
      createdAt: preCuenta.createdAt,
      items: preCuenta.items,
      total: preCuenta.total,
    };

    const rows = printers.map((printer) => ({
      organization_id: orgId,
      branch_id: branchId,
      printer_id: printer.id,
      station: 'cashier',
      job_type: 'pre_cuenta' as const,
      reference_id: preCuenta.tableId,
      payload: payload as any,
      status: 'pending' as const,
    }));

    const { error } = await supabase.from('print_jobs').insert(rows);
    if (error) throw error;

    return { enqueued: rows.length };
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
}
