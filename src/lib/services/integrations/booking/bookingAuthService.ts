// ============================================================
// Servicio de Autenticación Booking.com Connectivity API
// OAuth2 Client Credentials (Machine Account)
// ============================================================

import { supabase } from '@/lib/supabase/config';
import {
  BOOKING_ENDPOINTS,
  BOOKING_CREDENTIAL_PURPOSES,
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

// Cache en memoria de tokens por connectionId
const tokenCache = new Map<string, BookingTokenInfo>();

/**
 * Servicio de autenticación para Booking.com Connectivity API.
 * Gestiona Machine Account credentials y tokens OAuth2.
 */
export const bookingAuthService = {

  // ─── Credenciales ──────────────────────────────────────────

  /**
   * Obtener credenciales de Booking.com para una conexión específica.
   * Lee de integration_credentials vinculadas a la integration_connection.
   */
  async getCredentials(connectionId: string): Promise<BookingCredentials | null> {
    try {
      // Obtener la integration_connection para sacar el connection ID real
      const { data: conn, error: connErr } = await supabase
        .from('integration_connections')
        .select('id')
        .eq('id', connectionId)
        .single();

      if (connErr || !conn) {
        console.error('[BookingAuth] Conexión no encontrada:', connectionId);
        return null;
      }

      // Obtener todas las credenciales de esta conexión
      const { data: creds, error: credsErr } = await supabase
        .from('integration_credentials')
        .select('purpose, value_encrypted')
        .eq('connection_id', connectionId);

      if (credsErr || !creds || creds.length === 0) {
        console.error('[BookingAuth] Sin credenciales para conexión:', connectionId);
        return null;
      }

      const credMap = new Map(creds.map(c => [c.purpose, c.value_encrypted]));

      const machineClientId = credMap.get(BOOKING_CREDENTIAL_PURPOSES.MACHINE_CLIENT_ID);
      const machineClientSecret = credMap.get(BOOKING_CREDENTIAL_PURPOSES.MACHINE_CLIENT_SECRET);
      const hotelId = credMap.get(BOOKING_CREDENTIAL_PURPOSES.HOTEL_ID);

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
        accessToken: credMap.get(BOOKING_CREDENTIAL_PURPOSES.ACCESS_TOKEN) || undefined,
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
      const { error } = await supabase
        .from('integration_credentials')
        .upsert(
          {
            connection_id: connectionId,
            purpose: BOOKING_CREDENTIAL_PURPOSES.ACCESS_TOKEN,
            value_encrypted: tokenInfo.accessToken,
            metadata: { expires_at: tokenInfo.expiresAt },
          },
          { onConflict: 'connection_id,purpose' }
        );

      if (error) {
        console.warn('[BookingAuth] No se pudo persistir token:', error.message);
      }
    } catch (err) {
      console.warn('[BookingAuth] Error persistiendo token:', err);
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
      const { data, error } = await supabase
        .from('integration_connections')
        .select(`
          id,
          is_active,
          integration_credentials (
            purpose,
            value_encrypted
          )
        `)
        .eq('organization_id', organizationId)
        .eq('connector_id', BOOKING_OTA_CONNECTOR_ID)
        .eq('is_active', true);

      if (error || !data) {
        console.error('[BookingAuth] Error obteniendo conexiones:', error?.message);
        return [];
      }

      return data.map((conn: any) => {
        const creds = conn.integration_credentials || [];
        const hotelIdCred = creds.find((c: any) => c.purpose === BOOKING_CREDENTIAL_PURPOSES.HOTEL_ID);
        return {
          connectionId: conn.id,
          hotelId: hotelIdCred?.value_encrypted || '',
          isActive: conn.is_active,
        };
      });
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
