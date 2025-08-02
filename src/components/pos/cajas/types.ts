// Tipos específicos para el módulo de Apertura & Cierre de Caja
export interface CashSession {
  id: number;
  organization_id: number;
  branch_id: number;
  opened_by: string;
  opened_at: string;
  initial_amount: number;
  closed_at?: string;
  closed_by?: string;
  final_amount?: number;
  difference?: number;
  status: 'open' | 'closed';
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CashMovement {
  id: number;
  organization_id: number;
  cash_session_id: number;
  type: 'in' | 'out';
  concept: string;
  amount: number;
  user_id: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface CashSummary {
  initial_amount: number;
  sales_cash: number;
  cash_in: number;
  cash_out: number;
  expected_amount: number;
  counted_amount?: number;
  difference?: number;
}

export interface OpenCashSessionData {
  initial_amount: number;
  notes?: string;
}

export interface CloseCashSessionData {
  final_amount: number;
  notes?: string;
}

export interface CashMovementData {
  type: 'in' | 'out';
  concept: string;
  amount: number;
  notes?: string;
}

export interface CashSessionReport {
  session: CashSession;
  movements: CashMovement[];
  summary: CashSummary;
  sales_summary: {
    total_sales: number;
    cash_sales: number;
    card_sales: number;
    other_sales: number;
  };
}

// Estados y filtros
export interface CashSessionFilter {
  status?: 'open' | 'closed' | 'all';
  date_from?: string;
  date_to?: string;
  branch_id?: number;
}

// Para la generación de PDFs
export interface CashReportData {
  session: CashSession;
  movements: CashMovement[];
  summary: CashSummary;
  organization_name: string;
  branch_name: string;
  user_name: string;
}
