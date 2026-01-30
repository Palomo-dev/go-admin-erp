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

export interface SaleWithDetails extends Sale {
  customer?: Customer;
  items?: SaleItem[];
  payments?: Payment[];
  sale_number?: string;
  seller_name?: string;
  branch_name?: string;
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
