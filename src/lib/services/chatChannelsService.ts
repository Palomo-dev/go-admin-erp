import { supabase } from '@/lib/supabase/config';
import { codigoDelWidget } from '@/lib/chat/codigoWidget';

export type ChannelType = 'website' | 'whatsapp' | 'facebook' | 'instagram' | 'telegram' | 'email';
/** `channels.status` (CHECK en BD: active · inactive · suspended). */
export type ChannelStatus = 'active' | 'inactive' | 'suspended';
/**
 * `channels.ai_mode` (CHECK en BD: auto · hybrid · manual). Antes se tipaba
 * con `'off'`, que la BD rechaza: apagar la IA de un canal fallaba siempre.
 * `ai-auto-response` no responde en los canales `manual`.
 */
export type AIMode = 'manual' | 'hybrid' | 'auto';

export interface ChatChannel {
  id: string;
  organization_id: number;
  type: ChannelType;
  name: string;
  status: ChannelStatus;
  public_key: string | null;
  ai_mode: AIMode;
  business_hours: Record<string, unknown> | null;
  auto_close_inactive_hours: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  website_settings?: ChannelWebsiteSettings;
  credentials?: ChannelCredentials;
}

export interface WidgetPosition {
  side: 'right' | 'left';
  vertical: 'bottom' | 'top';
  offsetX: number;
  offsetY: number;
}

/**
 * Los canales anteriores guardan `brand_config.position` como texto ('bottom-right');
 * los actuales, como objeto. Sin normalizar, la pantalla esparcía el texto en el
 * estado (claves '0', '1'…) y mostraba márgenes por defecto. Misma regla que lee el
 * widget (supabase/functions/_shared/chat-widget/reglas.ts).
 */
export function normalizarPosicionWidget(valor: unknown): WidgetPosition {
  const base: WidgetPosition = { side: 'right', vertical: 'bottom', offsetX: 20, offsetY: 20 };
  if (typeof valor === 'string') {
    return {
      ...base,
      side: valor.includes('left') ? 'left' : 'right',
      vertical: valor.startsWith('top') ? 'top' : 'bottom',
    };
  }
  if (!valor || typeof valor !== 'object') return base;
  const p = valor as Partial<Record<keyof WidgetPosition, unknown>>;
  const numero = (v: unknown, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(200, Math.round(n))) : def;
  };
  return {
    side: p.side === 'left' ? 'left' : 'right',
    vertical: p.vertical === 'top' ? 'top' : 'bottom',
    offsetX: numero(p.offsetX, base.offsetX),
    offsetY: numero(p.offsetY, base.offsetY),
  };
}

export interface WidgetStyle {
  primaryColor: string;
  iconColor: string;
  iconType: 'chat' | 'whatsapp' | 'message' | 'support' | 'custom';
  iconStyle: 'outline' | 'filled';
  iconUrl?: string;
  buttonSize: number;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  shadowEnabled: boolean;
  shadowStrength: 'light' | 'medium' | 'strong';
}

export interface WidgetBehavior {
  title: string;
  welcomeMessage: string;
  openDefaultView: 'chat' | 'faq' | 'form';
  showQuickActions: boolean;
  quickActions?: { label: string; action: string }[];
  offlineMessage: string;
  offlineCollectData: boolean;
}

export interface BrandConfig {
  position: WidgetPosition;
  style: WidgetStyle;
  behavior: WidgetBehavior;
  // Legacy fields for backward compatibility
  primary_color?: string;
  logo_url?: string;
}

export interface CollectIdentity {
  name: boolean;
  email: boolean;
  phone: boolean;
  company?: boolean;
  required?: {
    name?: boolean;
    email?: boolean;
    phone?: boolean;
    company?: boolean;
  };
}

export interface ChannelWebsiteSettings {
  id: string;
  channel_id: string;
  allowed_domains: string[];
  brand_config: BrandConfig;
  welcome_message: string;
  collect_identity: CollectIdentity;
  created_at: string;
  updated_at: string;
}

export interface ChannelCredentials {
  id: string;
  channel_id: string;
  provider: string;
  credentials: Record<string, unknown>;
  is_valid: boolean;
  last_validated_at: string | null;
  /** Solo WhatsApp: cloud_api · coexistence · qr_scan (CHECK en BD). */
  connection_method?: 'cloud_api' | 'coexistence' | 'qr_scan';
  created_at: string;
  updated_at: string;
}

export interface ChannelStats {
  totalChannels: number;
  activeChannels: number;
  byType: Record<ChannelType, number>;
  byAIMode: Record<AIMode, number>;
}

/** Actividad de los canales para la lista de Canales (Figma 91-chat-20). */
export interface ActividadCanal {
  /** Conversaciones abiertas o pendientes. */
  abiertas: number;
  /** Último mensaje de cualquier conversación del canal. */
  ultimaActividad: string | null;
}

