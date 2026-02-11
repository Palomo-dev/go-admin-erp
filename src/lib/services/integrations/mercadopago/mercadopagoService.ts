// ============================================================
// Servicio principal de MercadoPago
// Encapsula la lógica de API, credenciales, pagos y webhooks
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { MERCADOPAGO_API_BASE, MERCADOPAGO_CREDENTIAL_PURPOSES } from './mercadopagoConfig';
import type {
  MercadoPagoCredentials,
  CreatePaymentRequest,
  PaymentResponse,
  PaymentMethod,
  RefundResponse,
  CreatePreferenceRequest,
  PreferenceResponse,
  WebhookNotification,
} from './mercadopagoTypes';
import crypto from 'crypto';

class MercadoPagoService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de MercadoPago para una conexión */
  async getCredentials(connectionId: string): Promise<MercadoPagoCredentials | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref')
      .eq('connection_id', connectionId);

    if (error || !data || data.length === 0) return null;

    const creds: MercadoPagoCredentials = {
      publicKey: '',
      accessToken: '',
      webhookSecret: '',
    };

    for (const row of data) {
      switch (row.purpose) {
        case MERCADOPAGO_CREDENTIAL_PURPOSES.PUBLIC_KEY:
          creds.publicKey = row.secret_ref || '';
          break;
        case MERCADOPAGO_CREDENTIAL_PURPOSES.ACCESS_TOKEN:
          creds.accessToken = row.secret_ref || '';
          break;
        case MERCADOPAGO_CREDENTIAL_PURPOSES.WEBHOOK_SECRET:
          creds.webhookSecret = row.secret_ref || '';
          break;
      }
    }

    return creds;
  }

  /** Guardar credenciales de MercadoPago para una conexión */
  async saveCredentials(connectionId: string, credentials: MercadoPagoCredentials): Promise<boolean> {
    const entries = [
      { purpose: MERCADOPAGO_CREDENTIAL_PURPOSES.PUBLIC_KEY, value: credentials.publicKey },
      { purpose: MERCADOPAGO_CREDENTIAL_PURPOSES.ACCESS_TOKEN, value: credentials.accessToken },
      { purpose: MERCADOPAGO_CREDENTIAL_PURPOSES.WEBHOOK_SECRET, value: credentials.webhookSecret },
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
          console.error(`Error updating MP credential ${entry.purpose}:`, error);
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
          console.error(`Error inserting MP credential ${entry.purpose}:`, error);
          return false;
        }
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // Pagos
  // ──────────────────────────────────────────────

  /** Crear un pago */
  async createPayment(
    accessToken: string,
    paymentData: CreatePaymentRequest
  ): Promise<PaymentResponse> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(paymentData),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `MercadoPago createPayment failed (${response.status}): ${errorBody?.message || response.statusText}`
      );
    }

    return response.json();
  }

  /** Consultar un pago por ID */
  async getPayment(accessToken: string, paymentId: string): Promise<PaymentResponse> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`MercadoPago getPayment failed (${response.status})`);
    }

    return response.json();
  }

  /** Cancelar un pago pendiente */
  async cancelPayment(accessToken: string, paymentId: string): Promise<PaymentResponse> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payments/${paymentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });

    if (!response.ok) {
      throw new Error(`MercadoPago cancelPayment failed (${response.status})`);
    }

    return response.json();
  }

  // ──────────────────────────────────────────────
  // Reembolsos
  // ──────────────────────────────────────────────

  /** Crear un reembolso (total si no se pasa amount, parcial si se pasa) */
  async createRefund(
    accessToken: string,
    paymentId: string,
    amount?: number
  ): Promise<RefundResponse> {
    const body = amount ? { amount } : {};

    const response = await fetch(
      `${MERCADOPAGO_API_BASE}/v1/payments/${paymentId}/refunds`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `MercadoPago createRefund failed (${response.status}): ${errorBody?.message || response.statusText}`
      );
    }

    return response.json();
  }

  // ──────────────────────────────────────────────
  // Métodos de Pago
  // ──────────────────────────────────────────────

  /** Listar métodos de pago disponibles */
  async getPaymentMethods(accessToken: string): Promise<PaymentMethod[]> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payment_methods`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`MercadoPago getPaymentMethods failed (${response.status})`);
    }

    return response.json();
  }

  /** Obtener instituciones financieras para PSE */
  async getPSEInstitutions(accessToken: string): Promise<PaymentMethod | null> {
    const methods = await this.getPaymentMethods(accessToken);
    return methods.find((m) => m.id === 'pse') || null;
  }

  // ──────────────────────────────────────────────
  // Checkout Pro (Preferencias)
  // ──────────────────────────────────────────────

  /** Crear una preferencia de pago (Checkout Pro) */
  async createPreference(
    accessToken: string,
    preferenceData: CreatePreferenceRequest
  ): Promise<PreferenceResponse> {
    const response = await fetch(`${MERCADOPAGO_API_BASE}/checkout/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(preferenceData),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `MercadoPago createPreference failed (${response.status}): ${errorBody?.message || response.statusText}`
      );
    }

    return response.json();
  }

  // ──────────────────────────────────────────────
  // Webhooks
  // ──────────────────────────────────────────────

  /** Verificar autenticidad de un webhook con x-signature (HMAC-SHA256) */
  verifyWebhook(
    xSignature: string,
    xRequestId: string,
    dataId: string,
    secret: string
  ): boolean {
    try {
      const parts = xSignature.split(',');
      const tsEntry = parts.find((p) => p.trim().startsWith('ts='));
      const v1Entry = parts.find((p) => p.trim().startsWith('v1='));

      if (!tsEntry || !v1Entry) return false;

      const ts = tsEntry.split('=')[1];
      const v1 = v1Entry.split('=')[1];

      // Template: id:{data.id};request-id:{x-request-id};ts:{ts};
      const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

      const calculated = crypto
        .createHmac('sha256', secret)
        .update(template)
        .digest('hex');

      return calculated === v1;
    } catch {
      return false;
    }
  }

  /** Parsear la notificación webhook */
  parseWebhookNotification(body: unknown): WebhookNotification | null {
    const notification = body as WebhookNotification;
    if (!notification?.id || !notification?.type || !notification?.data?.id) {
      return null;
    }
    return notification;
  }

  // ──────────────────────────────────────────────
  // Health Check
  // ──────────────────────────────────────────────

  /** Verificar que las credenciales son válidas consultando payment_methods */
  async healthCheck(accessToken: string): Promise<{ valid: boolean; message: string }> {
    try {
      const response = await fetch(`${MERCADOPAGO_API_BASE}/v1/payment_methods`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const methods = await response.json();
        return {
          valid: true,
          message: `Credenciales válidas. ${methods.length} métodos de pago disponibles.`,
        };
      }

      return {
        valid: false,
        message: `Access Token inválido (HTTP ${response.status})`,
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Error al verificar credenciales',
      };
    }
  }
}

export const mercadopagoService = new MercadoPagoService();
