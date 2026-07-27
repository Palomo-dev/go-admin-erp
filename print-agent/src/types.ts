export type PrinterConnectionType = 'usb' | 'network' | 'bluetooth' | 'system';

export interface PrinterRow {
  id: string;
  name: string;
  connection_type: PrinterConnectionType;
  ip_address: string | null;
  port: number | null;
  vendor_id: string | null;
  product_id: string | null;
  mac_address: string | null;
  driver: string;
  paper_width: '58mm' | '80mm';
  is_active: boolean;
}

// Los tipos del CONTENIDO de los tickets viven en `printing/`, que es la
// carpeta compartida entre el agente y el ERP web. Se re-exportan aqui para
// que los consumidores existentes sigan importando desde './types'.
export type {
  KitchenTicketItemModifier,
  KitchenTicketItemPayload,
  KitchenTicketPrintPayload,
  SaleTicketItemPayload,
  SaleTicketPayment,
  SaleTicketPrintPayload,
  TicketKind,
} from './printing/types';

import type { KitchenTicketPrintPayload, SaleTicketPrintPayload } from './printing/types';

export type PrintJobPayload = KitchenTicketPrintPayload | SaleTicketPrintPayload;

export interface PrintJobRow {
  id: string;
  organization_id: number;
  branch_id: number | null;
  printer_id: string;
  station: string | null;
  job_type: 'kitchen_ticket' | 'pre_cuenta' | 'sale_ticket';
  reference_id: string | null;
  payload: PrintJobPayload;
  status: 'pending' | 'sent' | 'printed' | 'error';
  error_message: string | null;
  created_at: string;
  printed_at: string | null;
  retry_count: number;
}
