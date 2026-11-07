import { redirect } from 'next/navigation';

/**
 * Pantalla duplicada retirada (Contabilidad v2, P-8; Finanzas R3, frente C):
 * los periodos viven en una sola página. Enlaces guardados y favoritos llegan
 * a la misma.
 */
export default function Page() {
  redirect('/app/finanzas/contabilidad/periodos-fiscales');
}
