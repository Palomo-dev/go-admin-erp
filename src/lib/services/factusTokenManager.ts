/**
 * Tokens de Factus, en caché por cuenta (ambiente + client_id + usuario).
 *
 * Modelo de servicio (2026-09-23): cada organización emite con SU cuenta de
 * Factus, cuyas credenciales carga la plataforma y viven cifradas en Vault
 * (ver `src/lib/services/einvoicing/accesoFactus.ts`). Una cuenta de Factus es
 * UNA empresa emisora: el NIT sale del token.
 *
 * Las variables `FACTUS_*` del entorno son la cuenta demo pública del sandbox
 * de Factus y SOLO sirven en desarrollo: `getCredentials()` devuelve null
 * (fail-closed) cuando el despliegue es de producción, para que ninguna ruta
 * emita o consulte a nombre de un NIT ajeno.
 */

import factusService, { FactusCredentials } from '@/lib/services/factusService';

interface EntradaToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

const MARGEN_MS = 60 * 1000;
const cache = new Map<string, EntradaToken>();
const enVuelo = new Map<string, Promise<string>>();

function claveDe(c: FactusCredentials): string {
  return `${c.environment}:${c.clientId}:${c.username}`;
}

function vigente(entrada: EntradaToken | undefined): boolean {
  return !!entrada && entrada.expiresAt.getTime() - Date.now() > MARGEN_MS;
}

/**
 * ¿El despliegue es de producción? Producción si Factus apunta a producción o
 * si Vercel dice que es el despliegue de producción. En esos casos la cuenta
 * demo del entorno no se usa nunca.
 */
export function esDespliegueDeProduccion(): boolean {
  return process.env.FACTUS_ENVIRONMENT === 'production' || process.env.VERCEL_ENV === 'production';
}

/** Token válido para esas credenciales (refresh si se puede; si no, login). Lanza si Factus no autentica. */
export async function obtenerTokenPara(credenciales: FactusCredentials): Promise<string> {
  const clave = claveDe(credenciales);
  const actual = cache.get(clave);
  if (actual && vigente(actual)) return actual.accessToken;

  const pendiente = enVuelo.get(clave);
  if (pendiente) return pendiente;

  const promesa = (async () => {
    try {
      let token = null as Awaited<ReturnType<typeof factusService.authenticate>> | null;
      if (actual?.refreshToken) {
        try {
          token = await factusService.refreshToken(credenciales, actual.refreshToken);
        } catch {
          token = null;
        }
      }
      if (!token) token = await factusService.authenticate(credenciales);
      cache.set(clave, { accessToken: token.accessToken, refreshToken: token.refreshToken, expiresAt: token.expiresAt });
      return token.accessToken;
    } catch (error) {
      cache.delete(clave);
      throw error;
    } finally {
      enVuelo.delete(clave);
    }
  })();
  enVuelo.set(clave, promesa);
  return promesa;
}

/** Olvida el token de esas credenciales (p. ej. tras un 401 de Factus). */
export function invalidarTokenPara(credenciales: FactusCredentials): void {
  cache.delete(claveDe(credenciales));
}

// ─── Cuenta demo del entorno: solo desarrollo ────────────────────────────────

function credencialesDemoDesarrollo(): FactusCredentials | null {
  if (esDespliegueDeProduccion()) return null;
  const clientId = process.env.FACTUS_CLIENT_ID;
  const clientSecret = process.env.FACTUS_CLIENT_SECRET;
  const username = process.env.FACTUS_USERNAME;
  const password = process.env.FACTUS_PASSWORD;
  if (!clientId || !clientSecret || !username || !password) return null;
  return { clientId, clientSecret, username, password, environment: 'sandbox' };
}

/**
 * Credenciales de la cuenta demo del entorno, SOLO fuera de producción (null
 * en producción). No emiten a nombre de ninguna organización: para eso está
 * `obtenerAccesoFactus(organizationId)`.
 */
export function getCredentials(): FactusCredentials | null {
  return credencialesDemoDesarrollo();
}

/** Token de la cuenta demo (solo desarrollo) o null. */
export async function getValidToken(): Promise<string | null> {
  const credenciales = credencialesDemoDesarrollo();
  if (!credenciales) return null;
  try {
    return await obtenerTokenPara(credenciales);
  } catch (error) {
    console.error('[factusTokenManager] autenticación de la cuenta demo fallida:', error instanceof Error ? error.message : error);
    return null;
  }
}

export function clearTokenCache(): void {
  cache.clear();
}
