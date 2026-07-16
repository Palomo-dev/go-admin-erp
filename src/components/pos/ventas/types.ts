// Tipos adicionales para el módulo de ventas POS
import { Sale, SaleItem, Customer, Payment } from '../types';

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

export interface CashCount {
  id: number;
  organization_id: number;
  cash_session_id: number;
  count_type: 'opening' | 'partial' | 'closing';
  counted_amount: number;
  expected_amount?: number;
  difference?: number;
  denominations?: {
    bills?: Record<string, number>;
    coins?: Record<string, number>;
  };
  counted_by: string;
  verified_by?: string;
  notes?: string;
  created_at: string;
}

export interface MesaInfo {
  table_session_id: string;
  table_name?: string;
  table_number?: string;
  server_id?: string;
  server_name?: string;
  opened_at?: string;
  closed_at?: string;
  customers?: number;
  status?: string;
}

export interface InvoiceInfo {
  id: string;
  number: string;
  issue_date: string;
  due_date: string;
  status: string;
  total: number;
  balance: number;
  payment_method?: string;
}

export interface AccountReceivableInfo {
  id: string;
  amount: number;
  balance: number;
  due_date: string;
  status: string;
}

export interface JournalEntryInfo {
  id: number;
  entry_date: string;
  memo: string;
  posted: boolean;
  lines?: {
    id: number;
    account_code: string;
    debit: number;
    credit: number;
    description?: string;
  }[];
}

export interface SaleWithDetails extends Sale {
  customer?: Customer;
  items?: SaleItem[];
  payments?: Payment[];
  sale_number?: string;
  seller_name?: string;
  branch_name?: string;
  _source?: 'pos' | 'web' | 'mesa';
  delivery_fee?: number;
  tip_amount?: number;
  tip_server_id?: string;
  driver_id?: string;
  table_session_id?: string;
  delivery_type?: string;
  delivery_address?: any;
  coupon_code?: string;
  salesperson_name?: string;
  commission_amount?: number;
  mesa_info?: MesaInfo;
  invoice?: InvoiceInfo;
  accounts_receivable?: AccountReceivableInfo;
  journal_entry?: JournalEntryInfo;
}

export interface SalesFilter {
  search?: string;
  status?: 'all' | 'pending' | 'completed' | 'cancelled';
  payment_status?: 'all' | 'pending' | 'paid' | 'partial' | 'refunded';
  date_from?: string;
  date_to?: string;
  customer_id?: string;
  user_id?: string;
  branch_id?: number;
  source_type?: 'all' | 'pos' | 'web';
}

export interface DailySummary {
  total_sales: number;
  total_amount: number;
  total_tax: number;
  total_discount: number;
  payment_methods: {
    method: string;
    count: number;
    amount: number;
  }[];
  pending_count: number;
  completed_count: number;
  cancelled_count: number;
}

export interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  href: string;
  color: string;
  badge?: string | number;
}
