// ============================================================
// Bold Colombia — Servicio principal
// ============================================================

import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getBoldIntegrationsBaseUrl, getBoldPaymentsBaseUrl } from './boldConfig';
import { confirmQrPayment } from '../qrShared/paymentConfirmation';
import { getQrSessionByReference } from '../qrShared/qrSessionService';
import type {
  BoldCredentials,
  BoldEnvironment,
  BoldCreateLinkRequest,
  BoldCreateLinkResponse,
  BoldLinkStatusResponse,
  BoldPaymentMethodsResponse,
  BoldPosPaymentMethodsResponse,
  BoldTerminalsResponse,
  BoldCreatePosPaymentRequest,
  BoldCreatePosPaymentResponse,
  BoldTransactionResponse,
  BoldWebhookEvent,
  BoldHealthCheckResult,
} from './boldTypes';

class BoldService {
  // ----------------------------------------------------------
  // Credenciales
  // ----------------------------------------------------------

  /**
   * Obtiene las credenciales de Bold para una conexion.
   * Lee de integration_credentials vinculadas al connection_id
   * usando el cliente admin (service role).
   */
  async getCredentials(connectionId: string): Promise<BoldCredentials | null> {
    const supabase = getSupabaseAdmin();

    const { data: connection, error: connError } = await supabase
      .from('integration_connections')
      .select('environment')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      console.error('[Bold] Error obteniendo conexion:', connError);
      return null;
    }

    const { data: creds, error } = await supabase
      .from('integration_credentials')
      .select('credential_type, purpose, secret_ref, key_prefix, status')
      .eq('connection_id', connectionId)
      .eq('status', 'active');

    if (error || !creds || creds.length === 0) {
      console.error('[Bold] Error obteniendo credenciales:', error);
      return null;
    }

    const findCred = (purpose: string) =>
      creds.find((c) => c.purpose === purpose)?.secret_ref || '';

