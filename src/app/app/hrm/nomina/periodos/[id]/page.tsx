import { Suspense } from 'react';
import { PeriodoPage } from '@/components/hrm/nomina/PeriodoPage';

/** Nómina › período: preliquidación (20.17), revisión y cierre (20.19), pago (20.22) y colillas (20.23.3). */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <PeriodoPage id={id} />
    </Suspense>
  );
}
