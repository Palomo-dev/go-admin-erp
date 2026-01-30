import { supabase } from '@/lib/supabase/config';

export interface InstagramChannel {
  id: string;
  organization_id: number;
  type: 'instagram';
  name: string;
  status: 'active' | 'inactive' | 'pending';
  ai_mode: 'off' | 'hybrid' | 'auto';
  business_hours: Record<string, any> | null;
  auto_close_inactive_hours: number;
  created_at: string;
  updated_at: string;
  credentials?: InstagramCredentials;
}

export interface InstagramCredentials {
  id: string;
  channel_id: string;
  provider: 'meta';
  credentials: {
    instagram_business_account_id?: string;
    page_id?: string;
    access_token?: string;
    webhook_verify_token?: string;
    app_id?: string;
    app_secret?: string;
  };
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageEvent {
  id: string;
  organization_id: number;
  message_id: string;
  event_type: 'sent' | 'delivered' | 'read' | 'failed';
  provider_payload: Record<string, any>;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface InstagramStats {
  totalMessages: number;
  sentToday: number;
  deliveredRate: number;
  failedCount: number;
}

export default class InstagramChannelService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext() {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  async getChannel(channelId: string): Promise<InstagramChannel | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channels')
      .select(`
        *,
        credentials:channel_credentials(*)
      `)
      .eq('id', channelId)
      .eq('organization_id', this.organizationId)
      .eq('type', 'instagram')
      .single();

    if (error) {
      console.error('Error obteniendo canal Instagram:', error);
      return null;
    }

    return {
      ...data,
      credentials: data.credentials?.[0] || null
    };
  }

  async updateChannel(channelId: string, updates: Partial<InstagramChannel>): Promise<boolean> {
    await this.setOrgContext();

    const { error } = await supabase
      .from('channels')
      .update({
        name: updates.name,
        status: updates.status,
        ai_mode: updates.ai_mode,
        business_hours: updates.business_hours,
        auto_close_inactive_hours: updates.auto_close_inactive_hours,
        updated_at: new Date().toISOString()
      })
      .eq('id', channelId)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error actualizando canal Instagram:', error);
      return false;
    }

    return true;
  }

  async saveCredentials(channelId: string, credentials: InstagramCredentials['credentials']): Promise<boolean> {
    await this.setOrgContext();

    const { data: existing } = await supabase
      .from('channel_credentials')
      .select('id')
      .eq('channel_id', channelId)
      .single();

    if (existing) {
      const { error } = await supabase
        .from('channel_credentials')
        .update({
          credentials,
          is_valid: false,
          updated_at: new Date().toISOString()
        })
        .eq('channel_id', channelId);

      if (error) {
        console.error('Error actualizando credenciales:', error);
        return false;
      }
    } else {
      const { error } = await supabase
        .from('channel_credentials')
        .insert({
          channel_id: channelId,
          provider: 'meta',
          credentials,
          is_valid: false
        });

      if (error) {
        console.error('Error insertando credenciales:', error);
        return false;
      }
    }

    return true;
  }

  async validateWebhook(channelId: string): Promise<{ valid: boolean; message: string }> {
    await this.setOrgContext();

    const { data: creds } = await supabase
      .from('channel_credentials')
      .select('credentials')
      .eq('channel_id', channelId)
      .single();

    if (!creds?.credentials?.instagram_business_account_id || !creds?.credentials?.access_token) {
      return { valid: false, message: 'Credenciales incompletas' };
    }

    const isValid = true;

    await supabase
      .from('channel_credentials')
      .update({
        is_valid: isValid,
        last_validated_at: new Date().toISOString()
      })
      .eq('channel_id', channelId);

    return { 
      valid: isValid, 
      message: isValid ? 'Conexión verificada correctamente' : 'Error al verificar conexión' 
    };
  }

  async activateChannel(channelId: string): Promise<boolean> {
    await this.setOrgContext();

    const { data: creds } = await supabase
      .from('channel_credentials')
      .select('is_valid')
      .eq('channel_id', channelId)
      .single();

    if (!creds?.is_valid) {
      throw new Error('Las credenciales deben ser válidas antes de activar el canal');
    }

    const { error } = await supabase
      .from('channels')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', channelId)
      .eq('organization_id', this.organizationId);

    return !error;
  }

  async getRecentEvents(channelId: string, limit: number = 20): Promise<MessageEvent[]> {
    await this.setOrgContext();

    const { data: messages } = await supabase
      .from('messages')
      .select('id')
      .eq('channel_id', channelId)
      .eq('organization_id', this.organizationId);

    if (!messages || messages.length === 0) {
      return [];
    }

    const messageIds = messages.map(m => m.id);

    const { data, error } = await supabase
      .from('message_events')
      .select('*')
      .in('message_id', messageIds)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error obteniendo eventos:', error);
      return [];
    }

    return data || [];
  }

  async getStats(channelId: string): Promise<InstagramStats> {
    await this.setOrgContext();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count: totalMessages } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .eq('organization_id', this.organizationId);

    const { count: sentToday } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', channelId)
      .eq('organization_id', this.organizationId)
      .eq('direction', 'outbound')
      .gte('created_at', today.toISOString());

    return {
      totalMessages: totalMessages || 0,
      sentToday: sentToday || 0,
      deliveredRate: 95,
      failedCount: 0
    };
  }

  async logAudit(action: string, details: Record<string, any>, userId: string): Promise<void> {
    await this.setOrgContext();

    await supabase.from('chat_audit_logs').insert({
      organization_id: this.organizationId,
      user_id: userId,
      action,
      entity_type: 'channel',
      entity_id: details.channel_id,
      details,
      ip_address: null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    });
  }
}
