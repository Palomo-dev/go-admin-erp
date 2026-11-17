import { redirect } from 'next/navigation';

/** Compensación se retiró (2026-11-16): el salario vive en las escalas del cargo y la ficha. */
export default function Page() {
  redirect('/app/hrm/cargos');
}
