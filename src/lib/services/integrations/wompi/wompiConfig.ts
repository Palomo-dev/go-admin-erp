// ============================================================
// Wompi Colombia — Configuración y constantes
// ============================================================

import type { WompiEnvironment } from './wompiTypes';

const WOMPI_BASE_URLS: Record<WompiEnvironment, string> = {
  sandbox: 'https://sandbox.wompi.co/v1',
  production: 'https://production.wompi.co/v1',
};

export function getWompiBaseUrl(environment: WompiEnvironment): string {
  return WOMPI_BASE_URLS[environment];
}

// Prefijos esperados por ambiente para validación
export const WOMPI_KEY_PREFIXES: Record<WompiEnvironment, {
  publicKey: string;
  privateKey: string;
  eventsSecret: string;
  integritySecret: string;
}> = {
  sandbox: {
    publicKey: 'pub_test_',
    privateKey: 'prv_test_',
    eventsSecret: 'test_events_',
    integritySecret: 'test_integrity_',
  },
  production: {
    publicKey: 'pub_prod_',
    privateKey: 'prv_prod_',
    eventsSecret: 'prod_events_',
    integritySecret: 'prod_integrity_',
  },
};

// Mapeo de credential_type y purpose para integration_credentials
export const WOMPI_CREDENTIAL_PURPOSES = {
  PUBLIC_KEY: { credential_type: 'api_key', purpose: 'public_key' },
  PRIVATE_KEY: { credential_type: 'api_key', purpose: 'private_key' },
  EVENTS_SECRET: { credential_type: 'secret', purpose: 'events_secret' },
  INTEGRITY_SECRET: { credential_type: 'secret', purpose: 'integrity_secret' },
} as const;

// Conector ID de Wompi Colombia en la BD
export const WOMPI_CO_CONNECTOR_CODE = 'wompi_co';
export const WOMPI_PROVIDER_CODE = 'wompi';
