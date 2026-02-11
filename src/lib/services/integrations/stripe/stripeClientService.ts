// ============================================================
// Servicio Stripe para CLIENTES de GO Admin ERP
// SEPARADO del servicio interno src/lib/stripe/
// Cada cliente usa SUS PROPIAS credenciales de Stripe
// ============================================================

import { supabase } from '@/lib/supabase/config';
import Stripe from 'stripe';
import { STRIPE_CLIENT_CREDENTIAL_PURPOSES } from './stripeClientConfig';
import type {
  StripeClientCredentials,
  CreatePaymentIntentParams,
  PaymentIntentResult,
  CreateCheckoutSessionParams,
  CheckoutSessionResult,
  CreateRefundParams,
  RefundResult,
  CreateCustomerParams,
  StripeCustomerResult,
  StripeHealthCheckResult,
} from './stripeClientTypes';

class StripeClientService {
  // ──────────────────────────────────────────────
  // Credenciales
  // ──────────────────────────────────────────────

  /** Obtener credenciales de Stripe para una conexión */
  async getCredentials(connectionId: string): Promise<StripeClientCredentials | null> {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('purpose, secret_ref')
      .eq('connection_id', connectionId);

    if (error || !data || data.length === 0) return null;

    const creds: StripeClientCredentials = {
      publishableKey: '',
      secretKey: '',
      webhookSecret: '',
    };

    for (const row of data) {
      switch (row.purpose) {
        case STRIPE_CLIENT_CREDENTIAL_PURPOSES.PUBLISHABLE_KEY:
          creds.publishableKey = row.secret_ref || '';
          break;
        case STRIPE_CLIENT_CREDENTIAL_PURPOSES.SECRET_KEY:
          creds.secretKey = row.secret_ref || '';
          break;
        case STRIPE_CLIENT_CREDENTIAL_PURPOSES.WEBHOOK_SECRET:
          creds.webhookSecret = row.secret_ref || '';
          break;
      }
    }

    return creds;
  }

