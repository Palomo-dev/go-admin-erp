'use client';

import { supabase } from '@/lib/supabase/config';

/**
 * Conexión OTA representada como integración unificada.
 * Combina datos de channel_connections (PMS) con integration_providers/connectors.
 */
export interface OtaBridgeConnection {
  id: string;
  source: 'pms' | 'integration';
  organization_id: number;
  channel: string;
  provider_code: string;
  provider_name: string;
  connector_code: string;
  connector_name: string;
  space_id?: string;
  space_label?: string;
  status: 'connected' | 'paused' | 'error' | 'draft';
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  commission_percent: number;
  ical_import_url: string | null;
  ical_export_token: string | null;
  connection_type: string;
  created_at: string;
  updated_at: string;
  /** ID del conector en integration_connectors (para crear integration_connection) */
  integration_connector_id?: string;
  /** ID de la integration_connection vinculada (si existe) */
  integration_connection_id?: string;
}

export interface OtaBridgeStats {
  totalOtaConnections: number;
  activeOtaConnections: number;
  errorOtaConnections: number;
  channelsUsed: string[];
  lastSyncAt: string | null;
  spacesConnected: number;
}

/** Mapeo channel_connections.channel → integration_providers.code */
const CHANNEL_TO_PROVIDER: Record<string, string> = {
  airbnb: 'airbnb',
  booking: 'booking',
  expedia: 'expedia',
  vrbo: 'expedia',
  tripadvisor: 'tripadvisor',
  google_vacation: 'google_vacation_rentals',
  otro_ical: 'custom',
};

