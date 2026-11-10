/**
 * Texto de un error de las rutas de consignación: los códigos nuevos de la ronda 5 del Contador se leen en
 * `consignacionesR5.errores`; los demás, en `consignacionesR4.errores` (mismo lector que los saldos a favor). Ronda 6:
 * con `tR6`, los códigos nuevos se leen primero en `consignacionesR6.errores`.
 */
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';

interface Traductor {
  (clave: string): string;
  has: (clave: string) => boolean;
}

export function textoErrorConsignacion(tR4: Traductor, tR5: Traductor, error: unknown, tR6?: Traductor): string {
  const codigo = error instanceof ErrorPeticionSaldoFavor ? String(error.codigo) : '';
  if (codigo && tR6?.has(`errores.${codigo}`)) return textoErrorSaldo(tR6, error);
  return textoErrorSaldo(codigo && tR5.has(`errores.${codigo}`) ? tR5 : tR4, error);
}
