/**
 * Política de reintentos de la cola de facturación electrónica. Pura: sin red
 * ni base de datos, para poder probarla.
 *
 * - Máximo 5 intentos por documento (`electronic_invoicing_jobs.max_attempts`).
 * - Tras el intento n fallido por una causa pasajera, se espera 2^n minutos:
 *   2, 4, 8 y 16. El quinto fallo deja el documento en `failed`.
 * - Un rechazo (Factus o la DIAN dicen que el documento está mal: 4xx) no se
 *   reintenta igual: queda `rejected` y pide corregir.
 * - Datos incompletos del lado nuestro (sin rango, sin cliente…) no se
 *   reintentan: `failed` con el motivo, hasta que alguien los corrija.
 * - Si la organización no tiene el servicio activo, el envío se libera sin
 *   contar intento.
 */

export const MAX_INTENTOS = 5;

export type ClaseFallo = 'pasajero' | 'rechazo' | 'datos' | 'no_activado';

export type EstadoTrasFallo = 'pending' | 'failed' | 'rejected';

export interface DecisionTrasFallo {
  estado: EstadoTrasFallo;
  contarIntento: boolean;
  /** Solo si `estado === 'pending'` y cuenta intento. */
  siguienteIntento: Date | null;
  esperaMinutos: number | null;
}

/** Minutos de espera tras el intento `intento` (1-based) fallido: 2, 4, 8, 16… */
export function esperaMinutos(intento: number): number {
  const n = Math.max(1, Math.floor(intento));
  return 2 ** n;
}

/**
 * Clase de fallo según el código HTTP de Factus. `null` = no hubo respuesta
 * (red, DNS, timeout): pasajero. 401/408/429 y 5xx: pasajeros. 409 (Factus
 * tiene una factura pendiente con ese código) y el resto de 4xx: rechazo.
 */
export function clasificarHttp(status: number | null | undefined): ClaseFallo {
  if (status === null || status === undefined) return 'pasajero';
  if (status === 401 || status === 408 || status === 425 || status === 429) return 'pasajero';
  if (status >= 500) return 'pasajero';
  if (status >= 400) return 'rechazo';
  return 'pasajero';
}

export function decidirTrasFallo(params: {
  clase: ClaseFallo;
  intentosPrevios: number;
  maxIntentos?: number;
  ahora?: Date;
}): DecisionTrasFallo {
  const { clase, intentosPrevios } = params;
  const max = params.maxIntentos ?? MAX_INTENTOS;
  const ahora = params.ahora ?? new Date();

  if (clase === 'no_activado') {
    return { estado: 'pending', contarIntento: false, siguienteIntento: null, esperaMinutos: null };
  }
  if (clase === 'rechazo') {
    return { estado: 'rejected', contarIntento: true, siguienteIntento: null, esperaMinutos: null };
  }
  if (clase === 'datos') {
    return { estado: 'failed', contarIntento: true, siguienteIntento: null, esperaMinutos: null };
  }

  const intento = intentosPrevios + 1;
  if (intento >= max) {
    return { estado: 'failed', contarIntento: true, siguienteIntento: null, esperaMinutos: null };
  }
  const minutos = esperaMinutos(intento);
  return {
    estado: 'pending',
    contarIntento: true,
    siguienteIntento: new Date(ahora.getTime() + minutos * 60 * 1000),
    esperaMinutos: minutos,
  };
}
