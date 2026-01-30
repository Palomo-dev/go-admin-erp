// Tipos para Campañas

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
export type CampaignChannel = 'whatsapp' | 'email' | 'sms';
export type ContactState = 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'failed';

export interface Campaign {
  id: string;
  organization_id: number;
  name: string;
  channel: CampaignChannel | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  template_id: string | null;
  segment_id: string | null;
  content: string | null;
  statistics: CampaignStatistics | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Relaciones
  segment?: {
    id: string;
    name: string;
    customer_count: number;
  };
}

export interface CampaignStatistics {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  failed: number;
}

export interface CampaignContact {
  id: string;
  campaign_id: string;
  customer_id: string;
  state: ContactState;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  // Relación
  customer?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
}

export interface Channel {
  id: string;
  organization_id: number;
  type: string;
  name: string;
  status: string;
}

export interface CreateCampaignInput {
  name: string;
  channel?: CampaignChannel;
  segment_id?: string;
  content?: string;
  scheduled_at?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  channel?: CampaignChannel;
  segment_id?: string;
  content?: string;
  scheduled_at?: string;
  status?: CampaignStatus;
}

export interface CampaignStats {
  total: number;
  draft: number;
  scheduled: number;
  sent: number;
  sending: number;
}

export const CAMPAIGN_STATUS_CONFIG: Record<CampaignStatus, {
  label: string;
  color: string;
  bgColor: string;
}> = {
  draft: { label: 'Borrador', color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-800' },
  scheduled: { label: 'Programada', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900/30' },
  sending: { label: 'Enviando', color: 'text-yellow-600', bgColor: 'bg-yellow-100 dark:bg-yellow-900/30' },
  sent: { label: 'Enviada', color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900/30' },
  paused: { label: 'Pausada', color: 'text-orange-600', bgColor: 'bg-orange-100 dark:bg-orange-900/30' },
  cancelled: { label: 'Cancelada', color: 'text-red-600', bgColor: 'bg-red-100 dark:bg-red-900/30' },
};

export const CHANNEL_CONFIG: Record<CampaignChannel, {
  label: string;
  color: string;
  icon: string;
}> = {
  whatsapp: { label: 'WhatsApp', color: 'text-green-600', icon: 'MessageCircle' },
  email: { label: 'Email', color: 'text-blue-600', icon: 'Mail' },
  sms: { label: 'SMS', color: 'text-purple-600', icon: 'MessageSquare' },
};
