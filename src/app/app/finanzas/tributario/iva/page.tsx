import { Suspense } from 'react';
import { Skeleton } from '@/components/kit';
import { BorradorIvaPage } from '@/components/finanzas/tributario/iva/BorradorIvaPage';

/**
 * Borrador del IVA · formulario 300 desde los libros (Finanzas R4-A, Figma
 * 2335:137440). `?desde=&hasta=` fijan el periodo; `?cada=` la periodicidad.
 */
export default function Page() {
  // El periodo va en la URL: useSearchParams pide Suspense.
  return (
    <Suspense fallback={<Skeleton className="m-4 h-64 sm:m-6" />}>
      <BorradorIvaPage />
    </Suspense>
  );
}
