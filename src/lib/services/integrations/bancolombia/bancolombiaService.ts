// ============================================================
// Bancolombia API Directa — Servicio principal
// ============================================================

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getBancolombiaBaseUrl, BANCOLOMBIA_SCOPES, type BancolombiaEnvironment } from './bancolombiaConfig';
import { confirmQrPayment } from '@/lib/services/integrations/qrShared/paymentConfirmation';
import type {
  BancolombiaCredentials,
  BancolombiaTokenResponse,
  BancolombiaTransferRegistryRequest,
  BancolombiaTransferRegistryResponse,
  BancolombiaTransferValidateResponse,
  BancolombiaRefundRequest,
  BancolombiaRefundResponse,
  BancolombiaWebhookPayload,
  BancolombiaHealthCheckResult,
} from './bancolombiaTypes';

// Rutas de la API de Bancolombia
const TOKEN_PATH = '/public-partner/sb/v4/operations/cross-product/payments/payment-order/security/token';
const TRANSFER_REGISTRY_PATH = '/public-partner/sb/v4/operations/cross-product/payments/payment-order/transfer/action/registry';
const TRANSFER_VALIDATE_PATH = '/public-partner/sb/v4/operations/cross-product/payments/payment-order/transfer';
const REFUND_PATH = '/public-partner/sb/v4/operations/cross-product/payments/payment-order/refund';

class BancolombiaService {
  // ----------------------------------------------------------
  // OAuth — Access Token
  // ----------------------------------------------------------

  /**
   * Obtiene un access_token de Bancolombia via OAuth 2.0 Client Credentials.
   * POST a {baseUrl}/.../security/token con body form-urlencoded.
   * El token dura 20 minutos y se obtiene fresco cada vez (sin cache).
   */
  async getAccessToken(
    clientId: string,
    clientSecret: string,
    environment: BancolombiaEnvironment,
  ): Promise<string> {
    const baseUrl = getBancolombiaBaseUrl(environment);

    // Scopes separados por '+' en form-urlencoded
    const scopeValue = BANCOLOMBIA_SCOPES.replace(/ /g, '+');

    const body = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&scope=${scopeValue}`;

    const response = await fetch(`${baseUrl}${TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Bancolombia OAuth respondio HTTP ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as BancolombiaTokenResponse;

    return data.access_token;
  }

  // ----------------------------------------------------------
  // Credenciales
  // ----------------------------------------------------------

  /**
   * Obtiene las credenciales de Bancolombia para una conexion.
   * Lee de integration_credentials donde secret_ref contiene un JSON
   * con { clientId, clientSecret, commerceTransferButtonId }.
   */
  async getCredentials(connectionId: string): Promise<BancolombiaCredentials | null> {
    try {
      const supabase = getSupabaseAdmin();

      // Obtener ambiente de la conexion
      const { data: connection, error: connError } = await supabase
        .from('integration_connections')
        .select('environment')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        console.error('[Bancolombia] Error obteniendo conexion:', connError);
        return null;
      }

      // Obtener credenciales (secret_ref contiene JSON)
      const { data: creds, error } = await supabase
        .from('integration_credentials')
        .select('purpose, secret_ref')
        .eq('connection_id', connectionId)
        .eq('status', 'active');

      if (error || !creds || creds.length === 0) {
        console.error('[Bancolombia] Error obteniendo credenciales:', error);
        return null;
      }

      // Reconstruir JSON desde secret_ref
      let clientId = '';
      let clientSecret = '';
      let commerceTransferButtonId = '';

      for (const row of creds) {
        try {
          const parsed = JSON.parse(row.secret_ref) as {
            clientId?: string;
            clientSecret?: string;
            commerceTransferButtonId?: string;
          };
          if (parsed.clientId) clientId = parsed.clientId;
          if (parsed.clientSecret) clientSecret = parsed.clientSecret;
          if (parsed.commerceTransferButtonId) commerceTransferButtonId = parsed.commerceTransferButtonId;
        } catch {
          // Si no es JSON, intentar como string plano
          if (row.purpose === 'client_id') {
            clientId = row.secret_ref || '';
          } else if (row.purpose === 'client_secret') {
            clientSecret = row.secret_ref || '';
          } else if (row.purpose === 'commerce_transfer_button_id') {
            commerceTransferButtonId = row.secret_ref || '';
          }
        }
      }

      if (!clientId || !clientSecret) {
        console.error('[Bancolombia] Credenciales incompletas');
        return null;
      }

      return {
        clientId,
        clientSecret,
        commerceTransferButtonId,
        environment: (connection.environment as 'sandbox' | 'production') || 'sandbox',
      };
    } catch (err) {
      console.error('[Bancolombia] Excepcion obteniendo credenciales:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------

  /**
   * Verifica que las credenciales de Bancolombia sean validas.
   * Intenta obtener un access_token con client_credentials.
   */
  async healthCheck(connectionId: string): Promise<BancolombiaHealthCheckResult> {
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
      console.error('[Bancolombia] Error en healthCheck:', err);
      return { valid: false, message };
    }
  }

  // ----------------------------------------------------------
  // Registro de intencion de transferencia
  // ----------------------------------------------------------

  /**
   * Registra una intencion de transferencia en Bancolombia.
   * POST a {baseUrl}/.../transfer/action/registry con Bearer token.
   */
  async registerTransferIntention(
    connectionId: string,
    params: BancolombiaTransferRegistryRequest,
  ): Promise<BancolombiaTransferRegistryResponse> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        throw new Error('No se encontraron credenciales para la conexion');
      }

      const baseUrl = getBancolombiaBaseUrl(credentials.environment);
      const token = await this.getAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.environment,
      );

