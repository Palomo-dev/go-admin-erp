/**
 * Formas del código de emparejamiento y del token de la pantalla remota
 * (PLAN §3.3 y §11). Módulo HOJA (sin `node:crypto`, sin DOM, sin
 * Supabase): lo comparten el servidor (`server/displayTokens.ts`, que lo
 * re-exporta para que las rutas y sus pruebas no cambien de import) y la
 * pantalla en el navegador (remoteDisplay.ts), así hay UNA sola definición
 * de «qué es un código» y «qué es un token» (regla 7 del CLAUDE.md).
 *
 * Solo FORMA: nada de esto dice si un código existe o si un token es válido;
 * eso lo decide el servidor contra `pos_terminal_secrets`.
 */

/** Formato exacto del CHECK `pos_terminal_secrets_code_formato`: seis dígitos. */
export const PAIRING_CODE_PATTERN = /^[0-9]{6}$/;
export const PAIRING_CODE_LENGTH = 6;

/** 32 bytes en base64url sin relleno: 43 caracteres del alfabeto base64url. */
export const DISPLAY_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** ¿Tiene la forma de un código de emparejamiento? */
export function isPairingCodeShape(value: unknown): value is string {
  return typeof value === 'string' && PAIRING_CODE_PATTERN.test(value);
}

/** ¿Tiene la forma de un token de pantalla? Descarta basura antes de mandarla o guardarla. */
export function isDisplayTokenShape(value: unknown): value is string {
  return typeof value === 'string' && DISPLAY_TOKEN_PATTERN.test(value);
}

/**
 * Lo que el usuario teclea o pega («123 456», «123-456», con espacios) →
 * solo dígitos, como mucho seis. Devuelve la cadena saneada (puede quedar
 * corta: la UI decide si ya se puede canjear con `isPairingCodeShape`).
 */
export function normalizePairingCodeInput(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^0-9]/g, '').slice(0, PAIRING_CODE_LENGTH);
}
