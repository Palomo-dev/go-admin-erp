// ============================================================
// Redeban Colombia — Servicio principal
// ============================================================

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getRedebanBaseUrl } from './redebanConfig';
import { confirmQrPayment } from '@/lib/services/integrations/qrShared/paymentConfirmation';
import type {
  RedebanCredentials,
  RedebanQrRequest,
  RedebanQrResponse,
  RedebanTransactionResponse,
  RedebanWebhookPayload,
  RedebanHealthCheckResult,
} from './redebanTypes';

class RedebanService {
  // ----------------------------------------------------------
  // Auth-Token
  // ----------------------------------------------------------

  /**
   * Genera el Auth-Token de Redeban.
   * Formula: Base64(APP_CODE;TIMESTAMP;SHA256(APP_KEY+TIMESTAMP))
   */
  generateAuthToken(serverAppCode: string, serverAppKey: string): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const hash = crypto
      .createHash('sha256')
      .update(serverAppKey + timestamp)
      .digest('hex');
    const rawToken = `${serverAppCode};${timestamp};${hash}`;
    return Buffer.from(rawToken).toString('base64');
  }

  // ----------------------------------------------------------
  // Credenciales
  // ----------------------------------------------------------

  /**
   * Obtiene las credenciales de Redeban para una conexion.
   * Lee de integration_credentials donde secret_ref contiene un JSON
   * con { serverAppCode, serverAppKey }.
   */
  async getCredentials(connectionId: string): Promise<RedebanCredentials | null> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener ambiente de la conexion
      const { data: connection, error: connError } = await supabase
        .from('integration_connections')
        .select('environment')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        console.error('[Redeban] Error obteniendo conexion:', connError);
        return null;
      }

      // Obtener credenciales (secret_ref contiene JSON)
      const { data: creds, error } = await supabase
        .from('integration_credentials')
        .select('purpose, secret_ref')
        .eq('connection_id', connectionId)
        .eq('status', 'active');

      if (error || !creds || creds.length === 0) {
        console.error('[Redeban] Error obteniendo credenciales:', error);
        return null;
      }

      // Reconstruir JSON desde secret_ref
      let serverAppCode = '';
      let serverAppKey = '';

      for (const row of creds) {
        try {
          const parsed = JSON.parse(row.secret_ref) as {
            serverAppCode?: string;
            serverAppKey?: string;
          };
          if (parsed.serverAppCode) serverAppCode = parsed.serverAppCode;
          if (parsed.serverAppKey) serverAppKey = parsed.serverAppKey;
        } catch {
          // Si no es JSON, intentar como string plano
          if (row.purpose === 'server_app_code') {
            serverAppCode = row.secret_ref || '';
          } else if (row.purpose === 'server_app_key') {
            serverAppKey = row.secret_ref || '';
          }
        }
      }

      if (!serverAppCode || !serverAppKey) {
        console.error('[Redeban] Credenciales incompletas');
        return null;
      }

      return {
        serverAppCode,
        serverAppKey,
        environment: (connection.environment as 'sandbox' | 'production') || 'sandbox',
      };
    } catch (err) {
      console.error('[Redeban] Excepcion obteniendo credenciales:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------

  /**
   * Verifica que las credenciales de Redeban sean validas.
   * Hace GET a {baseUrl}/v2/qr/status/ con el Auth-Token.
   */
  async healthCheck(connectionId: string): Promise<RedebanHealthCheckResult> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        return { valid: false, message: 'No se encontraron credenciales' };
      }

      const baseUrl = getRedebanBaseUrl(credentials.environment);
      const authToken = this.generateAuthToken(
        credentials.serverAppCode,
        credentials.serverAppKey,
      );

      const response = await fetch(`${baseUrl}/v2/qr/status/`, {
        method: 'GET',
        headers: {
          'Auth-Token': authToken,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        return { valid: true, message: 'Credenciales validas' };
      }

      const errorBody = await response.text();
      return {
        valid: false,
        message: `Redeban respondio HTTP ${response.status}: ${errorBody}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error de conexion';
      console.error('[Redeban] Error en healthCheck:', err);
      return { valid: false, message };
    }
  }

  // ----------------------------------------------------------
  // Generacion de QR
  // ----------------------------------------------------------

  /**
   * Crea un QR de pago en Redeban.
   * POST a {baseUrl}/v2/qr/generate/
   */
  async createQr(
    connectionId: string,
    params: RedebanQrRequest,
  ): Promise<RedebanQrResponse> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        throw new Error('No se encontraron credenciales para la conexion');
      }

      const baseUrl = getRedebanBaseUrl(credentials.environment);
      const authToken = this.generateAuthToken(
        credentials.serverAppCode,
        credentials.serverAppKey,
      );

      const body: Record<string, unknown> = {
        amount: params.amount,
        currency: params.currency,
        reference: params.reference,
        description: params.description,
        expires_at: params.expiresAt,
      };

      if (params.terminalId) {
        body.terminal_id = params.terminalId;
      }

      if (params.merchantName) {
        body.merchant_name = params.merchantName;
      }

      const response = await fetch(`${baseUrl}/v2/qr/generate/`, {
        method: 'POST',
        headers: {
          'Auth-Token': authToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Redeban respondio HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as Record<string, unknown>;
      const qrData = (data.data ?? data) as Record<string, unknown>;

      return {
        id: String(qrData.id ?? qrData.qr_id ?? ''),
        qr_string: String(qrData.qr_string ?? qrData.qr ?? ''),
        qr_image_base64: qrData.qr_image_base64 as string | undefined,
        status: String(qrData.status ?? 'pending'),
        expires_at: String(qrData.expires_at ?? ''),
        reference: String(qrData.reference ?? params.reference),
      };
    } catch (err) {
      console.error('[Redeban] Error en createQr:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // Consulta de estado
  // ----------------------------------------------------------

  /**
   * Consulta el estado de una transaccion en Redeban.
   * GET a {baseUrl}/order/{transactionId}
   */
  async getTransactionStatus(
    connectionId: string,
    transactionId: string,
  ): Promise<RedebanTransactionResponse> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        throw new Error('No se encontraron credenciales para la conexion');
      }

      const baseUrl = getRedebanBaseUrl(credentials.environment);
      const authToken = this.generateAuthToken(
        credentials.serverAppCode,
        credentials.serverAppKey,
      );

      const response = await fetch(`${baseUrl}/order/${transactionId}`, {
        method: 'GET',
        headers: {
          'Auth-Token': authToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Redeban respondio HTTP ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as Record<string, unknown>;
      const txData = (data.data ?? data) as Record<string, unknown>;

      return {
        id: String(txData.id ?? transactionId),
        status: (txData.status as RedebanTransactionResponse['status']) ?? 'pending',
        amount: Number(txData.amount ?? 0),
        currency: String(txData.currency ?? 'COP'),
        reference: String(txData.reference ?? ''),
        authorization_code: txData.authorization_code as string | undefined,
        created_at: String(txData.created_at ?? ''),
        paid_at: txData.paid_at as string | undefined,
      };
    } catch (err) {
      console.error('[Redeban] Error en getTransactionStatus:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // Webhook — Verificacion de firma
  // ----------------------------------------------------------

  /**
   * Verifica la firma del webhook de Redeban.
   * Calcula HMAC-SHA256 del payload con serverAppKey.
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    serverAppKey: string,
  ): boolean {
    try {
      const calculated = crypto
        .createHmac('sha256', serverAppKey)
        .update(payload)
        .digest('hex');
      return calculated === signature;
    } catch (err) {
      console.error('[Redeban] Error verificando firma webhook:', err);
      return false;
    }
  }

  // ----------------------------------------------------------
  // Webhook — Procesamiento
  // ----------------------------------------------------------

  /**
   * Procesa un webhook de Redeban.
   * Busca payment_qr_session por reference y actualiza segun el estado.
   */
  async processWebhook(
    connectionId: string,
    payload: RedebanWebhookPayload,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const supabase = getSupabaseAdmin();

      // Buscar sesion QR por reference
      const { data: session, error: sessionError } = await supabase
        .from('payment_qr_sessions')
        .select('*')
        .eq('reference', payload.reference)
        .maybeSingle();

      if (sessionError || !session) {
        return {
          success: false,
          message: `Sesion QR no encontrada para referencia ${payload.reference}`,
        };
      }

      // Si el estado es approved, confirmar el pago
      if (payload.status === 'approved') {
        const result = await confirmQrPayment({
          qrSessionId: session.id,
          organizationId: session.organization_id,
          status: 'paid',
          externalQrId: payload.transaction_id,
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

      // Si el estado es rejected o expired, actualizar sesion
      if (payload.status === 'rejected' || payload.status === 'expired') {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('payment_qr_sessions')
          .update({
            status: payload.status === 'rejected' ? 'rejected' : 'expired',
            updated_at: now,
          })
          .eq('id', session.id);

        if (updateError) {
          return {
            success: false,
            message: `Error al actualizar sesion: ${updateError.message}`,
          };
        }

        return {
          success: true,
          message: `Sesion marcada como ${payload.status}`,
        };
      }

      // Estado no accionable (pending, cancelled)
      return {
        success: true,
        message: `Estado ${payload.status} no requiere accion`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Redeban] Error en processWebhook:', err);
      return { success: false, message };
    }
  }
}

export const redebanService = new RedebanService();
export default redebanService;
