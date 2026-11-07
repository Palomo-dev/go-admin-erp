import { redirect } from 'next/navigation';
import { RUTAS_TESORERIA } from '@/lib/finanzas/tesoreria/rutas';

/** «Tesorería» es el título del grupo del menú, no una página (decisión 2 de FINANZAS-R3-PLAN). */
export default function Page() {
  redirect(RUTAS_TESORERIA.movimientos);
}
