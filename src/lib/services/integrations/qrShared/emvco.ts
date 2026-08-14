/**
 * EMVCo QR Code: builder/parser de payloads segun estandar EMVCo (TAGs 00-62).
 * Formato: ID (2 digitos) + length (2 digitos) + value.
 */

/** Tag EMVCo individual parseado. */
export type EmvcoTag = {
  id: string;
  value: string;
  length: number;
};

/** IDs estandar EMVCo QR Code. */
export const EMVCO_TAGS = {
  '00': 'payloadFormat',
  '01': 'pointOfInitiationMethod',
  '26': 'merchantAccountInfo',
  '52': 'merchantCategoryCode',
  '53': 'transactionCurrency',
  '54': 'transactionAmount',
  '58': 'countryCode',
  '59': 'merchantName',
  '60': 'merchantCity',
  '62': 'additionalDataField',
  '63': 'CRC',
} as const;

/** Rellena el length a 2 digitos (zero-padding). */
function padLength(length: number): string {
  return length.toString().padStart(2, '0');
}

/**
 * Construye un payload EMVCo a partir de un mapa de tags.
 * El CRC (tag 63) no se calcula aqui; si viene incluido se concatena al final.
 * @param tags Mapa ID -> value
 * @returns String QR con formato ID + length + value
 */
export function buildEmvcoPayload(tags: Record<string, string>): string {
  const parts: string[] = [];

  // Ordenar IDs ascendentemente, CRC (63) siempre al final
  const ids = Object.keys(tags)
    .filter((id) => id !== '63')
    .sort((a, b) => a.localeCompare(b));

  for (const id of ids) {
    const value = tags[id] ?? '';
    parts.push(`${id}${padLength(value.length)}${value}`);
  }

  // CRC al final si fue provisto
  if (tags['63'] !== undefined) {
    const crcValue = tags['63'];
    parts.push(`63${padLength(crcValue.length)}${crcValue}`);
  }

  return parts.join('');
}

/**
 * Parsea un payload EMVCo de vuelta a un mapa de tags.
 * @param payload String QR EMVCo
 * @returns Mapa ID -> value
 */
export function parseEmvcoPayload(payload: string): Record<string, string> {
  const tags: Record<string, string> = {};
  let cursor = 0;

  while (cursor + 4 <= payload.length) {
    const id = payload.substring(cursor, cursor + 2);
    const lengthStr = payload.substring(cursor + 2, cursor + 4);
    const length = parseInt(lengthStr, 10);

    if (Number.isNaN(length) || length < 0) {
      // Longitud invalida, abortar
      break;
    }

    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > payload.length) {
      // Payload truncado, abortar
      break;
    }

    tags[id] = payload.substring(valueStart, valueEnd);
    cursor = valueEnd;
  }

  return tags;
}
