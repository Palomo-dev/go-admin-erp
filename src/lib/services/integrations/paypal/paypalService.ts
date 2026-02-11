// ============================================================
// Servicio PayPal para CLIENTES de GO Admin ERP
// Cada cliente usa SUS PROPIAS credenciales de PayPal
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { PAYPAL_CREDENTIAL_PURPOSES, getPayPalApiUrl } from './paypalConfig';
import type {
  PayPalCredentials,
  PayPalAccessToken,
  CreateOrderParams,
  PayPalOrderResult,
  PayPalCaptureResult,
  CreateRefundParams,
  PayPalRefundResult,
  PayPalWebhookVerifyParams,
  PayPalHealthCheckResult,
} from './paypalTypes';

class PayPalService {
  // Cache de tokens por clientId para no pedir uno nuevo en cada request
  private tokenCache: Map<string, PayPalAccessToken> = new Map();

  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de PayPal para una conexión */
  async getCredentials(connectionId: string): Promise<PayPalCredentials | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref')
      .eq('connection_id', connectionId);

    if (error || !data || data.length === 0) return null;

    const creds: PayPalCredentials = {
      clientId: '',
      clientSecret: '',
      webhookId: '',
    };

    for (const row of data) {
      switch (row.purpose) {
        case PAYPAL_CREDENTIAL_PURPOSES.CLIENT_ID:
          creds.clientId = row.secret_ref || '';
          break;
        case PAYPAL_CREDENTIAL_PURPOSES.CLIENT_SECRET:
          creds.clientSecret = row.secret_ref || '';
          break;
        case PAYPAL_CREDENTIAL_PURPOSES.WEBHOOK_ID:
          creds.webhookId = row.secret_ref || '';
          break;
      }
    }

