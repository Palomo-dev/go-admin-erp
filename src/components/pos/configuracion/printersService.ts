import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';
import { isDesktop, isDesktopOnline } from '@/lib/utils/desktop';
import { readDesktopCache, writeDesktopCache } from '@/lib/utils/desktopLocalCache';

export type PrinterConnectionType = 'usb' | 'network' | 'bluetooth' | 'system' | 'raw_spooler';
export type PrinterStation = 'hot_kitchen' | 'cold_kitchen' | 'bar' | 'cashier' | 'all';
export type PrinterPaperWidth = '58mm' | '80mm';

export interface PrinterStationAssignment {
  id: string;
  printer_id: string;
  branch_id: number | null;
  station: PrinterStation;
}

export interface Printer {
  id: string;
  organization_id: number;
  branch_id: number | null;
  name: string;
  connection_type: PrinterConnectionType;
  ip_address: string | null;
  port: number | null;
  vendor_id: string | null;
  product_id: string | null;
  mac_address: string | null;
  driver: string;
  paper_width: PrinterPaperWidth;
  is_active: boolean;
  system_printer_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  branches?: { name: string } | null;
  printer_station_assignments?: PrinterStationAssignment[];
}

export interface PrinterFormData {
  name: string;
  branch_id: number | null;
  connection_type: PrinterConnectionType;
  ip_address?: string | null;
  port?: number | null;
  vendor_id?: string | null;
  product_id?: string | null;
  mac_address?: string | null;
  driver?: string;
  paper_width: PrinterPaperWidth;
  is_active?: boolean;
  system_printer_name?: string | null;
  notes?: string | null;
  stations: PrinterStation[];
}

export const STATION_LABELS: Record<PrinterStation, string> = {
  hot_kitchen: 'Cocina Caliente',
  cold_kitchen: 'Cocina Fría',
  bar: 'Bar',
  cashier: 'Caja',
  all: 'Todas las estaciones',
};

export const CONNECTION_TYPE_LABELS: Record<PrinterConnectionType, string> = {
  usb: 'USB',
  network: 'Red (IP/Puerto)',
  bluetooth: 'Bluetooth',
  system: 'Impresora del sistema (HTML)',
  raw_spooler: 'Sistema (ESC/POS directo)',
};

export class PrintersService {
  static async getPrinters(): Promise<Printer[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('printers')
      .select(`
        *,
        branches(name),
        printer_station_assignments(id, printer_id, branch_id, station)
      `)
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async createPrinter(form: PrinterFormData): Promise<Printer> {
    const orgId = getOrganizationId();

    const { data: printer, error } = await supabase
      .from('printers')
      .insert({
        organization_id: orgId,
        branch_id: form.branch_id,
        name: form.name,
        connection_type: form.connection_type,
        ip_address: form.ip_address || null,
        port: form.port || null,
        vendor_id: form.vendor_id || null,
        product_id: form.product_id || null,
        mac_address: form.mac_address || null,
        driver: form.driver || 'escpos_generic',
        paper_width: form.paper_width,
        is_active: form.is_active ?? true,
        system_printer_name: form.system_printer_name || null,
        notes: form.notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    await this.setStationAssignments(printer.id, form.branch_id, form.stations);

    return printer;
  }

  static async updatePrinter(id: string, form: PrinterFormData): Promise<void> {
    const { error } = await supabase
      .from('printers')
      .update({
        branch_id: form.branch_id,
        name: form.name,
        connection_type: form.connection_type,
        ip_address: form.ip_address || null,
        port: form.port || null,
        vendor_id: form.vendor_id || null,
        product_id: form.product_id || null,
        mac_address: form.mac_address || null,
        driver: form.driver || 'escpos_generic',
        paper_width: form.paper_width,
        system_printer_name: form.system_printer_name || null,
        notes: form.notes || null,
      })
      .eq('id', id);

    if (error) throw error;

    await this.setStationAssignments(id, form.branch_id, form.stations);
  }

  static async togglePrinter(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('printers')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) throw error;
  }

  static async deletePrinter(id: string): Promise<void> {
    const { error } = await supabase.from('printers').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Reemplaza las estaciones asignadas a una impresora (para la sucursal indicada).
   */
  static async setStationAssignments(
    printerId: string,
    branchId: number | null,
    stations: PrinterStation[]
  ): Promise<void> {
    const orgId = getOrganizationId();

    const { error: deleteError } = await supabase
      .from('printer_station_assignments')
      .delete()
      .eq('printer_id', printerId);

    if (deleteError) throw deleteError;

    if (stations.length === 0) return;

    const { error: insertError } = await supabase
      .from('printer_station_assignments')
      .insert(
        stations.map((station) => ({
          printer_id: printerId,
          organization_id: orgId,
          branch_id: branchId,
          station,
        }))
      );

    if (insertError) throw insertError;
  }

  /**
   * Obtiene la(s) impresora(s) activas asignadas a una estación específica,
   * para una sucursal dada. Usado por el flujo de impresión automática de comandas.
   *
   * En Go Admin Desktop la última respuesta buena se guarda por
   * organización/sucursal/estación: si el Desktop informa de que no hay
   * conectividad real, o la consulta falla, se devuelve esa copia para que el
   * POS pueda seguir imprimiendo por el agente local sin internet.
   */
  static async getPrintersByStation(branchId: number, station: PrinterStation): Promise<Printer[]> {
    const orgId = getOrganizationId();
    const cacheKey = `printers-by-station:${orgId}:${branchId}:${station}`;
    const desktop = isDesktop();

    if (desktop && !(await isDesktopOnline())) {
      const cached = readDesktopCache<Printer[]>(cacheKey);
      if (cached) return cached;
      // Sin copia local no queda otra que intentarlo: el interceptor de
      // fetch servirá la caché de IndexedDB si navigator.onLine es false.
    }

    try {
      const printers = await this.fetchPrintersByStation(orgId, branchId, station);
      if (desktop) writeDesktopCache(cacheKey, printers);
      return printers;
    } catch (error) {
      const cached = desktop ? readDesktopCache<Printer[]>(cacheKey) : null;
      if (!cached) throw error;
      console.warn('[printers] Supabase no respondió; usando impresoras de la caché local del Desktop', {
        branchId,
        station,
        error: error instanceof Error ? error.message : String(error),
      });
      return cached;
    }
  }

  /** Consulta a Supabase tal cual se hacía antes de la caché del Desktop. */
  private static async fetchPrintersByStation(orgId: number, branchId: number, station: PrinterStation): Promise<Printer[]> {
    // 1. Buscar impresoras asignadas a esta estación para la sucursal específica (o global)
    const { data, error } = await supabase
      .from('printer_station_assignments')
      .select('printers!inner(*)')
      .eq('organization_id', orgId)
      .or(`branch_id.eq.${branchId},branch_id.is.null`)
      .in('station', [station, 'all'])
      .eq('printers.is_active', true);

    if (error) throw error;
    const printers = (data || []).map((row: any) => row.printers).filter(Boolean);
    if (printers.length > 0) return printers;

    // 2. Fallback: si no hay impresoras para esta sucursal, buscar cualquier impresora
    //    de la organización con esa estación (sin importar branch_id)
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('printer_station_assignments')
      .select('printers!inner(*)')
      .eq('organization_id', orgId)
      .in('station', [station, 'all'])
      .eq('printers.is_active', true);

    if (fallbackError) throw fallbackError;
    return (fallbackData || []).map((row: any) => row.printers).filter(Boolean);
  }
}
