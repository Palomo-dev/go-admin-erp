export interface CuentaPorCobrarDetalle {
  id: string;
  organization_id: number;
  customer_id: string;
  invoice_id: string | null;
  sale_id: string | null;
  amount: number;
  balance: number;
  due_date: string;
  status: 'current' | 'overdue' | 'paid' | 'partial';
  days_overdue: number;
  last_reminder_date: string | null;
  created_at: string;
  updated_at: string;
  // Datos del cliente
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  customer_address: string;
  // Historial de pagos
  payment_history: PaymentRecord[];
}

export interface PaymentRecord {
  id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  created_at: string;
  invoice_number?: string;
}

export interface AgingInfo {
  period: string;
  days: number;
  color: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface AccountActions {
  canSendReminder: boolean;
  canApplyPayment: boolean;
  canMarkAsPaid: boolean;
  canEdit: boolean;
}
