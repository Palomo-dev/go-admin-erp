// ============================================================
// Servicio principal de PayU Latam
// Encapsula la lógica de API, credenciales, pagos y webhooks
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { PAYU_API_URLS, PAYU_CREDENTIAL_PURPOSES } from './payuConfig';
import type {
  PayUCredentials,
  PayURequest,
  PayUApiResponse,
  PayUPaymentMethodsResponse,
  PayUBanksResponse,
  PayUPingResponse,
  PayUOrderDetailResponse,
  PayUTransaction,
  PayUWebhookPayload,
} from './payuTypes';
import crypto from 'crypto';

class PayUService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de PayU para una conexión */
  async getCredentials(connectionId: string): Promise<PayUCredentials | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref')
      .eq('connection_id', connectionId);

    if (error || !data || data.length === 0) return null;

    const creds: PayUCredentials = {
      apiKey: '',
      apiLogin: '',
      merchantId: '',
      accountId: '',
    };

    for (const row of data) {
      switch (row.purpose) {
        case PAYU_CREDENTIAL_PURPOSES.API_KEY:
          creds.apiKey = row.secret_ref || '';
          break;
        case PAYU_CREDENTIAL_PURPOSES.API_LOGIN:
          creds.apiLogin = row.secret_ref || '';
          break;
        case PAYU_CREDENTIAL_PURPOSES.MERCHANT_ID:
          creds.merchantId = row.secret_ref || '';
          break;
        case PAYU_CREDENTIAL_PURPOSES.ACCOUNT_ID:
          creds.accountId = row.secret_ref || '';
          break;
      }
    }

    return creds;
  }

  /** Guardar credenciales de PayU para una conexión */
  async saveCredentials(connectionId: string, credentials: PayUCredentials): Promise<boolean> {
    const entries = [
      { purpose: PAYU_CREDENTIAL_PURPOSES.API_KEY, value: credentials.apiKey },
      { purpose: PAYU_CREDENTIAL_PURPOSES.API_LOGIN, value: credentials.apiLogin },
      { purpose: PAYU_CREDENTIAL_PURPOSES.MERCHANT_ID, value: credentials.merchantId },
      { purpose: PAYU_CREDENTIAL_PURPOSES.ACCOUNT_ID, value: credentials.accountId },
    ];

    for (const entry of entries) {
      if (!entry.value) continue;

      const { data: existing } = await supabase
        .from('integration_credentials')
        .select('id')
        .eq('connection_id', connectionId)
        .eq('purpose', entry.purpose)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('integration_credentials')
          .update({
            secret_ref: entry.value,
            credential_type: 'api_key',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`Error updating PayU credential ${entry.purpose}:`, error);
          return false;
        }
      } else {
        const { error } = await supabase
          .from('integration_credentials')
          .insert({
            connection_id: connectionId,
            credential_type: 'api_key',
            purpose: entry.purpose,
            secret_ref: entry.value,
          });

        if (error) {
          console.error(`Error inserting PayU credential ${entry.purpose}:`, error);
          return false;
        }
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /** Determinar URL base según ambiente */
  private getApiUrl(isTest: boolean, type: 'payments' | 'reports' = 'payments'): string {
    return isTest ? PAYU_API_URLS.sandbox[type] : PAYU_API_URLS.production[type];
  }

  /** Generar firma MD5: ApiKey~merchantId~referenceCode~tx_value~currency */
  generateSignature(
    apiKey: string,
    merchantId: string,
    referenceCode: string,
    txValue: number,
    currency: string
  ): string {
    // PayU puede usar hasta 1 decimal; usar el valor tal cual
    const valueStr = txValue % 1 === 0 ? `${txValue}.0` : `${txValue}`;
    const raw = `${apiKey}~${merchantId}~${referenceCode}~${valueStr}~${currency}`;
    return crypto.createHash('md5').update(raw).digest('hex');
  }

  /** Llamada genérica a la API de PayU */
  private async callApi<T>(url: string, body: PayURequest): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`PayU API error (HTTP ${response.status})`);
    }

    return response.json();
  }

  // ──────────────────────────────────────────────
  // Pagos
  // ──────────────────────────────────────────────

  /** Crear un pago */
  async createPayment(
    credentials: PayUCredentials,
    transaction: PayUTransaction,
    isTest: boolean = false
  ): Promise<PayUApiResponse> {
    const url = this.getApiUrl(isTest);

    const body: PayURequest = {
      language: 'es',
      command: 'SUBMIT_TRANSACTION',
      merchant: {
        apiKey: credentials.apiKey,
        apiLogin: credentials.apiLogin,
      },
      transaction,
      test: isTest,
    };

    return this.callApi<PayUApiResponse>(url, body);
  }

  // ──────────────────────────────────────────────
  // Consultas
  // ──────────────────────────────────────────────

  /** Consultar orden por ID */
  async getOrderById(
    credentials: PayUCredentials,
    orderId: number,
    isTest: boolean = false
  ): Promise<PayUOrderDetailResponse> {
    const url = this.getApiUrl(isTest, 'reports');

    const body: PayURequest = {
      language: 'es',
      command: 'ORDER_DETAIL',
      merchant: {
        apiKey: credentials.apiKey,
        apiLogin: credentials.apiLogin,
      },
      details: { orderId },
      test: isTest,
    };

    return this.callApi<PayUOrderDetailResponse>(url, body);
  }

  /** Consultar orden por referenceCode */
  async getOrderByReference(
    credentials: PayUCredentials,
    referenceCode: string,
    isTest: boolean = false
  ): Promise<PayUOrderDetailResponse> {
    const url = this.getApiUrl(isTest, 'reports');

    const body: PayURequest = {
      language: 'es',
      command: 'ORDER_DETAIL_BY_REFERENCE_CODE',
      merchant: {
        apiKey: credentials.apiKey,
        apiLogin: credentials.apiLogin,
      },
      details: { referenceCode },
      test: isTest,
    };

    return this.callApi<PayUOrderDetailResponse>(url, body);
  }

  // ──────────────────────────────────────────────
  // Reembolsos
  // ──────────────────────────────────────────────

  /** Crear un reembolso */
  async createRefund(
    credentials: PayUCredentials,
    orderId: number,
    parentTransactionId: string,
    reason: string,
    amount?: number,
    currency?: string,
    isTest: boolean = false
  ): Promise<PayUApiResponse> {
    const url = this.getApiUrl(isTest);

    const transaction: Record<string, unknown> = {
      order: { id: orderId },
      type: 'REFUND',
      reason,
      parentTransactionId,
    };

    // Reembolso parcial
    if (amount && currency) {
      transaction.additionalValues = {
        TX_VALUE: { value: amount, currency },
      };
    }

    const body: PayURequest = {
      language: 'es',
      command: 'SUBMIT_TRANSACTION',
      merchant: {
        apiKey: credentials.apiKey,
        apiLogin: credentials.apiLogin,
      },
      transaction: transaction as unknown as PayUTransaction,
      test: isTest,
    };

    return this.callApi<PayUApiResponse>(url, body);
  }

  // ──────────────────────────────────────────────
  // Métodos de Pago
  // ──────────────────────────────────────────────

  /** Listar métodos de pago disponibles */
  async getPaymentMethods(
    credentials: PayUCredentials,
    isTest: boolean = false
  ): Promise<PayUPaymentMethodsResponse> {
    const url = this.getApiUrl(isTest);

    const body: PayURequest = {
      language: 'es',
      command: 'GET_PAYMENT_METHODS',
      merchant: {
        apiKey: credentials.apiKey,
        apiLogin: credentials.apiLogin,
      },
      test: isTest,
    };

    return this.callApi<PayUPaymentMethodsResponse>(url, body);
  }

  /** Listar bancos PSE */
  async getPSEBanks(
    credentials: PayUCredentials,
    isTest: boolean = false
  ): Promise<PayUBanksResponse> {
    const url = this.getApiUrl(isTest);

    const body: PayURequest = {
      language: 'es',
      command: 'GET_BANKS_LIST',
      merchant: {
        apiKey: credentials.apiKey,
        apiLogin: credentials.apiLogin,
      },
      bankListInformation: {
        paymentMethod: 'PSE',
        paymentCountry: 'CO',
      },
      test: isTest,
    };

    return this.callApi<PayUBanksResponse>(url, body);
  }

  // ──────────────────────────────────────────────
  // Webhooks
  // ──────────────────────────────────────────────

  /** Verificar firma del webhook de PayU */
  verifyWebhookSignature(
    apiKey: string,
    merchantId: string,
    payload: PayUWebhookPayload
  ): boolean {
    try {
      const { reference_sale, value, currency, state_pol, sign } = payload;
      if (!sign || !reference_sale || !value || !currency || !state_pol) return false;

      // PayU redondea el value con 1 decimal usando HALF_UP
      const numValue = parseFloat(value);
      const roundedValue = numValue % 1 === 0 ? `${numValue}.0` : `${numValue}`;

      const raw = `${apiKey}~${merchantId}~${reference_sale}~${roundedValue}~${currency}~${state_pol}`;
      const calculated = crypto.createHash('md5').update(raw).digest('hex');

      return calculated === sign;
    } catch {
      return false;
    }
  }

  /** Parsear webhook payload (puede venir como form-urlencoded o JSON) */
  parseWebhookPayload(body: unknown): PayUWebhookPayload | null {
    const payload = body as PayUWebhookPayload;
    if (!payload?.merchant_id || !payload?.state_pol || !payload?.reference_sale) {
      return null;
    }
    return payload;
  }

  // ──────────────────────────────────────────────
  // Health Check (PING)
  // ──────────────────────────────────────────────

  /** Verificar que las credenciales son válidas con PING */
  async healthCheck(
    credentials: PayUCredentials,
    isTest: boolean = false
  ): Promise<{ valid: boolean; message: string }> {
    try {
      const url = this.getApiUrl(isTest);

      const body: PayURequest = {
        language: 'es',
        command: 'PING',
        merchant: {
          apiKey: credentials.apiKey,
          apiLogin: credentials.apiLogin,
        },
        test: isTest,
      };

      const result = await this.callApi<PayUPingResponse>(url, body);

      if (result.code === 'SUCCESS') {
        return { valid: true, message: 'Credenciales válidas. Conexión con PayU exitosa.' };
      }

      return { valid: false, message: result.error || 'Credenciales inválidas' };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Error al verificar credenciales',
      };
    }
  }
}

export const payuService = new PayUService();
