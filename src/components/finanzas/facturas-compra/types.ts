// Interfaces para Facturas de Compra

export interface SupplierBase {
  id: number;
  organization_id: number;
  name: string;
  nit?: string;
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvoicePurchase {
  id: string;
  organization_id: number;
  branch_id: number;
  supplier_id: number;
  po_id?: number;
  number_ext: string; // Número de factura del proveedor
  issue_date?: string;
  due_date?: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  total: number;
  balance: number;
  status: 'draft' | 'received' | 'paid' | 'partial' | 'void';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  notes?: string;
  payment_terms?: number; // Días de crédito
  payment_method?: string;
  tax_included: boolean;
  
  // Relaciones
  supplier?: SupplierBase;
  items?: InvoiceItem[];
  accounts_payable?: AccountPayable[];
}

export interface InvoiceItem {
  id?: string;
  invoice_id: string;
  invoice_type: 'purchase';
  product_id?: number;
  description: string;
  qty: number;
  unit_price: number;
  total_line: number;
  tax_rate?: number;
  tax_amount?: number;
  discount_amount?: number;
  created_at?: string;
  updated_at?: string;
}

export interface AccountPayable {
  id: string;
  organization_id: number;
  supplier_id: number;
  invoice_id?: string;
  amount: number;
  balance: number;
  due_date?: string;
  status: string;
  days_overdue?: number;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationPaymentMethod {
  id: number;
  organization_id: number;
  payment_method_code: string;
  is_active: boolean;
  settings?: any;
  created_at?: string;
  updated_at?: string;
  
  // Relación con payment_methods
  payment_methods?: {
    code: string;
    name: string;
    requires_reference: boolean;
    is_active: boolean;
    is_system: boolean;
  };
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
  auto_update?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationCurrency {
  organization_id: number;
  currency_code: string;
  is_base: boolean;
  auto_update?: boolean;
  created_at?: string;
  updated_at?: string;
  
  // Relación con currencies
  currencies?: Currency;
}

export interface CurrencyRate {
  id: number;
  organization_id: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  created_at?: string;
}

export interface BankAccount {
  id: number;
  organization_id: number;
  name: string;
  account_number: string;
  bank_name: string;
  account_type: string;
  currency: string;
  is_active: boolean;
  balance?: number;
  created_at?: string;
  updated_at?: string;
}

export interface BankTransaction {
  id: string;
  organization_id: number;
  bank_account_id: number;
  reference: string;
  amount: number;
  transaction_date: string;
  description?: string;
  status: 'unmatched' | 'matched' | 'reconciled';
  created_at?: string;
  updated_at?: string;
  
  // Relación
  bank_account?: BankAccount;
}

// Tipos para filtros y búsquedas
export interface FiltrosFacturasCompra {
  busqueda: string;
  estado: 'todos' | 'draft' | 'received' | 'paid' | 'partial' | 'void';
  proveedor: string | 'todos';
  fechaDesde: string;
  fechaHasta: string;
}

// Tipo para el formulario de nueva factura
export interface NuevaFacturaCompraForm {
  supplier_id: number | null;
  number_ext: string;
  issue_date: string;
  due_date: string;
  currency: string;
  payment_terms: number;
  tax_included: boolean;
  notes: string;
  items: InvoiceItemForm[];
}

export interface InvoiceItemForm {
  id?: string;
  product_id?: number;
  description: string;
  qty: number;
  unit_price: number;
  tax_rate: number;
  discount_amount: number;
}

// Opciones para componentes de selección
export interface SelectOption {
  value: string;
  label: string;
}

export interface SupplierOption extends SelectOption {
  value: string; // ID del proveedor como string
  nit?: string;
  phone?: string;
  email?: string;
}
