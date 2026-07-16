import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export type PrinterConnectionType = 'usb' | 'network' | 'bluetooth' | 'system';
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
  system: 'Impresora del sistema',
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
   */
  static async getPrintersByStation(branchId: number, station: PrinterStation): Promise<Printer[]> {
    const orgId = getOrganizationId();

    const { data, error } = await supabase
      .from('printer_station_assignments')
      .select('printers!inner(*)')
      .eq('organization_id', orgId)
      .eq('branch_id', branchId)
      .in('station', [station, 'all'])
      .eq('printers.is_active', true);

    if (error) throw error;
    return (data || []).map((row: any) => row.printers).filter(Boolean);
  }
}
