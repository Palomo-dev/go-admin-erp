import { Suspense } from 'react';
import { NominaPage } from '@/components/hrm/nomina/NominaPage';

/** Recursos humanos › Nómina (Figma 20.16 Períodos, 20.20 Prestaciones, 20.21 Préstamos y embargos, 20.25 solo preliquidación). */
export default function Page() {
  return (
    <Suspense>
      <NominaPage />
    </Suspense>
  );
}
