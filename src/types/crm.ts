export interface Customer {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
}

export interface Opportunity {
  id: string;
  name: string;
  amount?: number | null;
  currency?: string | null;
  expected_close_date?: string | null;
  status?: string | null;
  customer?: Customer | null;
  customer_id?: string | null;
  stage_id: string;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface Stage {
  id: string;
  name: string;
  position: number;
  probability: number;
  color?: string;
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
