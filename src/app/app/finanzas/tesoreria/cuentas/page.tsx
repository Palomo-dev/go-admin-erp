import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { CuentasDineroPage } from '@/components/finanzas/tesoreria/cuentas/CuentasDineroPage';

// La pestaña (`?tab=`) y el panel de nueva cuenta (`?nueva=1`) van en la URL: useSearchParams pide Suspense.
export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <CuentasDineroPage />
    </Suspense>
  );
}
