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
  metadata?: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  salesperson_id?: string | null;
  commission_rate?: number;
  commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
  // Campos operativos nuevos
  source?: string;
  vertical_id?: string;
  next_contact_at?: string;
  // FASE 2 — Nuevas columnas
  record_type?: 'lead' | 'deal';
  last_contact_at?: string | null;
  contact_channel?: string | null;
  contact_result?: string | null;
  objection_id?: string | null;
  loss_reason_value?: string | null;
  competitor_name?: string | null;
  competitor_price?: number | null;
  missing_features?: string[] | null;
  recontact_at?: string | null;
  discovery_data?: Record<string, unknown> | null;
  closed_at?: string | null;
  win_data?: Record<string, unknown> | null;
  next_action?: string | null;
  // Relaciones
  customer?: Customer;
  stage?: Stage;
  pipeline?: Pipeline;
  products?: OpportunityProduct[];
}

// Datos estructurados para registrar una oportunidad como perdida
export interface LossReasonData {
  lossReasonId: string;      // ID del catálogo (cuando exista)
  lossReasonLabel: string;   // etiqueta visible (fallback)
  competitor?: string;
  competitorPrice?: number;
  missingFeatures?: string[];
  recontactDate?: string;
  notes?: string;
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

export interface OpportunitySpace {
  id: string;
  opportunity_id: string;
  space_id: string;
  nights: number;
  unit_price: number;
  total_price: number;
  checkin_date?: string | null;
  checkout_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  // Relación
  space?: {
    id: string;
    label: string;
    floor_zone?: string;
    status: string;
    space_types?: {
      name: string;
      base_rate: number;
    };
  };
}

export interface OpportunityCustomLine {
  id: string;
  opportunity_id: string;
  concept: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: string;
  updated_at: string;
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

export interface OpportunityTask {
  id: string;
  organization_id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  assigned_to: string | null;
  priority: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  related_to_id: string | null;
  related_to_type: string | null;
  completed_at: string | null;
  tags: string[] | null;
  assigned_user?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface OpportunityNote {
  id: string;
  organization_id: number;
  user_id: string;
  body: string;
  related_type: string | null;
  related_id: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface CustomerDetails extends Customer {
  identification_type?: string;
  identification_number?: string;
  address?: string;
  city?: string;
  company_name?: string;
  customer_type?: string;
  tags?: string[];
  roles?: string[];
  notes?: string;
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
  record_type?: 'lead' | 'deal';
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
  salesperson_id?: string;
  commission_rate?: number;
  commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
  source?: string;
  vertical_id?: string;
  next_contact_at?: string;
  record_type?: 'lead' | 'deal';
  products?: {
    product_id: number;
    quantity: number;
    unit_price: number;
  }[];
  spaces?: {
    space_id: string;
    nights: number;
    unit_price: number;
  }[];
  customLines?: {
    concept: string;
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
  metadata?: Record<string, unknown> | null;
  salesperson_id?: string | null;
  commission_rate?: number;
  commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
  source?: string;
  vertical_id?: string;
  next_contact_at?: string;
  // FASE 2 — Nuevas columnas
  record_type?: 'lead' | 'deal';
  last_contact_at?: string | null;
  contact_channel?: string | null;
  contact_result?: string | null;
  objection_id?: string | null;
  loss_reason_value?: string | null;
  competitor_name?: string | null;
  competitor_price?: number | null;
  missing_features?: string[] | null;
  recontact_at?: string | null;
  discovery_data?: Record<string, unknown> | null;
  win_data?: Record<string, unknown> | null;
  next_action?: string | null;
  closed_at?: string | null;
  temperature?: string | null;
  products?: {
    product_id: number;
    quantity: number;
    unit_price: number;
  }[];
  spaces?: {
    space_id: string;
    nights: number;
    unit_price: number;
  }[];
  customLines?: {
    concept: string;
    quantity: number;
    unit_price: number;
  }[];
}
