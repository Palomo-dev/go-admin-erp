/** Contrato público del CRM; la normalización pura también se usa en Edge. */
export { normalizePhoneDigits, phoneSearchSuffix, phoneSuffixPattern, countryFromPhone,
  LAST_RESORT_COUNTRY_CODE, NATIONAL_PATTERNS } from '../../../../supabase/functions/_shared/contacto/telefono';
import { resolverIndicativo } from '../../../../supabase/functions/_shared/contacto/telefono';

export function resolveDefaultCountry(fromOrg: string | null | undefined): string {
  return resolverIndicativo(fromOrg, process.env.WHATSAPP_DEFAULT_COUNTRY_CODE);
}
