// ============================================================
// Wompi Colombia — Servicio principal
// ============================================================

import crypto from 'crypto';
import { supabase } from '@/lib/supabase/config';
import { getWompiBaseUrl, WOMPI_CREDENTIAL_PURPOSES } from './wompiConfig';
import type {
  WompiCredentials,
  WompiEnvironment,
  WompiMerchantResponse,
  WompiAcceptanceTokens,
  WompiCreateTransactionRequest,
  WompiTransactionResponse,
  WompiTokenizeCardRequest,
  WompiTokenizeCardResponse,
  WompiPSEInstitutionsResponse,
  WompiWebhookEvent,
  WompiVoidResponse,
  WompiTransactionStatus,
} from './wompiTypes';

class WompiService {
  // ----------------------------------------------------------
  // Credenciales
  // ----------------------------------------------------------

  /**
   * Obtiene las credenciales de Wompi para una conexión.
   * Lee de integration_credentials vinculadas al connection_id.
   */
  async getCredentials(connectionId: string): Promise<WompiCredentials | null> {
    const { data: connection, error: connError } = await supabase
      .from('integration_connections')
      .select('environment')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      console.error('[Wompi] Error obteniendo conexión:', connError);
      return null;
    }

    const { data: creds, error } = await supabase
      .from('integration_credentials')
      .select('credential_type, purpose, secret_ref, key_prefix, status')
      .eq('connection_id', connectionId)
      .eq('status', 'active');

    if (error || !creds || creds.length === 0) {
      console.error('[Wompi] Error obteniendo credenciales:', error);
      return null;
    }

    const findCred = (purpose: string) =>
      creds.find((c) => c.purpose === purpose)?.secret_ref || '';

