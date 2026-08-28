// ============================================================
// Bold Colombia — Tipos TypeScript
// ============================================================

// --- Configuracion y credenciales ---

export type BoldEnvironment = 'sandbox' | 'production';

export interface BoldCredentials {
  /** Llave de identidad (x-api-key). */
  identityKey: string;
  /** Llave secreta para validar firmas de webhook. */
  secretKey: string;
  /** Ambiente de la conexion. */
  environment: BoldEnvironment;
}

// --- Metodos de pago ---

export type BoldPaymentMethod =
  | 'CREDIT_CARD'
  | 'PSE'
  | 'BOTON_BANCOLOMBIA'
  | 'NEQUI'
  | 'POS'
  | 'PAY_BY_LINK'
  | 'PAY_BY_QR_BOLD'
  | 'DAVIPLATA';

// --- Estados de transaccion ---

export type BoldTransactionStatus =
  | 'PROCESSING'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'FAILED'
  | 'VOIDED'
  | 'NO_TRANSACTION_FOUND';

// --- Metodos de pago y limites (API Link) ---

export interface BoldPaymentMethodLimit {
  payment_method: BoldPaymentMethod;
  min_amount?: number;
  max_amount?: number;
}

export interface BoldPaymentMethodsResponse {
  payment_methods: BoldPaymentMethodLimit[];
}

// --- Crear link de pago (API Link) ---

export interface BoldCreateLinkRequest {
  /** Monto total en pesos (sin decimales). */
  amount: number;
  /** Moneda ISO 4217. */
  currency: 'COP';
  /** Referencia de la orden. */
  reference: string;
  /** Descripcion del pago. */
  description?: string;
  /** URL de redireccion tras el pago. */
  redirect_url?: string;
  /** Metadata adicional. */
  metadata?: Record<string, unknown>;
  /** Fecha de expiracion ISO 8601. */
  expires_at?: string;
}

export interface BoldCreateLinkResponse {
  id: string;
  link_url: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  expires_at?: string;
  created_at: string;
}

// --- Consultar link de pago (API Link) ---

export interface BoldLinkStatusResponse {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: BoldTransactionStatus;
  payment_method?: BoldPaymentMethod;
  created_at: string;
  paid_at?: string;
}

// --- Metodos de pago datáfono (API Integrations) ---

export interface BoldPosPaymentMethod {
  code: BoldPaymentMethod;
  name: string;
  enabled: boolean;
}

export interface BoldPosPaymentMethodsResponse {
  payment_methods: BoldPosPaymentMethod[];
}

// --- Terminales vinculados (API Integrations) ---

export interface BoldTerminal {
  id: string;
  serial: string;
  model: string;
  status: string;
  branch_id?: string;
}

export interface BoldTerminalsResponse {
  terminals: BoldTerminal[];
}

// --- Crear pago datáfono (API Integrations) ---

export interface BoldCreatePosPaymentRequest {
  /** Monto total en pesos (sin decimales). */
  amount: number;
  /** Moneda ISO 4217. */
  currency: 'COP';
  /** Referencia de la orden. */
  reference: string;
  /** ID del terminal a usar. */
  terminal_id: string;
  /** Metodo de pago solicitado. */
  payment_method?: BoldPaymentMethod;
  /** Propina en pesos. */
  tip?: number;
  /** Metadata adicional. */
  metadata?: Record<string, unknown>;
}

export interface BoldCreatePosPaymentResponse {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: BoldTransactionStatus;
  terminal_id: string;
  payment_method?: BoldPaymentMethod;
  created_at: string;
}

// --- Consulta de transaccion (payments.api.bold.co) ---

export interface BoldTransactionAmount {
  currency: string;
  total: number;
  taxes: number;
  tip: number;
}

export interface BoldTransactionResponse {
  id: string;
  status: BoldTransactionStatus;
  amount: BoldTransactionAmount;
  payment_method: BoldPaymentMethod;
  reference: string;
  created_at: string;
  paid_at?: string;
  merchant_id?: string;
}

// --- Webhook (estructura CloudEvents) ---

export interface BoldWebhookAmount {
  currency: string;
  total: number;
  taxes: number;
  tip: number;
}

export interface BoldWebhookMetadata {
  reference?: string;
  [key: string]: unknown;
}

export interface BoldWebhookData {
  payment_id: string;
  merchant_id: string;
  amount: BoldWebhookAmount;
  metadata: BoldWebhookMetadata;
  payment_method: BoldPaymentMethod;
  integration: string;
}

export interface BoldWebhookEvent {
  id: string;
  type: 'SALE_APPROVED' | 'SALE_REJECTED' | 'VOID_APPROVED' | 'VOID_REJECTED';
  subject: string;
  source: string;
  spec_version: string;
  time: string;
  data: BoldWebhookData;
  datacontenttype: string;
}

// --- Health check ---

export interface BoldHealthCheckResult {
  healthy: boolean;
  environment: BoldEnvironment;
  error?: string;
  payment_methods_count?: number;
}
