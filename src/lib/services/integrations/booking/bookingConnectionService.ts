// ============================================================
// Servicio de Conexiones — Booking.com Connectivity API
// Gestión de conexiones con propiedades en Booking.com
// ============================================================

import type { ChannelManagerClients } from '../channelManagerClients';
import { guardarCredencialesOta, propiedadDeSettings, CLAVE_PROPIEDAD } from '../conexiones/credencialesOta';
import { createBookingAuthService } from './bookingAuthService';
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
export function createBookingConnectionService(clients: ChannelManagerClients) {
  const supabase = clients.db;
  const bookingAuthService = createBookingAuthService(clients);

  return {

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
      /** Opcional: si no viene, se usa la cuenta de proveedor de conectividad del servidor. */
      machineClientId?: string;
      machineClientSecret?: string;
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

        // 2. Crear integration_connection. Frente INT (2026-11-07): la tabla no tiene `is_active`
        //    ni `config` (era el insert que fallaba siempre); la propiedad va en `settings`.
        const { data: intConn, error: intErr } = await supabase
          .from('integration_connections')
          .insert({
            organization_id: organizationId,
            connector_id: BOOKING_OTA_CONNECTOR_ID,
            name: connectionName || `Booking.com - ${hotelId}`,
            status: 'draft',
            settings: {
              hotel_id: hotelId,
              modo: 'api',
              connection_types: ['reservations', 'rates_availability'],
            },
          })
          .select('id')
          .single();

        if (intErr || !intConn) {
          return { success: false, message: `Error creando integration_connection: ${intErr?.message}` };
        }

        const connectionId = intConn.id;

        // 3. Guardar credenciales en la bóveda (antes `value_encrypted`, columna inexistente).
        try {
          await guardarCredencialesOta(clients.secrets(), connectionId, 'booking', {
            machine_client_id: machineClientId,
            machine_client_secret: machineClientSecret,
          });
        } catch (credErr) {
          const msg = credErr instanceof Error ? credErr.message : String(credErr);
          console.error('[BookingConnection] Error guardando credenciales:', msg);
          // Rollback: eliminar integration_connection
          await supabase.from('integration_connections').delete().eq('id', connectionId);
          return { success: false, message: 'Error guardando credenciales' };
        }

        await supabase
          .from('integration_connections')
          .update({ status: 'connected', connected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', connectionId);

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
          .select('id, name, status, settings, created_at')
          .eq('organization_id', organizationId)
          .eq('connector_id', BOOKING_OTA_CONNECTOR_ID)
          .order('created_at', { ascending: false });

        if (error || !data) return [];

        return (data as { id: string; name: string; status: string; settings: unknown; created_at: string }[]).map((conn) => ({
          connectionId: conn.id,
          hotelId: propiedadDeSettings('booking', conn.settings),
          name: conn.name,
          status: conn.status,
          isActive: conn.status === 'connected',
          createdAt: conn.created_at,
        }));
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
        // Por `settings.hotel_id` (antes `integration_credentials.value_encrypted`, inexistente).
        const { data } = await clients.secrets() // service role; filtra por organización y conector
          .from('integration_connections')
          .select('id, organization_id')
          .eq('organization_id', organizationId)
          .eq('connector_id', BOOKING_OTA_CONNECTOR_ID)
          .neq('status', 'revoked')
          .eq(`settings->>${CLAVE_PROPIEDAD['booking']}`, hotelId)
          .limit(1);

        const match = ((data as { id: string; organization_id: number }[] | null) ?? []).find(
          (d) => Number(d.organization_id) === organizationId,
        );
        return match ? { connectionId: match.id } : null;
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
        const { data: conn } = await supabase
          .from('integration_connections')
          .select('organization_id, settings')
          .eq('id', connectionId)
          .maybeSingle();

        // `paused` (el CHECK no admite 'inactive' y la tabla no tiene `is_active`).
        const { error } = await supabase
          .from('integration_connections')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', connectionId);

        if (error) {
          console.error('[BookingConnection] Error desactivando:', error.message);
          return false;
        }

        // Desactivar channel_connections asociadas (de la misma organización).
        const fila = conn as { organization_id?: number; settings?: unknown } | null;
        const propiedad = propiedadDeSettings('booking', fila?.settings);
        if (propiedad && fila?.organization_id != null) {
          await supabase
            .from('channel_connections')
            .update({ is_active: false, sync_enabled: false })
            .eq('organization_id', fila.organization_id)
            .eq('external_property_id', propiedad)
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
}

export type BookingConnectionService = ReturnType<typeof createBookingConnectionService>;
