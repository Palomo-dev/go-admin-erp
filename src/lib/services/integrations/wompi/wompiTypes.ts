// ============================================================
// Wompi Colombia — Tipos TypeScript
// ============================================================

// --- Configuración y credenciales ---

export type WompiEnvironment = 'sandbox' | 'production';

export interface WompiCredentials {
  publicKey: string;
  privateKey: string;
  eventsSecret: string;
  integritySecret: string;
  environment: WompiEnvironment;
}

// --- Métodos de pago ---

export type WompiPaymentMethodType =
  | 'CARD'
  | 'NEQUI'
  | 'PSE'
  | 'BANCOLOMBIA_TRANSFER'
  | 'BANCOLOMBIA_QR'
  | 'BANCOLOMBIA_COLLECT'
  | 'DAVIPLATA'
  | 'PCOL'
  | 'BNPL_BANCOLOMBIA'
  | 'SU_PAY';

export type WompiTransactionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DECLINED'
  | 'VOIDED'
  | 'ERROR';

// --- Tokens de aceptación ---

export interface WompiAcceptanceTokens {
  acceptanceToken: string;
  acceptPersonalAuth: string;
}

export interface WompiMerchantResponse {
  data: {
    id: number;
    name: string;
    email: string;
    legal_name: string;
    presigned_acceptance: {
      acceptance_token: string;
      permalink: string;
      type: string;
    };
    presigned_personal_data_auth: {
      acceptance_token: string;
      permalink: string;
      type: string;
    };
  };
}

// --- Tokenización de tarjeta ---

export interface WompiTokenizeCardRequest {
  number: string;
  cvc: string;
  exp_month: string;
  exp_year: string;
  card_holder: string;
}

export interface WompiTokenizeCardResponse {
  status: string;
  data: {
    id: string;
    brand: string;
    name: string;
    last_four: string;
    bin: string;
    exp_year: string;
    exp_month: string;
    card_holder: string;
    expires_at: string;
  };
}

// --- Payment methods por tipo ---

export interface WompiCardPaymentMethod {
  type: 'CARD';
  installments: number;
  token: string;
}

export interface WompiNequiPaymentMethod {
  type: 'NEQUI';
  phone_number: string;
}

export interface WompiPSEPaymentMethod {
  type: 'PSE';
  user_type: 0 | 1; // 0 = persona natural, 1 = jurídica
  user_legal_id_type: string;
  user_legal_id: string;
  financial_institution_code: string;
  payment_description: string;
}

export interface WompiBancolombiaTransferPaymentMethod {
  type: 'BANCOLOMBIA_TRANSFER';
  payment_description: string;
  ecommerce_url: string;
}

export interface WompiDaviplataPaymentMethod {
  type: 'DAVIPLATA';
  user_legal_id: string;
  user_legal_id_type: string;
  payment_description: string;
}

export type WompiPaymentMethod =
  | WompiCardPaymentMethod
  | WompiNequiPaymentMethod
  | WompiPSEPaymentMethod
  | WompiBancolombiaTransferPaymentMethod
  | WompiDaviplataPaymentMethod;

// --- Crear transacción ---

export interface WompiCreateTransactionRequest {
  acceptance_token: string;
  accept_personal_auth: string;
  amount_in_cents: number;
  currency: 'COP';
  customer_email: string;
  reference: string;
  signature?: string;
  payment_method: WompiPaymentMethod;
  payment_method_type?: WompiPaymentMethodType;
  customer_data?: {
    phone_number?: string;
    full_name?: string;
    legal_id?: string;
    legal_id_type?: string;
  };
  redirect_url?: string;
  expiration_time?: string;
}

export interface WompiTransactionResponse {
  data: {
    id: string;
    created_at: string;
    amount_in_cents: number;
    reference: string;
    currency: string;
    payment_method_type: WompiPaymentMethodType;
    payment_method: {
      type: string;
      extra: Record<string, unknown>;
      installments?: number;
      phone_number?: number;
    };
    status: WompiTransactionStatus;
    status_message: string | null;
    merchant: {
      name: string;
      legal_name: string;
      email: string;
    };
    redirect_url: string | null;
    taxes: unknown[];
  };
}

// --- PSE Instituciones ---

export interface WompiPSEInstitution {
  financial_institution_code: string;
  financial_institution_name: string;
}

export interface WompiPSEInstitutionsResponse {
  data: WompiPSEInstitution[];
}

// --- Webhook / Evento ---

export interface WompiWebhookEvent {
  event: string;
  data: {
    transaction: {
      id: string;
      amount_in_cents: number;
      reference: string;
      customer_email: string;
      currency: string;
      payment_method_type: WompiPaymentMethodType;
      status: WompiTransactionStatus;
      status_message?: string;
      redirect_url?: string;
    };
  };
  environment: string;
  signature: {
    properties: string[];
    checksum: string;
  };
  timestamp: number;
  sent_at: string;
}

// --- Void (anular transacción) ---

export interface WompiVoidResponse {
  data: {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'ERROR';
    amount_in_cents: number;
    currency: string;
  };
}
