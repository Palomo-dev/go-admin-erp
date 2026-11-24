/**
 * Clave i18n (`crm.redPartners.errores.*`) para un error de `/api/crm/partners/**`.
 * El servidor responde con `code` estable; el texto se traduce aquí y nunca se
 * muestra el mensaje en español del servidor en otro idioma.
 */

const CODIGOS = [
  'DUPLICATE_EMAIL',
  'DUPLICATE_DEAL',
  'DUPLICATE',
  'TIER_IN_USE',
  'IN_USE',
  'CONCURRENT_CHANGE',
  'INVALID_TRANSITION',
  'INVALID_STATUS',
  'COMMISSION_OUT_OF_RANGE',
  'MANAGER_REQUIRED',
  'NOT_FOUND',
  'VALIDATION',
] as const;

export function claveErrorPartners(e: unknown): string {
  const err = e as { status?: number; code?: string | null } | null;
  if (err && typeof err.code === 'string' && (CODIGOS as readonly string[]).includes(err.code)) return `errores.codigos.${err.code}`;
  if (err?.status === 0 || err?.code === 'RED') return 'errores.red';
  if (err?.status === 403) return 'errores.codigos.MANAGER_REQUIRED';
  return 'errores.generico';
}
