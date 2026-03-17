// ============================================================
// Servicio de Autenticación Expedia Group Lodging API
// Basic Auth (EQC) + OAuth2 (GraphQL)
// ============================================================

import { supabase } from '@/lib/supabase/config';
import {
  EXPEDIA_OAUTH_URL,
  EXPEDIA_CREDENTIAL_PURPOSES,
  EXPEDIA_TOKEN_REFRESH_MARGIN_SEC,
  EXPEDIA_RATE_LIMITS,
  getBasicAuthHeader,
  generateRequestId,
} from './expediaConfig';
import type {
  ExpediaCredentials,
  ExpediaTokenResponse,
  ExpediaTokenInfo,
} from './expediaTypes';
import { EXPEDIA_OTA_CONNECTOR_ID } from './expediaTypes';

// Cache en memoria de tokens OAuth2 por connectionId (para GraphQL)
const tokenCache = new Map<string, ExpediaTokenInfo>();

/**
 * Servicio de autenticación para Expedia Group Lodging API.
 * Gestiona EQC credentials (Basic Auth) y tokens OAuth2 (para GraphQL).
 */
export const expediaAuthService = {

  // ─── Credenciales ──────────────────────────────────────────

  /**
   * Obtener credenciales EQC de Expedia para una conexión específica.
   * Lee de integration_credentials vinculadas a la integration_connection.
   */
  async getCredentials(connectionId: string): Promise<ExpediaCredentials | null> {
    try {
      const { data: conn, error: connErr } = await supabase
        .from('integration_connections')
        .select('id')
        .eq('id', connectionId)
        .single();

      if (connErr || !conn) {
        console.error('[ExpediaAuth] Conexión no encontrada:', connectionId);
        return null;
      }

      const { data: creds, error: credsErr } = await supabase
        .from('integration_credentials')
        .select('purpose, value_encrypted')
        .eq('connection_id', connectionId);

      if (credsErr || !creds || creds.length === 0) {
        console.error('[ExpediaAuth] Sin credenciales para conexión:', connectionId);
        return null;
      }

      const credMap = new Map(creds.map(c => [c.purpose, c.value_encrypted]));

      const eqcUsername = credMap.get(EXPEDIA_CREDENTIAL_PURPOSES.EQC_USERNAME);
      const eqcPassword = credMap.get(EXPEDIA_CREDENTIAL_PURPOSES.EQC_PASSWORD);
      const propertyId = credMap.get(EXPEDIA_CREDENTIAL_PURPOSES.PROPERTY_ID);

      if (!eqcUsername || !eqcPassword || !propertyId) {
        console.error('[ExpediaAuth] Credenciales incompletas. Faltan:',
          !eqcUsername ? 'eqc_username' : '',
          !eqcPassword ? 'eqc_password' : '',
          !propertyId ? 'property_id' : '',
        );
        return null;
      }

      return {
        eqcUsername,
        eqcPassword,
        propertyId,
        accessToken: credMap.get(EXPEDIA_CREDENTIAL_PURPOSES.ACCESS_TOKEN) || undefined,
      };
    } catch (err) {
      console.error('[ExpediaAuth] Error obteniendo credenciales:', err);
      return null;
    }
  },

  // ─── Basic Auth ─────────────────────────────────────────────

  /**
   * Obtener el header de Basic Auth para XML/JSON APIs.
   * Expedia usa EQC username:password codificado en Base64.
   */
  getBasicAuth(credentials: ExpediaCredentials): string {
    return getBasicAuthHeader(credentials.eqcUsername, credentials.eqcPassword);
  },

  // ─── OAuth2 Token (para GraphQL) ───────────────────────────

  /**
   * Obtener un token OAuth2 válido para las APIs GraphQL.
   * Del cache o generando uno nuevo via client_credentials.
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

    // 3. Solicitar nuevo token OAuth2
    const tokenInfo = await this.requestOAuthToken(credentials);
    if (!tokenInfo) return null;

    // 4. Guardar en cache
    tokenCache.set(connectionId, tokenInfo);

    // 5. Persistir en BD
    await this.persistToken(connectionId, tokenInfo);

    return tokenInfo.accessToken;
  },

  /**
   * Solicitar nuevo token OAuth2 usando EQC credentials como client_credentials.
   * Endpoint: https://api.expediagroup.com/identity/oauth2/v3/token
   */
  async requestOAuthToken(credentials: ExpediaCredentials): Promise<ExpediaTokenInfo | null> {
    const requestId = generateRequestId();

    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
      });

      const response = await fetch(EXPEDIA_OAUTH_URL, {
        method: 'POST',
        headers: {
          'Authorization': getBasicAuthHeader(credentials.eqcUsername, credentials.eqcPassword),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ExpediaAuth] Error obteniendo token (${response.status}):`, errorText, 'ReqID:', requestId);
        return null;
      }

      const data: ExpediaTokenResponse = await response.json();

      const tokenInfo: ExpediaTokenInfo = {
        accessToken: data.access_token,
        expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
        isValid: true,
      };

      console.log(`[ExpediaAuth] Token OAuth2 obtenido. Expira en ${data.expires_in}s. ReqID: ${requestId}`);
      return tokenInfo;
    } catch (err) {
      console.error('[ExpediaAuth] Error en request de token:', err, 'ReqID:', requestId);
      return null;
    }
  },

  /**
   * Verificar si un token es válido (no expirado con margen de seguridad).
   */
  isTokenValid(tokenInfo: ExpediaTokenInfo): boolean {
    if (!tokenInfo.isValid || !tokenInfo.accessToken) return false;
    const now = Math.floor(Date.now() / 1000);
    return tokenInfo.expiresAt > now + EXPEDIA_TOKEN_REFRESH_MARGIN_SEC;
  },

  /**
   * Persistir token en integration_credentials para recuperación post-restart.
   */
  async persistToken(connectionId: string, tokenInfo: ExpediaTokenInfo): Promise<void> {
    try {
      const { error } = await supabase
        .from('integration_credentials')
        .upsert(
          {
            connection_id: connectionId,
            purpose: EXPEDIA_CREDENTIAL_PURPOSES.ACCESS_TOKEN,
            value_encrypted: tokenInfo.accessToken,
            metadata: { expires_at: tokenInfo.expiresAt },
          },
          { onConflict: 'connection_id,purpose' }
        );

      if (error) {
        console.warn('[ExpediaAuth] No se pudo persistir token:', error.message);
      }
    } catch (err) {
      console.warn('[ExpediaAuth] Error persistiendo token:', err);
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
   * Obtener todas las conexiones activas de Expedia OTA para una organización.
   */
  async getActiveConnections(organizationId: number): Promise<Array<{
    connectionId: string;
    propertyId: string;
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
        .eq('connector_id', EXPEDIA_OTA_CONNECTOR_ID)
        .eq('is_active', true);

      if (error || !data) {
        console.error('[ExpediaAuth] Error obteniendo conexiones:', error?.message);
        return [];
      }

      return data.map((conn: any) => {
        const creds = conn.integration_credentials || [];
        const propIdCred = creds.find((c: any) => c.purpose === EXPEDIA_CREDENTIAL_PURPOSES.PROPERTY_ID);
        return {
          connectionId: conn.id,
          propertyId: propIdCred?.value_encrypted || '',
          isActive: conn.is_active,
        };
      });
    } catch (err) {
      console.error('[ExpediaAuth] Error inesperado:', err);
      return [];
    }
  },

  /**
   * Ejecutar un request con retry y exponential backoff.
   */
  async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = EXPEDIA_RATE_LIMITS.MAX_RETRIES
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);

        // Si es 429 (rate limit), hacer backoff
        if (response.status === 429 && attempt < maxRetries) {
          const delay = EXPEDIA_RATE_LIMITS.BACKOFF_BASE_MS * Math.pow(2, attempt);
          console.warn(`[ExpediaAuth] Rate limited (429). Retry ${attempt + 1}/${maxRetries} en ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxRetries) {
          const delay = EXPEDIA_RATE_LIMITS.BACKOFF_BASE_MS * Math.pow(2, attempt);
          console.warn(`[ExpediaAuth] Error de red. Retry ${attempt + 1}/${maxRetries} en ${delay}ms`);
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
