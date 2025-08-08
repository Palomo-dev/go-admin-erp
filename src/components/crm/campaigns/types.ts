export interface Campaign {
  id: string;
  organization_id: number;
  name: string;
  channel: 'email' | 'whatsapp' | null;
  status: 'draft' | 'scheduled' | 'sending' | 'sent';
  scheduled_at: string | null;
  template_id: string | null;
  segment_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  content: string | null;
  statistics: CampaignStatistics;
  // Relaciones
  segment?: Segment;
  template?: Template;
}

export interface CampaignStatistics {
  total_sent?: number;
  delivered?: number;
  opened?: number;
  clicked?: number;
  bounced?: number;
  unsubscribed?: number;
  conversion_rate?: number;
  open_rate?: number;
  click_rate?: number;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  customer_id: string;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'unsubscribed';
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  unsubscribed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones
  customer?: Customer;
}

export interface Segment {
  id: string;
  organization_id: number;
  name: string;
  filter_json: any;
  is_dynamic: boolean;
  description: string | null;
  customer_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  type: 'email' | 'whatsapp';
}

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
}

export interface CampaignFormData {
  name: string;
  channel: 'email' | 'whatsapp';
  segment_id: string;
  template_id?: string;
  content?: string;
  scheduled_at?: string;
}

export interface CampaignKPIData {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
}
