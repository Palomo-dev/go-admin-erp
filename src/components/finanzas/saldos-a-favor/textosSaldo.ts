/**
 * Texto de un error de `/api/saldos-a-favor/**` con su código estable
 * (`finanzasDocumentosR3.saldos.errores.<codigo>`). Sin React.
 */
import { ErrorPeticionSaldoFavor } from './saldosAFavorService';

interface Traductor {
  (clave: string): string;
  has: (clave: string) => boolean;
}

export function textoErrorSaldo(t: Traductor, error: unknown): string {
  const codigo = error instanceof ErrorPeticionSaldoFavor ? String(error.codigo) : 'error_desconocido';
  const clave = `errores.${codigo}`;
  return t.has(clave) ? t(clave) : t('errores.error_desconocido');
}

/**
 * Errores de «Anular» tras los que la salida es devolver el disponible en dinero
 * (`fn_saldo_favor_anular`): ya se aplicó en parte (`saldo_usado`), el efectivo
 * entró en una caja cerrada (`pago_en_caja_cerrada`) o no nació de un pago
 * (`saldo_no_anulable`). La pantalla puede llegar con datos viejos, así que no
 * basta con la regla local: el código del servidor también ofrece «Devolver».
 */
export const ERRORES_ANULAR_CON_DEVOLUCION = ['saldo_usado', 'pago_en_caja_cerrada', 'saldo_no_anulable'] as const;

export function anularOfreceDevolver(error: unknown): boolean {
  return (
    error instanceof ErrorPeticionSaldoFavor &&
    (ERRORES_ANULAR_CON_DEVOLUCION as readonly string[]).includes(String(error.codigo))
  );
}