      const response = await fetch(`${baseUrl}${TRANSFER_REGISTRY_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...params,
          commerceTransferButtonId: params.commerceTransferButtonId || credentials.commerceTransferButtonId,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Bancolombia respondio HTTP ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const transferData = (data.data ?? data) as Record<string, unknown>;

      return {
        transferCode: String(transferData.transferCode ?? transferData.transfer_code ?? ''),
        redirectURL: String(transferData.redirectURL ?? transferData.redirect_url ?? ''),
        transferState: String(transferData.transferState ?? transferData.transfer_state ?? 'pending'),
        transferReference: String(transferData.transferReference ?? transferData.transfer_reference ?? params.transferReference),
        transferAmount: Number(transferData.transferAmount ?? transferData.transfer_amount ?? params.transferAmount),
      };
    } catch (err) {
      console.error('[Bancolombia] Error en registerTransferIntention:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // Validacion de transferencia
  // ----------------------------------------------------------

  /**
   * Valida el estado de una transferencia en Bancolombia.
   * GET a {baseUrl}/.../transfer/{transferCode}/action/validate con Bearer token.
   */
  async validateTransfer(
    connectionId: string,
    transferCode: string,
  ): Promise<BancolombiaTransferValidateResponse> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        throw new Error('No se encontraron credenciales para la conexion');
      }

      const baseUrl = getBancolombiaBaseUrl(credentials.environment);
      const token = await this.getAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.environment,
      );

      const response = await fetch(
        `${baseUrl}${TRANSFER_VALIDATE_PATH}/${transferCode}/action/validate`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Bancolombia respondio HTTP ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const transferData = (data.data ?? data) as Record<string, unknown>;

      return {
        transferCode: String(transferData.transferCode ?? transferData.transfer_code ?? transferCode),
        transferState: String(transferData.transferState ?? transferData.transfer_state ?? 'pending'),
        transferReference: String(transferData.transferReference ?? transferData.transfer_reference ?? ''),
        transferAmount: Number(transferData.transferAmount ?? transferData.transfer_amount ?? 0),
        transactionId: transferData.transactionId as string | undefined,
      };
    } catch (err) {
      console.error('[Bancolombia] Error en validateTransfer:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // Reembolso (refund)
  // ----------------------------------------------------------

  /**
   * Solicita un reembolso de una transferencia en Bancolombia.
   * POST a {baseUrl}/.../refund con Bearer token.
   */
  async refundTransfer(
    connectionId: string,
    params: BancolombiaRefundRequest,
  ): Promise<BancolombiaRefundResponse> {
    try {
      const credentials = await this.getCredentials(connectionId);
      if (!credentials) {
        throw new Error('No se encontraron credenciales para la conexion');
      }

      const baseUrl = getBancolombiaBaseUrl(credentials.environment);
      const token = await this.getAccessToken(
        credentials.clientId,
        credentials.clientSecret,
        credentials.environment,
      );

      const response = await fetch(`${baseUrl}${REFUND_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Bancolombia respondio HTTP ${response.status}: ${errorBody}`);
      }

      const data = (await response.json()) as Record<string, unknown>;
      const refundData = (data.data ?? data) as Record<string, unknown>;

      return {
        refundCode: String(refundData.refundCode ?? refundData.refund_code ?? ''),
        refundState: String(refundData.refundState ?? refundData.refund_state ?? 'pending'),
        refundAmount: Number(refundData.refundAmount ?? refundData.refund_amount ?? params.refundAmount),
      };
    } catch (err) {
      console.error('[Bancolombia] Error en refundTransfer:', err);
      throw err;
    }
  }

  // ----------------------------------------------------------
  // Notificacion JWT — Verificacion
  // ----------------------------------------------------------

  /**
   * Verifica la firma de un JWT de notificacion de Bancolombia.
   * En sandbox puede usar HS256 con client_secret como clave.
   * En produccion usa RS256 con clave publica del partner.
   * Retorna false si la verificacion falla (manejo graceful).
   */
  verifyJwtNotification(token: string, clientSecret: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.error('[Bancolombia] JWT mal formado');
        return false;
      }

      const [headerB64, payloadB64, signatureB64] = parts;

      // Decodificar header para determinar algoritmo
      const headerJson = Buffer.from(headerB64, 'base64url').toString('utf8');
      const header = JSON.parse(headerJson) as { alg: string; typ?: string };

      const signedContent = `${headerB64}.${payloadB64}`;

      // HS256: usa client_secret como clave simetrica (sandbox)
      if (header.alg === 'HS256') {
        const expectedSignature = crypto
          .createHmac('sha256', clientSecret)
          .update(signedContent)
          .digest('base64url');

        // Comparacion segura contra timing attacks
        return crypto.timingSafeEqual(
          Buffer.from(expectedSignature),
          Buffer.from(signatureB64),
        );
      }

      // RS256: requiere clave publica del partner (no disponible en sandbox)
      // Para produccion, la clave publica deberia obtenerse de configuracion
      console.error('[Bancolombia] Algoritmo JWT no soportado sin clave publica:', header.alg);
      return false;
    } catch (err) {
      console.error('[Bancolombia] Error verificando JWT de notificacion:', err);
      return false;
    }
  }

  /**
   * Decodifica el payload de un JWT sin verificar la firma.
   * Usar despues de verifyJwtNotification para obtener el contenido.
   */
  decodeJwtPayload(token: string): BancolombiaWebhookPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      return JSON.parse(payloadJson) as BancolombiaWebhookPayload;
    } catch (err) {
      console.error('[Bancolombia] Error decodificando JWT:', err);
      return null;
    }
  }

  // ----------------------------------------------------------
  // Webhook — Procesamiento
  // ----------------------------------------------------------

  /**
   * Procesa una notificacion webhook de Bancolombia.
   * Busca payment_qr_session por transferReference y actualiza segun el estado.
   */
  async processWebhook(
    connectionId: string,
    payload: BancolombiaWebhookPayload,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const supabase = getSupabaseAdmin();

      const reference = payload.transferReference;

      if (!reference) {
        return {
          success: false,
          message: 'No se encontro transferReference en el payload',
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

      // Si el estado es approved, confirmar el pago
      if (payload.transferState === 'approved') {
        const result = await confirmQrPayment({
          qrSessionId: session.id,
          organizationId: session.organization_id,
          status: 'paid',
          externalQrId: payload.transferCode,
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

      // Si el estado es rejected, marcar sesion como rejected
      if (payload.transferState === 'rejected') {
        const now = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('payment_qr_sessions')
          .update({
            status: 'rejected',
            updated_at: now,
          })
          .eq('id', session.id);

        if (updateError) {
          return {
            success: false,
            message: `Error al actualizar sesion: ${updateError.message}`,
          };
        }

        return { success: true, message: 'Sesion marcada como rejected' };
      }

      // Estado no accionable (pending)
      return {
        success: true,
        message: `Estado ${payload.transferState} no requiere accion`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[Bancolombia] Error en processWebhook:', err);
      return { success: false, message };
    }
  }
}

export const bancolombiaService = new BancolombiaService();
export default bancolombiaService;
