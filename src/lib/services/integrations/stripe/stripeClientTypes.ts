// ============================================================
// Tipos TypeScript para la integración Stripe de CLIENTES
// SEPARADO del servicio interno src/lib/stripe/types.ts
// Este servicio es para que los clientes de GO Admin cobren a SUS clientes
// ============================================================

// --- Credenciales del cliente ---

export interface StripeClientCredentials {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
}

// --- Payment Intent ---

export interface CreatePaymentIntentParams {
  amount: number; // En centavos de la moneda
  currency: string; // 'cop', 'usd', etc.
  description?: string;
  customerId?: string; // Stripe Customer ID
  metadata?: Record<string, string>;
  paymentMethodTypes?: string[];
  statementDescriptor?: string;
  captureMethod?: 'automatic' | 'manual';
  setupFutureUsage?: 'on_session' | 'off_session';
}

export interface PaymentIntentResult {
  id: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status: string;
}

// --- Checkout Session ---

export interface CheckoutLineItem {
  name: string;
  description?: string;
  amount: number; // En centavos
  currency: string;
  quantity: number;
  images?: string[];
}

export interface CreateCheckoutSessionParams {
  lineItems: CheckoutLineItem[];
  mode: 'payment' | 'subscription' | 'setup';
  successUrl: string;
  cancelUrl: string;
  customerId?: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  allowPromotionCodes?: boolean;
}

export interface CheckoutSessionResult {
  id: string;
  url: string;
}

// --- Customer ---

export interface CreateCustomerParams {
  name: string;
  email: string;
  phone?: string;
  metadata?: Record<string, string>;
}

export interface StripeCustomerResult {
  id: string;
  name: string | null;
  email: string | null;
}

// --- Refund ---

export interface CreateRefundParams {
  paymentIntentId: string;
  amount?: number; // Parcial en centavos. Omitir = total
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  metadata?: Record<string, string>;
}

export interface RefundResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

// --- Webhook ---

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  created: number;
  livemode: boolean;
}

// --- Health Check ---

export interface StripeHealthCheckResult {
  valid: boolean;
  message: string;
  livemode?: boolean;
}

// --- Subscription (para clientes que cobran membresías) ---

export interface CreateProductParams {
  name: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface CreatePriceParams {
  productId: string;
  unitAmount: number; // Centavos
  currency: string;
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    intervalCount?: number;
  };
}

export interface CreateSubscriptionParams {
  customerId: string;
  priceId: string;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
}
