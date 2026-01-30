// Tipos para el módulo de Oportunidades CRM

export interface Pipeline {
  id: string;
  name: string;
  organization_id: number;
  is_default: boolean;
  goal_amount: number;
  goal_period: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  goal_currency: string;
  created_at: string;
  updated_at: string;
}

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  color: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  organization_id: number;
}

export interface Opportunity {
  id: string;
  organization_id: number;
  pipeline_id: string;
  stage_id: string;
  customer_id: string | null;
  name: string;
  amount: number;
  currency: string;
  expected_close_date: string | null;
  status: 'open' | 'won' | 'lost';
  loss_reason?: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones
  customer?: Customer;
  stage?: Stage;
  pipeline?: Pipeline;
  products?: OpportunityProduct[];
}

export interface OpportunityProduct {
  id: string;
  opportunity_id: string;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
  // Relación
  product?: {
    id: number;
    name: string;
    sku?: string;
  };
}

export interface Activity {
  id: string;
  organization_id: number;
  activity_type: 'call' | 'email' | 'meeting' | 'note' | 'task';
  user_id: string | null;
  notes: string | null;
  related_type: string | null;
  related_id: string | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface OpportunityFilters {
  pipelineId?: string;
  stageId?: string;
  status?: 'open' | 'won' | 'lost' | 'all';
  customerId?: string;
  agentId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface OpportunityStats {
  total: number;
  open: number;
  won: number;
  lost: number;
  totalAmount: number;
  weightedAmount: number;
  avgDealSize: number;
  winRate: number;
}

export interface ForecastData {
  period: string;
  openAmount: number;
  weightedAmount: number;
  wonAmount: number;
  lostAmount: number;
  goal: number;
  goalCompletion: number;
}

export interface CreateOpportunityInput {
  pipeline_id: string;
  stage_id: string;
  customer_id?: string;
  name: string;
  amount: number;
  currency?: string;
  expected_close_date?: string;
  products?: {
    product_id: number;
    quantity: number;
    unit_price: number;
  }[];
}

export interface UpdateOpportunityInput {
  stage_id?: string;
  customer_id?: string;
  name?: string;
  amount?: number;
  currency?: string;
  expected_close_date?: string;
  status?: 'open' | 'won' | 'lost';
  loss_reason?: string;
}
