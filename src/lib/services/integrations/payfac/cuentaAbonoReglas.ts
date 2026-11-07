/**
 * Reglas de la cuenta de abono de PayFac (Finanzas ronda 2, piezas A9 y A10).
 * Sin React ni Supabase: las usan el servicio (servidor) y la pantalla (cliente),
 * para que la regla sea una sola.
 *
 * - A9: no se quita la ÚNICA cuenta verificada mientras haya dispersiones
 *   pendientes o en proceso: GO Admin se quedaría sin a dónde transferir.
 * - A10: el titular de la cuenta debe ser la organización (razón social o NIT).
 */

/** Código de error que viaja del servicio a la ruta y de la ruta a la pantalla. */
export const UNICA_VERIFICADA_CON_PENDIENTES = 'unica_verificada_con_pendientes';
export const TITULAR_NO_COINCIDE = 'titular_no_coincide';

export interface EstadoParaQuitarCuenta {
  /** La cuenta que se quiere quitar está verificada. */
  verificada: boolean;
  /** Otras cuentas activas y verificadas de la misma organización. */
  otrasVerificadas: number;
  /** Dispersiones de la organización en `pending` o `processing`. */
  dispersionesPendientes: number;
}

/** `null` si se puede quitar; si no, el código del motivo. */
export function motivoNoQuitarCuentaAbono(estado: EstadoParaQuitarCuenta): typeof UNICA_VERIFICADA_CON_PENDIENTES | null {
  if (estado.verificada && estado.otrasVerificadas <= 0 && estado.dispersionesPendientes > 0) {
    return UNICA_VERIFICADA_CON_PENDIENTES;
  }
  return null;
}

/** Estados de dispersión que todavía esperan una cuenta a dónde transferir. */
export const ESTADOS_DISPERSION_PENDIENTE = ['pending', 'processing'] as const;

/** Mayúsculas, sin tildes, sin puntos, comas ni espacios: «Mi Empresa S.A.S.» → «MIEMPRESASAS». */
export function normalizarNombreTitular(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ]/g, '');
}

/**
 * Parte numérica de un documento sin dígito de verificación:
 * «900.000.000-0» → «900000000»; «900000000» → «900000000».
 */
export function baseDocumento(valor: string | null | undefined): string {
  const texto = (valor ?? '').trim();
  const sinDv = texto.includes('-') ? texto.slice(0, texto.lastIndexOf('-')) : texto;
  return sinDv.replace(/\D/g, '');
}

export interface DatosOrganizacionTitular {
  name?: string | null;
  legal_name?: string | null;
  nit?: string | null;
  tax_id?: string | null;
}

export interface TitularCuenta {
  nombre: string;
  documento: string;
}

/**
 * ¿El titular es la organización?
 * - Si la organización tiene NIT (`nit` o `tax_id`), manda el documento: debe
 *   ser ese NIT (con o sin dígito de verificación). El nombre puede venir
 *   escrito como lo tenga el banco.
 * - Si no tiene NIT, el nombre debe coincidir con la razón social o con el
 *   nombre de la organización (sin tildes, puntos ni espacios).
 */
export function titularCoincideConOrganizacion(titular: TitularCuenta, org: DatosOrganizacionTitular): boolean {
  const nitOrg = baseDocumento(org.nit) || baseDocumento(org.tax_id);
  if (nitOrg) {
    const doc = baseDocumento(titular.documento);
    const docCompleto = (titular.documento ?? '').replace(/\D/g, '');
    // Sin guion, el último dígito puede ser el de verificación («9000000000»).
    return doc === nitOrg || docCompleto === nitOrg || docCompleto.slice(0, -1) === nitOrg;
  }
  const nombre = normalizarNombreTitular(titular.nombre);
  if (!nombre) return false;
  return [org.legal_name, org.name].some((n) => normalizarNombreTitular(n) === nombre);
}