  /** Guardar credenciales de Stripe para una conexión */
  async saveCredentials(
    connectionId: string,
    credentials: StripeClientCredentials
  ): Promise<boolean> {
    const entries = [
      { purpose: STRIPE_CLIENT_CREDENTIAL_PURPOSES.PUBLISHABLE_KEY, value: credentials.publishableKey },
      { purpose: STRIPE_CLIENT_CREDENTIAL_PURPOSES.SECRET_KEY, value: credentials.secretKey },
      { purpose: STRIPE_CLIENT_CREDENTIAL_PURPOSES.WEBHOOK_SECRET, value: credentials.webhookSecret },
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
          console.error(`Error updating Stripe credential ${entry.purpose}:`, error);
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
          console.error(`Error inserting Stripe credential ${entry.purpose}:`, error);
          return false;
        }
      }
    }

    return true;
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /** Crear instancia de Stripe con la secret key del CLIENTE */
  private createStripeInstance(secretKey: string): Stripe {
    return new Stripe(secretKey, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
      appInfo: {
        name: 'GO Admin ERP - Client Integration',
        version: '1.0.0',
      },
    });
  }

  // ──────────────────────────────────────────────
  // Payment Intents
  // ──────────────────────────────────────────────

  /** Crear un Payment Intent con credenciales del cliente */
  async createPaymentIntent(
    secretKey: string,
    params: CreatePaymentIntentParams
  ): Promise<PaymentIntentResult> {
    const stripe = this.createStripeInstance(secretKey);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: params.currency,
      description: params.description,
      customer: params.customerId,
      metadata: params.metadata,
      payment_method_types: params.paymentMethodTypes || ['card'],
      statement_descriptor: params.statementDescriptor,
      capture_method: params.captureMethod || 'automatic',
      setup_future_usage: params.setupFutureUsage,
    });

    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret || '',
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    };
  }

  /** Capturar un Payment Intent (para capture_method: manual) */
  async capturePaymentIntent(
    secretKey: string,
    paymentIntentId: string,
    amount?: number
  ): Promise<{ id: string; status: string }> {
    const stripe = this.createStripeInstance(secretKey);
    const pi = await stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: amount,
    });
    return { id: pi.id, status: pi.status };
  }

  /** Cancelar un Payment Intent */
  async cancelPaymentIntent(
    secretKey: string,
    paymentIntentId: string
  ): Promise<{ id: string; status: string }> {
    const stripe = this.createStripeInstance(secretKey);
    const pi = await stripe.paymentIntents.cancel(paymentIntentId);
    return { id: pi.id, status: pi.status };
  }

  // ──────────────────────────────────────────────
  // Checkout Sessions
  // ──────────────────────────────────────────────

  /** Crear una Checkout Session */
  async createCheckoutSession(
    secretKey: string,
    params: CreateCheckoutSessionParams
  ): Promise<CheckoutSessionResult> {
    const stripe = this.createStripeInstance(secretKey);

    const lineItems = params.lineItems.map((item) => ({
      price_data: {
        currency: item.currency,
        product_data: {
          name: item.name,
          description: item.description,
          images: item.images,
        },
        unit_amount: item.amount,
      },
      quantity: item.quantity,
    }));

    const session = await stripe.checkout.sessions.create({
      line_items: lineItems,
      mode: params.mode,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer: params.customerId,
      customer_email: params.customerId ? undefined : params.customerEmail,
      metadata: params.metadata,
      allow_promotion_codes: params.allowPromotionCodes,
    });

    return {
      id: session.id,
      url: session.url || '',
    };
  }

  // ──────────────────────────────────────────────
  // Reembolsos
  // ──────────────────────────────────────────────

  /** Crear un reembolso */
  async createRefund(
    secretKey: string,
    params: CreateRefundParams
  ): Promise<RefundResult> {
    const stripe = this.createStripeInstance(secretKey);

    const refund = await stripe.refunds.create({
      payment_intent: params.paymentIntentId,
      amount: params.amount,
      reason: params.reason,
      metadata: params.metadata,
    });

    return {
      id: refund.id,
      amount: refund.amount,
      currency: refund.currency,
      status: refund.status,
    };
  }

  // ──────────────────────────────────────────────
  // Customers
  // ──────────────────────────────────────────────

  /** Crear un customer en la cuenta Stripe del cliente */
  async createCustomer(
    secretKey: string,
    params: CreateCustomerParams
  ): Promise<StripeCustomerResult> {
    const stripe = this.createStripeInstance(secretKey);

    const customer = await stripe.customers.create({
      name: params.name,
      email: params.email,
      phone: params.phone,
      metadata: params.metadata,
    });

    return {
      id: customer.id,
      name: customer.name,
      email: customer.email,
    };
  }

  // ──────────────────────────────────────────────
  // Webhooks
  // ──────────────────────────────────────────────

  /** Verificar y parsear evento de webhook */
  verifyWebhookEvent(
    secretKey: string,
    rawBody: string | Buffer,
    signature: string,
    webhookSecret: string
  ): Stripe.Event {
    const stripe = this.createStripeInstance(secretKey);
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  // ──────────────────────────────────────────────
  // Health Check
  // ──────────────────────────────────────────────

  /** Verificar que las credenciales son válidas */
  async healthCheck(secretKey: string): Promise<StripeHealthCheckResult> {
    try {
      const stripe = this.createStripeInstance(secretKey);

      // Intentar listar 1 balance transaction para verificar la llave
      const balance = await stripe.balance.retrieve();

      const isLive = !secretKey.startsWith('sk_test_');

      return {
        valid: true,
        message: `Credenciales válidas. Cuenta Stripe ${isLive ? 'en producción' : 'en modo test'}.`,
        livemode: isLive,
      };
    } catch (err) {
      const message =
        err instanceof Stripe.errors.StripeAuthenticationError
          ? 'Secret key inválida. Verifica que la llave sea correcta.'
          : err instanceof Error
            ? err.message
            : 'Error al verificar credenciales';

      return { valid: false, message };
    }
  }
}

export const stripeClientService = new StripeClientService();
