import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { NuevaConciliacionForm } from '@/components/finanzas/conciliacion-bancaria/NuevaConciliacionForm';

// `?cuenta=<id>` llega elegida desde el detalle de una cuenta: useSearchParams pide Suspense.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <NuevaConciliacionForm />
    </Suspense>
  );
}