export interface ActividadCanales {
  porCanal: Record<string, ActividadCanal>;
  /** Conversaciones creadas desde `desde` (inicio del día en la zona de la organización). */
  conversacionesHoy: number;
  /** Promedio de `first_response_time_seconds` de esas conversaciones; `null` si ninguna tiene respuesta. */
  primeraRespuestaSeg: number | null;
}

export interface CreateChannelData {
  type: ChannelType;
  name: string;
  ai_mode?: AIMode;
  status?: ChannelStatus;
}

export interface UpdateChannelData {
  name?: string;
  status?: ChannelStatus;
  ai_mode?: AIMode;
  business_hours?: Record<string, unknown>;
  auto_close_inactive_hours?: number;
}

export interface WidgetSession {
  id: string;
  organization_id: number;
  channel_id: string;
  customer_id: string | null;
  anon_id: string;
  device_type: string | null;
  current_page: string | null;
  referrer: string | null;
  is_active: boolean;
  last_seen_at: string;
  created_at: string;
}

export interface WidgetStats {
  totalSessions: number;
  activeSessions: number;
  uniqueVisitors: number;
  deviceBreakdown: Record<string, number>;
  topPages: { page: string; count: number }[];
}

class ChatChannelsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getChannels(): Promise<ChatChannel[]> {
    const { data, error } = await supabase
      .from('channels')
      .select(`
        id,
        organization_id,
        type,
        name,
        status,
        public_key,
        ai_mode,
        business_hours,
        auto_close_inactive_hours,
        created_at,
        updated_at,
        created_by
      `)
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error obteniendo canales:', error);
      throw error;
    }

    const channels = data || [];

    const channelsWithDetails = await Promise.all(
      channels.map(async (channel) => {
        let websiteSettings: ChannelWebsiteSettings | undefined;
        let credentials: ChannelCredentials | undefined;

        if (channel.type === 'website') {
          const { data: wsData } = await supabase
            .from('channel_website_settings')
            .select('*')
            .eq('channel_id', channel.id)
            .single();
          websiteSettings = wsData || undefined;
        }

        if (['whatsapp', 'facebook', 'instagram', 'telegram'].includes(channel.type)) {
          const { data: credData } = await supabase
            .from('channel_credentials')
            .select('*')
            .eq('channel_id', channel.id)
            .single();
          credentials = credData || undefined;
        }

        return {
          ...channel,
          website_settings: websiteSettings,
          credentials
        } as ChatChannel;
      })
    );

    return channelsWithDetails;
  }

  async getChannel(channelId: string): Promise<ChatChannel | null> {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .eq('id', channelId)
      .eq('organization_id', this.organizationId)
      .single();

    if (error || !data) {
      return null;
    }

    let websiteSettings: ChannelWebsiteSettings | undefined;
    let credentials: ChannelCredentials | undefined;

    if (data.type === 'website') {
      const { data: wsData } = await supabase
        .from('channel_website_settings')
        .select('*')
        .eq('channel_id', channelId)
        .single();
      websiteSettings = wsData || undefined;
    }

    if (['whatsapp', 'facebook', 'instagram', 'telegram'].includes(data.type)) {
      const { data: credData } = await supabase
        .from('channel_credentials')
        .select('*')
        .eq('channel_id', channelId)
        .single();
      credentials = credData || undefined;
    }

    return {
      ...data,
      website_settings: websiteSettings,
      credentials
    } as ChatChannel;
  }

  async createChannel(channelData: CreateChannelData, userId: string): Promise<ChatChannel> {
    const publicKey = this.generatePublicKey();

    const { data, error } = await supabase
      .from('channels')
      .insert({
        organization_id: this.organizationId,
        type: channelData.type,
        name: channelData.name,
        status: channelData.status || 'active',
        ai_mode: channelData.ai_mode || 'hybrid',
        public_key: publicKey,
        created_by: userId
      })
      .select()
      .single();

    if (error) {
      console.error('Error creando canal:', error);
      throw error;
    }

    if (channelData.type === 'website') {
      await supabase
        .from('channel_website_settings')
        .insert({
          channel_id: data.id,
          allowed_domains: [],
          brand_config: { primary_color: '#3B82F6', position: 'bottom-right' },
          welcome_message: '¡Hola! ¿En qué podemos ayudarte?',
          collect_identity: { name: true, email: true, phone: false }
        });
    }

    await this.logAuditAction(data.id, 'create_channel', userId, {
      channel_type: channelData.type,
      channel_name: channelData.name
    });

    return data as ChatChannel;
  }

  async updateChannel(channelId: string, updates: UpdateChannelData, userId: string): Promise<ChatChannel> {
        const { data, error } = await supabase
      .from('channels')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', channelId)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando canal:', error);
      throw error;
    }

    await this.logAuditAction(channelId, 'update_channel', userId, {
      updates
    });

    return data as ChatChannel;
  }

  async toggleChannelStatus(channelId: string, userId: string): Promise<ChatChannel> {
    const channel = await this.getChannel(channelId);
    if (!channel) {
      throw new Error('Canal no encontrado');
    }

    const newStatus: ChannelStatus = channel.status === 'active' ? 'inactive' : 'active';

    return this.updateChannel(channelId, { status: newStatus }, userId);
  }

  async updateAIMode(channelId: string, aiMode: AIMode, userId: string): Promise<ChatChannel> {
    return this.updateChannel(channelId, { ai_mode: aiMode }, userId);
  }

  async updateWebsiteSettings(
    channelId: string, 
    settings: Partial<ChannelWebsiteSettings>,
    userId: string
  ): Promise<ChannelWebsiteSettings> {
        const { data, error } = await supabase
      .from('channel_website_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString()
      })
      .eq('channel_id', channelId)
      .select()
      .single();

    if (error) {
      console.error('Error actualizando configuración website:', error);
      throw error;
    }

    await this.logAuditAction(channelId, 'update_website_settings', userId, {
      settings
    });

    return data as ChannelWebsiteSettings;
  }

  async getStats(): Promise<ChannelStats> {
    const channels = await this.getChannels();

    const stats: ChannelStats = {
      totalChannels: channels.length,
      activeChannels: channels.filter(c => c.status === 'active').length,
      byType: {} as Record<ChannelType, number>,
      byAIMode: {} as Record<AIMode, number>
    };

    channels.forEach(channel => {
      stats.byType[channel.type] = (stats.byType[channel.type] || 0) + 1;
      stats.byAIMode[channel.ai_mode] = (stats.byAIMode[channel.ai_mode] || 0) + 1;
    });

    return stats;
  }

  /**
   * Conversaciones abiertas y última actividad por canal, más las cifras del
   * día. Cuenta con `head: true` (sin traer filas) salvo las conversaciones de
   * hoy, que son pocas. `desde` es un instante: el inicio del día en la zona de
   * la organización (`useFormatDate().toInstant(getToday())`).
   */
  async getActividadCanales(canalIds: string[], desde: string): Promise<ActividadCanales> {
    const porCanal: Record<string, ActividadCanal> = {};
    await Promise.all(
      canalIds.map(async (id) => {
        const [abiertas, ultima] = await Promise.all([
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', this.organizationId)
            .eq('channel_id', id)
            .in('status', ['open', 'pending']),
          supabase
            .from('conversations')
            .select('last_message_at')
            .eq('organization_id', this.organizationId)
            .eq('channel_id', id)
            .not('last_message_at', 'is', null)
            .order('last_message_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        porCanal[id] = {
          abiertas: abiertas.count ?? 0,
          ultimaActividad: (ultima.data as { last_message_at: string | null } | null)?.last_message_at ?? null,
        };
      })
    );

    const { data: hoy, error } = await supabase
      .from('conversations')
      .select('first_response_time_seconds')
      .eq('organization_id', this.organizationId)
      .gte('created_at', desde)
      .limit(5000);
    if (error) throw error;
    const filas = (hoy ?? []) as { first_response_time_seconds: number | null }[];
    const tiempos = filas.map((f) => f.first_response_time_seconds).filter((x): x is number => typeof x === 'number');
    return {
      porCanal,
      conversacionesHoy: filas.length,
      primeraRespuestaSeg: tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
    };
  }

  /** Código de instalación del widget (ver `src/lib/chat/codigoWidget.ts`). */
  generateWidgetCode(channel: ChatChannel): string {
    return codigoDelWidget(channel.public_key);
  }

  getTypeLabel(type: ChannelType): string {
    const labels: Record<ChannelType, string> = {
      website: 'Sitio Web',
      whatsapp: 'WhatsApp',
      facebook: 'Facebook Messenger',
      instagram: 'Instagram',
      telegram: 'Telegram',
      email: 'Email'
    };
    return labels[type] || type;
  }

  getTypeIcon(type: ChannelType): string {
    const icons: Record<ChannelType, string> = {
      website: 'Globe',
      whatsapp: 'MessageCircle',
      facebook: 'Facebook',
      instagram: 'Instagram',
      telegram: 'Send',
      email: 'Mail'
    };
    return icons[type] || 'MessageSquare';
  }

  getAIModeLabel(mode: AIMode): string {
    const labels: Record<AIMode, string> = {
      manual: 'Desactivado',
      hybrid: 'Híbrido',
      auto: 'Automático'
    };
    return labels[mode] || mode;
  }

  isConnected(channel: ChatChannel): boolean {
    if (channel.type === 'website') {
      return !!channel.public_key;
    }
    return channel.credentials?.is_valid === true;
  }

  async rotatePublicKey(channelId: string, userId: string): Promise<string> {
        const oldChannel = await this.getChannel(channelId);
    const newPublicKey = this.generatePublicKey();

    const { error } = await supabase
      .from('channels')
      .update({
        public_key: newPublicKey,
        updated_at: new Date().toISOString()
      })
      .eq('id', channelId)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error rotando public key:', error);
      throw error;
    }

    await this.logAuditAction(channelId, 'rotate_public_key', userId, {
      old_key_prefix: oldChannel?.public_key?.substring(0, 10),
      new_key_prefix: newPublicKey.substring(0, 10)
    });

    return newPublicKey;
  }

  async addAllowedDomain(channelId: string, domain: string, userId: string): Promise<string[]> {
        const { data: settings } = await supabase
      .from('channel_website_settings')
      .select('allowed_domains')
      .eq('channel_id', channelId)
      .single();

    const currentDomains = settings?.allowed_domains || [];
    const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    if (currentDomains.includes(normalizedDomain)) {
      return currentDomains;
    }

    const newDomains = [...currentDomains, normalizedDomain];

    const { error } = await supabase
      .from('channel_website_settings')
      .update({
        allowed_domains: newDomains,
        updated_at: new Date().toISOString()
      })
      .eq('channel_id', channelId);

    if (error) {
      console.error('Error agregando dominio:', error);
      throw error;
    }

    await this.logAuditAction(channelId, 'add_allowed_domain', userId, { domain: normalizedDomain });

    return newDomains;
  }

  async removeAllowedDomain(channelId: string, domain: string, userId: string): Promise<string[]> {
        const { data: settings } = await supabase
      .from('channel_website_settings')
      .select('allowed_domains')
      .eq('channel_id', channelId)
      .single();

    const currentDomains = settings?.allowed_domains || [];
    const newDomains = currentDomains.filter((d: string) => d !== domain);

    const { error } = await supabase
      .from('channel_website_settings')
      .update({
        allowed_domains: newDomains,
        updated_at: new Date().toISOString()
      })
      .eq('channel_id', channelId);

    if (error) {
      console.error('Error removiendo dominio:', error);
      throw error;
    }

    await this.logAuditAction(channelId, 'remove_allowed_domain', userId, { domain });

    return newDomains;
  }

  async getWidgetStats(channelId: string): Promise<WidgetStats> {
    const { data: sessions, error } = await supabase
      .from('widget_sessions')
      .select('*')
      .eq('channel_id', channelId)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error obteniendo sesiones del widget:', error);
      throw error;
    }

    const sessionList = sessions || [];
    const uniqueAnons = new Set(sessionList.map(s => s.anon_id));
    const deviceBreakdown: Record<string, number> = {};
    const pageCount: Record<string, number> = {};

    sessionList.forEach(session => {
      const device = session.device_type || 'unknown';
      deviceBreakdown[device] = (deviceBreakdown[device] || 0) + 1;

      if (session.current_page) {
        pageCount[session.current_page] = (pageCount[session.current_page] || 0) + 1;
      }
    });

    const topPages = Object.entries(pageCount)
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalSessions: sessionList.length,
      activeSessions: sessionList.filter(s => s.is_active).length,
      uniqueVisitors: uniqueAnons.size,
      deviceBreakdown,
      topPages
    };
  }

  async updateBrandConfig(
    channelId: string,
    brandConfig: ChannelWebsiteSettings['brand_config'],
    userId: string
  ): Promise<ChannelWebsiteSettings> {
    return this.updateWebsiteSettings(channelId, { brand_config: brandConfig } as Partial<ChannelWebsiteSettings>, userId);
  }

  async updateCollectIdentity(
    channelId: string,
    collectIdentity: ChannelWebsiteSettings['collect_identity'],
    userId: string
  ): Promise<ChannelWebsiteSettings> {
    return this.updateWebsiteSettings(channelId, { collect_identity: collectIdentity } as Partial<ChannelWebsiteSettings>, userId);
  }

  async updateWelcomeMessage(
    channelId: string,
    welcomeMessage: string,
    userId: string
  ): Promise<ChannelWebsiteSettings> {
    return this.updateWebsiteSettings(channelId, { welcome_message: welcomeMessage } as Partial<ChannelWebsiteSettings>, userId);
  }

  private generatePublicKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'pk_';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async logAuditAction(
    channelId: string,
    action: string,
    userId: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      await supabase.from('chat_audit_logs').insert({
        organization_id: this.organizationId,
        actor_type: 'member',
        actor_id: userId,
        action,
        entity_type: 'channel',
        entity_id: channelId,
        changes: details
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  }
}

export default ChatChannelsService;
