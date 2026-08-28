// ============================================================
// Bold Colombia — Exportaciones del modulo
// ============================================================

export { boldService, BoldService } from './boldService';
export {
  getBoldIntegrationsBaseUrl,
  getBoldPaymentsBaseUrl,
  BOLD_CREDENTIAL_PURPOSES,
  BOLD_PROVIDER_CODE,
  BOLD_CONNECTOR_LINK,
  BOLD_CONNECTOR_POS,
  BOLD_PROVIDER_ID,
  BOLD_CONNECTOR_LINK_ID,
  BOLD_CONNECTOR_POS_ID,
} from './boldConfig';
export type {
  BoldEnvironment,
  BoldCredentials,
  BoldPaymentMethod,
  BoldTransactionStatus,
  BoldPaymentMethodLimit,
  BoldPaymentMethodsResponse,
  BoldCreateLinkRequest,
  BoldCreateLinkResponse,
  BoldLinkStatusResponse,
  BoldPosPaymentMethod,
  BoldPosPaymentMethodsResponse,
  BoldTerminal,
  BoldTerminalsResponse,
  BoldCreatePosPaymentRequest,
  BoldCreatePosPaymentResponse,
  BoldTransactionAmount,
  BoldTransactionResponse,
  BoldWebhookAmount,
  BoldWebhookMetadata,
  BoldWebhookData,
  BoldWebhookEvent,
  BoldHealthCheckResult,
} from './boldTypes';
