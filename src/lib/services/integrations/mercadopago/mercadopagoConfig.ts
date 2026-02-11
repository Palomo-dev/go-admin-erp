// ============================================================
// Configuración de MercadoPago
// Ref: https://www.mercadopago.com.co/developers/es/docs
// ============================================================

/** URL base de la API de MercadoPago (única para todos los ambientes) */
export const MERCADOPAGO_API_BASE = 'https://api.mercadopago.com';

/** URL del SDK JS para el frontend */
export const MERCADOPAGO_SDK_URL = 'https://sdk.mercadopago.com/js/v2';

/** Prefijos de credenciales para detectar el ambiente */
export const MERCADOPAGO_KEY_PREFIXES = {
  test: {
    publicKey: 'TEST-',
    accessToken: 'TEST-',
  },
  production: {
    publicKey: 'APP_USR-',
    accessToken: 'APP_USR-',
  },
} as const;

/** Mapeo de propósitos de credenciales en integration_credentials */
export const MERCADOPAGO_CREDENTIAL_PURPOSES = {
  PUBLIC_KEY: 'public_key',
  ACCESS_TOKEN: 'access_token',
  WEBHOOK_SECRET: 'webhook_secret',
} as const;

/** Métodos de pago disponibles en Colombia */
export const MERCADOPAGO_CO_PAYMENT_METHODS = {
  credit_card: ['visa', 'master', 'amex', 'diners', 'codensa'],
  debit_card: ['debvisa', 'debmaster'],
  bank_transfer: ['pse'],
  cash: ['efecty', 'baloto'],
  digital_wallet: ['account_money'],
} as const;

/** Tipos de documento disponibles en Colombia */
export const MERCADOPAGO_CO_DOC_TYPES = [
  { id: 'CC', name: 'Cédula de Ciudadanía' },
  { id: 'CE', name: 'Cédula de Extranjería' },
  { id: 'NIT', name: 'Número de Identificación Tributaria' },
  { id: 'PP', name: 'Pasaporte' },
] as const;

/** Detectar ambiente según prefijo de la credencial */
export function detectEnvironment(publicKeyOrAccessToken: string): 'sandbox' | 'production' {
  if (publicKeyOrAccessToken.startsWith('TEST-')) return 'sandbox';
  return 'production';
}
