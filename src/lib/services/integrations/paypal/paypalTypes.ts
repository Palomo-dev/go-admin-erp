// ============================================================
// Tipos TypeScript para la integración PayPal
// Orders v2 API + Webhooks + Subscriptions
// ============================================================

// --- Credenciales ---

export interface PayPalCredentials {
  clientId: string;
  clientSecret: string;
  webhookId: string;
}

// --- OAuth Token ---

export interface PayPalAccessToken {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: number; // timestamp ms para saber cuándo renovar
}

// --- Orden ---

export interface PayPalOrderAmount {
  currency_code: string;
  value: string; // Strings con decimales: "100.00"
  breakdown?: {
    item_total?: { currency_code: string; value: string };
    tax_total?: { currency_code: string; value: string };
    shipping?: { currency_code: string; value: string };
    discount?: { currency_code: string; value: string };
  };
}

export interface PayPalOrderItem {
  name: string;
  quantity: string;
  unit_amount: { currency_code: string; value: string };
  description?: string;
  category?: 'DIGITAL_GOODS' | 'PHYSICAL_GOODS' | 'DONATION';
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  description?: string;
  amount: PayPalOrderAmount;
  items?: PayPalOrderItem[];
  payee?: { email_address?: string; merchant_id?: string };
}

export interface CreateOrderParams {
  intent: 'CAPTURE' | 'AUTHORIZE';
  purchaseUnits: PayPalPurchaseUnit[];
  brandName?: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface PayPalOrderResult {
  id: string;
  status: PayPalOrderStatus;
  links: PayPalLink[];
}

export interface PayPalLink {
  href: string;
  rel: string;
  method: string;
}

export type PayPalOrderStatus =
  | 'CREATED'
  | 'SAVED'
  | 'APPROVED'
  | 'VOIDED'
  | 'COMPLETED'
  | 'PAYER_ACTION_REQUIRED';

// --- Captura ---

export interface PayPalCaptureResult {
  id: string;
  status: string;
  purchaseUnits: {
    referenceId?: string;
    payments?: {
      captures?: PayPalCapture[];
    };
  }[];
  payer?: {
    name?: { given_name: string; surname: string };
    email_address?: string;
    payer_id?: string;
  };
}

export interface PayPalCapture {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  amount: { currency_code: string; value: string };
  sellerReceivableBreakdown?: {
    grossAmount: { currency_code: string; value: string };
    paypalFee: { currency_code: string; value: string };
    netAmount: { currency_code: string; value: string };
  };
  createTime?: string;
}

// --- Reembolso ---

export interface CreateRefundParams {
  captureId: string;
  amount?: { value: string; currency_code: string };
  noteToPayer?: string;
}

export interface PayPalRefundResult {
  id: string;
  status: 'CANCELLED' | 'FAILED' | 'PENDING' | 'COMPLETED';
  amount?: { currency_code: string; value: string };
}

// --- Webhook ---

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  create_time: string;
  resource_type: string;
  resource: Record<string, unknown>;
  summary: string;
}

export interface PayPalWebhookVerifyParams {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId: string;
  webhookEvent: Record<string, unknown>;
}

// --- Health Check ---

export interface PayPalHealthCheckResult {
  valid: boolean;
  message: string;
  sandbox?: boolean;
}