    return {
      publicKey: findCred('public_key'),
      privateKey: findCred('private_key'),
      eventsSecret: findCred('events_secret'),
      integritySecret: findCred('integrity_secret'),
      environment: (connection.environment as WompiEnvironment) || 'sandbox',
    };
  }

  /**
   * Guarda las 4 credenciales de Wompi para una conexión.
   */
  async saveCredentials(
    connectionId: string,
    credentials: {
      publicKey: string;
      privateKey: string;
      eventsSecret: string;
      integritySecret: string;
    }
  ): Promise<boolean> {
    const entries = [
      {
        ...WOMPI_CREDENTIAL_PURPOSES.PUBLIC_KEY,
        secret_ref: credentials.publicKey,
        key_prefix: credentials.publicKey.substring(0, 12) + '...',
      },
      {
        ...WOMPI_CREDENTIAL_PURPOSES.PRIVATE_KEY,
        secret_ref: credentials.privateKey,
        key_prefix: credentials.privateKey.substring(0, 12) + '...',
      },
      {
        ...WOMPI_CREDENTIAL_PURPOSES.EVENTS_SECRET,
        secret_ref: credentials.eventsSecret,
        key_prefix: credentials.eventsSecret.substring(0, 15) + '...',
      },
      {
        ...WOMPI_CREDENTIAL_PURPOSES.INTEGRITY_SECRET,
        secret_ref: credentials.integritySecret,
        key_prefix: credentials.integritySecret.substring(0, 18) + '...',
      },
    ];

    // Eliminar credenciales previas de esta conexión
    await supabase
      .from('integration_credentials')
      .delete()
      .eq('connection_id', connectionId);

    const { error } = await supabase.from('integration_credentials').insert(
      entries.map((entry) => ({
        connection_id: connectionId,
        credential_type: entry.credential_type,
        purpose: entry.purpose,
        secret_ref: entry.secret_ref,
        key_prefix: entry.key_prefix,
        status: 'active',
      }))
    );

    if (error) {
      console.error('[Wompi] Error guardando credenciales:', error);
      return false;
    }

    // Marcar conexión como connected
    await supabase
      .from('integration_connections')
      .update({
        status: 'connected',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    return true;
  }

  // ----------------------------------------------------------
  // Firma de integridad
  // ----------------------------------------------------------

  /**
   * Genera la firma de integridad SHA256.
   * Concatena: reference + amount_in_cents + currency + integrity_secret
   */
  generateIntegritySignature(
    reference: string,
    amountInCents: number,
    currency: string,
    integritySecret: string,
    expirationTime?: string
  ): string {
    let concatenated = `${reference}${amountInCents}${currency}`;
    if (expirationTime) {
      concatenated += expirationTime;
    }
    concatenated += integritySecret;
    return crypto.createHash('sha256').update(concatenated).digest('hex');
  }

  // ----------------------------------------------------------
  // Tokens de aceptación
  // ----------------------------------------------------------

  /**
   * Obtiene los tokens prefirmados de aceptación (requeridos por ley colombiana).
   */
  async getAcceptanceTokens(
    credentials: WompiCredentials
  ): Promise<WompiAcceptanceTokens | null> {
    const baseUrl = getWompiBaseUrl(credentials.environment);
    try {
      const response = await fetch(
        `${baseUrl}/merchants/${credentials.publicKey}`,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } }
      );

      if (!response.ok) {
        console.error('[Wompi] Error obteniendo tokens:', response.statusText);
        return null;
      }

      const data: WompiMerchantResponse = await response.json();
      return {
        acceptanceToken: data.data.presigned_acceptance.acceptance_token,
        acceptPersonalAuth:
          data.data.presigned_personal_data_auth.acceptance_token,
      };
    } catch (err) {
      console.error('[Wompi] Error en getAcceptanceTokens:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Transacciones
  // ----------------------------------------------------------

  /**
   * Crea una transacción en Wompi.
   */
  async createTransaction(
    credentials: WompiCredentials,
    transaction: WompiCreateTransactionRequest
  ): Promise<WompiTransactionResponse | null> {
    const baseUrl = getWompiBaseUrl(credentials.environment);

    // Generar firma si no viene
    if (!transaction.signature) {
      transaction.signature = this.generateIntegritySignature(
        transaction.reference,
        transaction.amount_in_cents,
        transaction.currency,
        credentials.integritySecret,
        transaction.expiration_time
      );
    }

    try {
      const response = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.privateKey}`,
        },
        body: JSON.stringify(transaction),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Wompi] Error creando transacción:', errorBody);
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error('[Wompi] Error en createTransaction:', err);
      return null;
    }
  }

  /**
   * Consulta el estado de una transacción.
   */
  async getTransaction(
    credentials: WompiCredentials,
    transactionId: string
  ): Promise<WompiTransactionResponse | null> {
    const baseUrl = getWompiBaseUrl(credentials.environment);

    try {
      const response = await fetch(
        `${baseUrl}/transactions/${transactionId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${credentials.privateKey}`,
          },
        }
      );

      if (!response.ok) {
        console.error('[Wompi] Error consultando transacción:', response.statusText);
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error('[Wompi] Error en getTransaction:', err);
      return null;
    }
  }

  /**
   * Anula una transacción (solo tarjetas, status APPROVED).
   */
  async voidTransaction(
    credentials: WompiCredentials,
    transactionId: string
  ): Promise<WompiVoidResponse | null> {
    const baseUrl = getWompiBaseUrl(credentials.environment);

    try {
      const response = await fetch(
        `${baseUrl}/transactions/${transactionId}/void`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${credentials.privateKey}`,
          },
        }
      );

      if (!response.ok) {
        console.error('[Wompi] Error anulando transacción:', response.statusText);
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error('[Wompi] Error en voidTransaction:', err);
      return null;
    }
  }

  /**
   * Long polling: consulta una transacción hasta que tenga estado final.
   * Máximo 10 intentos con intervalo de 2s.
   */
  async pollTransactionStatus(
    credentials: WompiCredentials,
    transactionId: string,
    maxAttempts: number = 10,
    intervalMs: number = 2000
  ): Promise<WompiTransactionResponse | null> {
    const finalStatuses: WompiTransactionStatus[] = [
      'APPROVED',
      'DECLINED',
      'VOIDED',
      'ERROR',
    ];

    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.getTransaction(credentials, transactionId);
      if (result && finalStatuses.includes(result.data.status)) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    // Retornar último estado aunque sea PENDING
    return this.getTransaction(credentials, transactionId);
  }

  // ----------------------------------------------------------
  // Tokenización de tarjeta
  // ----------------------------------------------------------

  /**
   * Tokeniza una tarjeta de crédito/débito.
   * NOTA: Esto normalmente se hace desde el frontend con la llave pública.
   */
  async tokenizeCard(
    credentials: WompiCredentials,
    cardData: WompiTokenizeCardRequest
  ): Promise<WompiTokenizeCardResponse | null> {
    const baseUrl = getWompiBaseUrl(credentials.environment);

    try {
      const response = await fetch(`${baseUrl}/tokens/cards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.publicKey}`,
        },
        body: JSON.stringify(cardData),
      });

      if (!response.ok) {
        console.error('[Wompi] Error tokenizando tarjeta:', response.statusText);
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error('[Wompi] Error en tokenizeCard:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // PSE — Instituciones financieras
  // ----------------------------------------------------------

  /**
   * Obtiene la lista de instituciones financieras disponibles para PSE.
   */
  async getPSEInstitutions(
    credentials: WompiCredentials
  ): Promise<WompiPSEInstitutionsResponse | null> {
    const baseUrl = getWompiBaseUrl(credentials.environment);

    try {
      const response = await fetch(
        `${baseUrl}/pse/financial_institutions`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${credentials.publicKey}`,
          },
        }
      );

      if (!response.ok) {
        console.error('[Wompi] Error obteniendo instituciones PSE:', response.statusText);
        return null;
      }

      return await response.json();
    } catch (err) {
      console.error('[Wompi] Error en getPSEInstitutions:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Webhooks — Verificación
  // ----------------------------------------------------------

  /**
   * Verifica la autenticidad de un evento webhook de Wompi.
   */
  verifyWebhookEvent(event: WompiWebhookEvent, eventsSecret: string): boolean {
    try {
      // Paso 1: Obtener valores de las propiedades indicadas
      const values = event.signature.properties.map((prop) => {
        const keys = prop.split('.');
        let value: unknown = event.data;
        for (const key of keys) {
          value = (value as Record<string, unknown>)[key];
        }
        return value;
      });

      // Paso 2: Concatenar valores + timestamp + secreto
      const concatenated = values.join('') + event.timestamp + eventsSecret;

      // Paso 3: SHA256
      const calculatedChecksum = crypto
        .createHash('sha256')
        .update(concatenated)
        .digest('hex')
        .toUpperCase();

      // Paso 4: Comparar
      return calculatedChecksum === event.signature.checksum;
    } catch (err) {
      console.error('[Wompi] Error verificando webhook:', err);
      return false;
    }
  }

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------

  /**
   * Verifica que las credenciales de Wompi sean válidas
   * consultando el endpoint de merchant.
   */
  async healthCheck(connectionId: string): Promise<{
    ok: boolean;
    message: string;
    merchantName?: string;
  }> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return { ok: false, message: 'No se encontraron credenciales' };
    }

    const baseUrl = getWompiBaseUrl(credentials.environment);
    try {
      const response = await fetch(
        `${baseUrl}/merchants/${credentials.publicKey}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        // Actualizar estado de la conexión a error
        await supabase
          .from('integration_connections')
          .update({
            last_health_check_at: new Date().toISOString(),
            last_error_at: new Date().toISOString(),
            last_error_message: `Health check falló: HTTP ${response.status}`,
            status: 'error',
            updated_at: new Date().toISOString(),
          })
          .eq('id', connectionId);

        return {
          ok: false,
          message: `Wompi respondió con HTTP ${response.status}`,
        };
      }

      const data: WompiMerchantResponse = await response.json();

      // Actualizar health check exitoso
      await supabase
        .from('integration_connections')
        .update({
          last_health_check_at: new Date().toISOString(),
          last_error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

      return {
        ok: true,
        message: 'Conexión verificada correctamente',
        merchantName: data.data.name,
      };
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Error de conexión';

      await supabase
        .from('integration_connections')
        .update({
          last_health_check_at: new Date().toISOString(),
          last_error_at: new Date().toISOString(),
          last_error_message: errorMsg,
          status: 'error',
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

      return { ok: false, message: errorMsg };
    }
  }

  // ----------------------------------------------------------
  // Utilidades
  // ----------------------------------------------------------

  /**
   * Genera una referencia única para transacciones.
   * Formato: GO-{orgId}-{timestamp}-{random}
   */
  generateReference(organizationId: number, prefix?: string): string {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    const pfx = prefix || 'GO';
    return `${pfx}-${organizationId}-${ts}-${rand}`;
  }
}

export const wompiService = new WompiService();
export default wompiService;