    return creds;
  }

  /** Guardar credenciales de PayPal para una conexión */
  async saveCredentials(
    connectionId: string,
    credentials: PayPalCredentials
  ): Promise<boolean> {
    const entries = [
      { purpose: PAYPAL_CREDENTIAL_PURPOSES.CLIENT_ID, value: credentials.clientId },
      { purpose: PAYPAL_CREDENTIAL_PURPOSES.CLIENT_SECRET, value: credentials.clientSecret },
      { purpose: PAYPAL_CREDENTIAL_PURPOSES.WEBHOOK_ID, value: credentials.webhookId },
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
            credential_type: 'oauth2',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) {
          console.error(`Error updating PayPal credential ${entry.purpose}:`, error);
          return false;
        }
      } else {
        const { error } = await supabase
          .from('integration_credentials')
          .insert({
            connection_id: connectionId,
            credential_type: 'oauth2',
            purpose: entry.purpose,
            secret_ref: entry.value,
          });

        if (error) {
          console.error(`Error inserting PayPal credential ${entry.purpose}:`, error);
          return false;
        }
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // OAuth 2.0 – Access Token
  // ──────────────────────────────────────────────

  /** Obtener access token (con cache) */
  async getAccessToken(
    clientId: string,
    clientSecret: string,
    isSandbox: boolean = true
  ): Promise<string> {
    // Revisar cache
    const cached = this.tokenCache.get(clientId);
    if (cached && Date.now() < cached.expiresAt - 60000) {
      return cached.accessToken;
    }

    const baseUrl = getPayPalApiUrl(isSandbox);
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `PayPal OAuth error: ${response.status} - ${errorData.error_description || response.statusText}`
      );
    }

    const data = await response.json();

    const token: PayPalAccessToken = {
      accessToken: data.access_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    this.tokenCache.set(clientId, token);
    return token.accessToken;
  }

  // ──────────────────────────────────────────────
  // Orders
  // ──────────────────────────────────────────────

  /** Crear una orden */
  async createOrder(
    credentials: PayPalCredentials,
    params: CreateOrderParams,
    isSandbox: boolean = true
  ): Promise<PayPalOrderResult> {
    const accessToken = await this.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      isSandbox
    );

    const baseUrl = getPayPalApiUrl(isSandbox);

    const body: Record<string, unknown> = {
      intent: params.intent,
      purchase_units: params.purchaseUnits,
    };

    if (params.brandName || params.returnUrl || params.cancelUrl) {
      body.application_context = {
        brand_name: params.brandName,
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      };
    }

    const response = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `PayPal create order error: ${response.status} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();
    return {
      id: data.id,
      status: data.status,
      links: data.links || [],
    };
  }

  /** Capturar una orden aprobada */
  async captureOrder(
    credentials: PayPalCredentials,
    orderId: string,
    isSandbox: boolean = true
  ): Promise<PayPalCaptureResult> {
    const accessToken = await this.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      isSandbox
    );

    const baseUrl = getPayPalApiUrl(isSandbox);

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `PayPal capture error: ${response.status} - ${JSON.stringify(errorData)}`
      );
    }

    const data = await response.json();
    return {
      id: data.id,
      status: data.status,
      purchaseUnits: (data.purchase_units || []).map((pu: Record<string, unknown>) => ({
        referenceId: pu.reference_id,
        payments: pu.payments,
      })),
      payer: data.payer,
    };
  }

  /** Consultar una orden */
  async getOrder(
    credentials: PayPalCredentials,
    orderId: string,
    isSandbox: boolean = true
  ): Promise<Record<string, unknown>> {
    const accessToken = await this.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      isSandbox
    );

    const baseUrl = getPayPalApiUrl(isSandbox);

    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`PayPal get order error: ${response.status}`);
    }

    return response.json();
  }

  // ──────────────────────────────────────────────
  // Reembolsos
  // ──────────────────────────────────────────────

  /** Crear un reembolso */
  async createRefund(
    credentials: PayPalCredentials,
    params: CreateRefundParams,
    isSandbox: boolean = true
  ): Promise<PayPalRefundResult> {
    const accessToken = await this.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      isSandbox
    );

    const baseUrl = getPayPalApiUrl(isSandbox);

    const body: Record<string, unknown> = {};
    if (params.amount) body.amount = params.amount;
    if (params.noteToPayer) body.note_to_payer = params.noteToPayer;

    const response = await fetch(
      `${baseUrl}/v2/payments/captures/${params.captureId}/refund`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`PayPal refund error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return {
      id: data.id,
      status: data.status,
      amount: data.amount,
    };
  }

  // ──────────────────────────────────────────────
  // Webhooks
  // ──────────────────────────────────────────────

  /** Verificar firma de webhook vía API de PayPal */
  async verifyWebhookSignature(
    credentials: PayPalCredentials,
    params: PayPalWebhookVerifyParams,
    isSandbox: boolean = true
  ): Promise<boolean> {
    const accessToken = await this.getAccessToken(
      credentials.clientId,
      credentials.clientSecret,
      isSandbox
    );

    const baseUrl = getPayPalApiUrl(isSandbox);

    const response = await fetch(
      `${baseUrl}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          auth_algo: params.authAlgo,
          cert_url: params.certUrl,
          transmission_id: params.transmissionId,
          transmission_sig: params.transmissionSig,
          transmission_time: params.transmissionTime,
          webhook_id: params.webhookId,
          webhook_event: params.webhookEvent,
        }),
      }
    );

    if (!response.ok) return false;

    const data = await response.json();
    return data.verification_status === 'SUCCESS';
  }

  // ──────────────────────────────────────────────
  // Health Check
  // ──────────────────────────────────────────────

  /** Verificar que las credenciales son válidas obteniendo un access token */
  async healthCheck(
    clientId: string,
    clientSecret: string,
    isSandbox: boolean = true
  ): Promise<PayPalHealthCheckResult> {
    try {
      await this.getAccessToken(clientId, clientSecret, isSandbox);
      return {
        valid: true,
        message: `Credenciales válidas. Cuenta PayPal ${isSandbox ? 'sandbox' : 'producción'}.`,
        sandbox: isSandbox,
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : 'Error al verificar credenciales',
      };
    }
  }
}

export const paypalService = new PayPalService();
