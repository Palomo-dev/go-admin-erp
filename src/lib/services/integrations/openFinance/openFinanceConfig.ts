/**
 * Configuracion de proveedores Open Finance.
 * Prometeo es el proveedor principal; Belvo esta definido como proveedor futuro.
 */

/** Configuracion base comun a todos los proveedores */
interface ProviderBaseConfig {
  code: string;
  label: string;
  sandboxUrl: string;
  productionUrl: string;
}

/** Configuracion especifica de Prometeo */
interface PrometeoConfig extends ProviderBaseConfig {
  apiKey: string;
  webhookVerifyToken: string;
}

/** Configuracion especifica de Belvo */
interface BelvoConfig extends ProviderBaseConfig {
  secretId: string;
  secretPassword: string;
  webhookSecret: string;
}

/** Union de configuraciones de proveedores */
export type ProviderConfig = PrometeoConfig | BelvoConfig;

/** Configuracion resuelta con baseUrl y entorno */
export type ResolvedProviderConfig = ProviderConfig & {
  baseUrl: string;
  environment: string;
};

export const OPEN_FINANCE_PROVIDERS: Record<string, ProviderConfig> = {
  prometeo: {
    code: 'prometeo',
    label: 'Prometeo',
    sandboxUrl: process.env.PROMETEO_SANDBOX_URL || 'https://banking.sandbox.prometeoapi.com',
    productionUrl: process.env.PROMETEO_PRODUCTION_URL || 'https://banking.prometeoapi.net',
    apiKey: process.env.PROMETEO_API_KEY || '',
    webhookVerifyToken: process.env.PROMETEO_WEBHOOK_VERIFY_TOKEN || '',
  } as PrometeoConfig,
  belvo: {
    code: 'belvo',
    label: 'Belvo',
    sandboxUrl: process.env.BELVO_SANDBOX_URL || 'https://sandbox.belvo.com',
    productionUrl: process.env.BELVO_PRODUCTION_URL || 'https://api.belvo.com',
    secretId: process.env.BELVO_SECRET_ID || '',
    secretPassword: process.env.BELVO_SECRET_PASSWORD || '',
    webhookSecret: process.env.BELVO_WEBHOOK_SECRET || '',
  } as BelvoConfig,
};

/**
 * Obtiene la configuracion de un proveedor segun el entorno.
 * @param provider Codigo del proveedor ('prometeo' | 'belvo')
 * @param environment Entorno ('sandbox' | 'production'). Si no se especifica, se infiere de NODE_ENV.
 */
export function getProviderConfig(provider: string, environment?: string): ResolvedProviderConfig {
  const config = OPEN_FINANCE_PROVIDERS[provider];
  if (!config) throw new Error(`Proveedor Open Finance no soportado: ${provider}`);
  const env = environment || process.env.NODE_ENV === 'production' ? 'production' : 'sandbox';
  const baseUrl = env === 'production' ? config.productionUrl : config.sandboxUrl;
  return { ...config, baseUrl, environment: env };
}

/**
 * Verifica si un proveedor tiene sus credenciales configuradas.
 * @param provider Codigo del proveedor ('prometeo' | 'belvo')
 */
export function isProviderConfigured(provider: string): boolean {
  const config = OPEN_FINANCE_PROVIDERS[provider];
  if (!config) return false;
  if (provider === 'prometeo') return Boolean((config as PrometeoConfig).apiKey);
  if (provider === 'belvo') {
    const belvo = config as BelvoConfig;
    return Boolean(belvo.secretId && belvo.secretPassword);
  }
  return false;
}

/**
 * Obtiene la API Key de un proveedor (Prometeo).
 * @param provider Codigo del proveedor
 */
export function getProviderApiKey(provider: string): string {
  const config = OPEN_FINANCE_PROVIDERS[provider];
  if (!config) throw new Error(`Proveedor Open Finance no soportado: ${provider}`);
  if (provider === 'prometeo') return (config as PrometeoConfig).apiKey;
  throw new Error(`El proveedor ${provider} no usa API Key`);
}

/**
 * Obtiene el token de verificacion de webhook de Prometeo.
 */
export function getPrometeoWebhookToken(): string {
  const config = OPEN_FINANCE_PROVIDERS['prometeo'];
  if (!config) return '';
  return (config as PrometeoConfig).webhookVerifyToken;
}
