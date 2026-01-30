import { SupplierBase } from '../../facturas-compra/types';

// Detalle completo de cuenta por pagar
export interface CuentaPorPagarDetalle {
  id: string;
  organization_id: number;
  supplier_id: number;
  invoice_id?: string;
  amount: number;
  balance: number;
  due_date: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  days_overdue: number;
  created_at: string;
  updated_at: string;
  
  // Datos del proveedor
  supplier_name: string;
  supplier_nit?: string;
  supplier_email?: string;
  supplier_phone?: string;
  supplier_contact?: string;
  
  // Datos de la factura de compra
  invoice_number?: string;
  invoice_date?: string;
  invoice_currency?: string;
  
  // Historial de pagos
  payment_history: PaymentRecord[];
}

// Registro de pago
export interface PaymentRecord {
  id: string;
  amount: number;
  method: string;
  reference?: string;
  status: string;
  created_at: string;
  bank_account_name?: string;
}

// Información de aging
export interface AgingInfo {
  period: string;
  days: number;
  color: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Acciones disponibles
export interface AccountActions {
  canRegisterPayment: boolean;
  canSchedulePayment: boolean;
  canMarkAsPaid: boolean;
  canEdit: boolean;
  canCreateInstallments: boolean;
}

// Cuota de pago
export interface APInstallment {
  id: string;
  account_payable_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  principal?: number;
  interest?: number;
  balance: number;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  paid_amount: number;
  paid_at?: string;
  days_overdue?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

// Formulario para crear cuotas
export interface CreateInstallmentsForm {
  numberOfInstallments: number;
  startDate: Date;
  includeInterest: boolean;
  interestRate?: number;
}

// Datos para exportar estado de cuenta
export interface AccountStatementData {
  account: CuentaPorPagarDetalle;
  installments: APInstallment[];
  payments: PaymentRecord[];
  generatedAt: string;
}