    return {
      identityKey: findCred('identity_key'),
      secretKey: findCred('secret_key'),
      environment: (connection.environment as BoldEnvironment) || 'sandbox',
    };
  }

  // ----------------------------------------------------------
  // Helpers internos
  // ----------------------------------------------------------

  /**
   * Construye los headers de autenticacion para las peticiones a Bold.
   */
  private buildAuthHeaders(credentials: BoldCredentials): Record<string, string> {
    return {
      Authorization: `x-api-key ${credentials.identityKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Ejecuta una peticion HTTP a la API de Bold y parsea la respuesta JSON.
   */
  private async request<T>(
    url: string,
    credentials: BoldCredentials,
    options: RequestInit = {},
  ): Promise<T> {
    const headers = this.buildAuthHeaders(credentials);
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `[Bold] ${options.method || 'GET'} ${url} -> ${response.status}: ${text}`,
      );
    }

    return response.json() as Promise<T>;
  }

  // ----------------------------------------------------------
  // API Link — metodos de pago y limites
  // ----------------------------------------------------------

  /**
   * Obtiene los metodos de pago disponibles y sus limites (API Link).
   */
  async getPaymentMethods(
    connectionId: string,
  ): Promise<BoldPaymentMethodsResponse | null> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return null;
    }

    const baseUrl = getBoldIntegrationsBaseUrl();
    return this.request<BoldPaymentMethodsResponse>(
      `${baseUrl}/online/link/v1/payment_methods`,
      credentials,
    );
  }

  // ----------------------------------------------------------
  // API Link — crear y consultar links de pago
  // ----------------------------------------------------------

  /**
   * Crea un link de pago (API Link).
   */
  async createPaymentLink(
    connectionId: string,
    request: BoldCreateLinkRequest,
  ): Promise<BoldCreateLinkResponse | null> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return null;
    }

    const baseUrl = getBoldIntegrationsBaseUrl();
    return this.request<BoldCreateLinkResponse>(
      `${baseUrl}/online/link/v1`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    );
  }

  /**
   * Consulta el estado de un link de pago por su ID (API Link).
   */
  async getPaymentLinkStatus(
    connectionId: string,
    linkId: string,
  ): Promise<BoldLinkStatusResponse | null> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return null;
    }

    const baseUrl = getBoldIntegrationsBaseUrl();
    return this.request<BoldLinkStatusResponse>(
      `${baseUrl}/online/link/v1/${linkId}`,
      credentials,
    );
  }

  // ----------------------------------------------------------
  // API Integrations — datáfono
  // ----------------------------------------------------------

  /**
   * Obtiene los metodos de pago disponibles para datáfono (API Integrations).
   */
  async getPosPaymentMethods(
    connectionId: string,
  ): Promise<BoldPosPaymentMethodsResponse | null> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return null;
    }

    const baseUrl = getBoldIntegrationsBaseUrl();
    return this.request<BoldPosPaymentMethodsResponse>(
      `${baseUrl}/payments/payment-methods`,
      credentials,
    );
  }

  /**
   * Obtiene los terminales (datáfonos) vinculados (API Integrations).
   */
  async getTerminals(
    connectionId: string,
  ): Promise<BoldTerminalsResponse | null> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return null;
    }

    const baseUrl = getBoldIntegrationsBaseUrl();
    return this.request<BoldTerminalsResponse>(
      `${baseUrl}/payments/binded-terminals`,
      credentials,
    );
  }

  /**
   * Crea un pago en el datáfono via app-checkout (API Integrations).
   */
  async createPosPayment(
    connectionId: string,
    request: BoldCreatePosPaymentRequest,
  ): Promise<BoldCreatePosPaymentResponse | null> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return null;
    }

    const baseUrl = getBoldIntegrationsBaseUrl();
    return this.request<BoldCreatePosPaymentResponse>(
      `${baseUrl}/payments/app-checkout`,
      credentials,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    );
  }

  // ----------------------------------------------------------
  // Consulta de transacciones (payments.api.bold.co)
  // ----------------------------------------------------------

  /**
   * Consulta el estado de una transaccion por su ID.
   */
  async getTransactionStatus(
    connectionId: string,
    transactionId: string,
  ): Promise<BoldTransactionResponse | null> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return null;
    }

    const baseUrl = getBoldPaymentsBaseUrl();
    return this.request<BoldTransactionResponse>(
      `${baseUrl}/v2/payment-voucher/${transactionId}`,
      credentials,
    );
  }

  // ----------------------------------------------------------
  // Webhook — verificacion de firma y procesamiento
  // ----------------------------------------------------------

  /**
   * Verifica la firma del webhook de Bold.
   * La firma es HMAC-SHA256 del body (raw) usando la llave secreta,
   * con el resultado expresado en hexadecimal.
   *
   * @param rawBody Body crudo de la peticion (string o Buffer).
   * @param signature Valor del header x-bold-signature (hex).
   * @param secretKey Llave secreta de la conexion.
   * @returns true si la firma es valida.
   */
  verifyWebhookSignature(
    rawBody: string | Buffer,
    signature: string,
    secretKey: string,
  ): boolean {
    if (!secretKey || !signature) {
      return false;
    }

    const bodyBuffer = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    const expected = crypto
      .createHmac('sha256', secretKey)
      .update(bodyBuffer)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature, 'hex'),
      );
    } catch {
      return false;
    }
  }

  /**
   * Procesa un evento de webhook de Bold.
   * Mapea SALE_APPROVED -> confirmQrPayment buscando la sesion QR por referencia.
   *
   * @param event Evento CloudEvents recibido de Bold.
   * @param connectionId ID de la conexion de integracion.
   * @returns Resultado de la confirmacion del pago.
   */
  async processWebhook(
    event: BoldWebhookEvent,
    connectionId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Solo procesamos aprobaciones de venta
      if (event.type !== 'SALE_APPROVED') {
        console.log(`[Bold] Webhook tipo ${event.type} ignorado (no es SALE_APPROVED)`);
        return { success: true };
      }

      const reference = event.data.metadata?.reference;
      if (!reference) {
        return { success: false, error: 'Webhook sin reference en metadata' };
      }

      // Buscar la sesion QR por referencia.
      // Se requiere organizationId; se obtiene desde la conexion.
      const supabase = getSupabaseAdmin();
      const { data: connection, error: connError } = await supabase
        .from('integration_connections')
        .select('organization_id')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        return {
          success: false,
          error: `Conexion no encontrada: ${connError?.message ?? 'desconocido'}`,
        };
      }

      const organizationId = connection.organization_id as number;
      const session = await getQrSessionByReference(organizationId, reference);
      if (!session) {
        return {
          success: false,
          error: `Sesion QR no encontrada para reference: ${reference}`,
        };
      }

      const result = await confirmQrPayment({
        qrSessionId: session.id,
        organizationId,
        status: 'paid',
        externalQrId: event.data.payment_id,
        providerResponse: event as unknown as Record<string, unknown>,
      });

      if (!result.success) {
        return { success: false, error: result.error };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[Bold] Excepcion procesando webhook:', err);
      return { success: false, error: message };
    }
  }

  // ----------------------------------------------------------
  // Health check
  // ----------------------------------------------------------

  /**
   * Valida que las credenciales de la conexion sean correctas
   * consultando los metodos de pago disponibles.
   */
  async healthCheck(connectionId: string): Promise<BoldHealthCheckResult> {
    const credentials = await this.getCredentials(connectionId);
    if (!credentials) {
      return {
        healthy: false,
        environment: 'sandbox',
        error: 'No se pudieron obtener las credenciales',
      };
    }

    try {
      const methods = await this.getPaymentMethods(connectionId);
      return {
        healthy: true,
        environment: credentials.environment,
        payment_methods_count: methods?.payment_methods?.length ?? 0,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        healthy: false,
        environment: credentials.environment,
        error: message,
      };
    }
  }
}

// Instancia singleton exportada
export const boldService = new BoldService();
export { BoldService };
