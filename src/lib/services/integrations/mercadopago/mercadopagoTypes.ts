// ============================================================
// Tipos TypeScript para la integración con MercadoPago
// Ref: https://www.mercadopago.com.co/developers/es/reference
// ============================================================

// --- Credenciales ---

export interface MercadoPagoCredentials {
  publicKey: string;
  accessToken: string;
  webhookSecret: string;
}

// --- Payer (Pagador) ---

export interface PayerIdentification {
  type: 'CC' | 'CE' | 'NIT' | 'PP' | string;
  number: string;
}

export interface Payer {
  email: string;
  first_name?: string;
  last_name?: string;
  identification?: PayerIdentification;
  entity_type?: 'individual' | 'association';
}

// --- Payment Request ---

export interface CreatePaymentRequest {
  transaction_amount: number;
  token?: string;
  description: string;
  installments?: number;
  payment_method_id: string;
  issuer_id?: number;
  payer: Payer;
  notification_url?: string;
  external_reference?: string;
  statement_descriptor?: string;
  callback_url?: string;
  transaction_details?: {
    financial_institution?: string;
  };
  additional_info?: {
    items?: Array<{
      id: string;
      title: string;
      description?: string;
      quantity: number;
      unit_price: number;
    }>;
  };
}

// --- Payment Response ---

export type PaymentStatus =
  | 'approved'
  | 'pending'
  | 'authorized'
  | 'in_process'
  | 'in_mediation'
  | 'rejected'
  | 'cancelled'
  | 'refunded'
  | 'charged_back';

export interface PaymentResponse {
  id: number;
  status: PaymentStatus;
  status_detail: string;
  date_created: string;
  date_approved: string | null;
  date_last_updated: string;
  money_release_date: string | null;
  payment_method_id: string;
  payment_type_id: string;
  transaction_amount: number;
  transaction_amount_refunded: number;
  currency_id: string;
  description: string;
  external_reference: string | null;
  installments: number;
  payer: Payer;
  transaction_details?: {
    net_received_amount: number;
    total_paid_amount: number;
    overpaid_amount: number;
    external_resource_url?: string;
    installment_amount?: number;
    financial_institution?: string;
    payment_method_reference_id?: string;
    barcode?: { content: string };
  };
  refunds: Array<{
    id: number;
    amount: number;
    status: string;
    date_created: string;
  }>;
}

// --- Payment Methods ---

export interface FinancialInstitution {
  id: string;
  description: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  payment_type_id: string;
  status: string;
  secure_thumbnail: string;
  thumbnail: string;
  min_allowed_amount: number;
  max_allowed_amount: number;
  financial_institutions?: FinancialInstitution[];
}

// --- Refund ---

export interface RefundRequest {
  amount?: number;
}

export interface RefundResponse {
  id: number;
  payment_id: number;
  amount: number;
  status: string;
  date_created: string;
  source: { id: string; name: string; type: string };
}

// --- Checkout Pro (Preferencias) ---

export interface PreferenceItem {
  id?: string;
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
  currency_id?: string;
}

export interface CreatePreferenceRequest {
  items: PreferenceItem[];
  back_urls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  notification_url?: string;
  auto_return?: 'approved' | 'all';
  external_reference?: string;
  expires?: boolean;
  expiration_date_from?: string;
  expiration_date_to?: string;
}

export interface PreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
  date_created: string;
  items: PreferenceItem[];
  external_reference: string | null;
}

// --- Webhook ---

export interface WebhookNotification {
  id: number;
  live_mode: boolean;
  type: string;
  date_created: string;
  user_id: number;
  api_version: string;
  action: string;
  data: {
    id: string;
  };
}

// --- Identification Types ---

export interface IdentificationType {
  id: string;
  name: string;
  type: string;
  min_length: number;
  max_length: number;
}
