import { supabase } from '@/lib/supabase/config';

// Tiempo máximo en minutos para considerar una sesión como "online"
const ONLINE_THRESHOLD_MINUTES = 3;

export interface WidgetSession {
  id: string;
  organization_id: number;
  channel_id: string;
  customer_id: string | null;
  anon_id: string;
  session_token: string;
  fingerprint_hash: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  referrer: string | null;
  current_page: string | null;
  location_data: {
    country?: string;
    city?: string;
    region?: string;
  } | null;
  device_type: string | null;
  is_active: boolean; // true = online (heartbeat reciente), false = offline
  last_seen_at: string;
  expires_at: string;
  created_at: string;
  channel?: {
    id: string;
    name: string;
    type: string;
  };
  customer?: {
    id: string;
    full_name: string;
    email: string | null;
    last_seen_at?: string | null;
  };
}

export interface SessionStats {
  total: number;
  active: number;
  expired: number;
  withCustomer: number;
  anonymous: number;
}

export interface SessionFilters {
  status?: 'all' | 'active' | 'expired' | 'blocked';
  channelId?: string;
  hasCustomer?: boolean;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

class WidgetSessionsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  private async setOrgContext(): Promise<void> {
    await supabase.rpc('set_org_context', { org_id: this.organizationId });
  }

  private async logAudit(action: string, entityId: string | null, changes: Record<string, any>): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: null,
        action,
        entity_type: 'widget_session',
        entity_id: entityId,
        changes,
        metadata: {},
        ip_address: null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }

  private isOnline(lastSeenAt: string | null): boolean {
    if (!lastSeenAt) return false;
    const lastSeen = new Date(lastSeenAt);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeen.getTime()) / (1000 * 60);
    return diffMinutes <= ONLINE_THRESHOLD_MINUTES;
  }

  async getSessions(filters?: SessionFilters): Promise<WidgetSession[]> {
    await this.setOrgContext();

    // Obtener conversaciones del widget (tipo website) con last_seen_at del customer
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        id,
        organization_id,
        channel_id,
        customer_id,
        status,
        created_at,
        updated_at,
        channel:channels!inner(id, name, type),
        customer:customers(id, full_name, email, last_seen_at)
      `)
      .eq('organization_id', this.organizationId)
      .eq('channels.type', 'website')
      .order('updated_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Error obteniendo sesiones:', error);
      return [];
    }

    // Transformar y calcular is_active basado en last_seen_at del customer
    let sessions = (data || []).map((conv: any) => {
      const customerLastSeen = conv.customer?.last_seen_at;
      const isOnline = this.isOnline(customerLastSeen);
      
      return {
        id: conv.id,
        organization_id: conv.organization_id,
        channel_id: conv.channel_id,
        customer_id: conv.customer_id,
        anon_id: conv.customer?.email?.split('@')[0]?.replace('visitor_', '') || conv.id.substring(0, 8),
        session_token: conv.id,
        fingerprint_hash: null,
        ip_hash: null,
        user_agent: null,
        referrer: null,
        current_page: null,
        location_data: null,
        device_type: 'desktop',
        is_active: isOnline, // Online si heartbeat es reciente
        last_seen_at: customerLastSeen || conv.updated_at,
        expires_at: customerLastSeen || conv.updated_at,
        created_at: conv.created_at,
        channel: conv.channel,
        customer: conv.customer,
      };
    });

    // Aplicar filtros de estado basados en online/offline
    if (filters?.status === 'active') {
      sessions = sessions.filter(s => s.is_active);
    } else if (filters?.status === 'expired') {
      sessions = sessions.filter(s => !s.is_active);
    }

    if (filters?.channelId) {
      sessions = sessions.filter(s => s.channel_id === filters.channelId);
    }

    if (filters?.hasCustomer === true) {
      sessions = sessions.filter(s => s.customer_id !== null);
    } else if (filters?.hasCustomer === false) {
      sessions = sessions.filter(s => s.customer_id === null);
    }

    if (filters?.dateFrom) {
      sessions = sessions.filter(s => new Date(s.created_at) >= new Date(filters.dateFrom!));
    }

    if (filters?.dateTo) {
      sessions = sessions.filter(s => new Date(s.created_at) <= new Date(filters.dateTo!));
    }

    // Ordenar: online primero, luego por last_seen_at
    sessions.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });

    return sessions.slice(0, 200);
  }

  async getSessionById(id: string): Promise<WidgetSession | null> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('widget_sessions')
      .select(`
        *,
        channel:channels(id, name, type),
        customer:customers(id, full_name, email)
      `)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      console.error('Error obteniendo sesión:', error);
      return null;
    }

    return data;
  }

  async getStats(): Promise<SessionStats> {
    await this.setOrgContext();

    // Obtener estadísticas de conversaciones del widget con last_seen_at del customer
    const { data: conversations } = await supabase
      .from('conversations')
      .select(`
        id, 
        status, 
        customer_id,
        channel:channels!inner(type),
        customer:customers(last_seen_at)
      `)
      .eq('organization_id', this.organizationId)
      .eq('channels.type', 'website');

    if (!conversations) {
      return { total: 0, active: 0, expired: 0, withCustomer: 0, anonymous: 0 };
    }

    // Calcular stats basados en online/offline (heartbeat reciente)
    const stats: SessionStats = {
      total: conversations.length,
      active: conversations.filter((c: any) => this.isOnline(c.customer?.last_seen_at)).length,
      expired: conversations.filter((c: any) => !this.isOnline(c.customer?.last_seen_at)).length,
      withCustomer: conversations.filter(c => c.customer_id !== null).length,
      anonymous: conversations.filter(c => c.customer_id === null).length
    };

    return stats;
  }

  async blockSession(id: string, reason?: string): Promise<void> {
    await this.setOrgContext();

    // Cerrar la conversación en lugar de bloquear widget_session
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'closed' })
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error bloqueando sesión:', error);
      throw new Error('No se pudo bloquear la sesión');
    }

    await this.logAudit('block_session', id, { reason });
  }

  async unblockSession(id: string): Promise<void> {
    await this.setOrgContext();

    // Reabrir la conversación
    const { error } = await supabase
      .from('conversations')
      .update({ status: 'open' })
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error desbloqueando sesión:', error);
      throw new Error('No se pudo desbloquear la sesión');
    }

    await this.logAudit('unblock_session', id, {});
  }

  async getChannels(): Promise<{ id: string; name: string; type: string }[]> {
    await this.setOrgContext();

    const { data, error } = await supabase
      .from('channels')
      .select('id, name, type')
      .eq('organization_id', this.organizationId)
      .eq('type', 'website')
      .order('name');

    if (error) {
      console.error('Error obteniendo canales:', error);
      return [];
    }

    return data || [];
  }
}

export default WidgetSessionsService;
