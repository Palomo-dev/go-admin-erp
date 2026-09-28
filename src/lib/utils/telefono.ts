/**
 * Teléfonos de los formularios: parseo, validación y formato por país.
 *
 * Módulo PURO (sin React ni Supabase): lo usan `PhoneInput`
 * (`src/components/ui/phone-input.tsx`) y las validaciones de los formularios.
 *
 * FORMATO DE ALMACENAMIENTO. Se conserva el que `PhoneInput` ya escribía:
 * `"+<indicativo> <número nacional sin separadores>"`, p. ej. `"+57 3001234567"`.
 * Medido el 2026-09-23 en customers, suppliers, organizations, branches y
 * profiles: conviven ese formato, 10 dígitos sin indicativo, `"300 1234567"`,
 * `"+1 (201) 555-0123"`… Pasar ahora a E.164 puro (`+573001234567`) cambiaría
 * el texto de ~1.900 filas escritas por este mismo componente sin ganar nada:
 * `aE164()` lo deriva sin pérdida, y `normalizePhoneDigits`
 * (`src/lib/services/crm/phoneNormalize.ts`), que es la regla de WhatsApp y
 * campañas, entiende los dos.
 *
 * VALORES VIEJOS SIN INDICATIVO. `"3001234567"` se interpreta como número
 * NACIONAL del país por defecto (el de la organización, o Colombia). Antes
 * `parsePhoneString` lo leía como Grecia (+30) porque probaba prefijos
 * internacionales primero.
 */
