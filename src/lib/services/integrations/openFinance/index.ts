/**
 * Punto de entrada del modulo Open Finance.
 * Exporta el servicio, la configuracion y los tipos.
 */

export { openFinanceService } from './openFinanceService';
export { OPEN_FINANCE_PROVIDERS, getProviderConfig, isProviderConfigured } from './openFinanceConfig';
export type {
  OpenFinanceProvider,
  OpenFinanceLinkStatus,
  OpenFinanceConsentStatus,
  OpenFinanceConsentType,
  OpenFinanceAccountType,
  OpenFinanceTransactionType,
  OpenFinanceLink,
  OpenFinanceAccount,
  OpenFinanceTransaction,
  OpenFinanceConsent,
  Institution,
  PrometeoLoginRequest,
  PrometeoLoginResponse,
  AccountBalance,
  Movement,
  TransferRequest,
  TransferResponse,
  AccountValidationRequest,
  AccountValidationResponse,
  WebhookEvent,
  CreateLinkInput,
  SyncTransactionsInput,
} from './openFinanceTypes';
