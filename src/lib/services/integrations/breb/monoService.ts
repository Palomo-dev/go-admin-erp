// ============================================================
// Mono (Bre-B) Colombia — Servicio principal
// ============================================================

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getMonoBaseUrl, type MonoEnvironment } from './monoConfig';
import { confirmQrPayment } from '@/lib/services/integrations/qrShared/paymentConfirmation';
import type {
  MonoCredentials,
  MonoCollectionRequest,
  MonoCollectionResponse,
  MonoSimulatePaymentRequest,
  MonoWebhookPayload,
  MonoHealthCheckResult,
} from './monoTypes';

class MonoService {
  // ----------------------------------------------------------
  // OAuth — Access Token
  // ----------------------------------------------------------

  /**
   * Obtiene un access_token de Mono via OAuth 2.0 Client Credentials.
   * POST a {baseUrl}/oauth/token con grant_type=client_credentials.
   * El token se obtiene fresco cada vez (sin cache por ahora).
   */
  async getAccessToken(
    clientId: string,
    clientSecret: string,
    environment: MonoEnvironment,
  ): Promise<string> {
    const baseUrl = getMonoBaseUrl(environment);

    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Mono OAuth respondio HTTP ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
    };

    return data.access_token;
  }

  // ----------------------------------------------------------
  // Credenciales
  // ----------------------------------------------------------

  /**
   * Obtiene las credenciales de Mono para una conexion.
   * Lee de integration_credentials donde secret_ref contiene un JSON
   * con { clientId, clientSecret }.
   */
  async getCredentials(connectionId: string): Promise<MonoCredentials | null> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener ambiente de la conexion
      const { data: connection, error: connError } = await supabase
        .from('integration_connections')
        .select('environment')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        console.error('[Mono] Error obteniendo conexion:', connError);
        return null;
      }

      // Obtener credenciales (secret_ref contiene JSON)
      const { data: creds, error } = await supabase
        .from('integration_credentials')
        .select('purpose, secret_ref')
        .eq('connection_id', connectionId)
        .eq('status', 'active');

      if (error || !creds || creds.length === 0) {
        console.error('[Mono] Error obteniendo credenciales:', error);
        return null;
      }

      // Reconstruir JSON desde secret_ref
      let clientId = '';
      let clientSecret = '';

      for (const row of creds) {
        try {
          const parsed = JSON.parse(row.secret_ref) as {
            clientId?: string;
            clientSecret?: string;
          };
          if (parsed.clientId) clientId = parsed.clientId;
          if (parsed.clientSecret) clientSecret = parsed.clientSecret;
        } catch {
          // Si no es JSON, intentar como string plano
          if (row.purpose === 'client_id') {
            clientId = row.secret_ref || '';
          } else if (row.purpose === 'client_secret') {
            clientSecret = row.secret_ref || '';
          }
        }
      }

      if (!clientId || !clientSecret) {
        console.error('[Mono] Credenciales incompletas');
        return null;
      }

      return {
        clientId,
        clientSecret,
        environment: (connection.environment as 'sandbox' | 'production') || 'sandbox',
      };
    } catch (err) {
      console.error('[Mono] Excepcion obteniendo credenciales:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------

  /**
   * Verifica que las credenciales de Mono sean validas.
   * Intenta obtener un access_token con client_credentials.
   */
  async healthCheck(connectionId: string): Promise<MonoHealthCheckResult> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        return { valid: false, message: 'No se encontraron credenciales' };
      }

      await this.getAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.environment,
      );

      return { valid: true, message: 'Credenciales validas' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de conexion';
      console.error('[Mono] Error en healthCheck:', err);
      return { valid: false, message };
    }
  }

  // ----------------------------------------------------------
  // Crear collection (QR de pago)
  // ----------------------------------------------------------

  /**
   * Crea una collection en Mono.
   * POST a {baseUrl}/api/v1/collections con Bearer token.
   */
  async createCollection(
    connectionId: string,
    params: MonoCollectionRequest,
  ): Promise<MonoCollectionResponse> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        throw new Error('No se encontraron credenciales para la conexion');
      }

      const baseUrl = getMonoBaseUrl(credentials.environment);
      const token = await this.getAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.environment,
      );

      const response = await fetch(`${baseUrl}/api/v1/collections`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Mono respondio HTTP ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const collectionData = (data.data ?? data) as Record<string, unknown>;
      const amountData = (collectionData.amount ?? {}) as Record<string, unknown>;

      return {
        id: String(collectionData.id ?? ''),
        status: (collectionData.status as MonoCollectionResponse['status']) ?? 'ready',
        qr: collectionData.qr as string | undefined,
        qr_image: collectionData.qr_image as string | undefined,
        expires_at: String(collectionData.expires_at ?? ''),
        amount: {
          amount: Number(amountData.amount ?? params.amount),
          currency: String(amountData.currency ?? params.currency),
        },
        metadata: collectionData.metadata as Record<string, unknown> | undefined,
      };
    } catch (err) {
      console.error('[Mono] Error en createCollection:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // Simular pago (solo sandbox)
  // ----------------------------------------------------------

  /**
   * Simula un pago sobre una collection en sandbox.
   * POST a {baseUrl}/api/v1/sandbox/collections/simulate-payment
   */
  async simulatePayment(
    connectionId: string,
    params: MonoSimulatePaymentRequest,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        return { success: false, message: 'No se encontraron credenciales para la conexion' };
      }

      if (credentials.environment !== 'sandbox') {
        return { success: false, message: 'Simulacion solo disponible en sandbox' };
      }

      const baseUrl = getMonoBaseUrl(credentials.environment);
      const token = await this.getAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.environment,
      );

      const response = await fetch(`${baseUrl}/api/v1/sandbox/collections/simulate-payment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          message: `Mono respondio HTTP ${response.status}: ${errorBody}`,
        };
      }

      return { success: true, message: 'Pago simulado correctamente' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Mono] Error en simulatePayment:', err);
      return { success: false, message };
    }
  }

  // ----------------------------------------------------------
  // Webhook — Verificacion de firma
  // ----------------------------------------------------------

  /**
   * Verifica la firma del webhook de Mono.
   * Calcula HMAC-SHA256 del payload con el webhookSecret.
   * Compara con la signature recibida (hex o base64).
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    webhookSecret: string,
  ): boolean {
    try {
      // Comparar en hex
      const calculatedHex = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('hex');

      if (calculatedHex === signature) {
        return true;
      }

      // Comparar en base64
      const calculatedBase64 = crypto
        .createHmac('sha256', webhookSecret)
        .update(payload)
        .digest('base64');

      return calculatedBase64 === signature;
    } catch (err) {
      console.error('[Mono] Error verificando firma webhook:', err);
      return false;
    }
  }

  // ----------------------------------------------------------
  // Webhook — Procesamiento
  // ----------------------------------------------------------

  /**
   * Procesa un webhook de Mono.
   * Extrae reference de metadata, busca payment_qr_session y actualiza segun el evento.
   */
  async processWebhook(
    connectionId: string,
    payload: MonoWebhookPayload,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const supabase = getSupabaseAdmin();

      // Extraer reference de metadata
      const metadata = (payload.data.metadata ?? {}) as Record<string, unknown>;
      const reference = String(
        metadata.reference ?? metadata.payment_reference ?? '',
      );

      if (!reference) {
        return {
          success: false,
          message: 'No se encontro reference en metadata del webhook',
        };
      }

      // Buscar sesion QR por reference
      const { data: session, error: sessionError } = await supabase
        .from('payment_qr_sessions')
        .select('*')
        .eq('reference', reference)
        .maybeSingle();

      if (sessionError || !session) {
        return {
          success: false,
          message: `Sesion QR no encontrada para referencia ${reference}`,
        };
      }

      const event = payload.event;

      // Eventos de pago exitoso
      if (event === 'collection.paid' || event === 'collection.minimum_paid') {
        const result = await confirmQrPayment({
          qrSessionId: session.id,
          organizationId: session.organization_id,
          status: 'paid',
          externalQrId: payload.data.id,
          providerResponse: payload as unknown as Record<string, unknown>,
        });

        if (!result.success) {
          return {
            success: false,
            message: result.error ?? 'Error al confirmar pago',
          };
        }

        return { success: true, message: 'Pago confirmado correctamente' };
      }

      // Evento de expiracion
      if (event === 'collection.expired') {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('payment_qr_sessions')
          .update({ status: 'expired', updated_at: now })
          .eq('id', session.id);

        if (updateError) {
          return {
            success: false,
            message: `Error al actualizar sesion: ${updateError.message}`,
          };
        }

        return { success: true, message: 'Sesion marcada como expired' };
      }

      // Evento de cancelacion
      if (event === 'collection.cancelled') {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('payment_qr_sessions')
          .update({ status: 'cancelled', updated_at: now })
          .eq('id', session.id);

        if (updateError) {
          return {
            success: false,
            message: `Error al actualizar sesion: ${updateError.message}`,
          };
        }

        return { success: true, message: 'Sesion marcada como cancelled' };
      }

      // Evento no accionable (ready, attempt_successful, attempt_unsuccessful)
      return {
        success: true,
        message: `Evento ${event} no requiere accion`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Mono] Error en processWebhook:', err);
      return { success: false, message };
    }
  }
}

export const monoService = new MonoService();
export default monoService;
