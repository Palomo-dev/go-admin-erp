// ============================================================
// Servicio de Autenticación Booking.com Connectivity API
// OAuth2 Client Credentials (Machine Account)
// ============================================================

import type { ChannelManagerClients } from '../channelManagerClients';
import {
  BOOKING_ENDPOINTS,
  BOOKING_TOKEN_REFRESH_MARGIN_SEC,
  BOOKING_RATE_LIMITS,
  getOAuthUrl,
  generateRuid,
} from './bookingConfig';
import type {
  BookingCredentials,
  BookingTokenResponse,
  BookingTokenInfo,
} from './bookingTypes';
import { BOOKING_OTA_CONNECTOR_ID } from './bookingTypes';
import { guardarCredencialesOta, leerCredencialesOta, propiedadDeSettings } from '../conexiones/credencialesOta';

// Cache en memoria de tokens por connectionId
const tokenCache = new Map<string, BookingTokenInfo>();

/**
 * Servicio de autenticación para Booking.com Connectivity API.
 * Gestiona Machine Account credentials y tokens OAuth2.
 */
export function createBookingAuthService(clients: ChannelManagerClients) {
  const supabase = clients.db;

  return {

    // ─── Credenciales ──────────────────────────────────────────

    /**
     * Obtener credenciales de Booking.com para una conexión específica.
     * Lee de integration_credentials vinculadas a la integration_connection.
     */
    async getCredentials(connectionId: string): Promise<BookingCredentials | null> {
      try {
        // Frente INT (2026-11-07): antes se leía `integration_credentials.value_encrypted`, columna
        // que no existe. La propiedad vive en `settings.hotel_id`; los secretos, en la bóveda
        // (lectura dual: bóveda o valor en claro). Las credenciales de máquina son de la cuenta de
        // proveedor de conectividad: si la conexión no trae las suyas, se usan las del servidor.
        const { data: conn, error: connErr } = await supabase
          .from('integration_connections')
          .select('id, settings')
          .eq('id', connectionId)
          .single();

        if (connErr || !conn) {
          console.error('[BookingAuth] Conexión no encontrada:', connectionId);
          return null;
        }

        const valores = await leerCredencialesOta(clients.secrets(), connectionId, 'booking');
        const machineClientId = valores.machine_client_id || process.env.BOOKING_MACHINE_CLIENT_ID || '';
        const machineClientSecret = valores.machine_client_secret || process.env.BOOKING_MACHINE_CLIENT_SECRET || '';
        const hotelId = propiedadDeSettings('booking', (conn as { settings?: unknown }).settings);

        if (!machineClientId || !machineClientSecret || !hotelId) {
          console.error('[BookingAuth] Credenciales incompletas. Faltan:',
            !machineClientId ? 'machine_client_id' : '',
            !machineClientSecret ? 'machine_client_secret' : '',
            !hotelId ? 'hotel_id' : '',
          );
          return null;
        }

        return {
          machineClientId,
          machineClientSecret,
          hotelId,
          accessToken: valores.access_token || undefined,
        };
      } catch (err) {
        console.error('[BookingAuth] Error obteniendo credenciales:', err);
        return null;
      }
    },

    // ─── Token Management ──────────────────────────────────────

    /**
     * Obtener un token válido (del cache o generando uno nuevo).
     */
    async getValidToken(connectionId: string): Promise<string | null> {
      // 1. Verificar cache en memoria
      const cached = tokenCache.get(connectionId);
      if (cached && this.isTokenValid(cached)) {
        return cached.accessToken;
      }

      // 2. Obtener credenciales
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) return null;

      // 3. Solicitar nuevo token
      const tokenInfo = await this.requestNewToken(credentials);
      if (!tokenInfo) return null;

      // 4. Guardar en cache
      tokenCache.set(connectionId, tokenInfo);

      // 5. Persistir token en BD
      await this.persistToken(connectionId, tokenInfo);

      return tokenInfo.accessToken;
    },

    /**
     * Solicitar nuevo token OAuth2 via client_credentials.
     */
    async requestNewToken(credentials: BookingCredentials): Promise<BookingTokenInfo | null> {
      const ruid = generateRuid();

      try {
        const url = getOAuthUrl(BOOKING_ENDPOINTS.TOKEN);
        const body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: credentials.machineClientId,
          client_secret: credentials.machineClientSecret,
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[BookingAuth] Error obteniendo token (${response.status}):`, errorText, 'RUID:', ruid);
          return null;
        }

        const data: BookingTokenResponse = await response.json();

        const tokenInfo: BookingTokenInfo = {
          accessToken: data.access_token,
          expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
          isValid: true,
        };

        console.log(`[BookingAuth] Token obtenido exitosamente. Expira en ${data.expires_in}s. RUID: ${ruid}`);
        return tokenInfo;
      } catch (err) {
        console.error('[BookingAuth] Error en request de token:', err, 'RUID:', ruid);
        return null;
      }
    },

    /**
     * Verificar si un token es válido (no expirado con margen de seguridad).
     */
    isTokenValid(tokenInfo: BookingTokenInfo): boolean {
      if (!tokenInfo.isValid || !tokenInfo.accessToken) return false;
      const now = Math.floor(Date.now() / 1000);
      return tokenInfo.expiresAt > now + BOOKING_TOKEN_REFRESH_MARGIN_SEC;
    },

    /**
     * Persistir token en integration_credentials para recuperación post-restart.
     */
    async persistToken(connectionId: string, tokenInfo: BookingTokenInfo): Promise<void> {
      try {
        // El token va a la bóveda (propósito `access_token`); su vencimiento, a `settings`.
        const secrets = clients.secrets();
        await guardarCredencialesOta(secrets, connectionId, 'booking', { access_token: tokenInfo.accessToken });
        const { data: conn } = await secrets
          .from('integration_connections')
          .select('settings')
          .eq('id', connectionId)
          .maybeSingle();
        const previos = (conn as { settings?: unknown } | null)?.settings;
        const settings = previos && typeof previos === 'object' && !Array.isArray(previos) ? (previos as Record<string, unknown>) : {};
        const { error } = await secrets
          .from('integration_connections')
          .update({ settings: { ...settings, token_expires_at: tokenInfo.expiresAt }, updated_at: new Date().toISOString() })
          .eq('id', connectionId);

        if (error) {
          console.warn('[BookingAuth] No se pudo guardar el vencimiento del token:', error.message);
        }
      } catch (err) {
        console.warn('[BookingAuth] Error persistiendo token:', err instanceof Error ? err.message : err);
      }
    },

    /**
     * Invalidar token en cache (forzar renovación).
     */
    invalidateToken(connectionId: string): void {
      tokenCache.delete(connectionId);
    },

    // ─── Helpers ───────────────────────────────────────────────

    /**
     * Obtener todas las conexiones activas de Booking.com OTA para una organización.
     */
    async getActiveConnections(organizationId: number): Promise<Array<{
      connectionId: string;
      hotelId: string;
      isActive: boolean;
    }>> {
      try {
        const { data, error } = await clients.secrets() // service role; filtra por organization_id
          .from('integration_connections')
          .select('id, status, settings')
          .eq('organization_id', organizationId)
          .eq('connector_id', BOOKING_OTA_CONNECTOR_ID)
          .eq('status', 'connected');

        if (error || !data) {
          console.error('[BookingAuth] Error obteniendo conexiones:', error?.message);
          return [];
        }

        return (data as { id: string; status: string; settings: unknown }[]).map((conn) => ({
          connectionId: conn.id,
          hotelId: propiedadDeSettings('booking', conn.settings),
          isActive: conn.status === 'connected',
        }));
      } catch (err) {
        console.error('[BookingAuth] Error inesperado:', err);
        return [];
      }
    },

    /**
     * Ejecutar un request con retry y exponential backoff.
     */
    async fetchWithRetry(
      url: string,
      options: RequestInit,
      maxRetries: number = BOOKING_RATE_LIMITS.MAX_RETRIES
    ): Promise<Response> {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await fetch(url, options);

          // Si es 429 (rate limit), hacer backoff
          if (response.status === 429 && attempt < maxRetries) {
            const delay = BOOKING_RATE_LIMITS.BACKOFF_BASE_MS * Math.pow(2, attempt);
            console.warn(`[BookingAuth] Rate limited (429). Retry ${attempt + 1}/${maxRetries} en ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          return response;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          if (attempt < maxRetries) {
            const delay = BOOKING_RATE_LIMITS.BACKOFF_BASE_MS * Math.pow(2, attempt);
            console.warn(`[BookingAuth] Error de red. Retry ${attempt + 1}/${maxRetries} en ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      throw lastError || new Error('Max retries exceeded');
    },

    /**
     * Limpiar cache completo de tokens.
     */
    clearTokenCache(): void {
      tokenCache.clear();
    },
  };
}

export type BookingAuthService = ReturnType<typeof createBookingAuthService>;
