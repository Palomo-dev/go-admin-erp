// ============================================================
// Configuración de PayPal para clientes de GO Admin ERP
// ============================================================

/** URLs base de la API de PayPal */
export const PAYPAL_API_URLS = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  production: 'https://api-m.paypal.com',
} as const;

/** URLs del JS SDK */
export const PAYPAL_SDK_URL = 'https://www.paypal.com/sdk/js' as const;

/** Mapeo de propósitos de credenciales en integration_credentials */
export const PAYPAL_CREDENTIAL_PURPOSES = {
  CLIENT_ID: 'client_id',
  CLIENT_SECRET: 'client_secret',
  WEBHOOK_ID: 'webhook_id',
} as const;

/** Detectar ambiente por client_id (sandbox IDs empiezan con cierto patrón) */
export function detectPayPalEnvironment(clientId: string): 'sandbox' | 'production' {
  // PayPal sandbox client IDs suelen empezar con 'A' seguido de caracteres
  // pero no hay un prefijo determinístico como en Stripe.
  // El usuario debe indicar el ambiente explícitamente.
  // Heurística: si contiene 'sandbox' o 'test' en metadata, es sandbox.
  // Por defecto asumimos sandbox si no se especifica.
  return 'sandbox';
}

/** Obtener URL base según ambiente */
export function getPayPalApiUrl(isSandbox: boolean): string {
  return isSandbox ? PAYPAL_API_URLS.sandbox : PAYPAL_API_URLS.production;
}

/** Eventos de webhook más relevantes */
export const PAYPAL_WEBHOOK_EVENTS = [
  'CHECKOUT.ORDER.APPROVED',
  'CHECKOUT.ORDER.COMPLETED',
  'PAYMENT.CAPTURE.COMPLETED',
  'PAYMENT.CAPTURE.DENIED',
  'PAYMENT.CAPTURE.REFUNDED',
  'PAYMENT.CAPTURE.REVERSED',
  'CUSTOMER.DISPUTE.CREATED',
  'CUSTOMER.DISPUTE.RESOLVED',
  'BILLING.SUBSCRIPTION.CREATED',
  'BILLING.SUBSCRIPTION.ACTIVATED',
  'BILLING.SUBSCRIPTION.CANCELLED',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
] as const;

/** Estados de orden PayPal */
export const PAYPAL_ORDER_STATUSES = {
  CREATED: 'CREATED',
  SAVED: 'SAVED',
  APPROVED: 'APPROVED',
  VOIDED: 'VOIDED',
  COMPLETED: 'COMPLETED',
  PAYER_ACTION_REQUIRED: 'PAYER_ACTION_REQUIRED',
} as const;
