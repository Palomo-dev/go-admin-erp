// ============================================================
// Servicio de Conexiones — Booking.com Connectivity API
// Gestión de conexiones con propiedades en Booking.com
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { bookingAuthService } from './bookingAuthService';
import {
  BOOKING_CREDENTIAL_PURPOSES,
} from './bookingConfig';
import {
  BOOKING_PROVIDER_ID,
  BOOKING_OTA_CONNECTOR_ID,
} from './bookingTypes';
import type {
  BookingConnection,
  BookingConnectionType,
  BookingHealthCheckResult,
  BookingRoomMapping,
} from './bookingTypes';

/**
 * Servicio para gestionar conexiones de propiedades con Booking.com.
 * Crea integration_connections + channel_connections + credenciales.
 */
export const bookingConnectionService = {

  // ─── Crear nueva conexión ─────────────────────────────────

  /**
   * Crear una conexión completa de Booking.com para una organización.
   * 1. Crea integration_connection
   * 2. Guarda credenciales en integration_credentials
   * 3. Crea channel_connection para el espacio
   */
  async createConnection(params: {
    organizationId: number;
    hotelId: string;
    machineClientId: string;
    machineClientSecret: string;
    spaceId?: string;
    connectionName?: string;
  }): Promise<{ success: boolean; connectionId?: string; message: string }> {
    try {
      const {
        organizationId,
        hotelId,
        machineClientId,
        machineClientSecret,
        spaceId,
        connectionName,
      } = params;

      // 1. Verificar que no exista ya una conexión para este hotel
      const existing = await this.getConnectionByHotelId(organizationId, hotelId);
      if (existing) {
        return {
          success: false,
          connectionId: existing.connectionId,
          message: `Ya existe una conexión para hotel ${hotelId}`,
        };
      }

      // 2. Crear integration_connection
      const { data: intConn, error: intErr } = await supabase
        .from('integration_connections')
        .insert({
          organization_id: organizationId,
          connector_id: BOOKING_OTA_CONNECTOR_ID,
          name: connectionName || `Booking.com - ${hotelId}`,
          status: 'active',
          is_active: true,
          config: {
            hotel_id: hotelId,
            connection_types: ['reservations', 'rates_availability'],
          },
        })
        .select('id')
        .single();

      if (intErr || !intConn) {
        return { success: false, message: `Error creando integration_connection: ${intErr?.message}` };
      }

      const connectionId = intConn.id;

      // 3. Guardar credenciales
      const credentials = [
        {
          connection_id: connectionId,
          purpose: BOOKING_CREDENTIAL_PURPOSES.MACHINE_CLIENT_ID,
          value_encrypted: machineClientId,
          metadata: {},
        },
        {
          connection_id: connectionId,
          purpose: BOOKING_CREDENTIAL_PURPOSES.MACHINE_CLIENT_SECRET,
          value_encrypted: machineClientSecret,
          metadata: {},
        },
        {
          connection_id: connectionId,
          purpose: BOOKING_CREDENTIAL_PURPOSES.HOTEL_ID,
          value_encrypted: hotelId,
          metadata: {},
        },
      ];

      const { error: credErr } = await supabase
        .from('integration_credentials')
        .insert(credentials);

      if (credErr) {
        console.error('[BookingConnection] Error guardando credenciales:', credErr.message);
        // Rollback: eliminar integration_connection
        await supabase.from('integration_connections').delete().eq('id', connectionId);
        return { success: false, message: `Error guardando credenciales: ${credErr.message}` };
      }

      // 4. Crear channel_connection si se especificó espacio
      if (spaceId) {
        await supabase
          .from('channel_connections')
          .insert({
            organization_id: organizationId,
            space_id: spaceId,
            channel: 'booking',
            connection_type: 'api',
            external_property_id: hotelId,
            sync_enabled: true,
            sync_interval_minutes: 1, // Polling cada minuto (pero real es cada 20s vía cron)
            is_active: true,
          });
      }

      return {
        success: true,
        connectionId,
        message: `Conexión creada exitosamente para hotel ${hotelId}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  },

  // ─── Obtener conexiones ───────────────────────────────────

  /**
   * Obtener todas las conexiones de Booking.com de una organización.
   */
  async getConnections(organizationId: number): Promise<Array<{
    connectionId: string;
    hotelId: string;
    name: string;
    status: string;
    isActive: boolean;
    createdAt: string;
    lastSyncAt?: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('integration_connections')
        .select(`
          id,
          name,
          status,
          is_active,
          config,
          created_at,
          integration_credentials (
            purpose,
            value_encrypted
          )
        `)
        .eq('organization_id', organizationId)
        .eq('connector_id', BOOKING_OTA_CONNECTOR_ID)
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((conn: any) => {
        const creds = conn.integration_credentials || [];
        const hotelCred = creds.find((c: any) => c.purpose === BOOKING_CREDENTIAL_PURPOSES.HOTEL_ID);

        return {
          connectionId: conn.id,
          hotelId: hotelCred?.value_encrypted || conn.config?.hotel_id || '',
          name: conn.name,
          status: conn.status,
          isActive: conn.is_active,
          createdAt: conn.created_at,
        };
      });
    } catch (err) {
      console.error('[BookingConnection] Error obteniendo conexiones:', err);
      return [];
    }
  },

  /**
   * Obtener conexión por hotel_id.
   */
  async getConnectionByHotelId(
    organizationId: number,
    hotelId: string,
  ): Promise<{ connectionId: string } | null> {
    try {
      const { data } = await supabase
        .from('integration_credentials')
        .select(`
          connection_id,
          integration_connections!inner (
            organization_id,
            connector_id,
            is_active
          )
        `)
        .eq('purpose', BOOKING_CREDENTIAL_PURPOSES.HOTEL_ID)
        .eq('value_encrypted', hotelId)
        .limit(1);

      if (!data || data.length === 0) return null;

      const match = data.find((d: any) =>
        d.integration_connections?.organization_id === organizationId &&
        d.integration_connections?.connector_id === BOOKING_OTA_CONNECTOR_ID
      );

      return match ? { connectionId: match.connection_id } : null;
    } catch {
      return null;
    }
  },

  // ─── Desactivar / Eliminar ────────────────────────────────

  /**
   * Desactivar una conexión (soft delete).
   */
  async deactivateConnection(connectionId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('integration_connections')
        .update({ is_active: false, status: 'inactive', updated_at: new Date().toISOString() })
        .eq('id', connectionId);

      if (error) {
        console.error('[BookingConnection] Error desactivando:', error.message);
        return false;
      }

      // Desactivar channel_connections asociadas
      const creds = await bookingAuthService.getCredentials(connectionId);
      if (creds?.hotelId) {
        await supabase
          .from('channel_connections')
          .update({ is_active: false, sync_enabled: false })
          .eq('external_property_id', creds.hotelId)
          .eq('channel', 'booking')
          .eq('connection_type', 'api');
      }

      // Invalidar token en cache
      bookingAuthService.invalidateToken(connectionId);

      return true;
    } catch {
      return false;
    }
  },

  // ─── Sync Status ──────────────────────────────────────────

  /**
   * Obtener el estado de sincronización de una conexión.
   */
  async getSyncStatus(connectionId: string): Promise<{
    lastSync?: { type: string; status: string; createdAt: string; itemsProcessed: number };
    totalSyncs24h: number;
    errors24h: number;
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Último sync
      const { data: lastSync } = await supabase
        .from('booking_sync_logs')
        .select('sync_type, status, created_at, items_processed')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Totales últimas 24h
      const { count: totalSyncs } = await supabase
        .from('booking_sync_logs')
        .select('id', { count: 'exact', head: true })
        .eq('connection_id', connectionId)
        .gte('created_at', oneDayAgo);

      const { count: errorSyncs } = await supabase
        .from('booking_sync_logs')
        .select('id', { count: 'exact', head: true })
        .eq('connection_id', connectionId)
        .eq('status', 'error')
        .gte('created_at', oneDayAgo);

      return {
        lastSync: lastSync ? {
          type: lastSync.sync_type,
          status: lastSync.status,
          createdAt: lastSync.created_at,
          itemsProcessed: lastSync.items_processed,
        } : undefined,
        totalSyncs24h: totalSyncs || 0,
        errors24h: errorSyncs || 0,
      };
    } catch {
      return { totalSyncs24h: 0, errors24h: 0 };
    }
  },

  /**
   * Obtener logs de sincronización recientes.
   */
  async getSyncLogs(connectionId: string, limit: number = 20): Promise<Array<{
    id: string;
    syncType: string;
    direction: string;
    status: string;
    itemsProcessed: number;
    errorMessage?: string;
    createdAt: string;
  }>> {
    try {
      const { data, error } = await supabase
        .from('booking_sync_logs')
        .select('id, sync_type, direction, status, items_processed, error_message, created_at')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error || !data) return [];

      return data.map(log => ({
        id: log.id,
        syncType: log.sync_type,
        direction: log.direction,
        status: log.status,
        itemsProcessed: log.items_processed,
        errorMessage: log.error_message || undefined,
        createdAt: log.created_at,
      }));
    } catch {
      return [];
    }
  },
};
