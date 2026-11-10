/**
 * Texto de un error de las rutas de consignación: los códigos nuevos de la ronda 5 del Contador se leen en
 * `consignacionesR5.errores`; los demás, en `consignacionesR4.errores` (mismo lector que los saldos a favor).
 */
import { ErrorPeticionSaldoFavor } from '@/components/finanzas/saldos-a-favor/saldosAFavorService';
import { textoErrorSaldo } from '@/components/finanzas/saldos-a-favor/textosSaldo';

interface Traductor {
  (clave: string): string;
  has: (clave: string) => boolean;
}

export function textoErrorConsignacion(tR4: Traductor, tR5: Traductor, error: unknown): string {
  const codigo = error instanceof ErrorPeticionSaldoFavor ? String(error.codigo) : '';
  return textoErrorSaldo(codigo && tR5.has(`errores.${codigo}`) ? tR5 : tR4, error);
}
