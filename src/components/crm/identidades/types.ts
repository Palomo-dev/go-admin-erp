export interface ChannelIdentity {
  id: string;
  organization_id: number;
  customer_id: string;
  channel_id: string;
  identity_type: 'phone' | 'email' | 'whatsapp_id' | string;
  identity_value: string;
  verified: boolean;
  metadata: Record<string, unknown> | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  customer?: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
  };
  channel?: {
    id: string;
    name: string;
    type: string;
  };
}


export interface IdentityFilters {
  search: string;
  identityType: string | null;
  channelId: string | null;
  verified: boolean | null;
  showDuplicates: boolean;
}