import {
  AsYouType,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from 'libphonenumber-js/min';
import {
  countryPhoneCodes,
  DEFAULT_COUNTRY_ISO,
  getCountryByIso,
  type CountryPhoneCode,
} from '@/lib/data/countryPhoneCodes';

export { DEFAULT_COUNTRY_ISO };

/** Resultado de interpretar un teléfono guardado o escrito. */
export interface TelefonoParseado {
  /** ISO 3166-1 alfa-2 del país (ej. `'CO'`). */
  iso: string;
  /** Indicativo con «+» (ej. `'+57'`). */
  dialCode: string;
  /** Número nacional, solo dígitos (ej. `'3001234567'`). */
  number: string;
}

const soloDigitos = (s: string) => (s || '').replace(/\D/g, '');

function soportado(iso: string): iso is CountryCode {
  return !!iso && isSupportedCountry(iso as CountryCode);
}

/** Indicativo con «+» de un país: primero libphonenumber, luego la lista propia. */
export function indicativoDe(iso: string): string {
  if (soportado(iso)) return `+${getCountryCallingCode(iso)}`;
  return getCountryByIso(iso)?.dialCode ?? '';
}

/**
 * Lista de países para el selector: la de `countryPhoneCodes` sin duplicados
 * (UY y VE aparecen dos veces: en el bloque de frecuentes y en el alfabético,
 * y la clave repetida hacía que React confundiera las filas).
 */
export const paisesTelefono: CountryPhoneCode[] = (() => {
  const vistos = new Set<string>();
  return countryPhoneCodes.filter((c) => {
    if (vistos.has(c.iso)) return false;
    vistos.add(c.iso);
    return true;
  });
})();

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Filtra países por nombre (sin tildes), ISO o indicativo (`57`, `+57`). */
export function buscarPaises(consulta: string, lista: CountryPhoneCode[] = paisesTelefono): CountryPhoneCode[] {
  const q = quitarTildes(consulta.trim());
  if (!q) return lista;
  const qDigitos = soloDigitos(q);
  const pareceIndicativo = /^\+?\d+$/.test(q);
  return lista.filter((c) => {
    if (pareceIndicativo) return c.dialCode.replace('+', '').startsWith(qDigitos);
    return quitarTildes(c.name).includes(q) || c.iso.toLowerCase() === q;
  });
}

/** País de un indicativo cuando libphonenumber no lo resuelve (el primero de la lista). */
function paisPorIndicativo(digitos: string): CountryPhoneCode | undefined {
  // Indicativos más largos primero: +591 antes que +59…, +1 al final.
  const ordenados = [...paisesTelefono].sort((a, b) => b.dialCode.length - a.dialCode.length);
  return ordenados.find((c) => digitos.startsWith(c.dialCode.replace('+', '')));
}

/**
 * Interpreta un teléfono en cualquiera de los formatos que hay en la base.
 *
 * - Con «+» o «00» delante: internacional (`"+57 300 123 4567"`, `"+1 (201) 555-0123"`).
 * - Sin indicativo: nacional del país por defecto si tiene forma válida ahí
 *   (`"3001234567"` → Colombia); si no, se prueba como internacional sin «+»
 *   (`"573001234567"`); y si nada encaja se conservan los dígitos tal cual en
 *   el país por defecto, para no perder lo que el usuario escribió.
 *
 * Devuelve `null` solo si no hay ningún dígito.
 */
export function parsearTelefono(valor: string | null | undefined, isoPorDefecto: string = DEFAULT_COUNTRY_ISO): TelefonoParseado | null {
  const crudo = (valor ?? '').trim();
  const digitos = soloDigitos(crudo);
  if (!digitos) return null;
  const isoDefecto = getCountryByIso(isoPorDefecto) ? isoPorDefecto : DEFAULT_COUNTRY_ISO;

  const esInternacional = crudo.startsWith('+') || digitos.startsWith('00');
  if (esInternacional) {
    const intl = digitos.startsWith('00') && !crudo.startsWith('+') ? digitos.slice(2) : digitos;
    const p = parsePhoneNumberFromString(`+${intl}`);
    if (p) {
      const dialCode = `+${p.countryCallingCode}`;
      // Con un indicativo compartido (+1) y un número aún incompleto,
      // libphonenumber no sabe el país: se respeta el por defecto si comparte
      // indicativo; si no, el primero de la lista.
      const iso =
        p.country ??
        (indicativoDe(isoDefecto) === dialCode ? isoDefecto : paisPorIndicativo(intl)?.iso) ??
        isoDefecto;
      return { iso, dialCode, number: p.nationalNumber as string };
    }
    const pais = paisPorIndicativo(intl);
    if (pais) {
      return { iso: pais.iso, dialCode: pais.dialCode, number: intl.slice(pais.dialCode.length - 1) };
    }
    return { iso: isoDefecto, dialCode: indicativoDe(isoDefecto), number: intl };
  }

  if (soportado(isoDefecto)) {
    const nacional = parsePhoneNumberFromString(digitos, isoDefecto);
    if (nacional?.isValid()) {
      return {
        iso: nacional.country ?? isoDefecto,
        dialCode: `+${nacional.countryCallingCode}`,
        number: nacional.nationalNumber as string,
      };
    }
  }
  const intl = parsePhoneNumberFromString(`+${digitos}`);
  if (intl?.isValid()) {
    return {
      iso: intl.country ?? paisPorIndicativo(digitos)?.iso ?? isoDefecto,
      dialCode: `+${intl.countryCallingCode}`,
      number: intl.nationalNumber as string,
    };
  }
  return { iso: isoDefecto, dialCode: indicativoDe(isoDefecto), number: digitos };
}

/**
 * Compone el valor que se guarda: `"+57 3001234567"`. Sin dígitos devuelve `''`
 * (campo vacío), nunca `"+57 "`.
 */
export function formatearParaGuardar(iso: string, numeroNacional: string): string {
  let digitos = soloDigitos(numeroNacional);
  if (!digitos) return '';
  // Prefijo troncal nacional («0» en Reino Unido, España antigua…): si el
  // número es válido sin él, se guarda sin él, que es como lo marca E.164.
  if (soportado(iso)) {
    const p = parsePhoneNumberFromString(digitos, iso);
    if (p?.isValid() && p.countryCallingCode === getCountryCallingCode(iso)) digitos = p.nationalNumber as string;
  }
  const dial = indicativoDe(iso);
  return dial ? `${dial} ${digitos}` : digitos;
}

/**
 * Normaliza cualquier valor al formato de almacenamiento. Útil al guardar un
 * teléfono que llegó de otra fuente (importación, API). Vacío → `''`.
 */
export function normalizarTelefono(valor: string | null | undefined, isoPorDefecto?: string): string {
  const p = parsearTelefono(valor, isoPorDefecto);
  return p ? formatearParaGuardar(p.iso, p.number) : '';
}

/** E.164 (`"+573001234567"`) o `null` si el número no es válido. */
export function aE164(valor: string | null | undefined, isoPorDefecto?: string): string | null {
  const p = parsearTelefono(valor, isoPorDefecto);
  if (!p || !soportado(p.iso)) return null;
  const n = parsePhoneNumberFromString(p.number, p.iso);
  return n?.isValid() ? (n.number as string) : null;
}

/**
 * ¿Es un teléfono válido para su país? Longitud y prefijos según los
 * metadatos de libphonenumber. Un valor vacío NO es válido: para un campo
 * opcional usa `!valor || esTelefonoValido(valor)` (o `telefonoOpcionalValido`).
 */
export function esTelefonoValido(valor: string | null | undefined, isoPorDefecto?: string): boolean {
  return aE164(valor, isoPorDefecto) !== null;
}

/** Para campos opcionales: vacío es válido; si hay algo, debe ser un teléfono válido. */
export function telefonoOpcionalValido(valor: string | null | undefined, isoPorDefecto?: string): boolean {
  return !soloDigitos(valor ?? '') || esTelefonoValido(valor, isoPorDefecto);
}

/**
 * Mensaje de error listo para la UI, o `null` si el valor está vacío o es
 * válido. La obligatoriedad la decide cada formulario.
 */
export function mensajeErrorTelefono(valor: string | null | undefined, isoPorDefecto?: string): string | null {
  const p = parsearTelefono(valor, isoPorDefecto);
  if (!p || esTelefonoValido(valor, isoPorDefecto)) return null;
  const pais = getCountryByIso(p.iso)?.name ?? p.iso;
  if (soportado(p.iso)) {
    const largo = validatePhoneNumberLength(p.number, p.iso);
    if (largo === 'TOO_SHORT' || largo === 'NOT_A_NUMBER') return `El número está incompleto para ${pais}.`;
    if (largo === 'TOO_LONG') return `El número tiene demasiados dígitos para ${pais}.`;
  }
  return `El número no es válido para ${pais}.`;
}

/** ¿Se puede añadir otro dígito sin pasarse de la longitud máxima del país? */
export function excedeLongitud(iso: string, numeroNacional: string): boolean {
  if (!soportado(iso)) return soloDigitos(numeroNacional).length > 15;
  return validatePhoneNumberLength(soloDigitos(numeroNacional), iso) === 'TOO_LONG';
}

/** Formato de escritura del número nacional (`"300 1234567"`, `"(201) 555-0123"`). */
export function formatearNacional(iso: string, numeroNacional: string): string {
  const digitos = soloDigitos(numeroNacional);
  if (!digitos || !soportado(iso)) return digitos;
  return new AsYouType(iso).input(digitos);
}

/**
 * Formato internacional para mostrar en listas y fichas
 * (`"+57 300 1234567"`). Si no se puede interpretar devuelve el valor tal cual.
 */
export function formatearTelefono(valor: string | null | undefined, isoPorDefecto?: string): string {
  const p = parsearTelefono(valor, isoPorDefecto);
  if (!p) return (valor ?? '').trim();
  if (soportado(p.iso)) {
    const n = parsePhoneNumberFromString(p.number, p.iso);
    if (n?.isValid()) return n.formatInternational();
  }
  return formatearParaGuardar(p.iso, p.number);
}

/** Ejemplo de número nacional para el placeholder del campo. */
export function ejemploNacional(iso: string): string {
  // Ejemplos fijos de los países más usados; el resto no muestra ejemplo.
  const ejemplos: Record<string, string> = {
    CO: '300 1234567',
    MX: '55 1234 5678',
    US: '(201) 555-0123',
    ES: '612 34 56 78',
    PE: '912 345 678',
    EC: '99 123 4567',
    AR: '11 2345-6789',
    CL: '9 6123 4567',
    VE: '412-1234567',
    PA: '6123-4567',
  };
  return ejemplos[iso] ?? '';
}

/**
 * Alfa-3 → alfa-2 de los países que hoy puede tener `organizations.country_code`
 * (se guarda en alfa-3: «COL»). Lista corta a propósito: si falta un país se
 * cae al nombre (`organizations.country`) y, al final, a Colombia.
 */
const ALFA3_A_ALFA2: Record<string, string> = {
  COL: 'CO', MEX: 'MX', USA: 'US', CAN: 'CA', ARG: 'AR', BOL: 'BO', BRA: 'BR', CHL: 'CL',
  CRI: 'CR', CUB: 'CU', DOM: 'DO', ECU: 'EC', SLV: 'SV', GTM: 'GT', HND: 'HN', NIC: 'NI',
  PAN: 'PA', PRY: 'PY', PER: 'PE', PRI: 'PR', URY: 'UY', VEN: 'VE', ESP: 'ES', PRT: 'PT',
  FRA: 'FR', DEU: 'DE', ITA: 'IT', GBR: 'GB',
};

/**
 * País (alfa-2) para preseleccionar en el teléfono a partir de la fila de la
 * organización. `null` si no se puede deducir.
 */
export function paisIsoDeOrganizacion(countryCode?: string | null, countryName?: string | null): string | null {
  const code = (countryCode ?? '').trim().toUpperCase();
  if (code.length === 2 && getCountryByIso(code)) return code;
  if (code.length === 3 && ALFA3_A_ALFA2[code]) return ALFA3_A_ALFA2[code];
  const nombre = quitarTildes((countryName ?? '').trim());
  if (nombre) {
    const pais = paisesTelefono.find((c) => quitarTildes(c.name) === nombre);
    if (pais) return pais.iso;
  }
  return null;
}
