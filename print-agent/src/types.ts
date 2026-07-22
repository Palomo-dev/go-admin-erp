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

export interface KitchenTicketItemModifier {
  name: string;
  extraPrice: number;
}

export interface KitchenTicketItemPayload {
  productName: string;
  quantity: number;
  notes?: string | null;
  variantData?: Record<string, string> | null;
  modifiers?: KitchenTicketItemModifier[] | null;
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
  taxAmount?: number;
  discountAmount?: number;
  variantData?: Record<string, string> | null;
  modifiers?: Array<{ name: string; extraPrice: number }> | null;
}

export interface SaleTicketPayment {
  method: string;
  amount: number;
}

export interface SaleTicketPrintPayload {
  saleId: string;
  saleNumber?: string;
  customerName?: string;
  customerDocType?: string;
  customerDocNumber?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  customerFiscalResponsibilities?: string[] | null;
  title?: string;
  tableName?: string;
  serverName?: string;
  cashierName?: string;
  createdAt: string;
  items: SaleTicketItemPayload[];
  subtotal?: number;
  taxTotal?: number;
  discountTotal?: number;
  tipAmount?: number;
  deliveryFee?: number;
  total: number;
  payments?: SaleTicketPayment[];
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
  deliveryInfo?: { type: string; address: string; driverName?: string };
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
