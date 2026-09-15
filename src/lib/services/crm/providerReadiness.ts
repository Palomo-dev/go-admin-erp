/**
 * F10 — «¿está configurado el proveedor?» sin fingir.
 *
 * Fuentes, en orden: configuración de la organización (`provider_configs`
 * categoría `esign`; `integration_credentials` para Stripe) → variables de la
 * plataforma. Un placeholder (`your-…`) NUNCA cuenta como clave real
 * (`isPlaceholderCredential`). Los mensajes `missing` van a organizaciones
 * cliente: no nombran variables de entorno, que son de la plataforma.
 */

import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';

export interface ProviderConfigRow {
  provider: string;
  is_active: boolean;
  credentials: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  priority?: number;
}

export type ReadinessSource = 'organization' | 'platform' | null;

export interface EsignReadiness {
  configured: boolean;
  provider: 'documenso' | null;
  source: ReadinessSource;
  apiKey: string | null;
  apiUrl: string;
  webhookSecret: string | null;
  missing: string[];
}

function real(value: unknown): string | null {
  return typeof value === 'string' && !isPlaceholderCredential(value) ? value.trim() : null;
}

const DOCUMENSO_DEFAULT_URL = 'https://app.documenso.com/api/v1';

export function resolveEsignReadiness(input: { orgConfigs: ProviderConfigRow[]; env: Record<string, string | undefined> }): EsignReadiness {
  const rows = [...(input.orgConfigs ?? [])]
    .filter((r) => r && r.is_active && r.provider === 'documenso')
    .sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  for (const row of rows) {
    const creds = row.credentials ?? {};
    const apiKey = real(creds.DOCUMENSO_API_KEY ?? creds.api_key);
    if (apiKey) {
      return {
        configured: true,
        provider: 'documenso',
        source: 'organization',
        apiKey,
        apiUrl: real(creds.DOCUMENSO_API_URL ?? creds.api_url) ?? real(input.env.DOCUMENSO_API_URL) ?? DOCUMENSO_DEFAULT_URL,
        webhookSecret: real(creds.DOCUMENSO_WEBHOOK_SECRET ?? creds.webhook_secret) ?? real(input.env.DOCUMENSO_WEBHOOK_SECRET),
        missing: [],
      };
    }
  }
  const platformKey = real(input.env.DOCUMENSO_API_KEY);
  if (platformKey) {
    return {
      configured: true,
      provider: 'documenso',
      source: 'platform',
      apiKey: platformKey,
      apiUrl: real(input.env.DOCUMENSO_API_URL) ?? DOCUMENSO_DEFAULT_URL,
      webhookSecret: real(input.env.DOCUMENSO_WEBHOOK_SECRET),
      missing: [],
    };
  }
  return {
    configured: false,
    provider: null,
    source: null,
    apiKey: null,
    apiUrl: DOCUMENSO_DEFAULT_URL,
    // El secreto de webhook de plataforma sigue valiendo para autenticar avisos aunque no haya clave de API.
    webhookSecret: real(input.env.DOCUMENSO_WEBHOOK_SECRET),
    missing: [
      'Un proveedor de firma electrónica activo para la organización (Configuración → CRM → Proveedores → Firma electrónica) con su clave de API.',
      'Mientras tanto, el contrato puede firmarse fuera de la plataforma y adjuntarse en Documentos.',
    ],
  };
}

export interface StripeOrgCredentials {
  secretKey?: string | null;
  webhookSecret?: string | null;
  publishableKey?: string | null;
}

export interface StripeReadiness {
  configured: boolean;
  source: ReadinessSource;
  secretKey: string | null;
  webhookSecret: string | null;
  missing: string[];
}

function realSecretKey(value: unknown): string | null {
  const v = real(value);
  return v && /^sk_(test|live)_/.test(v) ? v : null;
}

function realWebhookSecret(value: unknown): string | null {
  const v = real(value);
  return v && /^whsec_/.test(v) ? v : null;
}

export function resolveStripeReadiness(input: { orgCredentials: StripeOrgCredentials | null; env: Record<string, string | undefined> }): StripeReadiness {
  const orgKey = realSecretKey(input.orgCredentials?.secretKey);
  if (orgKey) {
    return { configured: true, source: 'organization', secretKey: orgKey, webhookSecret: realWebhookSecret(input.orgCredentials?.webhookSecret), missing: [] };
  }
  const platformKey = realSecretKey(input.env.STRIPE_SECRET_KEY);
  if (platformKey) {
    return { configured: true, source: 'platform', secretKey: platformKey, webhookSecret: realWebhookSecret(input.env.STRIPE_CRM_WEBHOOK_SECRET), missing: [] };
  }
  return {
    configured: false,
    source: null,
    secretKey: null,
    webhookSecret: null,
    missing: [
      'Una cuenta de Stripe conectada a la organización (Integraciones → Stripe) con su clave secreta.',
      'Mientras tanto, el pago puede registrarse manualmente desde Finanzas cuando el cliente transfiera.',
    ],
  };
}
