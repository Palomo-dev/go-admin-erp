/**
 * Normalización de teléfonos del CRM. Módulo PURO y sin dependencias de
 * servidor a propósito: lo usan tanto los servicios (WhatsApp, campañas) como
 * la barra de acciones rápidas del navegador, y hasta la ronda 4 cada uno
 * tenía su propia copia de la regla.
 *
 * La regla que importa: un número NACIONAL solo se completa con el indicativo
 * del país si TIENE LA FORMA de un número nacional de ese país. Sin eso,
 * `415 555 0100` (EE.UU.) se convertía en `+574155550100` y el país salía
 * `'co'`, con lo que el bloqueo de marketing a EE.UU. no se aplicaba
 * (tester F16 r3 · F-4).
 *
 * ALCANCE REAL, medido en la base el 2026-09-10 (12.522 clientes con
 * teléfono) para no repetir la exageración de la ronda 3:
 *
 *  - `+574155550100` NO es «un número colombiano real»: Colombia no asigna
 *    nada que empiece por 4 tras el +57. Es un identificador inventado e
 *    irrutable, y ninguno de los 7 casos de la base apunta hoy a otro cliente
 *    del CRM.
 *  - Lo que SÍ queda es un riesgo residual que esta regla NO cierra: en el
 *    rango 3XX los indicativos de área de EE.UU. y los prefijos de móvil
 *    colombianos se solapan (310 es Los Ángeles y también Claro). Un
 *    `310 987 6543` estadounidense guardado sin indicativo seguirá saliendo
 *    como `+573109876543`. Deshacerlo requiere que la organización guarde el
 *    teléfono en E.164, no una heurística mejor.
 *  - Coste del arreglo: 0 destinatarios legítimos. De los 11.505 teléfonos
 *    guardados como nacional de 10 dígitos, 11.494 son móviles 3XX (todos con
 *    prefijo que Colombia asigna de verdad) y 4 son fijos 60X; los 7 que
 *    dejan de completarse son 5 cédulas y 2 números de EE.UU.
 */

/**
 * Indicativo de último recurso cuando la organización no lo tiene configurado
 * y tampoco hay variable de entorno. NO es una regla de negocio cableada: es el
 * último escalón de la cascada `provider_configs.settings.default_country_code`
 * → `WHATSAPP_DEFAULT_COUNTRY_CODE` → esto, y cualquier organización lo cambia
 * desde sus ajustes.
 */
export const LAST_RESORT_COUNTRY_CODE = '57';

/**
 * Forma de un número NACIONAL (sin indicativo) por indicativo de país.
 *
 * Un indicativo sin regla conocida NO completa números nacionales: se prefiere
 * devolver `null` (y que el envío falle con NO_PHONE) a inventarse un número.
 */
export const NATIONAL_PATTERNS: Record<string, RegExp> = {
  // Colombia: móvil 3XXXXXXXXX; fijo con el indicativo nacional 60X XXXXXXX.
  '57': /^(?:3\d{9}|60\d{8})$/,
  // México: 10 dígitos, sin empezar por 0.
  '52': /^[1-9]\d{9}$/,
  // NANP (EE.UU./Canadá): NPA-NXX-XXXX, ni NPA ni NXX empiezan por 0 o 1.
  '1': /^[2-9]\d{2}[2-9]\d{6}$/,
};

/**
 * `wa_id` de Meta: E.164 SIN «+», solo dígitos.
 *
 * Antes se limitaba a borrar todo lo que no fuera dígito, así que el MISMO
 * número guardado en dos formatos daba dos destinatarios distintos
 * (`+57 310 987 6543` → `573109876543`, pero `310 987 6543` → `3109876543`) y
 * el segundo ni siquiera es un wa_id válido. Con 10.027 de 12.494 teléfonos
 * guardados con separadores, eso significaba duplicar mensajes al mismo
 * cliente y mandar números inválidos a Meta (tester F16 r2 · F-4).
 *
 * `defaultCountry` es OPCIONAL y por defecto NO SE APLICA (`null`): completar
 * el indicativo solo tiene sentido cuando el número viene del texto libre que
 * la organización guardó en `customers.phone`. Un identificador que llega del
 * proveedor (`wa_id`) o del cuerpo de una petición ya viene cualificado, y
 * reescribirlo es inventarse un destinatario, así que esos emisores llaman a
 * esta función SIN indicativo (tester F16 r3 · F-4).
 *
 * Aun con indicativo, solo se completa si el número nacional TIENE LA FORMA de
 * ese país (`NATIONAL_PATTERNS`).
 */
export function normalizePhoneDigits(phone: string, defaultCountry: string | null = null): string | null {
  const limpio = String(phone).replace(/@(s\.whatsapp\.net|lid)$/, '').trim();
  const conMas = limpio.startsWith('+');
  let digits = limpio.replace(/\D/g, '');
  if (!conMas && digits.startsWith('00')) digits = digits.slice(2);
  // Número nacional de 10 dígitos: le falta el indicativo. Con «+» delante ya
  // es E.164 y no se toca; sin indicativo por defecto tampoco se toca.
  if (!conMas && digits.length === 10) {
    const cc = (defaultCountry ?? '').replace(/\D/g, '');
    const patron = cc ? NATIONAL_PATTERNS[cc] : undefined;
    if (!cc || !patron || !patron.test(digits)) return null;
    digits = `${cc}${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Últimos 4 dígitos: prefiltro barato para buscar un teléfono guardado con
 * cualquier separador. Cubre 12.448 de los 12.465 teléfonos normalizables
 * (99,86 %); los 17 restantes llevan la extensión al final. El filtro fino se
 * hace luego en memoria comparando `normalizePhoneDigits`.
 */
export function phoneSearchSuffix(digits: string): string {
  return digits.slice(-4);
}

/** País (ISO-2 minúsculas) por prefijo E.164; solo los que tienen precio en provider_pricing. */
export function countryFromPhone(digits: string): 'co' | 'mx' | 'us' | 'other' {
  if (digits.startsWith('57')) return 'co';
  if (digits.startsWith('52')) return 'mx';
  if (digits.startsWith('1')) return 'us';
  return 'other';
}

/**
 * Indicativo por defecto EFECTIVO: ajuste de la organización → variable de
 * entorno → último recurso. Nunca se decide dentro de `normalizePhoneDigits`,
 * para que el emisor sea siempre explícito.
 */
export function resolveDefaultCountry(fromOrg: string | null | undefined): string {
  const s = (fromOrg ?? '').replace(/\D/g, '');
  if (s) return s;
  const env = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? '').replace(/\D/g, '');
  return env || LAST_RESORT_COUNTRY_CODE;
}