class OtaBridgeService {
  /**
   * Obtiene todas las conexiones OTA de una organización,
   * combinando channel_connections (PMS) con metadata de integration_providers.
   */
  async getOtaConnections(organizationId: number): Promise<OtaBridgeConnection[]> {
    // Obtener conexiones PMS (channel_connections)
    const { data: pmsConnections, error: pmsError } = await supabase
      .from('channel_connections')
      .select(`
        id,
        organization_id,
        space_id,
        channel,
        connection_type,
        ical_import_url,
        ical_export_token,
        sync_enabled,
        last_sync_at,
        last_sync_status,
        last_sync_error,
        commission_percent,
        is_active,
        created_at,
        updated_at,
        space:spaces(id, label)
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (pmsError) {
      console.error('Error fetching PMS channel connections:', pmsError);
      return [];
    }

    // Obtener proveedores OTA para enriquecer datos
    const { data: providers } = await supabase
      .from('integration_providers')
      .select('id, code, name, metadata')
      .eq('category', 'ota')
      .eq('is_active', true);

    // Obtener conectores iCal
    const { data: connectors } = await supabase
      .from('integration_connectors')
      .select('id, code, name, provider_id, metadata')
      .eq('is_active', true)
      .like('code', '%_ical');

    const providerMap = new Map<string, { id: string; name: string; metadata: Record<string, unknown> }>();
    (providers || []).forEach(p => providerMap.set(p.code, { id: p.id, name: p.name, metadata: p.metadata }));

    const connectorByProvider = new Map<string, { id: string; code: string; name: string }>();
    (connectors || []).forEach(c => {
      const provider = (providers || []).find(p => p.id === c.provider_id);
      if (provider) {
        connectorByProvider.set(provider.code, { id: c.id, code: c.code, name: c.name });
      }
    });

    // Verificar si ya existen integration_connections vinculadas
    const pmsIds = (pmsConnections || []).map(c => c.id);
    let linkedIntegrations = new Map<string, string>();
    if (pmsIds.length > 0) {
      const { data: intConns } = await supabase
        .from('integration_connections')
        .select('id, settings')
        .eq('organization_id', organizationId)
        .containedBy('settings', { bridge_source: 'channel_connections' } as any);

      if (intConns) {
        intConns.forEach(ic => {
          const bridgeId = (ic.settings as any)?.channel_connection_id;
          if (bridgeId) {
            linkedIntegrations.set(bridgeId, ic.id);
          }
        });
      }
    }

    type PmsRow = {
      id: string;
      organization_id: number;
      space_id: string;
      channel: string;
      connection_type: string;
      ical_import_url: string | null;
      ical_export_token: string | null;
      sync_enabled: boolean;
      last_sync_at: string | null;
      last_sync_status: string | null;
      last_sync_error: string | null;
      commission_percent: number;
      is_active: boolean;
      created_at: string;
      updated_at: string;
      space?: { id: string; label: string } | { id: string; label: string }[] | null;
    };

    return (pmsConnections || []).map((conn: PmsRow) => {
      const providerCode = CHANNEL_TO_PROVIDER[conn.channel] || conn.channel;
      const provider = providerMap.get(providerCode);
      const connector = connectorByProvider.get(providerCode);

      const spaceData = Array.isArray(conn.space) ? conn.space[0] : conn.space;

      const status: OtaBridgeConnection['status'] =
        conn.last_sync_status === 'error' ? 'error' :
        conn.sync_enabled ? 'connected' : 'paused';

      return {
        id: conn.id,
        source: 'pms' as const,
        organization_id: conn.organization_id,
        channel: conn.channel,
        provider_code: providerCode,
        provider_name: provider?.name || conn.channel,
        connector_code: connector?.code || `${providerCode}_ical`,
        connector_name: connector?.name || `${conn.channel} iCal`,
        space_id: conn.space_id,
        space_label: spaceData?.label || undefined,
        status,
        sync_enabled: conn.sync_enabled,
        last_sync_at: conn.last_sync_at,
        last_sync_status: conn.last_sync_status,
        last_sync_error: conn.last_sync_error,
        commission_percent: conn.commission_percent || 0,
        ical_import_url: conn.ical_import_url,
        ical_export_token: conn.ical_export_token,
        connection_type: conn.connection_type,
        created_at: conn.created_at,
        updated_at: conn.updated_at,
        integration_connector_id: connector?.id,
        integration_connection_id: linkedIntegrations.get(conn.id) || undefined,
      };
    });
  }

  /**
   * Obtiene estadísticas agregadas de conexiones OTA.
   */
  async getOtaStats(organizationId: number): Promise<OtaBridgeStats> {
    const connections = await this.getOtaConnections(organizationId);

    const channelsUsed = Array.from(new Set(connections.map(c => c.channel)));
    const spacesConnected = new Set(connections.map(c => c.space_id).filter(Boolean)).size;

    const syncDates = connections
      .map(c => c.last_sync_at)
      .filter((d): d is string => d !== null)
      .sort()
      .reverse();

    return {
      totalOtaConnections: connections.length,
      activeOtaConnections: connections.filter(c => c.status === 'connected').length,
      errorOtaConnections: connections.filter(c => c.status === 'error').length,
      channelsUsed,
      lastSyncAt: syncDates[0] || null,
      spacesConnected,
    };
  }

  /**
   * Sincroniza una conexión PMS (channel_connections) como integration_connection.
   * Crea o actualiza la entrada en integration_connections para que aparezca
   * en el módulo de integraciones.
   */
  async syncToIntegrationConnection(
    channelConnectionId: string,
    organizationId: number
  ): Promise<string | null> {
    // Obtener la channel_connection
    const { data: pmsConn, error: pmsErr } = await supabase
      .from('channel_connections')
      .select('*, space:spaces(label)')
      .eq('id', channelConnectionId)
      .single();

    if (pmsErr || !pmsConn) {
      console.error('Error fetching channel connection:', pmsErr);
      return null;
    }

    const providerCode = CHANNEL_TO_PROVIDER[pmsConn.channel] || pmsConn.channel;

    // Buscar conector iCal correspondiente
    const { data: connector } = await supabase
      .from('integration_connectors')
      .select('id, provider_id')
      .eq('code', `${providerCode}_ical`)
      .single();

    if (!connector) {
      console.error(`No iCal connector found for provider: ${providerCode}`);
      return null;
    }

    const spaceLabel = Array.isArray(pmsConn.space)
      ? pmsConn.space[0]?.label
      : pmsConn.space?.label;

    const connectionName = `${pmsConn.channel} iCal - ${spaceLabel || 'Espacio'}`;

    const status = pmsConn.last_sync_status === 'error' ? 'error' :
      pmsConn.sync_enabled ? 'connected' : 'paused';

    const settings = {
      bridge_source: 'channel_connections',
      channel_connection_id: channelConnectionId,
      space_id: pmsConn.space_id,
      channel: pmsConn.channel,
      connection_type: pmsConn.connection_type,
      commission_percent: pmsConn.commission_percent,
      auto_sync: true,
    };

    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('integration_connections')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('connector_id', connector.id)
      .contains('settings', { channel_connection_id: channelConnectionId })
      .maybeSingle();

    if (existing) {
      // Actualizar
      const { error: updateErr } = await supabase
        .from('integration_connections')
        .update({
          name: connectionName,
          status,
          settings,
          last_activity_at: pmsConn.last_sync_at,
          last_error_message: pmsConn.last_sync_error,
          last_error_at: pmsConn.last_sync_status === 'error' ? pmsConn.updated_at : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateErr) {
        console.error('Error updating integration connection:', updateErr);
        return null;
      }

      return existing.id;
    }

    // Crear nueva
    const { data: newConn, error: insertErr } = await supabase
      .from('integration_connections')
      .insert({
        organization_id: organizationId,
        connector_id: connector.id,
        name: connectionName,
        environment: 'production' as const,
        status,
        settings,
        connected_at: pmsConn.created_at,
        last_activity_at: pmsConn.last_sync_at,
      })
      .select('id')
      .single();

    if (insertErr) {
      console.error('Error creating integration connection:', insertErr);
      return null;
    }

    return newConn?.id || null;
  }

  /**
   * Sincroniza TODAS las channel_connections de una organización
   * como integration_connections.
   */
  async syncAllToIntegrations(organizationId: number): Promise<{
    synced: number;
    errors: number;
  }> {
    const { data: pmsConns } = await supabase
      .from('channel_connections')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_active', true);

    if (!pmsConns || pmsConns.length === 0) {
      return { synced: 0, errors: 0 };
    }

    let synced = 0;
    let errors = 0;

    for (const conn of pmsConns) {
      const result = await this.syncToIntegrationConnection(conn.id, organizationId);
      if (result) {
        synced++;
      } else {
        errors++;
      }
    }

    return { synced, errors };
  }

  /**
   * Obtiene los proveedores OTA disponibles con info de iCal.
   */
  async getOtaProviders(): Promise<Array<{
    id: string;
    code: string;
    name: string;
    ical_supported: boolean;
    commission_default: number;
    pms_redirect: string | null;
    connector_id: string | null;
  }>> {
    const { data: providers } = await supabase
      .from('integration_providers')
      .select(`
        id, code, name, metadata,
        connectors:integration_connectors(id, code, metadata)
      `)
      .eq('category', 'ota')
      .eq('is_active', true)
      .order('name');

    if (!providers) return [];

    return providers.map(p => {
      const icalConnector = (p.connectors as any[])?.find(
        (c: any) => c.code?.endsWith('_ical')
      );

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        ical_supported: (p.metadata as any)?.ical_supported || false,
        commission_default: (p.metadata as any)?.commission_default || 0,
        pms_redirect: (p.metadata as any)?.pms_redirect || null,
        connector_id: icalConnector?.id || null,
      };
    });
  }
}

const otaBridgeService = new OtaBridgeService();
export default otaBridgeService;
