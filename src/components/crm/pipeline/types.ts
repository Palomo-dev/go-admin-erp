export interface Customer {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  avatar_url?: string;
  has_opportunities: boolean;
  organization_id: string;
  created_at: string;
  updated_at?: string;
  total_opportunities: number;
  active_opportunities: number;
  won_opportunities: number;
  lost_opportunities: number;
  total_value: number;
  latest_opportunity?: {
    id: string;
    name: string;
    status: string;
    amount: number;
    stage_id: string;
    created_at: string;
  };
  opportunities?: Opportunity[];
}

export interface Opportunity {
  id: string;
  name: string;
  amount: number;
  customer_id: string;
  pipeline_id: string;
  stage_id: string;
  expected_close_date: string;
  status: "active" | "won" | "lost";
  created_at: string;
  updated_at?: string;
  organization_id: string;
}

export interface CustomerInteraction {
  id: string;
  related_id: string;
  related_type: string;
  activity_type: string;
  notes: string;
  occurred_at: string;
  created_at: string;
  updated_at?: string;
  user_id?: string;
  organization_id: string | number;
  metadata?: {
    title?: string;
    [key: string]: any;
  };
}

export interface FormMessage {
  type: "success" | "error" | "warning" | "info" | "";
  text: string;
}

export interface PipelineStage {
  id: string;
  name: string;
  position: number;
  color?: string;
  pipeline_id: string;
  organization_id: string;
  created_at: string;
  updated_at?: string;
}

export interface EditFormData {
  full_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export interface OpportunityFormData {
  name: string;
  amount: number;
  expected_close_date: string;
  stage: string;
}

export interface ClientsViewProps {
  pipelineId: string;
}

// Opciones para ordenamiento
export type SortDirection = "asc" | "desc";
export type SortField = "full_name" | "email" | "total_opportunities" | "total_value";

// Tipo para manejo de errores
export type ErrorState = string | null;
