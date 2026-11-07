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
