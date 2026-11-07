import { redirect } from 'next/navigation';
import { destinoNuevaCuenta } from '@/lib/finanzas/tesoreria/rutas';

/** La nueva cuenta bancaria es un panel sobre Cuentas de dinero (Figma 1009:85183). */
export default function Page() {
  redirect(destinoNuevaCuenta());
}
