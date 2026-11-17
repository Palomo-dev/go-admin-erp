import { Suspense } from 'react';
import { FormularioPrestamo } from '@/components/hrm/nomina/FormularioPrestamo';

/** Nómina › Préstamos y embargos › nuevo préstamo (Figma 20.21.4). */
export default function Page() {
  return (
    <Suspense>
      <FormularioPrestamo />
    </Suspense>
  );
}
