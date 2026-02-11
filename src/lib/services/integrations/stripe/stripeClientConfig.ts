// ============================================================
// Configuración de Stripe para CLIENTES de GO Admin ERP
// SEPARADO del servicio interno src/lib/stripe/server.ts
// ============================================================

/** URL base de la API de Stripe (misma para test y producción) */
export const STRIPE_API_URL = 'https://api.stripe.com' as const;

/** Mapeo de propósitos de credenciales en integration_credentials */
export const STRIPE_CLIENT_CREDENTIAL_PURPOSES = {
  PUBLISHABLE_KEY: 'publishable_key',
  SECRET_KEY: 'secret_key',
  WEBHOOK_SECRET: 'webhook_secret',
} as const;

/** Prefijos de llaves para detección de ambiente */
export const STRIPE_KEY_PREFIXES = {
  test: {
    publishable: 'pk_test_',
    secret: 'sk_test_',
  },
  live: {
    publishable: 'pk_live_',
    secret: 'sk_live_',
  },
  webhook: 'whsec_',
} as const;

/** Detectar ambiente por prefijo de llave */
export function detectStripeEnvironment(
  publishableKey: string
): 'test' | 'live' {
  if (publishableKey.startsWith(STRIPE_KEY_PREFIXES.test.publishable)) return 'test';
  if (publishableKey.startsWith(STRIPE_KEY_PREFIXES.live.publishable)) return 'live';
  return 'test'; // Default a test si no se reconoce
}

/** Validar formato de las llaves */
export function validateStripeKeys(keys: {
  publishableKey?: string;
  secretKey?: string;
  webhookSecret?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (keys.publishableKey) {
    if (
      !keys.publishableKey.startsWith('pk_test_') &&
      !keys.publishableKey.startsWith('pk_live_')
    ) {
      errors.push('Publishable key debe comenzar con pk_test_ o pk_live_');
    }
  }

  if (keys.secretKey) {
    if (
      !keys.secretKey.startsWith('sk_test_') &&
      !keys.secretKey.startsWith('sk_live_')
    ) {
      errors.push('Secret key debe comenzar con sk_test_ o sk_live_');
    }
  }

  if (keys.webhookSecret) {
    if (!keys.webhookSecret.startsWith('whsec_')) {
      errors.push('Webhook secret debe comenzar con whsec_');
    }
  }

  // Verificar que publishable y secret estén en el mismo ambiente
  if (keys.publishableKey && keys.secretKey) {
    const pkEnv = keys.publishableKey.startsWith('pk_test_') ? 'test' : 'live';
    const skEnv = keys.secretKey.startsWith('sk_test_') ? 'test' : 'live';
    if (pkEnv !== skEnv) {
      errors.push('Publishable key y Secret key deben ser del mismo ambiente (test o live)');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Montos mínimos por moneda (en centavos) */
export const STRIPE_MIN_AMOUNTS: Record<string, number> = {
  cop: 200000, // $2,000 COP
  usd: 50,     // $0.50 USD
  mxn: 1000,   // $10.00 MXN
  brl: 50,     // R$0.50 BRL
  eur: 50,     // €0.50 EUR
} as const;

/** Monedas sin decimales (zero-decimal) */
export const STRIPE_ZERO_DECIMAL_CURRENCIES = [
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw',
  'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf',
] as const;

/** Eventos de webhook más relevantes */
export const STRIPE_WEBHOOK_EVENTS = [
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'charge.succeeded',
  'charge.refunded',
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
] as const;
