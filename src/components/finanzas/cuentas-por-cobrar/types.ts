export interface CuentaPorCobrar {
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
}

export interface FiltrosCuentasPorCobrar {
  busqueda: string;
  estado: 'todos' | 'current' | 'overdue' | 'paid' | 'partial';
  aging: 'todos' | '0-30' | '31-60' | '61-90' | '90+';
  cliente: string;
  fechaDesde: string;
  fechaHasta: string;
  // Paginación
  pageSize: number;
  pageNumber: number;
}

export interface ResultadoPaginado<T> {
  data: T[];
  total_count: number;
  page_size: number;
  page_number: number;
  total_pages: number;
}

export interface AgingBucket {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  current: number;  // 0-30 días
  days_31_60: number;  // 31-60 días
  days_61_90: number;  // 61-90 días
  days_90_plus: number;  // +90 días
  total: number;
}

export interface Recordatorio {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  amount: number;
  due_date: string;
  days_overdue: number;
  last_reminder_date: string | null;
  next_reminder_date: string;
}

export interface Abono {
  id: string;
  account_receivable_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string;
  notes: string;
}

export interface EstadisticasCxC {
  total_cuentas: number;
  total_amount: number;
  total_balance: number;
  current_amount: number;
  overdue_amount: number;
  paid_amount: number;
  partial_amount: number;
  promedio_dias_cobro: number;
}
