/**
 * Punto de entrada del modulo Open Finance.
 * Exporta el servicio, la configuracion y los tipos.
 */

export { openFinanceService } from './openFinanceService';
export { consentService, ConsentService } from './consentService';
export type { CreateConsentInput, ConsentStats } from './consentService';
export { transactionSyncService, TransactionSyncService } from './transactionSyncService';
export { aiMatchingService, AiMatchingService } from './aiMatchingService';
export type { BankTransaction, PaymentCandidate, MatchScore, SuggestedMatch } from './aiMatchingService';
export { balanceService, BalanceService } from './balanceService';
export type { RealTimeBalance, BalanceValidation, BalanceHistoryEntry } from './balanceService';
export { paymentInitiationService, PaymentInitiationService } from './paymentInitiationService';
export type { PaymentResult, ValidationResult, PaymentHistoryEntry } from './paymentInitiationService';
export { treasuryService, TreasuryService } from './treasuryService';
export type {
  AccountPosition,
  ConsolidatedPosition,
  ProjectionEntry,
  CashFlowProjection,
  InterAccountTransfer,
  PaymentConcentration,
  TreasuryAlert,
} from './treasuryService';
export { anomalyDetectionService, AnomalyDetectionService } from './anomalyDetectionService';
export type {
  DuplicateAlert,
  AnomalyAlert,
  BalanceDiscrepancy,
  AnomalySummary,
} from './anomalyDetectionService';
export { cronJobs, CronJobs } from './cronJobs';
export type {
  SyncReport,
  BalanceReport,
  PaymentReport,
  AnomalyReport,
  ConsentReport,
  HealthStatus,
} from './cronJobs';
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
