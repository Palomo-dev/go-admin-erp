// ============================================================
// Servicio de Conexiones — Expedia Group Lodging API
// Gestión de conexiones con propiedades en Expedia Group
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { expediaAuthService } from './expediaAuthService';
import {
  EXPEDIA_CREDENTIAL_PURPOSES,
  EXPEDIA_ENDPOINTS,
  getApiUrl,
  getXmlHeaders,
  generateRequestId,
} from './expediaConfig';
import {
  EXPEDIA_PROVIDER_ID,
  EXPEDIA_OTA_CONNECTOR_ID,
} from './expediaTypes';
import type {
  ExpediaConnection,
  ExpediaHealthCheckResult,
} from './expediaTypes';

/**
 * Servicio para gestionar conexiones de propiedades con Expedia Group.
 * Crea integration_connections + channel_connections + credenciales.
 */
export const expediaConnectionService = {

  // ─── Crear nueva conexión ─────────────────────────────────

  /**
   * Crear una conexión completa de Expedia para una organización.
   * 1. Crea integration_connection
   * 2. Guarda credenciales en integration_credentials
   * 3. Crea channel_connection para el espacio
   */
  async createConnection(params: {
    organizationId: number;
    propertyId: string;
    eqcUsername: string;
    eqcPassword: string;
    spaceId?: string;
    connectionName?: string;
  }): Promise<{ success: boolean; connectionId?: string; message: string }> {
    try {
      const {
        organizationId,
        propertyId,
        eqcUsername,
        eqcPassword,
        spaceId,
        connectionName,
      } = params;

      // 1. Verificar que no exista ya una conexión para esta propiedad
      const existing = await this.getConnectionByPropertyId(organizationId, propertyId);
      if (existing) {
        return {
          success: false,
          connectionId: existing.connectionId,
          message: `Ya existe una conexión para propiedad Expedia ${propertyId}`,
        };
      }

      // 2. Crear integration_connection
      const { data: intConn, error: intErr } = await supabase
        .from('integration_connections')
        .insert({
          organization_id: organizationId,
          connector_id: EXPEDIA_OTA_CONNECTOR_ID,
          name: connectionName || `Expedia Group - ${propertyId}`,
          status: 'active',
          is_active: true,
          config: {
            property_id: propertyId,
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
          purpose: EXPEDIA_CREDENTIAL_PURPOSES.EQC_USERNAME,
          value_encrypted: eqcUsername,
          metadata: {},
        },
        {
          connection_id: connectionId,
          purpose: EXPEDIA_CREDENTIAL_PURPOSES.EQC_PASSWORD,
          value_encrypted: eqcPassword,
          metadata: {},
        },
        {
          connection_id: connectionId,
          purpose: EXPEDIA_CREDENTIAL_PURPOSES.PROPERTY_ID,
          value_encrypted: propertyId,
          metadata: {},
        },
      ];

      const { error: credErr } = await supabase
        .from('integration_credentials')
        .insert(credentials);

      if (credErr) {
        console.error('[ExpediaConnection] Error guardando credenciales:', credErr.message);
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
            channel: 'expedia',
            connection_type: 'api',
            external_property_id: propertyId,
            sync_enabled: true,
            sync_interval_minutes: 5,
            is_active: true,
          });
      }

      return {
        success: true,
        connectionId,
        message: `Conexión creada exitosamente para propiedad Expedia ${propertyId}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  },

  // ─── Obtener conexiones ───────────────────────────────────

  /**
   * Obtener todas las conexiones de Expedia de una organización.
   */
  async getConnections(organizationId: number): Promise<Array<{
    connectionId: string;
    propertyId: string;
    name: string;
    status: string;
    isActive: boolean;
    createdAt: string;
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
        .eq('connector_id', EXPEDIA_OTA_CONNECTOR_ID)
        .order('created_at', { ascending: false });

      if (error || !data) return [];

      return data.map((conn: any) => {
        const creds = conn.integration_credentials || [];
        const propCred = creds.find((c: any) => c.purpose === EXPEDIA_CREDENTIAL_PURPOSES.PROPERTY_ID);

        return {
          connectionId: conn.id,
          propertyId: propCred?.value_encrypted || conn.config?.property_id || '',
          name: conn.name,
          status: conn.status,
          isActive: conn.is_active,
          createdAt: conn.created_at,
        };
      });
    } catch (err) {
      console.error('[ExpediaConnection] Error obteniendo conexiones:', err);
      return [];
    }
  },

  /**
   * Obtener conexión por property_id.
   */
  async getConnectionByPropertyId(
    organizationId: number,
    propertyId: string,
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
        .eq('purpose', EXPEDIA_CREDENTIAL_PURPOSES.PROPERTY_ID)
        .eq('value_encrypted', propertyId)
        .limit(1);

      if (!data || data.length === 0) return null;

      const match = data.find((d: any) =>
        d.integration_connections?.organization_id === organizationId &&
        d.integration_connections?.connector_id === EXPEDIA_OTA_CONNECTOR_ID
      );

      return match ? { connectionId: match.connection_id } : null;
    } catch {
      return null;
    }
  },

  // ─── Health Check ──────────────────────────────────────────

  /**
   * Verificar credenciales y conexión con Expedia Group.
   * Intenta hacer un GET a la AR API para verificar acceso.
   */
  async healthCheck(connectionId: string): Promise<ExpediaHealthCheckResult> {
    const result: ExpediaHealthCheckResult = {
      connected: false,
      message: '',
    };

    try {
      // 1. Obtener credenciales
      const credentials = await expediaAuthService.getCredentials(connectionId);
      if (!credentials) {
        result.message = 'Credenciales no encontradas o incompletas';
        return result;
      }

      result.propertyId = credentials.propertyId;

      // 2. Test request: GET Availability (AR API) para verificar acceso
      const requestId = generateRequestId();
      const url = `${getApiUrl(EXPEDIA_ENDPOINTS.AR_GET)}?hotel_id=${credentials.propertyId}`;

      const response = await expediaAuthService.fetchWithRetry(url, {
        method: 'GET',
        headers: getXmlHeaders(credentials.eqcUsername, credentials.eqcPassword),
      });

      if (response.ok) {
        const responseText = await response.text();
        // Intentar extraer nombre de propiedad de la respuesta
        const nameMatch = responseText.match(/<hotel\s[^>]*name="([^"]*)"/i);
        if (nameMatch) {
          result.propertyName = nameMatch[1];
        }
        result.connected = true;
        result.message = `Conexión exitosa con propiedad Expedia ${result.propertyName || credentials.propertyId}`;
      } else if (response.status === 401) {
        result.message = 'Credenciales EQC inválidas (401 Unauthorized)';
      } else if (response.status === 403) {
        result.message = 'Acceso denegado. Verificar que el Property ID esté asociado a las credenciales EQC (403 Forbidden)';
      } else {
        result.message = `Error conectando con Expedia (HTTP ${response.status})`;
      }

      // 3. Intentar obtener token OAuth2 (para GraphQL)
      const tokenInfo = await expediaAuthService.requestOAuthToken(credentials);
      result.tokenValid = tokenInfo !== null;
      if (tokenInfo) {
        result.tokenExpiresAt = tokenInfo.expiresAt;
      }

      return result;
    } catch (err) {
      result.message = `Error de red: ${err instanceof Error ? err.message : String(err)}`;
      return result;
    }
  },

  // ─── Sync Status / Logs ──────────────────────────────────

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

      const { data: lastSync } = await supabase
        .from('expedia_sync_logs')
        .select('sync_type, status, created_at, items_processed')
        .eq('connection_id', connectionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { count: totalSyncs } = await supabase
        .from('expedia_sync_logs')
        .select('id', { count: 'exact', head: true })
        .eq('connection_id', connectionId)
        .gte('created_at', oneDayAgo);

      const { count: errorSyncs } = await supabase
        .from('expedia_sync_logs')
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
        .from('expedia_sync_logs')
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
        console.error('[ExpediaConnection] Error desactivando:', error.message);
        return false;
      }

      // Desactivar channel_connections asociadas
      const creds = await expediaAuthService.getCredentials(connectionId);
      if (creds?.propertyId) {
        await supabase
          .from('channel_connections')
          .update({ is_active: false, sync_enabled: false })
          .eq('external_property_id', creds.propertyId)
          .eq('channel', 'expedia')
          .eq('connection_type', 'api');
      }

      // Invalidar token en cache
      expediaAuthService.invalidateToken(connectionId);

      return true;
    } catch {
      return false;
    }
  },
};
