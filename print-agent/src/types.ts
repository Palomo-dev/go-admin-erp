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

export interface KitchenTicketItemPayload {
  productName: string;
  quantity: number;
  notes?: string | null;
}

export interface KitchenTicketPrintPayload {
  ticketId: number;
  tableName?: string;
  serverName?: string;
  station: string;
  createdAt: string;
  items: KitchenTicketItemPayload[];
}

export interface SaleTicketItemPayload {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SaleTicketPrintPayload {
  saleId: string;
  saleNumber?: string;
  customerName?: string;
  createdAt: string;
  items: SaleTicketItemPayload[];
  total: number;
}

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
}
