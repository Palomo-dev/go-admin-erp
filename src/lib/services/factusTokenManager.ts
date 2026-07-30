/**
 * Gestor centralizado de tokens de Factus API
 * Evita duplicación de lógica de autenticación entre routes
 */

import factusService, { FactusCredentials, FactusToken } from '@/lib/services/factusService';

let tokenCache: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
} | null = null;

let authenticating: Promise<string> | null = null;

function getFactusCredentials(): FactusCredentials | null {
  const clientId = process.env.FACTUS_CLIENT_ID;
  const clientSecret = process.env.FACTUS_CLIENT_SECRET;
  const username = process.env.FACTUS_USERNAME;
  const password = process.env.FACTUS_PASSWORD;
  const environment = (process.env.FACTUS_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production';

  if (!clientId || !clientSecret || !username || !password) {
    return null;
  }

  return { clientId, clientSecret, username, password, environment };
}

function isTokenValid(): boolean {
  if (!tokenCache) return false;
  const now = new Date();
  const marginMs = 60 * 1000;
  return tokenCache.expiresAt.getTime() - now.getTime() > marginMs;
}

export async function getValidToken(): Promise<string | null> {
  if (isTokenValid()) {
    return tokenCache!.accessToken;
  }

  const credentials = getFactusCredentials();
  if (!credentials) return null;

  if (authenticating) {
    return authenticating;
  }

  authenticating = (async () => {
    try {
      if (tokenCache?.refreshToken) {
        try {
          const token = await factusService.refreshToken(credentials, tokenCache.refreshToken);
          tokenCache = {
            accessToken: token.accessToken,
            refreshToken: token.refreshToken,
            expiresAt: token.expiresAt,
          };
          return token.accessToken;
        } catch {
          // Refresh falló, hacer autenticación completa
        }
      }

      const token = await factusService.authenticate(credentials);
      tokenCache = {
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        expiresAt: token.expiresAt,
      };
      return token.accessToken;
    } catch (error) {
      console.error('Error en factusTokenManager:', error);
      tokenCache = null;
      throw error;
    } finally {
      authenticating = null;
    }
  })();

  try {
    return await authenticating;
  } catch {
    return null;
  }
}

export function getCredentials(): FactusCredentials | null {
  return getFactusCredentials();
}

export function clearTokenCache(): void {
  tokenCache = null;
}
