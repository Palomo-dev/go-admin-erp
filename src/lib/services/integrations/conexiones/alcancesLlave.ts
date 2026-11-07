/**
 * Alcances de las llaves de API (módulo puro: lo usan el diálogo del navegador y el servidor).
 * Son los mismos que ya guardaba `ApiKeyDialog`: no se inventa otro formato.
 */
export const ALCANCES_LLAVE = [
  'read:products', 'write:products',
  'read:orders', 'write:orders',
  'read:customers', 'write:customers',
  'read:inventory', 'write:inventory',
  'read:reports', 'webhooks',
] as const;

export type AlcanceLlave = (typeof ALCANCES_LLAVE)[number];
