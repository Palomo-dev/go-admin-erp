/**
 * Tipos TypeScript para Open Finance.
 * Cubre entidades de BD, requests/responses de Prometeo y DTOs internos.
 */

/** Proveedores Open Finance soportados */
export type OpenFinanceProvider = 'prometeo' | 'belvo';

/** Estados posibles de un link Open Finance */
export type OpenFinanceLinkStatus = 'active' | 'revoked' | 'expired' | 'error';

/** Estados posibles de un consentimiento */
export type OpenFinanceConsentStatus = 'active' | 'revoked' | 'expired';

/** Tipos de consentimiento */
export type OpenFinanceConsentType = 'data_access' | 'payment_initiation' | 'account_validation';

/** Tipos de cuenta bancaria */
export type OpenFinanceAccountType = 'checking' | 'savings' | 'credit_card' | 'loan';

/** Tipos de transaccion */
export type OpenFinanceTransactionType = 'debit' | 'credit';

/** Fila de open_finance_links */
export interface OpenFinanceLink {
  id: string;
  organization_id: number;
  provider: string;
  institution_code: string;
  institution_name: string;
  session_key: string | null;
  status: OpenFinanceLinkStatus;
  consent_id: string | null;
  last_sync_at: string | null;
  sync_frequency: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

/** Fila de open_finance_accounts */
export interface OpenFinanceAccount {
  id: string;
  link_id: string;
  organization_id: number;
  bank_account_id: string | null;
  external_account_id: string | null;
  account_number: string | null;
  account_type: OpenFinanceAccountType | string | null;
  currency: string | null;
  holder_name: string | null;
  is_active: boolean;
  last_balance: number | null;
  last_balance_at: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Fila de open_finance_transactions */
export interface OpenFinanceTransaction {
  id: string;
  link_id: string;
  account_id: string;
  organization_id: number;
  bank_transaction_id: string | null;
  external_transaction_id: string | null;
  transaction_date: string;
  description: string | null;
  amount: number;
  currency: string | null;
  category: string | null;
  counterparty: string | null;
  counterparty_id: string | null;
  reference: string | null;
  transaction_type: OpenFinanceTransactionType | string | null;
  is_imported: boolean;
  imported_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

/** Fila de open_finance_consents */
export interface OpenFinanceConsent {
  id: string;
  organization_id: number;
  link_id: string | null;
  consent_type: OpenFinanceConsentType;
  purpose: string | null;
  scope: string[] | string | null;
  granted_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  granted_by: string | null;
  status: OpenFinanceConsentStatus;
  created_at?: string;
  updated_at?: string;
}

/** Institucion bancaria disponible en un proveedor */
export interface Institution {
  code: string;
  name: string;
  country: string;
  provider: OpenFinanceProvider;
}

/** Request de login a Prometeo (POST /login/) */
export interface PrometeoLoginRequest {
  provider: string;
  username: string;
  password: string;
  document_number?: string;
  type?: string;
}

/** Response de login de Prometeo */
export interface PrometeoLoginResponse {
  status: 'success' | 'error';
  session_key: string | null;
  message: string | null;
}

/** Saldo de una cuenta (GET /balance/) */
export interface AccountBalance {
  current: number;
  available: number;
  blocked: number;
}

/** Movimiento bancario (GET /movement/) */
export interface Movement {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  category: string | null;
  counterparty: string | null;
  reference: string | null;
}

/** Request de transferencia (POST /payout/) */
export interface TransferRequest {
  account_number: string;
  bank_code: string;
  account_type: string;
  document_number: string;
  document_type: string;
  amount: number;
  currency: string;
  description: string;
  reference: string;
}

/** Response de transferencia */
export interface TransferResponse {
  id: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  detail: string | null;
}

/** Request de validacion de cuenta (POST /validate_account/) */
export interface AccountValidationRequest {
  country_code: string;
  account_number: string;
  bank_code: string;
  account_type: string;
  document_number: string;
  document_type: string;
}

/** Response de validacion de cuenta */
export interface AccountValidationResponse {
  valid: boolean;
  account_number: string | null;
  bank_name: string | null;
  holder_name: string | null;
  holder_id: string | null;
  currency: string | null;
  account_type: string | null;
}

/** Evento de webhook recibido de Prometeo */
export interface WebhookEvent {
  event_type: 'payin.settled' | 'payout.cancelled' | 'payout.failed' | string;
  event_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/** Input para crear un link Open Finance en BD */
export interface CreateLinkInput {
  organizationId: number;
  provider: OpenFinanceProvider;
  institutionCode: string;
  institutionName: string;
  consentId?: string;
  metadata?: Record<string, unknown>;
}

/** Input para sincronizar transacciones */
export interface SyncTransactionsInput {
  linkId: string;
  accountId?: string;
  dateFrom: string;
  dateTo: string;
}
