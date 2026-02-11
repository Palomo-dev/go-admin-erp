// ============================================================
// Configuración de PayU Latam
// Ref: https://developers.payulatam.com/latam/es/docs/integrations.html
// ============================================================

/** URLs base de la API de PayU */
export const PAYU_API_URLS = {
  sandbox: {
    payments: 'https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi',
    reports: 'https://sandbox.api.payulatam.com/reports-api/4.0/service.cgi',
  },
  production: {
    payments: 'https://api.payulatam.com/payments-api/4.0/service.cgi',
    reports: 'https://api.payulatam.com/reports-api/4.0/service.cgi',
  },
} as const;

/** Mapeo de propósitos de credenciales en integration_credentials */
export const PAYU_CREDENTIAL_PURPOSES = {
  API_KEY: 'api_key',
  API_LOGIN: 'api_login',
  MERCHANT_ID: 'merchant_id',
  ACCOUNT_ID: 'account_id',
} as const;

/** Credenciales de prueba (sandbox) */
export const PAYU_SANDBOX_CREDENTIALS = {
  apiKey: '4Vj8eK4rloUd272L48hsrarnUA',
  apiLogin: 'pRRXKOl8ikMmt9u',
  merchantId: '508029',
  accountId: '512321',
} as const;

/** Métodos de pago disponibles en Colombia */
export const PAYU_CO_PAYMENT_METHODS = {
  credit_card: ['VISA', 'MASTERCARD', 'AMEX', 'DINERS', 'CODENSA'],
  debit_card: ['VISA_DEBIT', 'MASTERCARD_DEBIT'],
  bank_transfer: ['PSE'],
  digital_wallet: ['NEQUI', 'BANCOLOMBIA_TRANSFER', 'GOOGLE_PAY'],
  cash: ['EFECTY', 'BALOTO', 'OTHERS_CASH'],
  bank_reference: ['BANK_REFERENCED'],
} as const;

/** Tipos de documento disponibles en Colombia */
export const PAYU_CO_DOC_TYPES = [
  { id: 'CC', name: 'Cédula de Ciudadanía' },
  { id: 'CE', name: 'Cédula de Extranjería' },
  { id: 'NIT', name: 'Número de Identificación Tributaria' },
  { id: 'PP', name: 'Pasaporte' },
] as const;

/** Estados de transacción de PayU */
export const PAYU_TRANSACTION_STATES: Record<string, string> = {
  '4': 'APPROVED',
  '5': 'EXPIRED',
  '6': 'DECLINED',
  '7': 'PENDING',
  '104': 'ERROR',
} as const;

/** IPs de PayU para whitelist de webhooks */
export const PAYU_WEBHOOK_IPS = [
  '18.232.231.205',
  '18.235.148.28',
  '34.195.228.30',
  '34.196.146.74',
  '54.196.229.4',
  '54.90.62.10',
] as const;

/** Detectar ambiente: si merchantId es el de sandbox → sandbox */
export function detectEnvironment(merchantId: string): 'sandbox' | 'production' {
  if (merchantId === PAYU_SANDBOX_CREDENTIALS.merchantId) return 'sandbox';
  return 'production';
}
