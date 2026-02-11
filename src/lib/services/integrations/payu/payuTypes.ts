// ============================================================
// Tipos TypeScript para la integración con PayU Latam
// Ref: https://developers.payulatam.com/latam/es/docs/integrations/api-integration/payments-api-colombia.html
// ============================================================

// --- Credenciales ---

export interface PayUCredentials {
  apiKey: string;
  apiLogin: string;
  merchantId: string;
  accountId: string;
}

// --- Merchant (body) ---

export interface PayUMerchant {
  apiKey: string;
  apiLogin: string;
}

// --- Dirección ---

export interface PayUAddress {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
  phone?: string;
}

// --- Buyer ---

export interface PayUBuyer {
  merchantBuyerId?: string;
  fullName: string;
  emailAddress: string;
  contactPhone?: string;
  dniNumber?: string;
  dniType?: 'CC' | 'CE' | 'NIT' | 'PP' | string;
  shippingAddress?: PayUAddress;
}

// --- Payer ---

export interface PayUPayer {
  merchantPayerId?: string;
  fullName: string;
  emailAddress: string;
  contactPhone?: string;
  dniNumber?: string;
  dniType?: 'CC' | 'CE' | 'NIT' | 'PP' | string;
  birthdate?: string;
  billingAddress?: PayUAddress;
}

// --- Tarjeta de crédito ---

export interface PayUCreditCard {
  number: string;
  securityCode: string;
  expirationDate: string; // YYYY/MM
  name: string;
  processWithoutCvv2?: boolean;
}

// --- Valores adicionales ---

export interface PayUAdditionalValue {
  value: number;
  currency: string;
}

export interface PayUAdditionalValues {
  TX_VALUE: PayUAdditionalValue;
  TX_TAX?: PayUAdditionalValue;
  TX_TAX_RETURN_BASE?: PayUAdditionalValue;
}

// --- Orden ---

export interface PayUOrder {
  accountId: string;
  referenceCode: string;
  description: string;
  language?: string;
  signature?: string;
  notifyUrl?: string;
  partnerId?: string;
  additionalValues: PayUAdditionalValues;
  buyer?: PayUBuyer;
  shippingAddress?: PayUAddress;
}

// --- Transacción de pago ---

export type PayUTransactionType =
  | 'AUTHORIZATION_AND_CAPTURE'
  | 'AUTHORIZATION'
  | 'CAPTURE'
  | 'CANCELLATION'
  | 'VOID'
  | 'REFUND';

export interface PayUTransaction {
  order: PayUOrder;
  payer?: PayUPayer;
  creditCard?: PayUCreditCard;
  creditCardTokenId?: string;
  extraParameters?: Record<string, string | number>;
  type: PayUTransactionType;
  paymentMethod: string;
  paymentCountry: string;
  deviceSessionId?: string;
  ipAddress?: string;
  cookie?: string;
  userAgent?: string;
  threeDomainSecure?: {
    embedded?: boolean;
    eci?: string;
    cavv?: string;
    xid?: string;
    directoryServerTransactionId?: string;
  };
}

// --- Request genérico ---

export type PayUCommand =
  | 'SUBMIT_TRANSACTION'
  | 'GET_PAYMENT_METHODS'
  | 'GET_BANKS_LIST'
  | 'PING'
  | 'ORDER_DETAIL'
  | 'ORDER_DETAIL_BY_REFERENCE_CODE'
  | 'TRANSACTION_RESPONSE_DETAIL';

export interface PayURequest {
  language: string;
  command: PayUCommand;
  merchant: PayUMerchant;
  transaction?: PayUTransaction;
  details?: {
    orderId?: number;
    referenceCode?: string;
    transactionId?: string;
  };
  bankListInformation?: {
    paymentMethod: string;
    paymentCountry: string;
  };
  test: boolean;
}

// --- Response de transacción ---

export type PayUTransactionState =
  | 'APPROVED'
  | 'DECLINED'
  | 'PENDING'
  | 'EXPIRED'
  | 'ERROR';

export interface PayUTransactionResponse {
  orderId: number;
  transactionId: string;
  state: PayUTransactionState;
  paymentNetworkResponseCode: string | null;
  paymentNetworkResponseErrorMessage: string | null;
  trazabilityCode: string | null;
  authorizationCode: string | null;
  pendingReason: string | null;
  responseCode: string;
  responseMessage: string | null;
  operationDate: number | null;
  extraParameters?: Record<string, string>;
}

export interface PayUApiResponse {
  code: 'SUCCESS' | 'ERROR';
  error?: string;
  transactionResponse?: PayUTransactionResponse;
}

// --- Payment Methods ---

export interface PayUPaymentMethod {
  id: string;
  description: string;
  country: string;
  enabled: boolean;
  reason: string | null;
}

export interface PayUPaymentMethodsResponse {
  code: 'SUCCESS' | 'ERROR';
  error?: string;
  paymentMethods?: PayUPaymentMethod[];
}

// --- Banks PSE ---

export interface PayUBank {
  id: string;
  description: string;
  pseCode: string;
}

export interface PayUBanksResponse {
  code: 'SUCCESS' | 'ERROR';
  error?: string;
  banks?: PayUBank[];
}

// --- Ping ---

export interface PayUPingResponse {
  code: 'SUCCESS' | 'ERROR';
  error?: string;
}

// --- Query / Order Detail ---

export interface PayUOrderDetail {
  id: number;
  accountId: number;
  status: string;
  referenceCode: string;
  description: string;
  additionalValues: Record<string, PayUAdditionalValue>;
  transactions?: Array<{
    id: string;
    type: string;
    paymentMethod: string;
    transactionResponse: PayUTransactionResponse;
  }>;
}

export interface PayUOrderDetailResponse {
  code: 'SUCCESS' | 'ERROR';
  error?: string;
  result?: PayUOrderDetail;
}

// --- Webhook (Confirmation Page) ---

export interface PayUWebhookPayload {
  merchant_id: string;
  state_pol: string;
  risk: string;
  response_code_pol: string;
  reference_sale: string;
  reference_pol: string;
  sign: string;
  extra1?: string;
  extra2?: string;
  payment_method: string;
  payment_method_type: string;
  installments_number: string;
  value: string;
  tax: string;
  transaction_date: string;
  currency: string;
  email_buyer: string;
  cus?: string;
  pse_bank?: string;
  test?: string;
  description?: string;
  billing_address?: string;
  shipping_address?: string;
  phone?: string;
  office_phone?: string;
  account_number_ach?: string;
  account_type_ach?: string;
  administrative_fee?: string;
  administrative_fee_base?: string;
  administrative_fee_tax?: string;
  airline_code?: string;
  attempts?: string;
  authorization_code?: string;
  bank_id?: string;
  billing_city?: string;
  billing_country?: string;
  commision_pol?: string;
  commision_pol_currency?: string;
  customer_number?: string;
  date?: string;
  ip?: string;
  nickname_buyer?: string;
  nickname_seller?: string;
  payment_method_id?: string;
  payment_request_state?: string;
  pseCycle?: string;
  response_message_pol?: string;
  transaction_bank_id?: string;
  transaction_id?: string;
}
