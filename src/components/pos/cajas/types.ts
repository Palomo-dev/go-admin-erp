// Tipos específicos para el módulo de Apertura & Cierre de Caja
export interface CashSession {
  id: number;
  uuid: string;
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
  // Campos adicionales para UI
  opened_by_name?: string;
  closed_by_name?: string;
  branch_name?: string;
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
  // Campos adicionales para UI
  user_name?: string;
}

// Arqueo de caja
export interface CashCount {
  id: number;
  organization_id: number;
  cash_session_id: number;
  count_type: 'opening' | 'partial' | 'closing';
  counted_amount: number;
  expected_amount?: number;
  difference?: number;
  denominations?: CashDenominations;
  counted_by: string;
  verified_by?: string;
  notes?: string;
  created_at: string;
  // Campos adicionales para UI
  counted_by_name?: string;
  verified_by_name?: string;
}

// Desglose de denominaciones para arqueo
export interface CashDenominations {
  bills?: Record<string, number>; // { "100000": 2, "50000": 5, ... }
  coins?: Record<string, number>; // { "1000": 10, "500": 20, ... }
}

// Datos para crear arqueo
export interface CreateCashCountData {
  count_type: 'opening' | 'partial' | 'closing';
  counted_amount: number;
  expected_amount?: number;
  denominations?: CashDenominations;
  notes?: string;
}

// Datos para crear movimiento
export interface CreateCashMovementData {
  type: 'in' | 'out';
  concept: string;
  amount: number;
  notes?: string;
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
