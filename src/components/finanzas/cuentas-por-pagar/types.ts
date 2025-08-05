import { SupplierBase, OrganizationPaymentMethod, OrganizationCurrency } from '../facturas-compra/types';

// Interface principal para cuentas por pagar
export interface AccountPayable {
  id: string;
  organization_id: number;
  supplier_id: number;
  invoice_id?: string;
  amount: number;
  balance: number;
  due_date?: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  days_overdue?: number;
  created_at?: string;
  updated_at?: string;
  
  // Relaciones
  supplier?: SupplierBase;
  invoice_purchase?: {
    id: string;
    number_ext: string;
    issue_date: string;
    currency: string;
  };
}

// Interface para pagos programados
export interface ScheduledPayment {
  id: string;
  organization_id: number;
  account_payable_id: string;
  amount: number;
  scheduled_date: string;
  status: 'pending' | 'approved' | 'rejected' | 'processed';
  created_by: string;
  approved_by?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  
  // Relaciones
  account_payable?: AccountPayable;
  created_by_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
  approved_by_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

// Interface para pagos realizados
export interface Payment {
  id: string;
  organization_id: number;
  branch_id?: number;
  source: string;
  source_id: string;
  method: string;
  amount: number;
  currency: string;
  reference?: string;
  processor_response?: any;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  
  // Relaciones
  payment_method_info?: {
    code: string;
    name: string;
    requires_reference: boolean;
  };
  created_by_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

// Interface para pagos con relaciones extendidas (para consultas específicas)
export interface PaymentWithRelations extends Payment {
  account_payable?: AccountPayable;
  notes?: string; // Alias para reference field
  created_by_user?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

// Interface para resumen de CxP
export interface AccountsPayableSummary {
  total_pending: number;
  total_overdue: number;
  total_partial: number;
  total_amount: number;
  suppliers_count: number;
  overdue_count: number;
  next_due_amount: number;
  next_due_date?: string;
}

// Interface para filtros
export interface FiltrosCuentasPorPagar {
  busqueda: string;
  estado: 'todos' | 'pending' | 'partial' | 'paid' | 'overdue';
  proveedor: string | 'todos';
  fechaDesde: string;
  fechaHasta: string;
  vencimiento: 'todos' | 'vencidas' | 'proximas' | 'futuras';
  montoMinimo: number | null;
  montoMaximo: number | null;
}

// Interface para programar pago
export interface ProgramarPagoForm {
  account_payable_id: string;
  amount: number;
  scheduled_date: string;
  payment_method: string;
  reference?: string;
  notes?: string;
}

// Interface para registrar pago
export interface RegistrarPagoForm {
  account_payable_id: string;
  amount: number;
  payment_method: string;
  reference?: string;
  payment_date: string;
  notes?: string;
}

// Interface para archivo de banca online
export interface BankFileRecord {
  id: string;
  organization_id: number;
  file_name: string;
  file_type: 'csv' | 'excel' | 'txt' | 'xml';
  records_count: number;
  processed_count: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  upload_date: string;
  processed_date?: string;
  created_by: string;
  
  // Registros procesados
  records?: BankFileTransaction[];
}

export interface BankFileTransaction {
  id: string;
  bank_file_id: string;
  reference: string;
  amount: number;
  transaction_date: string;
  description?: string;
  status: 'unmatched' | 'matched' | 'processed';
  matched_payment_id?: string;
  
  // Relación con pago procesado
  matched_payment?: Payment;
}

// Interface para aprobación de pagos
export interface PaymentApproval {
  id: string;
  organization_id: number;
  scheduled_payment_id: string;
  approver_id: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  approved_at?: string;
  
  // Relaciones
  scheduled_payment?: ScheduledPayment;
  approver_user?: {
    id: string;
    email: string;
    full_name?: string;
  };
}

// Tipos para widgets y dashboard
export interface CuentasPorPagarWidget {
  type: 'vencidas' | 'proximas' | 'pendientes' | 'resumen';
  title: string;
  value: number;
  currency: string;
  change?: number;
  change_type?: 'increase' | 'decrease';
}

// Opciones para selects
export interface SelectOption {
  value: string;
  label: string;
}

export interface SupplierOption extends SelectOption {
  nit?: string;
  balance?: number;
  overdue_amount?: number;
}
