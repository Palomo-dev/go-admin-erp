import { supabase } from '@/lib/supabase/config';
import ICalService, {
  type ChannelConnection,
  type SyncResult,
} from './icalService';

// ============================================================
// Tipos para Channel Manager
// ============================================================

export interface ChannelProvider {
  id: string;
  name: string;
  type: 'ical' | 'api' | 'channel_manager';
  logo?: string;
  color: string;
  description: string;
  commission_default: number;
  supports_ical_import: boolean;
  supports_ical_export: boolean;
  supports_api: boolean;
  ical_help_url?: string;
}

export interface SpaceChannelSummary {
  space_id: string;
  space_label: string;
  space_type: string;
  connections: ChannelConnection[];
  total_blocks: number;
  last_sync: string | null;
}

export interface ChannelManagerStats {
  total_connections: number;
  active_connections: number;
  total_blocks: number;
  last_sync: string | null;
  sync_errors: number;
  channels_used: string[];
}

// ============================================================
// Proveedores predefinidos
// ============================================================

export const CHANNEL_PROVIDERS: ChannelProvider[] = [
  {
    id: 'airbnb',
    name: 'Airbnb',
    type: 'ical',
    color: '#FF5A5F',
    description: 'Sincroniza disponibilidad con Airbnb vía iCal',
    commission_default: 12,
    supports_ical_import: true,
    supports_ical_export: true,
    supports_api: false,
    ical_help_url: 'https://www.airbnb.com/help/article/99',
  },
  {
    id: 'booking',
    name: 'Booking.com',
    type: 'ical',
    color: '#003580',
    description: 'Sincroniza disponibilidad con Booking.com vía iCal o Connectivity API',
    commission_default: 15,
    supports_ical_import: true,
    supports_ical_export: true,
    supports_api: true,
    ical_help_url: 'https://partner.booking.com/en-gb/help/rates-availability/how-do-i-set-ical-connection',
  },
  {
    id: 'expedia',
    name: 'Expedia / Vrbo',
    type: 'ical',
    color: '#FBAF17',
    description: 'Sincroniza con Expedia y Vrbo vía iCal',
    commission_default: 15,
    supports_ical_import: true,
    supports_ical_export: true,
    supports_api: false,
  },
  {
    id: 'tripadvisor',
    name: 'TripAdvisor',
    type: 'ical',
    color: '#00AA6C',
    description: 'Sincroniza con TripAdvisor Rentals vía iCal',
    commission_default: 12,
    supports_ical_import: true,
    supports_ical_export: true,
    supports_api: false,
  },
  {
    id: 'google_vacation',
    name: 'Google Vacation Rentals',
    type: 'ical',
    color: '#4285F4',
    description: 'Sincroniza con Google Vacation Rentals vía iCal',
    commission_default: 0,
    supports_ical_import: true,
    supports_ical_export: true,
    supports_api: false,
  },
  {
    id: 'custom',
    name: 'Otro (iCal)',
    type: 'ical',
    color: '#6B7280',
    description: 'Conecta cualquier plataforma que soporte iCal',
    commission_default: 0,
    supports_ical_import: true,
    supports_ical_export: true,
    supports_api: false,
  },
];

// ============================================================
// Servicio principal
// ============================================================

class ChannelManagerService {
  /**
   * Obtiene el resumen de canales por espacio.
   */
  async getSpaceChannelSummaries(
    organizationId: number
  ): Promise<SpaceChannelSummary[]> {
    // Obtener branches de la organización
    const { data: branches } = await supabase
      .from('branches')
      .select('id')
      .eq('organization_id', organizationId);

    const branchIds = (branches || []).map(b => b.id);
    if (branchIds.length === 0) return [];

    // Obtener todos los espacios de esas branches
    const { data: spaces, error: spacesError } = await supabase
      .from('spaces')
      .select(`
        id,
        label,
        space_types ( name )
      `)
      .in('branch_id', branchIds)
      .order('label');

    if (spacesError) {
      console.error('Error cargando espacios:', spacesError.message || spacesError);
      return [];
    }

    const connections = await ICalService.getConnections(organizationId);

    // Obtener conteo de bloqueos por espacio
    const { data: blockCounts } = await supabase
      .from('channel_blocks')
      .select('space_id')
      .eq('organization_id', organizationId);

    const blockCountMap: Record<string, number> = {};
    (blockCounts || []).forEach(b => {
      blockCountMap[b.space_id] = (blockCountMap[b.space_id] || 0) + 1;
    });

    return (spaces || []).map(space => {
      const spaceConnections = connections.filter(c => c.space_id === space.id);
      const lastSync = spaceConnections.reduce((latest: string | null, c) => {
        if (!c.last_sync_at) return latest;
        if (!latest) return c.last_sync_at;
        return c.last_sync_at > latest ? c.last_sync_at : latest;
      }, null);

      const spaceType = Array.isArray(space.space_types)
        ? space.space_types[0]?.name || ''
        : (space.space_types as any)?.name || '';

      return {
        space_id: space.id,
        space_label: space.label,
        space_type: spaceType,
        connections: spaceConnections,
        total_blocks: blockCountMap[space.id] || 0,
        last_sync: lastSync,
      };
    });
  }

  /**
   * Obtiene estadísticas generales del channel manager.
   */
  async getStats(organizationId: number): Promise<ChannelManagerStats> {
    let connections: ChannelConnection[] = [];
    try {
      connections = await ICalService.getConnections(organizationId);
    } catch (err: any) {
      console.error('Error obteniendo conexiones para stats:', err?.message || err);
    }

    const { count: totalBlocks } = await supabase
      .from('channel_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId);

    const channelsUsed = Array.from(
      new Set(connections.map(c => c.channel))
    );

    const lastSync = connections.reduce((latest: string | null, c) => {
      if (!c.last_sync_at) return latest;
      if (!latest) return c.last_sync_at;
      return c.last_sync_at > latest ? c.last_sync_at : latest;
    }, null);

    const syncErrors = connections.filter(
      c => c.last_sync_status === 'error'
    ).length;

    return {
      total_connections: connections.length,
      active_connections: connections.filter(c => c.sync_enabled).length,
      total_blocks: totalBlocks || 0,
      last_sync: lastSync,
      sync_errors: syncErrors,
      channels_used: channelsUsed,
    };
  }

  /**
   * Genera la URL de exportación iCal para una conexión.
   */
  getExportUrl(exportToken: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    return `${baseUrl}/api/pms/ical/${exportToken}`;
  }

  /**
   * Sincroniza una conexión específica.
   */
  async syncConnection(connectionId: string): Promise<SyncResult> {
    const { data: connection, error } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (error || !connection) {
      throw new Error('Conexión no encontrada');
    }

    return ICalService.importFromUrl(connection);
  }

  /**
   * Sincroniza todas las conexiones de una organización.
   */
  async syncAll(organizationId: number): Promise<Map<string, SyncResult>> {
    return ICalService.syncAllConnections(organizationId);
  }

  /**
   * Obtiene la lista de proveedores disponibles.
   */
  getProviders(): ChannelProvider[] {
    return CHANNEL_PROVIDERS;
  }

  /**
   * Obtiene un proveedor por ID.
   */
  getProvider(channelId: string): ChannelProvider | undefined {
    return CHANNEL_PROVIDERS.find(p => p.id === channelId);
  }
}

export default new ChannelManagerService();
