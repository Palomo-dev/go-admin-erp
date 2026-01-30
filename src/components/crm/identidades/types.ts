export interface ChannelIdentity {
  id: string;
  organization_id: number;
  customer_id: string;
  channel_id: string;
  identity_type: 'phone' | 'email' | 'whatsapp_id' | string;
  identity_value: string;
  verified: boolean;
  metadata: Record<string, any> | null;
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

export interface DuplicateGroup {
  identity_type: string;
  identity_value: string;
  customers: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    conversations_count: number;
    opportunities_count: number;
    last_activity: string | null;
  }[];
}

export interface IdentityFilters {
  search: string;
  identityType: string | null;
  channelId: string | null;
  verified: boolean | null;
  showDuplicates: boolean;
}

export interface MergeResult {
  success: boolean;
  message: string;
  mergedCustomerId?: string;
}
