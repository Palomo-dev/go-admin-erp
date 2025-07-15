export interface Customer {
  id?: string;
  full_name: string;
  email?: string;
  phone?: string;
}

export interface OpportunityBase {
  id: string;
  stage_id: string;
  customer_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  expected_close_date?: string | null;
  status?: string | null;
  priority?: 'low' | 'medium' | 'high' | null;
  win_probability?: number | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  tasks_count?: number | null;
  tasks_completed?: number | null;
  last_activity_date?: string | null;
  description?: string | null;
  [key: string]: any; // Para permitir campos adicionales de Supabase
}

export interface Opportunity extends OpportunityBase {
  name: string;
  customer?: Customer | null;
}

export interface Stage {
  id: string;
  name: string;
  position: number;
  probability: number;
  pipeline_id: string;
  color?: string;
  description?: string;
  opportunities?: Opportunity[];
  count?: number;
  totalAmount?: number;
  forecast?: number;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: Stage[];
}
