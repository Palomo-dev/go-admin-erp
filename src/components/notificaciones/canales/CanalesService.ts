import { supabase } from '@/lib/supabase/config';
import type { NotificationChannel, ChannelFormData, LinkedConnection } from './types';

export const CanalesService = {
  // ── Listar canales con conexión vinculada ────────────
  async getChannels(orgId: number): Promise<NotificationChannel[]> {
    const { data, error } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('organization_id', orgId)
      .order('code', { ascending: true });

    if (error) {
      console.error('Error fetching channels:', error);
      return [];
    }

    const channels = (data as NotificationChannel[]) || [];

    const connIds = channels.map((c) => c.connection_id).filter(Boolean) as string[];
    if (connIds.length > 0) {
      const { data: conns } = await supabase
        .from('integration_connections')
        .select('id, name, status, environment, connector_id')
        .in('id', connIds);

      if (conns && conns.length > 0) {
        const connectorIds = Array.from(new Set(conns.map((c: any) => c.connector_id)));
        const { data: connectors } = await supabase
          .from('integration_connectors')
          .select('id, provider_id, code, name')
          .in('id', connectorIds);

        const providerIds = Array.from(new Set((connectors || []).map((c: any) => c.provider_id)));
        const { data: providers } = await supabase
          .from('integration_providers')
          .select('id, code, name, logo_url, category')
          .in('id', providerIds);

        const connMap = new Map<string, LinkedConnection>();
        for (const conn of conns as any[]) {
          const connector = (connectors || []).find((c: any) => c.id === conn.connector_id);
          const provider = connector ? (providers || []).find((p: any) => p.id === connector.provider_id) : null;
          connMap.set(conn.id, {
            id: conn.id,
            name: conn.name,
            status: conn.status,
            environment: conn.environment,
            provider_code: provider?.code || '',
            provider_name: provider?.name || connector?.name || '',
            provider_logo_url: provider?.logo_url || null,
            category: provider?.category || '',
          });
        }

        channels.forEach((ch) => {
          if (ch.connection_id && connMap.has(ch.connection_id)) {
            ch.linked_connection = connMap.get(ch.connection_id)!;
          }
        });
      }
    }

    return channels;
  },

  // ── Conexiones de integraciones disponibles para vincular ──
  async getAvailableConnections(orgId: number): Promise<LinkedConnection[]> {
    const { data: conns, error } = await supabase
      .from('integration_connections')
      .select('id, name, status, environment, connector_id')
      .eq('organization_id', orgId)
      .in('status', ['connected', 'paused']);

    if (error || !conns) return [];

    const connectorIds = Array.from(new Set(conns.map((c: any) => c.connector_id)));
    if (connectorIds.length === 0) return [];

    const { data: connectors } = await supabase
      .from('integration_connectors')
      .select('id, provider_id, code, name')
      .in('id', connectorIds);

    const providerIds = Array.from(new Set((connectors || []).map((c: any) => c.provider_id)));
    const { data: providers } = await supabase
      .from('integration_providers')
      .select('id, code, name, logo_url, category')
      .in('id', providerIds);

    return conns.map((conn: any) => {
      const connector = (connectors || []).find((c: any) => c.id === conn.connector_id);
      const provider = connector ? (providers || []).find((p: any) => p.id === connector.provider_id) : null;
      return {
        id: conn.id,
        name: conn.name,
        status: conn.status,
        environment: conn.environment,
        provider_code: provider?.code || '',
        provider_name: provider?.name || connector?.name || '',
        provider_logo_url: provider?.logo_url || null,
        category: provider?.category || '',
      };
    });
  },

  // ── Vincular/desvincular conexión de integración ─────
  async linkConnection(channelId: string, connectionId: string | null, providerName?: string): Promise<boolean> {
    const updates: Record<string, any> = {
      connection_id: connectionId,
      updated_at: new Date().toISOString(),
    };
    if (providerName) updates.provider_name = providerName;

    const { error } = await supabase
      .from('notification_channels')
      .update(updates)
      .eq('id', channelId);

    if (error) {
      console.error('Error linking connection:', error);
      return false;
    }
    return true;
  },

  // ── Actualizar canal (config de notificaciones, activo) ──
  async updateChannel(id: string, form: Partial<ChannelFormData>): Promise<boolean> {
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (form.provider_name !== undefined) updates.provider_name = form.provider_name;
    if (form.config_json !== undefined) updates.config_json = form.config_json;
    if (form.is_active !== undefined) updates.is_active = form.is_active;
    if (form.connection_id !== undefined) updates.connection_id = form.connection_id;

    const { error } = await supabase
      .from('notification_channels')
      .update(updates)
      .eq('id', id);
    if (error) {
      console.error('Error updating channel:', error);
      return false;
    }
    return true;
  },

  // ── Toggle activo/inactivo ───────────────────────────
  async toggleActive(id: string, isActive: boolean): Promise<boolean> {
    const { error } = await supabase
      .from('notification_channels')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      console.error('Error toggling channel:', error);
      return false;
    }
    return true;
  },

  // ── Eliminar canal ───────────────────────────────────
  async deleteChannel(id: string): Promise<boolean> {
    const { error } = await supabase
      .from('notification_channels')
      .delete()
      .eq('id', id);
    if (error) {
      console.error('Error deleting channel:', error);
      return false;
    }
    return true;
  },

  // ── Probar canal (enviar test) ───────────────────────
  async testChannel(orgId: number, channel: NotificationChannel): Promise<boolean> {
    const { error } = await supabase.from('notifications').insert({
      organization_id: orgId,
      channel: channel.code,
      payload: {
        type: 'channel_test',
        title: `Test: ${channel.provider_name}`,
        content: `Prueba de canal ${channel.code} vía ${channel.provider_name}. Timestamp: ${new Date().toISOString()}`,
        is_test: true,
        channel_id: channel.id,
      },
      status: 'pending',
    });
    if (error) {
      console.error('Error testing channel:', error);
      return false;
    }
    return true;
  },

  // ── Últimos delivery logs del canal ──────────────────
  async getRecentLogs(
    orgId: number,
    channelCode: string,
    limit: number = 5,
  ): Promise<any[]> {
    const { data, error } = await supabase
      .from('delivery_logs')
      .select('id, notification_id, channel, status, error_message, sent_at, created_at')
      .eq('organization_id', orgId)
      .eq('channel', channelCode)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  },
};
