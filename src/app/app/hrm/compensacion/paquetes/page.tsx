import { redirect } from 'next/navigation';

/**
 * Compensación se retiró (decisión del dueño, 2026-11-16): el salario se define en
 * un solo lugar, las escalas del cargo y la ficha del empleado. Ninguna empresa
 * tenía paquetes creados.
 */
export default function Page() {
  redirect('/app/hrm/cargos');
}
